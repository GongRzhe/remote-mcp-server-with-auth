import { z } from "zod";
import type { AuthRequest, OAuthHelpers, ClientInfo } from "@cloudflare/workers-oauth-provider";

// User context passed through OAuth
export type Props = {
  login: string;
  name: string;
  email: string;
  accessToken: string;
  picture?: string;
  verified_email?: boolean;
  sub?: string; // Auth0/Keycloak user ID
  updated_at?: string; // Auth0/Keycloak last update timestamp
  preferred_username?: string; // Keycloak preferred username
  given_name?: string; // Keycloak/Google given name
  family_name?: string; // Keycloak/Google family name
  user_id?: string; // Custom OAuth user ID
  scope?: string; // OAuth scopes granted
  client_id?: string; // OAuth client ID
  provider?: string; // OAuth provider identifier
};

// Extended environment with OAuth provider
export type ExtendedEnv = Env & { OAUTH_PROVIDER: OAuthHelpers };

// OAuth URL construction parameters
export interface UpstreamAuthorizeParams {
  upstream_url: string;
  client_id: string;
  scope: string;
  redirect_uri: string;
  state?: string;
}

// OAuth token exchange parameters
export interface UpstreamTokenParams {
  code: string | undefined;
  upstream_url: string;
  client_secret: string;
  redirect_uri: string;
  client_id: string;
}

// Approval dialog configuration
export interface ApprovalDialogOptions {
  client: ClientInfo | null;
  server: {
    name: string;
    logo?: string;
    description?: string;
  };
  state: Record<string, any>;
  cookieName?: string;
  cookieSecret?: string | Uint8Array;
  cookieDomain?: string;
  cookiePath?: string;
  cookieMaxAge?: number;
}

// Result of parsing approval form
export interface ParsedApprovalResult {
  state: any;
  headers: Record<string, string>;
}

// MCP tool schemas using Zod
export const ListTablesSchema = {};

export const QueryDatabaseSchema = {
  sql: z
    .string()
    .min(1, "SQL query cannot be empty")
    .describe("SQL query to execute (SELECT queries only)"),
};

export const ExecuteDatabaseSchema = {
  sql: z
    .string()
    .min(1, "SQL command cannot be empty")
    .describe("SQL command to execute (INSERT, UPDATE, DELETE, CREATE, etc.)"),
};

// GitHub tool schemas
export const SearchRepositoriesSchema = {
  query: z
    .string()
    .min(1, "Search query cannot be empty")
    .max(256, "Search query too long (max 256 characters)")
    .describe("Search query to find GitHub repositories"),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe("Maximum number of repositories to return (default: 10, max: 100)"),
};

export const GetRepositoryInfoSchema = {
  repository: z
    .string()
    .min(1, "Repository cannot be empty")
    .regex(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/, "Repository must be in format 'owner/repo'")
    .describe("GitHub repository in format 'owner/repo'"),
};

// Gmail tool schemas
export const SendEmailSchema = {
  to: z
    .array(z.string().email("Invalid email address"))
    .min(1, "At least one recipient is required")
    .max(25, "Too many 'To' recipients (max 25)")
    .describe("List of recipient email addresses"),
  cc: z
    .array(z.string().email("Invalid CC email address"))
    .max(25, "Too many 'CC' recipients (max 25)")
    .optional()
    .describe("List of CC recipient email addresses"),
  bcc: z
    .array(z.string().email("Invalid BCC email address"))
    .max(25, "Too many 'BCC' recipients (max 25)")
    .optional()
    .describe("List of BCC recipient email addresses"),
  subject: z
    .string()
    .min(1, "Email subject cannot be empty")
    .max(998, "Subject too long (max 998 characters)")
    .describe("Email subject line"),
  body: z
    .string()
    .min(1, "Email body cannot be empty")
    .max(10485760, "Email body too large (max 10MB)")
    .describe("Email body content (plain text or HTML)"),
  isHtml: z
    .boolean()
    .optional()
    .describe("Whether the email body is HTML format (default: false)"),
};

export const GetEmailProfileSchema = {};

// Brave Search tool schemas
export const WebSearchSchema = {
  query: z
    .string()
    .min(2, "Search query too short (minimum 2 characters)")
    .max(400, "Search query too long (max 400 characters)")
    .describe("Search query for web search"),
  count: z
    .number()
    .int()
    .positive()
    .max(20)
    .optional()
    .describe("Number of search results to return (default: 10, max: 20)"),
  country: z
    .string()
    .length(2)
    .optional()
    .describe("Country code for search results (e.g., 'US', 'GB', 'DE')"),
  language: z
    .string()
    .length(2)
    .optional()
    .describe("Language code for search (e.g., 'en', 'es', 'fr')"),
  safesearch: z
    .enum(['strict', 'moderate', 'off'])
    .optional()
    .describe("Safe search setting (default: moderate)"),
  freshness: z
    .enum(['pd', 'pw', 'pm', 'py'])
    .optional()
    .describe("Search freshness: pd=past day, pw=past week, pm=past month, py=past year"),
  result_filter: z
    .enum(['web', 'news', 'videos'])
    .optional()
    .describe("Filter results by type (default: web)"),
};

export const NewsSearchSchema = {
  query: z
    .string()
    .min(2, "Search query too short (minimum 2 characters)")
    .max(400, "Search query too long (max 400 characters)")
    .describe("Search query for news search"),
  count: z
    .number()
    .int()
    .positive()
    .max(20)
    .optional()
    .describe("Number of news results to return (default: 10, max: 20)"),
  country: z
    .string()
    .length(2)
    .optional()
    .describe("Country code for news results (e.g., 'US', 'GB', 'DE')"),
  freshness: z
    .enum(['pd', 'pw', 'pm'])
    .optional()
    .describe("News freshness: pd=past day, pw=past week, pm=past month"),
};

// MCP response types
export interface McpTextContent {
  type: "text";
  text: string;
  isError?: boolean;
}

export interface McpResponse {
  content: McpTextContent[];
}

// Standard response creators
export function createSuccessResponse(message: string, data?: any): McpResponse {
  let text = `**Success**\n\n${message}`;
  if (data !== undefined) {
    text += `\n\n**Result:**\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
  }
  return {
    content: [{
      type: "text",
      text,
    }],
  };
}

export function createErrorResponse(message: string, details?: any): McpResponse {
  let text = `**Error**\n\n${message}`;
  if (details !== undefined) {
    text += `\n\n**Details:**\n\`\`\`json\n${JSON.stringify(details, null, 2)}\n\`\`\``;
  }
  return {
    content: [{
      type: "text",
      text,
      isError: true,
    }],
  };
}

// Database operation result type
export interface DatabaseOperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  duration?: number;
}

// SQL validation result
export interface SqlValidationResult {
  isValid: boolean;
  error?: string;
}

// Re-export external types that are used throughout
export type { AuthRequest, OAuthHelpers, ClientInfo };