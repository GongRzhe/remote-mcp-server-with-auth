# Cloudflare Remote PostgreSQL Database MCP Server + Multi-Provider OAuth

This is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) server that enables you to **chat with your PostgreSQL database**, deployable as a remote MCP server with **multi-provider OAuth authentication** through Cloudflare. This is production ready MCP with support for **5 OAuth providers**: GitHub, Google, Auth0, Keycloak, and Custom OAuth servers.

## Key Features

- **🗄️ Database Integration with Lifespan**: Direct PostgreSQL database connection for all MCP tool calls
- **🛠️ Modular, Single Purpose Tools**: Following best practices around MCP tools and their descriptions
- **🔐 Multi-Provider OAuth**: Support for 5 OAuth providers (GitHub, Google, Auth0, Keycloak, Custom OAuth)
- **👥 Role-Based Access**: Username-based permissions for database write operations across all providers
- **📊 Schema Discovery**: Automatic table and column information retrieval
- **🛡️ SQL Injection Protection**: Built-in validation and sanitization
- **📈 Monitoring**: Optional Sentry integration for production monitoring
- **☁️ Cloud Native**: Powered by [Cloudflare Workers](https://developers.cloudflare.com/workers/) for global scale
- **🔄 PKCE Support**: OAuth 2.1 compliant with PKCE for enhanced security across all providers

## Modular Architecture

This MCP server uses a clean, modular architecture that makes it easy to extend and maintain:

- **`src/tools/`** - Individual tool implementations in separate files
- **`registerAllTools()`** - Centralized tool registration system 
- **Extensible Design** - Add new tools by creating files in `tools/` and registering them

This architecture allows you to easily add new database operations, external API integrations, or any other MCP tools while keeping the codebase organized and maintainable.

## Transport Protocols

This MCP server supports both modern and legacy transport protocols:

- **`/mcp` - Streamable HTTP** (recommended): Uses a single endpoint with bidirectional communication, automatic connection upgrades, and better resilience for network interruptions
- **`/sse` - Server-Sent Events** (legacy): Uses separate endpoints for requests/responses, maintained for backward compatibility

For new implementations, use the `/mcp` endpoint as it provides better performance and reliability.

## How It Works

The MCP server provides three main tools for database interaction:

1. **`listTables`** - Get database schema and table information (all authenticated users)
2. **`queryDatabase`** - Execute read-only SQL queries (all authenticated users)  
3. **`executeDatabase`** - Execute write operations like INSERT/UPDATE/DELETE (privileged users only)

**Authentication Flow**: Users authenticate via any supported OAuth provider (GitHub, Google, Auth0, Keycloak, or Custom OAuth) → Server validates permissions → Tools become available based on user's authentication.

**Security Model**: 
- All authenticated users can read data (regardless of OAuth provider)
- Only specific usernames can write/modify data (configurable per provider)
- SQL injection protection and query validation built-in
- PKCE (Proof Key for Code Exchange) implemented for OAuth 2.1 compliance

## Simple Example First

Want to see a basic MCP server before diving into the full database implementation? Check out `src/simple-math.ts` - a minimal MCP server with a single `calculate` tool that performs basic math operations (add, subtract, multiply, divide). This example demonstrates the core MCP components: server setup, tool definition with Zod schemas, and dual transport support (`/mcp` and `/sse` endpoints). You can run it locally with `wrangler dev --config wrangler-simple.jsonc` and test at `http://localhost:8789/mcp`.

## Prerequisites

- Node.js installed on your machine
- A Cloudflare account (free tier works)
- At least one OAuth provider account (GitHub, Google, Auth0, Keycloak, or your own OAuth server)
- A PostgreSQL database (local or hosted)

## Getting Started

### Step 1: Install Wrangler CLI

Install Wrangler globally to manage your Cloudflare Workers:

```bash
npm install -g wrangler
```

### Step 2: Authenticate with Cloudflare

Log in to your Cloudflare account:

```bash
wrangler login
```

This will open a browser window where you can authenticate with your Cloudflare account.

### Step 3: Clone and Setup

Clone the repo directly & install dependencies: `npm install`.

## Environment Variables Setup

The MCP server supports **5 OAuth providers**. You only need to configure the provider(s) you want to use. Each provider has its own endpoints and configuration.

### Create Environment Variables File

1. **Create your `.dev.vars` file** from the example:
   ```bash
   cp .dev.vars.example .dev.vars
   ```

2. **Configure environment variables** for your chosen OAuth provider(s):

### OAuth Provider Configuration

Choose one or more OAuth providers to enable:

#### 🐙 GitHub OAuth
```bash
# GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
```

#### 🔍 Google OAuth  
```bash
# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

#### 🔐 Auth0 OAuth
```bash
# Auth0 OAuth
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_CLIENT_ID=your_auth0_client_id
AUTH0_CLIENT_SECRET=your_auth0_client_secret
AUTH0_AUDIENCE=your_auth0_audience  # Optional
```

#### 🔑 Keycloak OAuth
```bash
# Keycloak OAuth
KEYCLOAK_DOMAIN=https://your.keycloak.server
KEYCLOAK_REALM=your-realm
KEYCLOAK_CLIENT_ID=your_keycloak_client_id
KEYCLOAK_CLIENT_SECRET=your_keycloak_client_secret  # Optional for public clients
```

#### 🏠 Custom OAuth Server
```bash
# Custom OAuth Server
CUSTOM_OAUTH_URL=http://localhost:3000
CUSTOM_OAUTH_CLIENT_ID=demo-client
```

### Required for All Providers
```bash
# Cookie encryption (required for all providers)
COOKIE_ENCRYPTION_KEY=your_random_encryption_key

# Database Connection
DATABASE_URL=postgresql://username:password@localhost:5432/database_name

# Optional: Sentry monitoring
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
NODE_ENV=development
```

## OAuth Provider Setup

### 🐙 GitHub OAuth Setup

1. **Create a GitHub OAuth App**:
   - Go to [GitHub Developer Settings](https://github.com/settings/developers)
   - Click "New OAuth App"
   - **Application name**: `MCP Server (Local Development)`
   - **Homepage URL**: `http://localhost:8792`
   - **Authorization callback URL**: `http://localhost:8792/github/callback`
   - Click "Register application"

2. **Copy your credentials** to `.dev.vars`:
   ```bash
   GITHUB_CLIENT_ID=your_client_id
   GITHUB_CLIENT_SECRET=your_client_secret
   ```

### 🔍 Google OAuth Setup

1. **Create a Google OAuth Client**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing
   - Enable the Google+ API
   - Go to "Credentials" → "Create Credentials" → "OAuth client ID"
   - **Application type**: Web application
   - **Authorized redirect URIs**: `http://localhost:8792/google/callback`

2. **Copy your credentials** to `.dev.vars`:
   ```bash
   GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your_client_secret
   ```

### 🔐 Auth0 OAuth Setup

1. **Create an Auth0 Application**:
   - Go to [Auth0 Dashboard](https://manage.auth0.com/)
   - Applications → Create Application
   - **Application Type**: Regular Web Applications
   - **Allowed Callback URLs**: `http://localhost:8792/auth0/callback`
   - **Allowed Web Origins**: `http://localhost:8792`

2. **Copy your credentials** to `.dev.vars`:
   ```bash
   AUTH0_DOMAIN=your-tenant.us.auth0.com
   AUTH0_CLIENT_ID=your_client_id
   AUTH0_CLIENT_SECRET=your_client_secret
   ```

### 🔑 Keycloak OAuth Setup

1. **Configure Keycloak Client**:
   - Access your Keycloak Admin Console
   - Select your realm
   - Clients → Create client
   - **Client ID**: `mcp-server`
   - **Client authentication**: Enable for confidential clients
   - **Valid redirect URIs**: `http://localhost:8792/keycloak/callback`

2. **Copy your credentials** to `.dev.vars`:
   ```bash
   KEYCLOAK_DOMAIN=https://your.keycloak.server
   KEYCLOAK_REALM=your-realm
   KEYCLOAK_CLIENT_ID=mcp-server
   KEYCLOAK_CLIENT_SECRET=your_client_secret
   ```

### 🏠 Custom OAuth Server Setup

1. **Use the included OAuth 2.1 server**:
   - Start the custom OAuth server: `cd /root/OAuth && npm start`
   - Server runs on `http://localhost:3000`
   - Pre-configured with `demo-client` and demo user

2. **Copy your credentials** to `.dev.vars`:
   ```bash
   CUSTOM_OAUTH_URL=http://localhost:3000
   CUSTOM_OAUTH_CLIENT_ID=demo-client
   ```

### Generate Encryption Key

Generate a secure random encryption key for cookie encryption:
```bash
openssl rand -hex 32
```
Copy the output and paste it as `COOKIE_ENCRYPTION_KEY` in `.dev.vars`.

## Database Setup

1. **Set up PostgreSQL** using a hosted service like:
   - [Supabase](https://supabase.com/) (recommended for beginners)
   - [Neon](https://neon.tech/)
   - Or use local PostgreSQL/Supabase

2. **Update the DATABASE_URL** in `.dev.vars` with your connection string:
   ```
   DATABASE_URL=postgresql://username:password@host:5432/database_name
   ```

#### Connection String Examples:
- **Local**: `postgresql://myuser:mypass@localhost:5432/mydb`
- **Supabase**: `postgresql://postgres:your-password@db.your-project.supabase.co:5432/postgres`

### Database Schema Setup

The MCP server works with any PostgreSQL database schema. It will automatically discover:
- All tables in the `public` schema
- Column names, types, and constraints
- Primary keys and indexes

**Testing the Connection**: Once you have your database set up, you can test it by asking the MCP server "What tables are available in the database?" and then querying those tables to explore your data.

## Local Development & Testing

**Run the server locally**:
   ```bash
   wrangler dev
   ```
   This makes the server available at `http://localhost:8792`

### Multi-Provider Authentication URLs

The server supports multiple OAuth providers via different endpoints:

- **GitHub**: `http://localhost:8792/github/authorize`
- **Google**: `http://localhost:8792/google/authorize`  
- **Auth0**: `http://localhost:8792/auth0/authorize`
- **Keycloak**: `http://localhost:8792/keycloak/authorize`
- **Custom OAuth**: `http://localhost:8792/custom/authorize`

### Smart OAuth Provider Routing

The MCP server features intelligent OAuth provider routing that automatically handles authentication flows:

#### **Automatic Provider Detection**
When you access the main `/authorize` endpoint, the server:

1. **Single Provider Mode**: If only one OAuth provider is configured, automatically redirects to that provider
2. **Multi-Provider Mode**: If multiple providers are configured, shows a clean selection page
3. **No Configuration**: Returns helpful error message if no providers are set up

#### **⚠️ Important Callback URL Update**
As of the latest update, the generic `/callback` handler has been **removed** to eliminate callback routing errors. Each OAuth provider now handles its own specific callback endpoint:

- **GitHub**: `/github/callback` ✅ (updated)
- **Google**: `/google/callback` ✅ (updated)
- **Auth0**: `/auth0/callback` ✅ (updated)
- **Keycloak**: `/keycloak/callback` ✅ (updated)
- **Custom OAuth**: `/custom/callback` ✅ (updated)

This change eliminates complex callback detection logic and prevents 403/500 routing errors that occurred when callbacks were incorrectly routed between providers.

### Testing with MCP Inspector

Use the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) to test your server:

1. **Install and run Inspector**:
   ```bash
   npx @modelcontextprotocol/inspector@latest
   ```

2. **Connect to your local server**:
   - **Preferred**: Enter URL: `http://localhost:8792/mcp` (streamable HTTP transport - newer, more robust)
   - **Alternative**: Enter URL: `http://localhost:8792/sse` (SSE transport - legacy support)
   - Click "Connect"
   - The server will automatically detect your configured provider(s)
   - **Single Provider**: Redirects directly to your configured provider
   - **Multiple Providers**: Shows a selection page to choose your preferred provider

3. **Provider-Specific Testing** (Optional):
   You can also test specific providers directly:
   - **GitHub**: `http://localhost:8792/github/authorize`
   - **Google**: `http://localhost:8792/google/authorize`  
   - **Auth0**: `http://localhost:8792/auth0/authorize`
   - **Keycloak**: `http://localhost:8792/keycloak/authorize`
   - **Custom OAuth**: `http://localhost:8792/custom/authorize`

4. **Test the tools**:
   - Use `listTables` to see your database structure
   - Use `queryDatabase` to run SELECT queries
   - Use `executeDatabase` (if you have write access) for INSERT/UPDATE/DELETE operations

## Production Deployment

#### Set up a KV namespace
- Create the KV namespace: 
`wrangler kv namespace create "OAUTH_KV"`
- Update the `wrangler.jsonc` file with the KV ID (replace <Add-KV-ID>)

#### Deploy
Deploy the MCP server to make it available on your workers.dev domain

```bash
wrangler deploy
```

### Create environment variables in production

Configure OAuth apps for production with your deployed Worker URL. Replace `<your-subdomain>` with your actual Workers subdomain.

#### Production OAuth App Configuration

For **each OAuth provider** you want to use in production:

**GitHub OAuth App**:
- Homepage URL: `https://mcp-oauth.<your-subdomain>.workers.dev`
- Authorization callback URL: `https://mcp-oauth.<your-subdomain>.workers.dev/github/callback`

**Google OAuth Client**:
- Authorized redirect URIs: `https://mcp-oauth.<your-subdomain>.workers.dev/google/callback`

**Auth0 Application**:
- Allowed Callback URLs: `https://mcp-oauth.<your-subdomain>.workers.dev/auth0/callback`
- Allowed Web Origins: `https://mcp-oauth.<your-subdomain>.workers.dev`

**Keycloak Client**:
- Valid redirect URIs: `https://mcp-oauth.<your-subdomain>.workers.dev/keycloak/callback`

**Custom OAuth Server**:
- Update `oauth-model.js` to include: `https://mcp-oauth.<your-subdomain>.workers.dev/custom/callback`

#### Set Production Secrets

Set secrets for your configured OAuth provider(s):

```bash
# Required for all providers
wrangler secret put COOKIE_ENCRYPTION_KEY  # use: openssl rand -hex 32
wrangler secret put DATABASE_URL

# GitHub OAuth (if using)
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET

# Google OAuth (if using)
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET

# Auth0 OAuth (if using)
wrangler secret put AUTH0_DOMAIN
wrangler secret put AUTH0_CLIENT_ID
wrangler secret put AUTH0_CLIENT_SECRET
wrangler secret put AUTH0_AUDIENCE  # optional

# Keycloak OAuth (if using)
wrangler secret put KEYCLOAK_DOMAIN
wrangler secret put KEYCLOAK_REALM
wrangler secret put KEYCLOAK_CLIENT_ID
wrangler secret put KEYCLOAK_CLIENT_SECRET  # optional for public clients

# Custom OAuth (if using)
wrangler secret put CUSTOM_OAUTH_URL
wrangler secret put CUSTOM_OAUTH_CLIENT_ID

# Optional: Sentry monitoring
wrangler secret put SENTRY_DSN
```

#### Test

Test the remote server using [Inspector](https://modelcontextprotocol.io/docs/tools/inspector): 

```bash
npx @modelcontextprotocol/inspector@latest
```

Connect using your deployed Worker URL:
- **Preferred**: `https://mcp-oauth.<your-subdomain>.workers.dev/mcp` (streamable HTTP)
- **Legacy**: `https://mcp-oauth.<your-subdomain>.workers.dev/sse` (Server-Sent Events)

The authentication flow will automatically detect your configured OAuth provider(s) and guide you through the appropriate authentication process.

<img width="640" alt="image" src="https://github.com/user-attachments/assets/7973f392-0a9d-4712-b679-6dd23f824287" />

You now have a remote MCP server deployed with multi-provider OAuth support! 

## Database Tools & Access Control

### Available Tools

#### 1. `listTables` (All Users)
**Purpose**: Discover database schema and structure  
**Access**: All authenticated GitHub users  
**Usage**: Always run this first to understand your database structure

```
Example output:
- Tables: users, products, orders
- Columns: id (integer), name (varchar), created_at (timestamp)
- Constraints and relationships
```

#### 2. `queryDatabase` (All Users) 
**Purpose**: Execute read-only SQL queries  
**Access**: All authenticated GitHub users  
**Restrictions**: Only SELECT statements and read operations allowed

```sql
-- Examples of allowed queries:
SELECT * FROM users WHERE created_at > '2024-01-01';
SELECT COUNT(*) FROM products;
SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id;
```

#### 3. `executeDatabase` (Privileged Users Only)
**Purpose**: Execute write operations (INSERT, UPDATE, DELETE, DDL)  
**Access**: Restricted to specific GitHub usernames  
**Capabilities**: Full database write access including schema modifications

```sql
-- Examples of allowed operations:
INSERT INTO users (name, email) VALUES ('New User', 'user@example.com');
UPDATE products SET price = 29.99 WHERE id = 1;
DELETE FROM orders WHERE status = 'cancelled';
CREATE TABLE new_table (id SERIAL PRIMARY KEY, data TEXT);
```

### Access Control Configuration  

Database write access is controlled by username in the `ALLOWED_USERNAMES` configuration. The system works with usernames from **any OAuth provider**:

```typescript
// Add usernames for database write access (works with any OAuth provider)
const ALLOWED_USERNAMES = new Set([
  'yourusername',      // Your username from any provider
  'john.doe',          // Google email prefix (john.doe@gmail.com)
  'github-user',       // GitHub username
  'auth0-user',        // Auth0 nickname or email prefix
  'keycloak-user',     // Keycloak preferred_username
  'demo_user'          // Custom OAuth server demo user
]);
```

**Username Mapping by Provider**:
- **GitHub**: Uses GitHub `login` (e.g., `octocat`)
- **Google**: Uses email prefix before `@` (e.g., `john.doe` from `john.doe@gmail.com`)
- **Auth0**: Uses `nickname` or falls back to email prefix or sub ID
- **Keycloak**: Uses `preferred_username` or falls back to email prefix or sub ID  
- **Custom OAuth**: Uses `username` field or falls back to `user_id`

**To update access permissions**:
1. Edit `src/index.ts` and `src/index_sentry.ts`
2. Update the `ALLOWED_USERNAMES` set with usernames from any provider
3. Redeploy the worker: `wrangler deploy`

### Typical Workflow

1. **🔍 Discover**: Use `listTables` to understand database structure
2. **📊 Query**: Use `queryDatabase` to read and analyze data  
3. **✏️ Modify**: Use `executeDatabase` (if you have write access) to make changes

### Security Features

- **SQL Injection Protection**: All queries are validated before execution
- **Operation Type Detection**: Automatic detection of read vs write operations
- **User Context Tracking**: All operations are logged with authenticated user information
- **Multi-Provider Authentication**: Secure OAuth 2.1 with PKCE across all providers
- **Connection Pooling**: Efficient database connection management
- **Error Sanitization**: Database errors are cleaned before being returned to users

### Access the remote MCP server from Claude Desktop

Open Claude Desktop and navigate to Settings -> Developer -> Edit Config. This opens the configuration file that controls which MCP servers Claude can access.

Replace the content with the following configuration. Once you restart Claude Desktop, a browser window will open showing your OAuth login page. Complete the authentication flow with your chosen OAuth provider to grant Claude access to your MCP server. After you grant access, the tools will become available for you to use. 

```json
{
  "mcpServers": {
    "database": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp-oauth.<your-subdomain>.workers.dev/mcp"
      ]
    }
  }
}
```

**Multi-Provider Authentication**: The server will automatically detect your configured OAuth provider(s) and present the appropriate authentication flow. You can authenticate with any of the supported providers (GitHub, Google, Auth0, Keycloak, or Custom OAuth).

Once the Tools (under 🔨) show up in the interface, you can ask Claude to interact with your database. Example commands:

- **"What tables are available in the database?"** → Uses `listTables` tool
- **"Show me all users created in the last 30 days"** → Uses `queryDatabase` tool  
- **"Add a new user named John with email john@example.com"** → Uses `executeDatabase` tool (if you have write access)

### Using Claude and other MCP Clients

When using Claude to connect to your remote MCP server, you may see some error messages. This is because Claude Desktop doesn't yet support remote MCP servers, so it sometimes gets confused. To verify whether the MCP server is connected, hover over the 🔨 icon in the bottom right corner of Claude's interface. You should see your tools available there.

#### Using Cursor and other MCP Clients

To connect Cursor with your MCP server, choose `Type`: "Command" and in the `Command` field, combine the command and args fields into one (e.g. `npx mcp-remote https://<your-worker-name>.<your-subdomain>.workers.dev/sse`).

Note that while Cursor supports HTTP+SSE servers, it doesn't support authentication, so you still need to use `mcp-remote` (and to use a STDIO server, not an HTTP one).

You can connect your MCP server to other MCP clients like Windsurf by opening the client's configuration file, adding the same JSON that was used for the Claude setup, and restarting the MCP client.

## Sentry Integration (Optional)

This project includes optional Sentry integration for comprehensive error tracking, performance monitoring, and distributed tracing. There are two versions available:

- `src/index.ts` - Standard version without Sentry
- `src/index_sentry.ts` - Version with full Sentry integration

### Setting Up Sentry

1. **Create a Sentry Account**: Sign up at [sentry.io](https://sentry.io) if you don't have an account.

2. **Create a New Project**: Create a new project in Sentry and select "Cloudflare Workers" as the platform (search in the top right).

3. **Get Your DSN**: Copy the DSN from your Sentry project settings.

### Using Sentry in Production

To deploy with Sentry monitoring:

1. **Set the Sentry DSN secret**:
   ```bash
   wrangler secret put SENTRY_DSN
   ```
   Enter your Sentry DSN when prompted.

2. **Update your wrangler.toml** to use the Sentry-enabled version:
   ```toml
   main = "src/index_sentry.ts"
   ```

3. **Deploy with Sentry**:
   ```bash
   wrangler deploy
   ```

### Using Sentry in Development

1. **Add Sentry DSN to your `.dev.vars` file**:
   ```
   SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
   NODE_ENV=development
   ```

2. **Run with Sentry enabled**:
   ```bash
   wrangler dev
   ```

### Sentry Features Included

- **Error Tracking**: Automatic capture of all errors with context
- **Performance Monitoring**: Full request tracing with 100% sample rate
- **User Context**: Automatically binds GitHub user information to events
- **Tool Tracing**: Each MCP tool call is traced with parameters
- **Custom Error Handling**: User-friendly error messages with Event IDs
- **Context Enrichment**: Automatic tagging and context for better debugging

## How does it work? 

#### Multi-Provider OAuth Architecture
The MCP server implements a sophisticated multi-provider OAuth architecture that supports 5 different authentication providers:

**OAuth Provider Library**: Serves as a complete OAuth 2.1 server implementation for Cloudflare Workers, handling:
- Authenticating MCP clients that connect to your server
- Managing connections to multiple upstream OAuth services (GitHub, Google, Auth0, Keycloak, Custom OAuth)
- Securely storing tokens and authentication state in KV storage
- PKCE (Proof Key for Code Exchange) implementation for OAuth 2.1 compliance

**Provider Routing System**: Uses Hono routing to direct authentication requests:
- `/github/authorize` → GitHub OAuth handler → redirects to GitHub → callbacks to `/github/callback`
- `/google/authorize` → Google OAuth handler → redirects to Google → callbacks to `/google/callback`  
- `/auth0/authorize` → Auth0 OAuth handler → redirects to Auth0 → callbacks to `/auth0/callback`
- `/keycloak/authorize` → Keycloak OAuth handler → redirects to Keycloak → callbacks to `/keycloak/callback`
- `/custom/authorize` → Custom OAuth handler → redirects to Custom OAuth → callbacks to `/custom/callback`

**Provider-Specific Callbacks**: Each provider uses its own dedicated callback endpoint, eliminating the need for complex callback detection and routing logic.

**Cookie-Based Approval System**: Once a user approves access, signed cookies enable automatic re-authorization for future requests, providing a seamless user experience across all providers.

#### Durable MCP
Durable MCP extends the base MCP functionality with Cloudflare's Durable Objects, providing:
- Persistent state management for your MCP server
- Secure storage of authentication context between requests
- Access to authenticated user information via `this.props`
- Support for conditional tool availability based on user identity

#### MCP Remote
The MCP Remote library enables your server to expose tools that can be invoked by MCP clients like the Inspector. It:
- Defines the protocol for communication between clients and your server
- Provides a structured way to define tools
- Handles serialization and deserialization of requests and responses
- Maintains the Server-Sent Events (SSE) connection between clients and your server

## Testing

This project includes comprehensive unit tests covering all major functionality:

```bash
npm test        # Run all tests
npm run test:ui # Run tests with UI
```

The test suite covers database security, tool registration, permission handling, and response formatting with proper mocking of external dependencies.
