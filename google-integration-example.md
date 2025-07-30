# Google OAuth Integration Example

This document shows how to integrate the Google OAuth handler alongside the existing GitHub handler in the MCP server.

## 1. Handler Setup

The `google-handler.ts` has been created following the same pattern as `github-handler.ts`. Both handlers support:

- PKCE (Proof Key for Code Exchange) for enhanced security
- Cookie-based approval system to skip repeated authorization
- Proper error handling and user info extraction

## 2. Environment Variables

Add these Google OAuth credentials to your environment:

### For Local Development (`.dev.vars`)
```bash
GOOGLE_CLIENT_ID=your-client-id.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

### For Production (Cloudflare Secrets)
```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
```

## 3. Multi-Provider Integration

To support both GitHub and Google authentication, you can modify `src/index.ts`:

```typescript
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { Props } from "./types";
import { GitHubHandler } from "./auth/github-handler";
import { GoogleHandler } from "./auth/google-handler";
import { Hono } from "hono";

// Create a routing handler that supports both providers
const authRouter = new Hono();

// Route to GitHub handler
authRouter.route("/github", GitHubHandler);

// Route to Google handler  
authRouter.route("/google", GoogleHandler);

// Main MCP class remains the same
export class MyMCP extends McpAgent<Env, Record<string, never>, Props> {
  server = new McpServer({
    name: "PostgreSQL Database MCP Server",
    version: "1.0.0",
  });

  async init() {
    registerAllTools(this.server, this.env, this.props);
  }
}

// Export OAuth provider with multi-provider support
export default new OAuthProvider({
  apiHandlers: {
    '/sse': MyMCP.serveSSE('/sse') as any,
    '/mcp': MyMCP.serve('/mcp') as any,
  },
  authorizeEndpoint: "/authorize",
  clientRegistrationEndpoint: "/register",
  defaultHandler: authRouter as any, // Use routing handler
  tokenEndpoint: "/token",
});
```

## 4. Google OAuth Application Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
5. Set application type to "Web application"
6. Add authorized redirect URIs:
   - For local development: `http://localhost:8788/google/callback`
   - For production: `https://your-worker.workers.dev/google/callback`

### ⚠️ Important Callback URL Update
As of the latest update, the generic `/callback` handler has been **removed** to eliminate callback routing errors. Each OAuth provider now handles its own specific callback endpoint:
- **Google**: `/google/callback` ✅ (already correctly configured above)
- **GitHub**: `/github/callback` 
- **Auth0**: `/auth0/callback`
- **Custom OAuth**: `/custom/callback`
- **Keycloak**: `/keycloak/callback`

This change eliminates complex callback detection logic and prevents 403/500 routing errors that occurred when callbacks were incorrectly routed between providers.

## 5. Key Differences from GitHub

### User Data Structure
Google provides additional fields that are included in the Props:

```typescript
// Google user props include:
{
  login: string,        // Derived from email (part before @)
  name: string,         // Full display name
  email: string,        // Email address
  accessToken: string,  // Google access token
  picture?: string,     // Profile picture URL
  verified_email?: boolean, // Email verification status
}
```

### OAuth Scopes
- **GitHub**: `read:user` (basic profile access)
- **Google**: `openid profile email` (OpenID Connect with profile and email)

### Authorization URLs
- **GitHub**: `https://github.com/login/oauth/authorize`
- **Google**: `https://accounts.google.com/o/oauth2/v2/auth`

### Token Exchange
- **GitHub**: `https://github.com/login/oauth/access_token`
- **Google**: `https://oauth2.googleapis.com/token`

### User Info APIs
- **GitHub**: `https://api.github.com/user` (via Octokit)
- **Google**: `https://www.googleapis.com/oauth2/v2/userinfo`

## 6. PKCE Implementation

The Google handler implements PKCE properly:

```typescript
// Generate code verifier and challenge
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode.apply(null, Array.from(array)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(digest))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
```

## 7. Testing the Integration

### Local Development
```bash
# Start the MCP server
wrangler dev

# Test Google OAuth flow
# Visit: http://localhost:8788/google/authorize?client_id=your-client&redirect_uri=...
```

### MCP Client Configuration

For Claude Desktop integration with Google auth:

```json
{
  "mcpServers": {
    "database-mcp-google": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8788/mcp"],
      "env": {
        "AUTH_PROVIDER": "google"
      }
    }
  }
}
```

## 8. Security Considerations

1. **PKCE**: Both handlers use PKCE for enhanced security
2. **State Parameter**: Prevents CSRF attacks by encoding OAuth request info
3. **Cookie Security**: HMAC-signed cookies prevent tampering
4. **Token Storage**: Access tokens are securely passed through MCP props
5. **Scope Limitation**: Minimal scopes requested (profile info only)

## 9. Error Handling

Both handlers include comprehensive error handling:

- Invalid state parameter
- Missing authorization code
- Token exchange failures
- User info retrieval errors
- Network timeouts and API errors

## 10. Usage in MCP Tools

The user context is available in all MCP tools:

```typescript
// Example tool using Google user info
this.server.tool(
  "getUserProfile",
  "Get current user profile information",
  {},
  async () => {
    return {
      content: [{
        type: "text",
        text: `**User Profile**\n\n` +
              `**Name:** ${this.props.name}\n` +
              `**Email:** ${this.props.email}\n` +
              `**Login:** ${this.props.login}\n` +
              `**Verified:** ${this.props.verified_email ? 'Yes' : 'No'}\n` +
              `**Picture:** ${this.props.picture || 'Not available'}`
      }]
    };
  }
);
```