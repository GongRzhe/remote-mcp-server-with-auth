# Auth0 OAuth Integration Example

This document shows how to integrate the Auth0 OAuth handler alongside the existing GitHub and Google handlers in the MCP server.

## 1. Handler Setup

The `auth0-handler.ts` has been created following the same pattern as the GitHub and Google handlers. It provides:

- PKCE (Proof Key for Code Exchange) for enhanced security
- Cookie-based approval system to skip repeated authorization
- Auth0-specific user info extraction with OpenID Connect support
- Proper error handling and token management

## 2. Environment Variables

Add these Auth0 OAuth credentials to your environment:

### For Local Development (`.dev.vars`)
```bash
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AUTH0_AUDIENCE=your-api-audience  # Optional
```

### For Production (Cloudflare Secrets)
```bash
wrangler secret put AUTH0_DOMAIN
wrangler secret put AUTH0_CLIENT_ID
wrangler secret put AUTH0_CLIENT_SECRET
wrangler secret put AUTH0_AUDIENCE  # Optional
```

## 3. Multi-Provider Integration

The `src/index.ts` has been updated to support all three providers (GitHub, Google, and Auth0):

```typescript
import { GitHubHandler } from "./auth/github-handler";
import { GoogleHandler } from "./auth/google-handler";
import { Auth0Handler } from "./auth/auth0-handler";
import { Hono } from "hono";

// Create a routing handler that supports multiple providers
const authRouter = new Hono();

// Route to GitHub handler
authRouter.route("/github", GitHubHandler);

// Route to Google handler  
authRouter.route("/google", GoogleHandler);

// Route to Auth0 handler
authRouter.route("/auth0", Auth0Handler);

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
```

## 4. Auth0 Application Setup

1. Go to [Auth0 Dashboard](https://manage.auth0.com/)
2. Create a new application or select an existing one
3. Set application type to "Regular Web Application"
4. Configure the following settings:

### Application Settings
- **Application Type**: Regular Web Application
- **Token Endpoint Authentication Method**: POST
- **Allowed Callback URLs**:
  - For local development: `http://localhost:8788/auth0/callback`
  - For production: `https://your-worker.workers.dev/auth0/callback`
- **Allowed Logout URLs**:
  - For local development: `http://localhost:8788/`
  - For production: `https://your-worker.workers.dev/`
- **Allowed Web Origins**:
  - For local development: `http://localhost:8788`
  - For production: `https://your-worker.workers.dev`

### Advanced Settings
- **Grant Types**: Enable "Authorization Code" and "Refresh Token"
- **OIDC Conformant**: Should be enabled (default for new applications)

## 5. Key Differences from GitHub/Google

### User Data Structure
Auth0 provides comprehensive user data following OpenID Connect standards:

```typescript
// Auth0 user props include:
{
  login: string,           // Derived from nickname or email
  name: string,            // Full display name
  email: string,           // Email address
  accessToken: string,     // Auth0 access token
  picture?: string,        // Profile picture URL
  verified_email?: boolean, // Email verification status
  sub?: string,            // Auth0 user ID (e.g., "auth0|abc123")
  updated_at?: string,     // ISO timestamp of last update
}
```

### OAuth Scopes
- **GitHub**: `read:user` (basic profile access)
- **Google**: `openid profile email` (OpenID Connect)
- **Auth0**: `openid profile email` (OpenID Connect with customizable scopes)

### Authorization URLs
- **GitHub**: `https://github.com/login/oauth/authorize`
- **Google**: `https://accounts.google.com/o/oauth2/v2/auth`
- **Auth0**: `https://YOUR_DOMAIN.auth0.com/authorize`

### Token Exchange
- **GitHub**: `https://github.com/login/oauth/access_token`
- **Google**: `https://oauth2.googleapis.com/token`
- **Auth0**: `https://YOUR_DOMAIN.auth0.com/oauth/token`

### User Info APIs
- **GitHub**: `https://api.github.com/user` (via Octokit)
- **Google**: `https://www.googleapis.com/oauth2/v2/userinfo`
- **Auth0**: `https://YOUR_DOMAIN.auth0.com/userinfo`

## 6. PKCE Implementation

The Auth0 handler implements PKCE properly following OAuth 2.1 standards:

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

# Test Auth0 OAuth flow
# Visit: http://localhost:8788/auth0/authorize?client_id=your-client&redirect_uri=...
```

### MCP Client Configuration

For Claude Desktop integration with Auth0:

```json
{
  "mcpServers": {
    "database-mcp-auth0": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8788/mcp"],
      "env": {
        "AUTH_PROVIDER": "auth0"
      }
    }
  }
}
```

## 8. Auth0 Audience (API Authorization)

If you need to access Auth0 APIs or custom APIs, configure the audience parameter:

### In Environment Variables
```bash
AUTH0_AUDIENCE=https://your-api.example.com
```

### In Auth0 Dashboard
1. Go to Applications → APIs
2. Create or select your API
3. Note the API Identifier (this becomes your audience)
4. Configure API settings and scopes as needed

### Usage in Authorization
The handler automatically includes the audience parameter if configured:

```typescript
// Add audience if configured
const audience = (env as any).AUTH0_AUDIENCE;
if (audience) {
  const urlWithAudience = finalAuthUrl + "&audience=" + encodeURIComponent(audience);
  // ... redirect with audience
}
```

## 9. Security Considerations

1. **PKCE**: All three handlers use PKCE for enhanced security
2. **State Parameter**: Prevents CSRF attacks by encoding OAuth request info with code verifier
3. **Cookie Security**: HMAC-signed cookies prevent tampering
4. **Token Storage**: Access tokens are securely passed through MCP props
5. **Scope Limitation**: Minimal scopes requested (profile info only)
6. **Domain Validation**: Auth0 domain must be provided and properly formatted

## 10. Error Handling

The Auth0 handler includes comprehensive error handling:

- Missing or invalid Auth0 domain
- Invalid state parameter
- Missing authorization code
- Token exchange failures (with detailed logging)
- User info retrieval errors
- Network timeouts and API errors

Example error responses:
```javascript
// Missing domain
throw new Error("AUTH0_DOMAIN environment variable is required");

// Token exchange failure
console.error("Auth0 token exchange failed:", errorText);
return c.text("Failed to fetch access token", 500);

// User info failure
console.error("Auth0 user info failed:", errorText);
return c.text("Failed to fetch user info", 500);
```

## 11. Usage in MCP Tools

The user context is available in all MCP tools with Auth0-specific fields:

```typescript
// Example tool using Auth0 user info
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
              `**Picture:** ${this.props.picture || 'Not available'}\n` +
              `**Auth0 ID:** ${this.props.sub}\n` +
              `**Last Updated:** ${this.props.updated_at || 'Unknown'}`
      }]
    };
  }
);
```

## 12. Auth0 Rules and Hooks (Advanced)

Auth0 allows customization of the authentication flow through Rules and Hooks:

### Example Rule: Add Custom Claims
```javascript
function addCustomClaims(user, context, callback) {
  const namespace = 'https://your-app.com/';
  context.idToken[namespace + 'role'] = user.app_metadata?.role || 'user';
  context.accessToken[namespace + 'permissions'] = user.app_metadata?.permissions || [];
  callback(null, user, context);
}
```

### Accessing Custom Claims
```typescript
// In the callback handler, custom claims are available in userData
const { sub, email, name, [`https://your-app.com/role`]: role } = userData;
```

## 13. Multi-Tenant Setup

For multi-tenant applications, you can configure different Auth0 tenants:

```bash
# Environment variables for different tenants
AUTH0_DOMAIN_TENANT_A=tenant-a.auth0.com
AUTH0_DOMAIN_TENANT_B=tenant-b.auth0.com
# ... configure routing logic in your handler
```

## 14. Testing with Different Providers

You can test all three providers in parallel:

```bash
# Test GitHub
curl "http://localhost:8788/github/authorize?client_id=test&redirect_uri=http://localhost:8788/github/callback"

# Test Google
curl "http://localhost:8788/google/authorize?client_id=test&redirect_uri=http://localhost:8788/google/callback"

# Test Auth0
curl "http://localhost:8788/auth0/authorize?client_id=test&redirect_uri=http://localhost:8788/auth0/callback"
```

The MCP server now supports all three major OAuth providers with consistent APIs and security practices!