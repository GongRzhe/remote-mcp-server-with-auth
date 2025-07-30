# Keycloak OAuth Integration Example

This document shows how to integrate the Keycloak OAuth handler alongside the existing GitHub, Google, and Auth0 handlers in the MCP server.

## 1. Handler Setup

The `keycloak-handler.ts` has been created following the same pattern as the other OAuth handlers. It provides:

- PKCE (Proof Key for Code Exchange) for enhanced security
- Cookie-based approval system to skip repeated authorization
- Keycloak OpenID Connect integration with realm support
- Comprehensive error handling and network debugging
- Support for both public and confidential clients

## 2. Environment Variables

Add these Keycloak OAuth credentials to your environment:

### For Local Development (`.dev.vars`)
```bash
KEYCLOAK_DOMAIN=http://localhost:8080
KEYCLOAK_REALM=master
KEYCLOAK_CLIENT_ID=mcp-client
KEYCLOAK_CLIENT_SECRET=your-client-secret  # Optional for public clients
```

### For Production (Cloudflare Secrets)
```bash
wrangler secret put KEYCLOAK_DOMAIN
wrangler secret put KEYCLOAK_REALM
wrangler secret put KEYCLOAK_CLIENT_ID
wrangler secret put KEYCLOAK_CLIENT_SECRET  # Optional
```

## 3. Multi-Provider Integration

The `src/index.ts` has been updated to support all four providers (GitHub, Google, Auth0, and Keycloak):

```typescript
import { GitHubHandler } from "./auth/github-handler";
import { GoogleHandler } from "./auth/google-handler";
import { Auth0Handler } from "./auth/auth0-handler";
import { KeycloakHandler } from "./auth/keycloak-handler";
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

## 4. Keycloak Server Setup

### Option 1: Docker Quick Start

```bash
# Start Keycloak server with admin user
docker run -p 8080:8080 \
  -e KEYCLOAK_ADMIN=admin \
  -e KEYCLOAK_ADMIN_PASSWORD=admin \
  quay.io/keycloak/keycloak:latest start-dev
```

### Option 2: Production Setup

For production environments, follow the [Keycloak Server Installation Guide](https://www.keycloak.org/server/installation).

## 5. Keycloak Admin Console Configuration

### Access Admin Console
1. Open `http://localhost:8080/admin` (for local Docker setup)
2. Login with admin credentials (`admin` / `admin` for Docker setup)

### Create or Select Realm
1. **Create New Realm** (recommended):
   - Click "Create realm"
   - Realm name: `mcp-realm`
   - Click "Create"

2. **Or Use Master Realm** (for testing):
   - Select "master" realm from dropdown

### Create OAuth Client
1. Go to "Clients" → "Create client"
2. **General Settings**:
   - Client type: `OpenID Connect`
   - Client ID: `mcp-client`
   - Name: `MCP Server Client`
   - Description: `OAuth client for MCP Remote Server`

3. **Capability config**:
   - Client authentication: `Off` (for public client with PKCE)
   - Authorization: `Off`
   - Standard flow: `Enabled` ✅
   - Direct access grants: `Disabled`
   - Implicit flow: `Disabled`
   - Service accounts roles: `Disabled`

4. **Login settings**:
   - Valid redirect URIs: 
     - `http://localhost:8788/keycloak/callback` (for local development)
     - `https://your-worker.workers.dev/keycloak/callback` (for production)
   - Valid post logout redirect URIs:
     - `http://localhost:8788/`

### ⚠️ Important Callback URL Update
As of the latest update, the generic `/callback` handler has been **removed** to eliminate callback routing errors. Each OAuth provider now handles its own specific callback endpoint:
- **Keycloak**: `/keycloak/callback` ✅ (already correctly configured above)
- **GitHub**: `/github/callback` 
- **Google**: `/google/callback`
- **Auth0**: `/auth0/callback`
- **Custom OAuth**: `/custom/callback`

This change eliminates complex callback detection logic and prevents 403/500 routing errors that occurred when callbacks were incorrectly routed between providers.
     - `https://your-worker.workers.dev/`
   - Web origins: `*` (or specify your domains)

### Create Test User
1. Go to "Users" → "Add user"
2. **User details**:
   - Username: `testuser`
   - Email: `test@example.com`
   - First name: `Test`
   - Last name: `User`
   - Email verified: `Yes`
   - Enabled: `Yes`

3. **Set Password**:
   - Go to "Credentials" tab
   - Click "Set password"
   - Password: `testpassword`
   - Temporary: `Off` ✅
   - Click "Save"

## 6. Key Differences from Other Providers

### User Data Structure
Keycloak provides comprehensive OpenID Connect user data:

```typescript
// Keycloak user props include:
{
  login: string,              // From preferred_username or email
  name: string,               // Full display name or constructed from given/family name
  email: string,              // Email address
  accessToken: string,        // Keycloak access token
  picture?: string,           // Profile picture URL (if configured)
  verified_email?: boolean,   // Email verification status
  sub?: string,              // Keycloak user ID (UUID format)
  updated_at?: string,       // Last update timestamp
  preferred_username?: string, // Keycloak username
  given_name?: string,       // First name
  family_name?: string,      // Last name
}
```

### OAuth Scopes
- **GitHub**: `read:user` (basic profile access)
- **Google**: `openid profile email` (OpenID Connect)
- **Auth0**: `openid profile email` (OpenID Connect with customizable scopes)
- **Keycloak**: `openid profile email` (OpenID Connect with extensive customization)

### Authorization URLs
- **GitHub**: `https://github.com/login/oauth/authorize`
- **Google**: `https://accounts.google.com/o/oauth2/v2/auth`
- **Auth0**: `https://YOUR_DOMAIN.auth0.com/authorize`
- **Keycloak**: `https://YOUR_DOMAIN/realms/YOUR_REALM/protocol/openid-connect/auth`

### Token Exchange
- **GitHub**: `https://github.com/login/oauth/access_token`
- **Google**: `https://oauth2.googleapis.com/token`
- **Auth0**: `https://YOUR_DOMAIN.auth0.com/oauth/token`
- **Keycloak**: `https://YOUR_DOMAIN/realms/YOUR_REALM/protocol/openid-connect/token`

### User Info APIs
- **GitHub**: `https://api.github.com/user` (via Octokit)
- **Google**: `https://www.googleapis.com/oauth2/v2/userinfo`
- **Auth0**: `https://YOUR_DOMAIN.auth0.com/userinfo`
- **Keycloak**: `https://YOUR_DOMAIN/realms/YOUR_REALM/protocol/openid-connect/userinfo`

## 7. PKCE Implementation

The Keycloak handler implements PKCE following OAuth 2.1 standards:

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

## 8. Testing the Integration

### Local Development
```bash
# Start the MCP server
wrangler dev

# Test Keycloak OAuth flow
# Visit: http://localhost:8788/keycloak/authorize?client_id=your-client&redirect_uri=...
```

### MCP Client Configuration

For Claude Desktop integration with Keycloak:

```json
{
  "mcpServers": {
    "database-mcp-keycloak": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8788/mcp"],
      "env": {
        "AUTH_PROVIDER": "keycloak"
      }
    }
  }
}
```

## 9. Advanced Keycloak Features

### Realm Configuration
Keycloak's realm concept allows for multi-tenancy:

```bash
# Different realms for different environments
KEYCLOAK_REALM=development  # for dev
KEYCLOAK_REALM=production   # for prod
KEYCLOAK_REALM=company-sso  # for enterprise
```

### Client Types
1. **Public Client** (recommended for PKCE):
   - No client secret required
   - PKCE mandatory
   - Suitable for single-page apps and mobile apps

2. **Confidential Client**:
   - Requires client secret
   - Can use PKCE (recommended) or client secret
   - Suitable for server-side applications

### Custom User Attributes
Keycloak allows custom user attributes that appear in the userinfo endpoint:

```json
{
  "sub": "f7d42348-c647-4685-8993-43c92b429d9f",
  "email_verified": true,
  "name": "John Doe",
  "preferred_username": "john.doe",
  "given_name": "John",
  "family_name": "Doe",
  "email": "john.doe@example.com",
  "department": "Engineering",     // Custom attribute
  "employee_id": "EMP001",        // Custom attribute
  "roles": ["user", "developer"]  // Custom attribute
}
```

## 10. Security Considerations

1. **PKCE**: All handlers use PKCE for enhanced security
2. **State Parameter**: Prevents CSRF attacks by encoding OAuth request info with code verifier
3. **Cookie Security**: HMAC-signed cookies prevent tampering
4. **Token Storage**: Access tokens are securely passed through MCP props
5. **Scope Limitation**: Minimal scopes requested (profile info only)
6. **Realm Isolation**: Keycloak realms provide strong tenant isolation
7. **Client Authentication**: Support for both public (PKCE) and confidential clients

## 11. Error Handling

The Keycloak handler includes comprehensive error handling:

- Missing or invalid Keycloak domain/realm
- Invalid state parameter
- Missing authorization code
- Token exchange failures (with detailed logging)
- User info retrieval errors
- Network timeouts and connectivity issues

Example error responses:
```javascript
// Missing configuration
throw new Error("KEYCLOAK_DOMAIN environment variable is required");
throw new Error("KEYCLOAK_REALM environment variable is required");

// Token exchange failure
console.error("Keycloak token exchange failed:", {
  status: tokenResponse.status,
  statusText: tokenResponse.statusText,
  error: errorText
});

// Network connectivity
return c.text("Network connectivity issue. Please check your internet connection and try again. If using a proxy, ensure it allows connections to Keycloak.", 500);
```

## 12. Usage in MCP Tools

The user context is available in all MCP tools with Keycloak-specific fields:

```typescript
// Example tool using Keycloak user info
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
              `**Username:** ${this.props.preferred_username}\n` +
              `**Email:** ${this.props.email}\n` +
              `**Login:** ${this.props.login}\n` +
              `**Verified:** ${this.props.verified_email ? 'Yes' : 'No'}\n` +
              `**Given Name:** ${this.props.given_name || 'Not available'}\n` +
              `**Family Name:** ${this.props.family_name || 'Not available'}\n` +
              `**Picture:** ${this.props.picture || 'Not available'}\n` +
              `**Keycloak ID:** ${this.props.sub}\n` +
              `**Last Updated:** ${this.props.updated_at || 'Unknown'}`
      }]
    };
  }
);
```

## 13. Keycloak Extensions and Customizations

### Custom Themes
Keycloak allows custom login/registration themes:
```bash
# Custom theme directory structure
themes/
  custom-theme/
    login/
      login.ftl
      resources/
        css/
        js/
        img/
```

### Identity Providers
Keycloak can integrate with external identity providers:
- LDAP/Active Directory
- SAML providers
- Social providers (Google, Facebook, etc.)
- Custom OIDC providers

### Event Listeners
Custom event listeners for audit logging:
```java
// Custom event listener for MCP authentication events
public class MCPEventListener implements EventListenerProvider {
    @Override
    public void onEvent(Event event) {
        if (event.getType() == EventType.LOGIN) {
            // Log MCP authentication event
        }
    }
}
```

## 14. Production Deployment

### Keycloak Production Setup
```bash
# Production-ready Keycloak with database
docker run -d \
  --name keycloak \
  -p 8080:8080 \
  -e KEYCLOAK_ADMIN=admin \
  -e KEYCLOAK_ADMIN_PASSWORD=secure-password \
  -e KC_DB=postgres \
  -e KC_DB_URL=jdbc:postgresql://postgres:5432/keycloak \
  -e KC_DB_USERNAME=keycloak \
  -e KC_DB_PASSWORD=password \
  -e KC_HOSTNAME=auth.example.com \
  -e KC_PROXY=edge \
  quay.io/keycloak/keycloak:latest start
```

### Environment Variables for Production
```bash
KEYCLOAK_DOMAIN=https://auth.example.com
KEYCLOAK_REALM=production
KEYCLOAK_CLIENT_ID=mcp-production-client
KEYCLOAK_CLIENT_SECRET=secure-production-secret
```

## 15. Testing with Different Providers

You can test all four providers in parallel:

```bash
# Test GitHub
curl "http://localhost:8788/github/authorize?client_id=test&redirect_uri=http://localhost:8788/github/callback"

# Test Google
curl "http://localhost:8788/google/authorize?client_id=test&redirect_uri=http://localhost:8788/google/callback"

# Test Auth0
curl "http://localhost:8788/auth0/authorize?client_id=test&redirect_uri=http://localhost:8788/auth0/callback"

# Test Keycloak
curl "http://localhost:8788/keycloak/authorize?client_id=test&redirect_uri=http://localhost:8788/keycloak/callback"
```

## 16. Troubleshooting

### Common Issues

1. **"KEYCLOAK_DOMAIN environment variable is required"**
   - Ensure KEYCLOAK_DOMAIN is set with protocol (http:// or https://)

2. **"KEYCLOAK_REALM environment variable is required"**
   - Set KEYCLOAK_REALM to your target realm name

3. **"Network connectivity issue"**
   - Check if Keycloak server is running
   - Verify proxy settings don't block Keycloak domain

4. **"Invalid client"**
   - Verify client ID exists in the specified realm
   - Check client configuration (public vs confidential)

5. **"Invalid redirect URI"**
   - Ensure redirect URI exactly matches client configuration
   - Check for trailing slashes and protocol mismatches

6. **"User not found"**
   - User must exist in the specified realm
   - Check user is enabled and email verified

### Debug Commands

```bash
# Test Keycloak server connectivity
curl "http://localhost:8080/realms/master/.well-known/openid_configuration"

# Test realm-specific configuration
curl "http://localhost:8080/realms/mcp-realm/.well-known/openid_configuration"

# Check client configuration (admin API)
curl -H "Authorization: Bearer ADMIN_TOKEN" \
  "http://localhost:8080/admin/realms/mcp-realm/clients"
```

The MCP server now supports all four major authentication providers with enterprise-grade Keycloak integration! 🔐