import * as Sentry from "@sentry/cloudflare";
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { Props } from "./types";

import { closeDb } from "./database/connection";
import { registerDatabaseToolsWithSentry } from "./tools/database-tools-sentry";
import { registerGitHubToolsWithSentry } from "./tools/github-tools-sentry";
import { registerGmailToolsWithSentry } from "./tools/gmail-tools-sentry";
import { registerBraveSearchToolsWithSentry } from "./tools/brave-search-tools-sentry";
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

// Note: Generic callback handler removed - each provider now handles its own callbacks directly
// This eliminates complex routing logic and prevents callback routing errors

// Sentry configuration helper
function getSentryConfig(env: Env) {
	return {
		// You can disable Sentry by setting SENTRY_DSN to a falsey-value
		dsn: (env as any).SENTRY_DSN,
		// A sample rate of 1.0 means "capture all traces"
		tracesSampleRate: 1,
	};
}

export class MyMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({
		name: "Database, GitHub, Gmail & Brave Search MCP Server",
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
		// Note: @sentry/cloudflare doesn't use init() - it uses withSentry wrapper
		// Sentry is configured at the worker level, not in individual classes
		console.log('Sentry configuration handled at worker level via withSentry wrapper');

		// Register all tools with Sentry instrumentation
		registerDatabaseToolsWithSentry(this.server, this.env, this.props);
		registerGitHubToolsWithSentry(this.server, this.env, this.props);
		registerGmailToolsWithSentry(this.server, this.env, this.props);
		registerBraveSearchToolsWithSentry(this.server, this.env, this.props);
	}
}

// Create the OAuth provider
const oauthProvider = new OAuthProvider({
	apiHandlers: {
		'/sse': MyMCP.serveSSE('/sse') as any,
		'/mcp': MyMCP.serve('/mcp') as any,
	},
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: authRouter as any, // Use routing handler for multiple providers
	tokenEndpoint: "/token",
});

// Wrap with Sentry for proper error tracking and performance monitoring
export default Sentry.withSentry(
	(env: any) => getSentryConfig(env),
	oauthProvider
);