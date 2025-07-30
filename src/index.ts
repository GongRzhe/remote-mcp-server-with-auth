import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { Props } from "./types";

import { closeDb } from "./database/connection";
import { registerAllTools } from "./tools/register-tools";
import { GitHubHandler } from "./auth/github-handler";
import { GoogleHandler } from "./auth/google-handler";
import { Auth0Handler } from "./auth/auth0-handler";
import { KeycloakHandler } from "./auth/keycloak-handler";
import { CustomOAuthHandler } from "./auth/custom-oauth-handler";
import { Hono } from "hono";

// Create a routing handler that supports multiple providers
const authRouter = new Hono();

// Route to GitHub handler
authRouter.route("/github", GitHubHandler);

// Route to Google handler  
authRouter.route("/google", GoogleHandler);

// Route to Auth0 handler
authRouter.route("/auth0", Auth0Handler);

// Route to Keycloak handler
authRouter.route("/keycloak", KeycloakHandler);

// Route to Custom OAuth handler
authRouter.route("/custom", CustomOAuthHandler);

// Root authorize handler - detects available providers and redirects or shows selection
authRouter.get("/authorize", async (c) => {
  const env = c.env as any;
  
  // Detect which providers are configured
  const providers = [];
  if (env.GITHUB_CLIENT_ID) providers.push({ name: 'GitHub', path: '/github' });
  if (env.GOOGLE_CLIENT_ID) providers.push({ name: 'Google', path: '/google' });
  if (env.AUTH0_DOMAIN && env.AUTH0_CLIENT_ID) providers.push({ name: 'Auth0', path: '/auth0' });
  if (env.KEYCLOAK_DOMAIN && env.KEYCLOAK_CLIENT_ID) providers.push({ name: 'Keycloak', path: '/keycloak' });
  if (env.CUSTOM_OAUTH_URL) providers.push({ name: 'Custom OAuth', path: '/custom' });
  
  // If only one provider is configured, redirect directly to it
  if (providers.length === 1) {
    const queryString = c.req.url.includes('?') ? c.req.url.split('?')[1] : '';
    const redirectUrl = `${providers[0].path}/authorize${queryString ? '?' + queryString : ''}`;
    return c.redirect(redirectUrl);
  }
  
  // If multiple providers, show selection page
  if (providers.length > 1) {
    const queryString = c.req.url.includes('?') ? c.req.url.split('?')[1] : '';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Choose OAuth Provider</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 40px; background: #f5f5f5; }
          .container { max-width: 400px; margin: 0 auto; background: white; padding: 32px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          h1 { text-align: center; color: #333; margin-bottom: 24px; }
          .provider { display: block; width: 100%; padding: 12px 16px; margin: 8px 0; border-radius: 6px; border: 1px solid #ddd; background: white; text-decoration: none; color: #333; transition: all 0.2s; }
          .provider:hover { background: #f8f9fa; border-color: #007cba; transform: translateY(-1px); }
          .provider-name { font-weight: 500; font-size: 16px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Choose Authentication Provider</h1>
          ${providers.map(provider => 
            `<a href="${provider.path}/authorize?${queryString}" class="provider">
              <div class="provider-name">${provider.name}</div>
            </a>`
          ).join('')}
        </div>
      </body>
      </html>
    `;
    return c.html(html);
  }
  
  // No providers configured
  return c.text("No OAuth providers configured. Please check your environment variables.", 500);
});

// Root callback handler - routes to the correct provider based on callback parameters
authRouter.get("/callback", async (c) => {
  const code = c.req.query("code");
  const scope = c.req.query("scope");
  const sessionState = c.req.query("session_state");
  const iss = c.req.query("iss");
  const authuser = c.req.query("authuser");
  const env = c.env as any;
  
  if (!code) {
    return c.text("Missing authorization code", 400);
  }
  
  let providerPath = "";
  
  // Detect provider based on callback parameters and environment
  if (iss && (iss.includes("keycloak") || iss.includes("localhost:8080"))) {
    // Keycloak callback - has iss parameter with keycloak domain
    providerPath = "/keycloak";
  } else if (sessionState && iss) {
    // Also likely Keycloak (has both session_state and iss)
    providerPath = "/keycloak";
  } else if (scope && scope.includes("googleapis.com")) {
    // Google OAuth callback - scope contains googleapis.com URLs
    providerPath = "/google";
  } else if (authuser !== undefined) {
    // Google also sometimes has authuser parameter
    providerPath = "/google";
  } else if (scope && scope.includes("openid") && env.AUTH0_DOMAIN) {
    // Auth0 callback - has openid scope and Auth0 is configured
    providerPath = "/auth0";
  } else if (env.AUTH0_DOMAIN && env.AUTH0_CLIENT_ID) {
    // Auth0 fallback - if Auth0 is configured and no other provider matches
    // Auth0 codes can be various lengths, so check for Auth0 config first
    providerPath = "/auth0";
  } else if (code.length > 60 && env.CUSTOM_OAUTH_URL) {
    // Custom OAuth server has very long codes (SHA-256 based, typically 64+ chars)
    // Increased threshold to avoid conflict with Auth0
    providerPath = "/custom";
  } else if (env.GITHUB_CLIENT_ID) {
    // Default to GitHub if configured and no other provider detected
    providerPath = "/github";
  }
  
  // If we still can't determine, try to detect from configured providers
  if (!providerPath) {
    const configuredProviders = [];
    if (env.GITHUB_CLIENT_ID) configuredProviders.push("/github");
    if (env.GOOGLE_CLIENT_ID) configuredProviders.push("/google");
    if (env.AUTH0_DOMAIN && env.AUTH0_CLIENT_ID) configuredProviders.push("/auth0");
    if (env.KEYCLOAK_DOMAIN && env.KEYCLOAK_CLIENT_ID) configuredProviders.push("/keycloak");
    if (env.CUSTOM_OAUTH_URL) configuredProviders.push("/custom");
    
    if (configuredProviders.length === 1) {
      // If only one provider is configured, use that
      providerPath = configuredProviders[0];
    }
  }
  
  if (!providerPath) {
    console.error("Unable to determine OAuth provider from callback parameters:", {
      code: code?.substring(0, 20) + "...",
      scope,
      sessionState: sessionState ? "present" : "missing",
      iss,
      authuser
    });
    return c.text("Unable to determine OAuth provider from callback. Please check your configuration.", 400);
  }
  
  // Construct the provider-specific callback URL
  const url = new URL(c.req.url);
  const callbackUrl = new URL(`${providerPath}/callback`, url.origin);
  callbackUrl.search = url.search; // Preserve all query parameters
  
  console.log(`Routing callback to ${providerPath} provider: ${callbackUrl.toString()}`);
  
  // Redirect to the provider-specific callback handler
  return c.redirect(callbackUrl.toString());
});

export class MyMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({
		name: "PostgreSQL Database MCP Server",
		version: "1.0.0",
	});

	/**
	 * Cleanup database connections when Durable Object is shutting down
	 */
	async cleanup(): Promise<void> {
		try {
			await closeDb();
			console.log('Database connections closed successfully');
		} catch (error) {
			console.error('Error during database cleanup:', error);
		}
	}

	/**
	 * Durable Objects alarm handler - used for cleanup
	 */
	async alarm(): Promise<void> {
		await this.cleanup();
	}

	async init() {
		// Register all tools based on user permissions
		registerAllTools(this.server, this.env, this.props);
	}
}

export default new OAuthProvider({
	apiHandlers: {
		'/sse': MyMCP.serveSSE('/sse') as any,
		'/mcp': MyMCP.serve('/mcp') as any,
	},
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: authRouter as any, // Use routing handler for multiple providers
	tokenEndpoint: "/token",
});