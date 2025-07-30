# Custom OAuth 2.1 Server Integration Example

This document shows how to integrate the custom OAuth 2.1 server (`server.js`) alongside the existing GitHub, Google, Auth0, and Keycloak handlers in the MCP server.

## 1. Handler Setup

The `custom-oauth-handler.ts` has been created to integrate with your custom OAuth 2.1 server. It provides:

- **PKCE Support**: Full OAuth 2.1 compliance with PKCE flow matching your server's requirements
- **Cookie-based Approval**: Same signed cookie system for seamless re-authorization
- **Custom Server Integration**: Direct integration with your `server.js` endpoints
- **Demo User Authentication**: Works with the built-in demo user authentication
- **Network Error Handling**: Comprehensive error handling for local server connectivity

## 2. Environment Variables

Add these custom OAuth server credentials to your environment:

### For Local Development (`.dev.vars`)
```bash
CUSTOM_OAUTH_URL=http://localhost:3000
CUSTOM_OAUTH_CLIENT_ID=demo-client
```

### For Production (Cloudflare Secrets)
```bash
wrangler secret put CUSTOM_OAUTH_URL
wrangler secret put CUSTOM_OAUTH_CLIENT_ID
```

**Note**: No client secret is required since your custom OAuth server supports PKCE for public clients.

## 3. Multi-Provider Integration

The `src/index.ts` has been updated to support all five providers (GitHub, Google, Auth0, Keycloak, and Custom OAuth):

```typescript
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

export default new OAuthProvider({
  apiHandlers: {
    '/sse': MyMCP.serveSSE('/sse') as any,
    '/mcp': MyMCP.serve('/mcp') as any,
  },
  authorizeEndpoint: "/authorize",
  clientRegistrationEndpoint: "/register",
  defaultHandler: authRouter as any, // Use routing handler for all providers
  tokenEndpoint: "/token",
});
```

## 4. Custom OAuth Server Setup

### Start Your Custom OAuth Server

```bash
# In the main OAuth directory (where server.js is located)
cd /root/OAuth

# Start the OAuth 2.1 server
npm start
# or
node server.js
```

Your server will be available at `http://localhost:3000` with these endpoints:
- Authorization: `http://localhost:3000/oauth/authorize`
- Token: `http://localhost:3000/oauth/token`
- User Info: `http://localhost:3000/api/userinfo`
- Discovery: `http://localhost:3000/.well-known/oauth-authorization-server`

### Server Configuration (Already Set Up)

Your `server.js` is already configured correctly for integration:

- **Client ID**: `demo-client` (public client)
- **PKCE**: Required with S256 method
- **Scopes**: `read write`
- **Auto Authentication**: Demo user (`user123`, `demo_user`)
- **Token Lifetime**: 1 hour access token, 14 days refresh token

## 5. Key Differences from Other Providers

### User Data Structure
Your custom OAuth server provides structured user data:

```typescript
// Custom OAuth user props include:
{
  login: string,              // From username or user_id
  name: string,               // Display name (same as login for demo)
  email: string,              // Generated: login@custom-oauth.local
  accessToken: string,        // OAuth access token
  user_id?: string,          // Custom server user ID
  scope?: string,            // Granted scopes (e.g., "read write")
  client_id?: string,        // OAuth client ID
  provider?: string,         // Set to "custom-oauth"
}
```

### OAuth Scopes
- **GitHub**: `read:user` (basic profile access)
- **Google**: `openid profile email` (OpenID Connect)
- **Auth0**: `openid profile email` (OpenID Connect with customizable scopes)
- **Keycloak**: `openid profile email` (OpenID Connect with extensive customization)
- **Custom OAuth**: `read write` (custom scopes defined in your server)

### Authorization URLs
- **GitHub**: `https://github.com/login/oauth/authorize`
- **Google**: `https://accounts.google.com/o/oauth2/v2/auth`
- **Auth0**: `https://YOUR_DOMAIN.auth0.com/authorize`
- **Keycloak**: `https://YOUR_DOMAIN/realms/YOUR_REALM/protocol/openid-connect/auth`
- **Custom OAuth**: `http://localhost:3000/oauth/authorize`

### Token Exchange
- **GitHub**: `https://github.com/login/oauth/access_token`
- **Google**: `https://oauth2.googleapis.com/token`
- **Auth0**: `https://YOUR_DOMAIN.auth0.com/oauth/token`
- **Keycloak**: `https://YOUR_DOMAIN/realms/YOUR_REALM/protocol/openid-connect/token`
- **Custom OAuth**: `http://localhost:3000/oauth/token`

### User Info APIs
- **GitHub**: `https://api.github.com/user` (via Octokit)
- **Google**: `https://www.googleapis.com/oauth2/v2/userinfo`
- **Auth0**: `https://YOUR_DOMAIN.auth0.com/userinfo`
- **Keycloak**: `https://YOUR_DOMAIN/realms/YOUR_REALM/protocol/openid-connect/userinfo`
- **Custom OAuth**: `http://localhost:3000/api/userinfo`

## 6. PKCE Implementation

The custom OAuth handler implements PKCE to match your server's requirements:

```typescript
// Server expects PKCE parameters in authorization request
const finalAuthUrl = authUrl + 
  "&code_challenge=" + encodeURIComponent(codeChallenge) + 
  "&code_challenge_method=S256";

// Server validates PKCE in token request
const tokenRequestData = {
  grant_type: 'authorization_code',
  client_id: 'demo-client',
  code: code,
  redirect_uri: callbackUrl,
  code_verifier: codeVerifier  // Validates against stored challenge
};
```

## 7. Testing the Integration

### Local Development Setup

1. **Start the Custom OAuth Server**:
   ```bash
   cd /root/OAuth
   npm start
   ```

2. **Start the MCP Server**:
   ```bash
   cd /root/OAuth/remote-mcp-server-with-auth
   wrangler dev
   ```

3. **Test Custom OAuth Flow**:
   ```
   # Visit: http://localhost:8788/custom/authorize?client_id=your-client&redirect_uri=...
   ```

### MCP Client Configuration

For Claude Desktop integration with custom OAuth:

```json
{
  "mcpServers": {
    "database-mcp-custom": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8788/mcp"],
      "env": {
        "AUTH_PROVIDER": "custom"
      }
    }
  }
}
```

## 8. Server.js Integration Details

### Authorization Flow Matching

Your custom handler matches the server's expectations:

1. **Authorization Request**: Includes required PKCE parameters
2. **User Authentication**: Server auto-authenticates with demo user
3. **Code Storage**: Server stores code challenge with authorization code
4. **Token Validation**: Server validates code verifier against stored challenge
5. **User Info**: Server provides structured user data

### Demo User Authentication

Your server includes automatic demo user authentication:

```javascript
// From server.js line 54-58
authenticateHandler: {
  handle: (request) => {
    // Simple user authentication - in production, implement proper auth
    return { id: 'user123', username: 'demo_user' };
  }
}
```

This means the custom OAuth handler will always authenticate as:
- User ID: `user123`
- Username: `demo_user`
- Login: `demo_user`
- Name: `demo_user`
- Email: `demo_user@custom-oauth.local`

## 9. Server Response Format

### Token Response (from server.js)
```json
{
  "access_token": "generated-access-token",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "generated-refresh-token",
  "scope": "read write"
}
```

### User Info Response (from server.js)
```json
{
  "user_id": "user123",
  "username": "demo_user",
  "scope": ["read", "write"],
  "client_id": "demo-client"
}
```

## 10. Security Considerations

1. **PKCE**: Full PKCE implementation matching OAuth 2.1 standards
2. **State Parameter**: Prevents CSRF attacks by encoding OAuth request info
3. **Token Validation**: Server validates all PKCE parameters before issuing tokens
4. **Local Network**: Secure for local development; ensure proper security for production
5. **Demo Authentication**: Built-in demo user for testing; implement real auth for production

## 11. Error Handling

The custom OAuth handler includes comprehensive error handling:

- Missing or invalid OAuth server URL
- OAuth server connectivity issues
- Invalid authorization codes
- Token exchange failures
- User info retrieval errors
- PKCE validation errors

Example error responses:
```javascript
// Network connectivity
return c.text("Network connectivity issue. Please check your internet connection and try again. If using a proxy, ensure it allows connections to the custom OAuth server.", 500);

// Token exchange failure
console.error("Custom OAuth token exchange failed:", {
  status: tokenResponse.status,
  statusText: tokenResponse.statusText,
  error: errorText
});
```

## 12. Usage in MCP Tools

The user context includes custom OAuth-specific fields:

```typescript
// Example tool using custom OAuth user info
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
              `**User ID:** ${this.props.user_id}\n` +
              `**Scopes:** ${this.props.scope}\n` +
              `**Client ID:** ${this.props.client_id}\n` +
              `**Provider:** ${this.props.provider}\n` +
              `**Access Token:** ${this.props.accessToken.substring(0, 20)}...`
      }]
    };
  }
);
```

## 13. Production Considerations

### Server Modifications (if needed)

If you need to modify your `server.js` for production, here are some considerations:

1. **Real Authentication**: Replace demo authentication with actual user login
2. **Database Storage**: Replace in-memory storage with persistent database
3. **HTTPS**: Use HTTPS for production deployments
4. **Rate Limiting**: Add rate limiting for API endpoints
5. **Logging**: Add comprehensive audit logging

### Example Production Authentication

```javascript
// Replace demo authentication in server.js
authenticateHandler: {
  handle: async (request) => {
    // Implement real user authentication
    const user = await authenticateUser(request);
    if (!user) {
      throw new Error('Authentication failed');
    }
    return { id: user.id, username: user.username };
  }
}
```

## 14. Advanced Features

### Token Introspection

Your server supports token introspection (already implemented):

```bash
# Test token introspection
curl -X POST "http://localhost:3000/oauth/introspect" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=YOUR_ACCESS_TOKEN"
```

### Discovery Endpoint

Your server provides OAuth discovery information:

```bash
# Get server configuration
curl "http://localhost:3000/.well-known/oauth-authorization-server"
```

### Refresh Tokens

Your server supports refresh token flow:

```bash
# Refresh access token
curl -X POST "http://localhost:3000/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token&refresh_token=YOUR_REFRESH_TOKEN&client_id=demo-client"
```

## 15. Testing with All Providers

You can now test all five providers in parallel:

```bash
# Test GitHub
curl "http://localhost:8788/github/authorize?client_id=test&redirect_uri=http://localhost:8788/github/callback"

# Test Google
curl "http://localhost:8788/google/authorize?client_id=test&redirect_uri=http://localhost:8788/google/callback"

# Test Auth0
curl "http://localhost:8788/auth0/authorize?client_id=test&redirect_uri=http://localhost:8788/auth0/callback"

# Test Keycloak
curl "http://localhost:8788/keycloak/authorize?client_id=test&redirect_uri=http://localhost:8788/keycloak/callback"

# Test Custom OAuth
curl "http://localhost:8788/custom/authorize?client_id=test&redirect_uri=http://localhost:8788/custom/callback"
```

## 16. Provider Comparison Summary

Your MCP server now supports **five complete OAuth providers**:

| Provider | Type | Best For | Key Features |
|----------|------|----------|--------------|
| **GitHub** | Developer Platform | Code/DevOps apps | Repository access, developer tools |
| **Google** | Consumer Platform | General applications | Google services integration |
| **Auth0** | SaaS Identity | Rapid deployment | Enterprise features, easy setup |
| **Keycloak** | Self-hosted | Enterprise/Custom | Full control, LDAP, custom flows |
| **Custom OAuth** | Local Development | Learning/Testing | Full control, PKCE demo, local dev |

## 17. Troubleshooting

### Common Issues

1. **"Custom OAuth server not reachable"**
   - Ensure `server.js` is running on `http://localhost:3000`
   - Check `CUSTOM_OAUTH_URL` environment variable

2. **"PKCE validation failed"**
   - Server logs will show PKCE validation details
   - Ensure code verifier/challenge generation matches server expectations

3. **"Invalid authorization code"**
   - Check server logs for authorization code generation/storage
   - Ensure callback URI matches exactly

4. **"Demo user authentication issues"**
   - Server automatically authenticates demo user
   - Check server console for authentication handler logs

### Debug Commands

```bash
# Test server connectivity
curl "http://localhost:3000/.well-known/oauth-authorization-server"

# Check server logs
# Server logs will show PKCE validation process in detail

# Test manual PKCE flow
# Use the curl examples from the main README.md
```

The MCP server now provides complete OAuth coverage including your custom OAuth 2.1 server with full PKCE support! 🚀