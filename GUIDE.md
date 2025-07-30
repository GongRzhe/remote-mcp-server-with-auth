# MCP Tools Development Guide

This guide explains how to add new tools to the MCP (Model Context Protocol) server with OAuth authentication. The server follows a consistent architecture pattern that makes adding new integrations straightforward.

## 🏗️ Architecture Overview

The MCP server follows a modular architecture with clear separation of concerns:

```
src/
├── tools/                  # MCP tool implementations with Sentry
│   ├── database-tools-sentry.ts      # PostgreSQL database operations
│   ├── github-tools-sentry.ts        # GitHub repository search & info
│   ├── gmail-tools-sentry.ts         # Gmail email sending & profile
│   ├── brave-search-tools-sentry.ts  # Brave Search web & news search
│   └── [service]-tools-sentry.ts     # Template for new services
├── database/              # Database-specific utilities
│   ├── utils.ts          # PostgreSQL connection wrapper
│   ├── security.ts       # SQL validation and sanitization
│   └── connection.ts     # Connection pooling
├── github/                # GitHub-specific utilities
│   ├── utils.ts          # GitHub API wrapper with Octokit
│   └── security.ts       # Repository and input validation
├── gmail/                 # Gmail-specific utilities
│   ├── utils.ts          # Gmail API wrapper and email formatting
│   └── security.ts       # Email content validation and anti-phishing
├── brave-search/          # Brave Search-specific utilities
│   ├── utils.ts          # Brave Search API wrapper and result formatting
│   └── security.ts       # Query validation and content filtering
├── [service]/             # Template for new service utilities
│   ├── utils.ts          # Core operations wrapper
│   └── security.ts       # Validation and security functions
├── types.ts              # Zod schemas and type definitions for all services
└── index_sentry.ts       # Main server with all tool registrations
```

## 📋 Tool Development Pattern

Every new service integration follows this consistent 5-step pattern:

### 1. Service Directory Structure
Create a new directory under `src/[service]/`:
- `utils.ts` - Core operations wrapper function
- `security.ts` - Input validation and security functions

### 2. Tool Implementation
Create `src/tools/[service]-tools-sentry.ts` with Sentry instrumentation

### 3. Type Definitions
Add Zod schemas to `src/types.ts`

### 4. Registration
Register tools in `src/index_sentry.ts`

### 5. Environment Configuration
Add required environment variables to `wrangler.jsonc`

## 🔧 Step-by-Step Implementation Guide

### Step 1: Create Service Directory Structure

Create `src/[service]/utils.ts` with the core wrapper pattern:

```typescript
import { ServiceClient } from "[service-sdk]";

/**
 * Execute a [service] operation with proper error handling and authentication
 */
export async function with[Service]<T>(
	accessToken: string,
	operation: (client: ServiceClient) => Promise<T>
): Promise<T> {
	const client = new ServiceClient({ auth: accessToken });
	const startTime = Date.now();
	try {
		const result = await operation(client);
		const duration = Date.now() - startTime;
		console.log(`[Service] operation completed successfully in ${duration}ms`);
		return result;
	} catch (error) {
		const duration = Date.now() - startTime;
		console.error(`[Service] operation failed after ${duration}ms:`, error);
		// Re-throw the error so it can be caught by Sentry in the calling code
		throw error;
	}
}

/**
 * Format [service] API errors for user-friendly display
 */
export function format[Service]Error(error: unknown): string {
	if (error && typeof error === 'object' && 'status' in error) {
		const apiError = error as any;
		switch (apiError.status) {
			case 401:
				return "[Service] authentication failed. Please check your access token.";
			case 403:
				return "[Service] API rate limit exceeded or insufficient permissions.";
			case 404:
				return "[Service] resource not found. Please check the parameters.";
			case 422:
				return "[Service] API validation failed. Please check your input parameters.";
			default:
				return `[Service] API error (${apiError.status}): ${apiError.message || 'Unknown error'}`;
		}
	}
	
	if (error instanceof Error) {
		return `[Service] operation failed: ${error.message}`;
	}
	
	return "Unknown [Service] API error occurred.";
}

/**
 * Validate [service] input format
 */
export function validate[Service]Input(input: string): { isValid: boolean; error?: string } {
	// Add service-specific validation logic
	if (!input || input.trim().length === 0) {
		return { isValid: false, error: "Input cannot be empty" };
	}
	
	// Add format validation, length checks, etc.
	
	return { isValid: true };
}
```

Create `src/[service]/security.ts` with validation functions:

```typescript
/**
 * Security validation for [service] operations
 */

/**
 * Check if an operation is potentially dangerous
 */
export function isDangerousOperation(operation: string): boolean {
	const dangerousOperations = [
		'delete',
		'remove',
		'destroy',
		'admin'
		// Add service-specific dangerous operations
	];
	
	const lowerOp = operation.toLowerCase();
	return dangerousOperations.some(dangerous => lowerOp.includes(dangerous));
}

/**
 * Validate input query for safety
 */
export function validateQuery(query: string): { isValid: boolean; error?: string } {
	if (!query || query.trim().length === 0) {
		return { isValid: false, error: "Query cannot be empty" };
	}
	
	// Check for potentially malicious patterns
	const maliciousPatterns = [
		/[\x00-\x1f\x7f]/,  // Control characters
		/[<>]/,             // HTML/XML injection attempts
		/javascript:/i,      // JavaScript protocol
		/data:/i,           // Data protocol
	];
	
	for (const pattern of maliciousPatterns) {
		if (pattern.test(query)) {
			return { isValid: false, error: "Query contains invalid characters" };
		}
	}
	
	// Limit query length
	if (query.length > 256) {
		return { isValid: false, error: "Query too long (max 256 characters)" };
	}
	
	return { isValid: true };
}

/**
 * Sanitize content for display
 */
export function sanitize[Service]Content(content: string): string {
	// Remove or escape potentially dangerous content
	return content
		.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
		.replace(/javascript:/gi, 'javascript_') // Neutralize JavaScript protocols
		.replace(/data:/gi, 'data_'); // Neutralize data protocols
}

/**
 * Rate limiting configuration
 */
export const [SERVICE]_RATE_LIMITS = {
	// Conservative limits to avoid hitting API rate limits
	OPERATION_1: 10,  // per minute
	OPERATION_2: 30,  // per minute
} as const;

/**
 * Check if operation is read-only
 */
export function isReadOnlyOperation(operation: string): boolean {
	const readOnlyOperations = [
		'get',
		'list',
		'search',
		'read',
		'fetch',
		'show',
		'view',
		'info'
	];
	
	const lowerOp = operation.toLowerCase();
	return readOnlyOperations.some(readonly => lowerOp.includes(readonly));
}
```

### Step 2: Add Type Definitions

Add Zod schemas to `src/types.ts`:

```typescript
// [Service] tool schemas
export const [Service]Operation1Schema = {
  query: z
    .string()
    .min(1, "Query cannot be empty")
    .max(256, "Query too long (max 256 characters)")
    .describe("Query parameter for [service] operation"),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe("Maximum number of results to return (default: 10, max: 100)"),
};

export const [Service]Operation2Schema = {
  identifier: z
    .string()
    .min(1, "Identifier cannot be empty")
    .regex(/^[a-zA-Z0-9._-]+$/, "Invalid identifier format")
    .describe("[Service] identifier"),
};
```

### Step 3: Create Tool Implementation

Create `src/tools/[service]-tools-sentry.ts`:

```typescript
import * as Sentry from "@sentry/cloudflare";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { 
	Props, 
	[Service]Operation1Schema, 
	[Service]Operation2Schema,
	createErrorResponse,
	createSuccessResponse
} from "../types";
import { validateQuery, format[Service]Error } from "../[service]/security";
import { with[Service], validate[Service]Input } from "../[service]/utils";

const ALLOWED_USERNAMES = new Set<string>([
	// Add GitHub usernames of users who should have access to [service] operations
	'coleam00'
]);

// Error handling helper for MCP tools with Sentry
function handleError(error: unknown): { content: Array<{ type: "text"; text: string; isError?: boolean }> } {
	const eventId = Sentry.captureException(error);

	const errorMessage = [
		"**Error**",
		"There was a problem with your [service] request.",
		"Please report the following to the support team:",
		`**Event ID**: ${eventId}`,
		process.env.NODE_ENV !== "production"
			? error instanceof Error
				? error.message
				: String(error)
			: "",
	].join("\n\n");

	return {
		content: [
			{
				type: "text",
				text: errorMessage,
				isError: true,
			},
		],
	};
}

export function register[Service]ToolsWithSentry(server: McpServer, env: Env, props: Props) {
	// Tool 1: [Service] Operation 1 - Available to all authenticated users
	server.tool(
		"[service]Operation1",
		"Description of what this tool does with [service] API.",
		[Service]Operation1Schema,
		async ({ query, limit = 10 }) => {
			return await Sentry.startNewTrace(async () => {
				return await Sentry.startSpan({
					name: "mcp.tool/[service]Operation1",
					attributes: {
						'mcp.tool.name': '[service]Operation1',
						'mcp.user.login': props.login,
						'mcp.[service].query': query.substring(0, 50), // Truncate for security
						'mcp.[service].limit': limit,
					},
				}, async (span) => {
					// Set user context
					Sentry.setUser({
						username: props.login,
						email: props.email,
					});

					try {
						// Validate the query
						const validation = validateQuery(query);
						if (!validation.isValid) {
							return createErrorResponse(`Invalid query: ${validation.error}`);
						}
						
						return await with[Service](props.accessToken, async (client) => {
							const response = await client.operation1({
								query: query,
								limit: Math.min(limit, 100)
							});
							
							const results = response.data.map(item => ({
								// Map API response to consistent format
								id: item.id,
								name: item.name,
								description: item.description,
								// ... other fields
							}));
							
							return {
								content: [
									{
										type: "text",
										text: `**[Service] Operation 1 Results**\n\n**Query:** ${query}\n**Results found:** ${results.length}\n\n**Results:**\n\`\`\`json\n${JSON.stringify(results, null, 2)}\n\`\`\`\n\n**Performed by:** ${props.login} (${props.name})`
									}
								]
							};
						});
					} catch (error) {
						console.error('[service]Operation1 error:', error);
						span.setStatus({ code: 2 }); // error
						return handleError(error);
					}
				});
			});
		}
	);

	// Tool 2: [Service] Operation 2 - Available to all authenticated users
	server.tool(
		"[service]Operation2",
		"Description of what this tool does with [service] API.",
		[Service]Operation2Schema,
		async ({ identifier }) => {
			return await Sentry.startNewTrace(async () => {
				return await Sentry.startSpan({
					name: "mcp.tool/[service]Operation2",
					attributes: {
						'mcp.tool.name': '[service]Operation2',
						'mcp.user.login': props.login,
						'mcp.[service].identifier': identifier,
					},
				}, async (span) => {
					// Set user context
					Sentry.setUser({
						username: props.login,
						email: props.email,
					});

					try {
						// Validate the identifier
						const validation = validate[Service]Input(identifier);
						if (!validation.isValid) {
							return createErrorResponse(`Invalid identifier: ${validation.error}`);
						}
						
						return await with[Service](props.accessToken, async (client) => {
							const response = await client.operation2({
								identifier: identifier
							});
							
							const result = {
								// Map API response to consistent format
								id: response.data.id,
								details: response.data.details,
								// ... other fields
							};
							
							return {
								content: [
									{
										type: "text",
										text: `**[Service] Operation 2 Result**\n\n**Identifier:** ${identifier}\n\n**Details:**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n\n**Retrieved by:** ${props.login} (${props.name})`
									}
								]
							};
						});
					} catch (error) {
						console.error('[service]Operation2 error:', error);
						span.setStatus({ code: 2 }); // error
						return handleError(error);
					}
				});
			});
		}
	);
}
```

### Step 4: Register Tools in Main Server

Update `src/index_sentry.ts`:

```typescript
// Add import
import { register[Service]ToolsWithSentry } from "./tools/[service]-tools-sentry";

// Update server name
export class MyMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({
		name: "Database, GitHub & [Service] MCP Server",
		version: "1.0.0",
	});

	async init() {
		// Register all tools with Sentry instrumentation
		registerDatabaseToolsWithSentry(this.server, this.env, this.props);
		registerGitHubToolsWithSentry(this.server, this.env, this.props);
		register[Service]ToolsWithSentry(this.server, this.env, this.props);
	}
}
```

### Step 5: Add Environment Variables

**A. Update `wrangler.jsonc` vars section (for non-sensitive config):**

```json
{
  "vars": {
    // Example: Brave Search API configuration
    "BRAVE_SEARCH_API_URL": "https://api.search.brave.com/res/v1",
    "BRAVE_SEARCH_DEFAULT_COUNTRY": "US",
    "BRAVE_SEARCH_DEFAULT_LANGUAGE": "en",
    
    // Add your service configuration
    "[SERVICE]_API_URL": "https://api.yourservice.com/v1",
    "[SERVICE]_DEFAULT_SETTING": "value"
  }
}
```

**B. Add secrets via Wrangler CLI (for sensitive data):**

```bash
# Add API keys and sensitive configuration
wrangler secret put [SERVICE]_API_KEY
wrangler secret put [SERVICE]_CLIENT_SECRET

# Example: Brave Search API key
wrangler secret put BRAVE_SEARCH_API_KEY
```

**C. Update `.dev.vars` for local development:**

```bash
# Copy from .dev.vars.example and fill in your values
cp .dev.vars.example .dev.vars

# Add your service configuration
[SERVICE]_API_KEY=your_api_key_here
[SERVICE]_CLIENT_ID=your_client_id_here
```

**D. Generate updated types:**
```bash
wrangler types
```

## 🎯 Current Implementations & Examples

The MCP server currently includes four fully-implemented service integrations that serve as real-world examples:

### 1. **Database Tools** (`src/database/`, `src/tools/database-tools-sentry.ts`)
- **Tools**: `listTables`, `queryDatabase`, `executeDatabase`
- **Technology**: PostgreSQL with connection pooling
- **Authentication**: OAuth-based with role restrictions for write operations
- **Security**: SQL injection protection, query validation, user-based permissions

**Key Patterns Demonstrated:**
- Connection pool management for Cloudflare Workers
- Role-based access control (`ALLOWED_USERNAMES`)
- SQL sanitization and validation
- Database error formatting

### 2. **GitHub Tools** (`src/github/`, `src/tools/github-tools-sentry.ts`)
- **Tools**: `searchRepositories`, `getRepositoryInfo`
- **Technology**: GitHub API via Octokit
- **Authentication**: GitHub OAuth with repository access scopes
- **Security**: Input validation, rate limiting awareness, error sanitization

**Key Patterns Demonstrated:**
- OAuth token-based API access
- API response formatting and caching
- Repository format validation
- GitHub-specific error handling

### 3. **Gmail Tools** (`src/gmail/`, `src/tools/gmail-tools-sentry.ts`)
- **Tools**: `sendEmail`, `getEmailProfile`
- **Technology**: Gmail API via Google OAuth
- **Authentication**: Google OAuth with Gmail scopes
- **Security**: Anti-phishing detection, content sanitization, recipient limits

**Key Patterns Demonstrated:**
- Email content validation and formatting
- MIME message construction
- Phishing pattern detection
- Content security (script/iframe removal)
- Multi-recipient validation

### 4. **Brave Search Tools** (`src/brave-search/`, `src/tools/brave-search-tools-sentry.ts`)
- **Tools**: `webSearch`, `newsSearch`
- **Technology**: Brave Search API
- **Authentication**: API key-based authentication
- **Security**: Query sanitization, harmful content detection, result filtering

**Key Patterns Demonstrated:**
- API key authentication pattern
- Query parameter validation
- Search result formatting and sanitization
- Content filtering and safety checks
- Multiple search types (web, news, videos)

### 🔍 **Implementation Study Guide**

When adding new tools, study these implementations:

1. **For OAuth-based APIs**: Study GitHub (`src/github/`) or Gmail (`src/gmail/`)
2. **For API key-based services**: Study Brave Search (`src/brave-search/`)
3. **For database operations**: Study Database tools (`src/database/`)
4. **For complex security validation**: Study Gmail (anti-phishing) or Brave Search (content filtering)
5. **For connection management**: Study Database (connection pooling)

### 📋 **Common Implementation Patterns**

All current implementations follow these patterns:

- **Service Directory**: `src/[service]/utils.ts` + `src/[service]/security.ts`
- **Tool File**: `src/tools/[service]-tools-sentry.ts` with full Sentry instrumentation
- **Type Definitions**: Zod schemas in `src/types.ts`
- **Error Handling**: Service-specific error formatting functions
- **Security Validation**: Input sanitization and validation
- **Rate Limiting**: Built-in awareness of API limits
- **User Context**: Integration with OAuth user information
- **Logging**: Comprehensive console logging + Sentry traces

## 🛡️ Security Best Practices

### Input Validation
- **Always** validate inputs with Zod schemas
- **Never** trust user input - sanitize and validate everything
- **Limit** input lengths and complexity
- **Block** dangerous patterns and characters

### Error Handling
- **Sanitize** error messages before showing to users
- **Hide** sensitive information (API keys, internal paths)
- **Log** detailed errors for debugging (with Sentry)
- **Return** user-friendly error messages

### Authentication & Authorization
- **Verify** user permissions before operations
- **Use** the `ALLOWED_USERNAMES` pattern for privileged operations
- **Check** OAuth scopes and token validity
- **Implement** rate limiting awareness

### API Security
- **Use** the wrapper pattern (`with[Service]`) for consistent error handling
- **Implement** timeout handling
- **Add** request/response sanitization
- **Monitor** API rate limits

## 📊 Testing Your Tools

### Local Development
```bash
# Start development server
npm run dev

# Test with MCP Inspector
npx @modelcontextprotocol/inspector@latest
```

### Unit Testing
Create tests in `tests/unit/tools/[service]-tools.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { register[Service]ToolsWithSentry } from '../../../src/tools/[service]-tools-sentry';
// ... test implementation
```

### Integration Testing
Test the complete OAuth flow:
1. Authenticate through OAuth provider
2. Call MCP tools with valid tokens
3. Verify tool responses and error handling

## 🚀 Deployment

### Environment Setup
```bash
# Set production secrets
wrangler secret put [SERVICE]_CLIENT_ID
wrangler secret put [SERVICE]_CLIENT_SECRET
wrangler secret put [SERVICE]_API_URL

# Deploy
wrangler deploy
```

### Production Checklist
- [ ] All environment variables configured
- [ ] OAuth scopes properly set
- [ ] Rate limiting configured
- [ ] Error monitoring enabled (Sentry)
- [ ] Security validation in place
- [ ] Input sanitization implemented

## 📋 Common Patterns Reference

### Standard Response Format
```typescript
return {
  content: [
    {
      type: "text",
      text: `**Operation Result**\n\n**Input:** ${input}\n\n**Result:**\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n\n**Performed by:** ${props.login}`
    }
  ]
};
```

### Error Response Format
```typescript
return {
  content: [
    {
      type: "text",
      text: `**Error**\n\n${message}\n\n**Details:**\n${details}`,
      isError: true
    }
  ]
};
```

### Permission Check Pattern
```typescript
const ALLOWED_USERNAMES = new Set<string>(['username1', 'username2']);

if (!ALLOWED_USERNAMES.has(props.login)) {
  return createErrorResponse("Insufficient permissions for this operation");
}
```

### Validation Pattern
```typescript
const validation = validateInput(input);
if (!validation.isValid) {
  return createErrorResponse(`Invalid input: ${validation.error}`);
}
```

## 🔍 Troubleshooting

### Common Issues

**Tool not appearing in MCP client:**
- Check tool registration in `index_sentry.ts`
- Verify Zod schema syntax
- Check server restart

**Authentication errors:**
- Verify OAuth token scopes
- Check token expiration
- Validate API credentials

**TypeScript errors:**
- Run `wrangler types` to update type definitions
- Check import paths
- Verify Zod schema types

**API rate limits:**
- Implement request throttling
- Add retry logic with exponential backoff
- Monitor API usage in production

### Debugging Tips

1. **Enable verbose logging** in development
2. **Use Sentry event IDs** to track specific errors
3. **Test with MCP Inspector** for interactive debugging
4. **Check Cloudflare Workers logs** for deployment issues

## 🚀 Future Improvements & Lessons Learned

Based on implementing Gmail and Brave Search tools, here are key improvements that will make adding future features easier:

### 🔧 **Architectural Improvements**

#### 1. **Standardized Authentication Patterns**
We now have proven patterns for different auth types:

- **OAuth Token Pattern**: Used by GitHub, Gmail (via Google OAuth)
- **API Key Pattern**: Used by Brave Search
- **Database Connection Pattern**: Used by PostgreSQL tools

**Future Enhancement**: Create authentication factory/adapter pattern to standardize these approaches.

#### 2. **Enhanced Security Validation Framework**
Current implementations show we need:

```typescript
// Proposed: Standardized security validator interface
interface SecurityValidator<T> {
  validateInput(input: T): ValidationResult;
  sanitizeContent(content: string): string;
  detectHarmfulPatterns(content: string): string[];
  formatErrors(error: unknown): string;
}
```

#### 3. **Improved Environment Variable Management**
Current split between `wrangler.jsonc` vars and secrets works but could be clearer:

**Recommendation**: 
- **Public config** → `wrangler.jsonc` vars
- **API keys/secrets** → Wrangler secrets
- **Development** → `.dev.vars` (with comprehensive `.dev.vars.example`)

### 📋 **Development Experience Improvements**

#### 1. **Tool Testing Framework**
**Issue**: Currently testing requires full OAuth flow
**Solution**: Add mock/test modes for each service

```typescript
// Proposed: Add test mode to service utils
export async function withService<T>(
  credentials: string,
  operation: (client: ServiceClient) => Promise<T>,
  options?: { testMode?: boolean }
): Promise<T>
```

#### 2. **Configuration Validation**
**Issue**: Missing environment variables only discovered at runtime
**Solution**: Add startup configuration validation

```typescript
// Proposed: Configuration validator
export function validateConfiguration(env: Env): ConfigValidationResult {
  // Check required environment variables
  // Validate API key formats  
  // Test basic connectivity
}
```

#### 3. **Development CLI Tools**
**Needed**: Helper scripts for common development tasks

```bash
# Proposed development helpers
npm run validate-config    # Check all environment variables
npm run test-apis         # Test all API connections
npm run generate-schemas  # Auto-generate Zod schemas from API docs
```

### 🛡️ **Security Enhancements**

#### 1. **Centralized Content Security**
**Current**: Each service implements own content filtering
**Improvement**: Shared content security utilities

```typescript
// Proposed: Shared security utilities
export class ContentSecurityManager {
  sanitizeUrl(url: string): string;
  removeScripts(html: string): string;
  validateFileUpload(file: FileInfo): ValidationResult;
  detectPhishing(content: string): PhishingResult;
}
```

#### 2. **Rate Limiting Framework**
**Current**: Rate limiting awareness in individual tools
**Improvement**: Centralized rate limiting with Redis/KV store

```typescript
// Proposed: Rate limiting service
export class RateLimiter {
  checkLimit(key: string, limit: number, window: number): Promise<boolean>;
  recordUsage(key: string): Promise<void>;
  getRemainingQuota(key: string): Promise<number>;
}
```

#### 3. **Audit Logging**
**Needed**: Comprehensive audit trail for sensitive operations

```typescript
// Proposed: Audit logging
export interface AuditEvent {
  user: string;
  tool: string;
  action: string;
  timestamp: Date;
  metadata: Record<string, any>;
}
```

### 📊 **Monitoring & Observability**

#### 1. **Enhanced Metrics**
Beyond Sentry, add:
- API usage metrics per service
- Cost tracking for paid APIs
- Performance benchmarks
- User activity patterns

#### 2. **Health Checks**
Add endpoint for monitoring service health:

```typescript
// Proposed: Health check endpoint
GET /health
{
  "status": "healthy",
  "services": {
    "database": { "status": "healthy", "latency": "45ms" },
    "github": { "status": "healthy", "rate_limit": "4500/5000" },
    "gmail": { "status": "healthy", "quota": "450/1000" },
    "brave_search": { "status": "degraded", "quota": "1950/2000" }
  }
}
```

### 🔄 **Code Generation & Automation**

#### 1. **Service Template Generator**
Create CLI tool to scaffold new services:

```bash
# Proposed: Service generator
npm run create-service MyNewService --type=api-key --auth=bearer
# Generates: src/my-new-service/, types, tool template
```

#### 2. **Schema Auto-Generation**
Generate Zod schemas from OpenAPI/Swagger specs:

```bash
# Proposed: Schema generation
npm run generate-schemas --api=https://api.example.com/openapi.json
```

### 🎯 **Quick Wins for Next Implementation**

When adding the next service, implement these improvements:

1. **✅ Use the proven patterns** from existing implementations
2. **🔒 Start with comprehensive security validation** (don't add it later)
3. **🧪 Add test mode support** from the beginning
4. **📝 Document environment variables** in `.dev.vars.example` immediately
5. **📊 Plan monitoring strategy** before deployment
6. **🚨 Set up error alerting** with Sentry from start

### 🏗️ **Architecture Evolution Path**

**Phase 1** (Current): Individual service implementations with shared patterns
**Phase 2** (Next): Standardized base classes and shared utilities
**Phase 3** (Future): Plugin architecture with auto-discovery and configuration

This evolution path ensures we can improve the architecture without breaking existing implementations.

## 📚 Additional Resources

- [MCP Protocol Documentation](https://modelcontextprotocol.io/docs)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Sentry Cloudflare Integration](https://docs.sentry.io/platforms/cloudflare/)
- [Zod Validation Library](https://zod.dev/)

---

This guide provides a complete blueprint for adding new tools to the MCP server. Follow these patterns to maintain consistency, security, and reliability across all integrations.