import * as Sentry from "@sentry/cloudflare";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { 
	Props, 
	WebSearchSchema, 
	NewsSearchSchema,
	createErrorResponse,
	createSuccessResponse
} from "../types";
import { 
	validateSearchQuery, 
	validateSearchFilters,
	detectHarmfulContent,
	sanitizeSearchQuery,
	sanitizeSearchResults
} from "../brave-search/security";
import { 
	searchBrave,
	formatSearchResults,
	formatBraveSearchError,
	validateSearchParams,
	type BraveSearchParams
} from "../brave-search/utils";

const ALLOWED_USERNAMES = new Set<string>([
	// Add GitHub usernames of users who should have access to Brave Search operations
	// For example: 'yourusername', 'coworkerusername'
	'coleam00'
]);

// Error handling helper for MCP tools with Sentry
function handleError(error: unknown): { content: Array<{ type: "text"; text: string; isError?: boolean }> } {
	const eventId = Sentry.captureException(error);

	const errorMessage = [
		"**Error**",
		"There was a problem with your Brave Search request.",
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

// Helper function to extract Brave Search API key from various sources
function getBraveSearchApiKey(env: Env, requestHeaders?: Record<string, string>): { apiKey: string | null; source: string } {
	// Priority order:
	// 1. Request header (user-specific)
	// 2. Environment variable (fallback/default)
	
	if (requestHeaders) {
		// Check for API key in headers (multiple possible header names)
		const headerNames = [
			'x-brave-search-api-key',
			'x-brave-api-key', 
			'brave-search-api-key',
			'brave-api-key'
		];
		
		for (const headerName of headerNames) {
			const headerValue = requestHeaders[headerName] || requestHeaders[headerName.toLowerCase()];
			if (headerValue && headerValue.trim().length > 0) {
				return { apiKey: headerValue.trim(), source: `header:${headerName}` };
			}
		}
	}
	
	// Fallback to environment variable
	const envApiKey = (env as any).BRAVE_SEARCH_API_KEY;
	if (envApiKey && envApiKey.trim().length > 0) {
		return { apiKey: envApiKey.trim(), source: 'environment' };
	}
	
	return { apiKey: null, source: 'none' };
}

export function registerBraveSearchToolsWithSentry(
	server: McpServer, 
	env: Env, 
	props: Props
) {
	// Helper function to extract headers from MCP call context
	// 
	// MULTI-USER API KEY IMPLEMENTATION:
	// This function should access the current HTTP request headers to extract
	// user-specific API keys. The MCP Agent should provide access to the
	// current request context including headers.
	//
	// IMPLEMENTATION APPROACHES:
	// 1. Via MCP Agent request context (preferred)
	// 2. Via WebSocket message metadata (for persistent connections)
	// 3. Via MCP tool call metadata/context
	//
	// CURRENT STATUS: 
	// This is a placeholder implementation. The actual header extraction
	// depends on how the MCP Agent exposes request context to tools.
	//
	// WORKAROUND FOR NOW:
	// Users must configure a shared API key in environment variables,
	// or the implementer needs to modify this to access request headers
	// through the specific MCP Agent implementation being used.
	function getCurrentRequestHeaders(): Record<string, string> {
		// TODO: Replace with actual header extraction from MCP request context
		// Example implementations:
		// 
		// Option 1: Via MCP Agent context (if available)
		// return this.context?.request?.headers || {};
		//
		// Option 2: Via global request store (if implemented)
		// return getRequestHeaders() || {};
		//
		// Option 3: Via AsyncLocalStorage (if request tracking is implemented)
		// return asyncLocalStorage.getStore()?.headers || {};
		
		console.log('⚠️  MULTI-USER API KEY WARNING: Currently using environment variable fallback.');
		console.log('   To support user-specific API keys, implement header extraction in getCurrentRequestHeaders().');
		
		return {};
	}
	// Tool 1: Web Search - Available to all authenticated users
	server.tool(
		"webSearch",
		"Perform web search using Brave Search API with comprehensive content filtering and security validation. Returns web results with titles, URLs, and descriptions. API Key: Provide your Brave Search API key via header 'X-Brave-Search-API-Key' or use server default.",
		WebSearchSchema,
		async ({ query, count = 10, country, language, safesearch = 'moderate', freshness, result_filter = 'web' }) => {
			return await Sentry.startNewTrace(async () => {
				return await Sentry.startSpan({
					name: "mcp.tool/webSearch",
					attributes: {
						'mcp.tool.name': 'webSearch',
						'mcp.user.login': props.login,
						'mcp.search.query': query.substring(0, 50), // Truncate for security
						'mcp.search.count': count,
						'mcp.search.country': country || 'unspecified',
						'mcp.search.language': language || 'unspecified',
						'mcp.search.safesearch': safesearch,
						'mcp.search.filter': result_filter,
					},
				}, async (span) => {
					// Set user context
					Sentry.setUser({
						username: props.login,
						email: props.email,
					});

					try {
						// Comprehensive validation
						
						// 1. Validate query content
						const queryValidation = validateSearchQuery(query);
						if (!queryValidation.isValid) {
							return createErrorResponse(`Query validation failed: ${queryValidation.error}`);
						}
						
						// 2. Check for harmful content
						const harmfulIndicators = detectHarmfulContent(query);
						if (harmfulIndicators.length > 0) {
							return createErrorResponse(
								`Search query contains potentially harmful content: ${harmfulIndicators.join(', ')}`
							);
						}
						
						// 3. Sanitize query
						const sanitizedQuery = sanitizeSearchQuery(query);
						
						// 4. Build search parameters
						const searchParams: BraveSearchParams = {
							q: sanitizedQuery,
							count,
							safesearch,
							result_filter
						};
						
						// Add optional parameters
						if (country) searchParams.country = country.toUpperCase();
						if (language) searchParams.search_lang = language.toLowerCase();
						if (freshness) searchParams.freshness = freshness;
						
						// 5. Validate all parameters
						const paramsValidation = validateSearchParams(searchParams);
						if (!paramsValidation.isValid) {
							return createErrorResponse(`Parameter validation failed: ${paramsValidation.error}`);
						}
						
						// 6. Get API key (from headers or environment)
						const currentHeaders = getCurrentRequestHeaders();
						const { apiKey, source: apiKeySource } = getBraveSearchApiKey(env, currentHeaders);
						if (!apiKey) {
							return createErrorResponse(
								"Brave Search API key not provided. Please provide API key via header 'X-Brave-Search-API-Key' or configure BRAVE_SEARCH_API_KEY environment variable."
							);
						}
						
						// Log API key source for debugging (without exposing the key)
						console.log(`Brave Search API key source: ${apiKeySource}`);
						span.setAttributes({
							'mcp.brave_search.api_key_source': apiKeySource
						});
						
						const searchResponse = await searchBrave(apiKey, searchParams);
						
						// 7. Format and sanitize results
						let results = formatSearchResults(searchResponse);
						results = sanitizeSearchResults(results);
						
						// 8. Create comprehensive response
						const searchSummary = {
							query: {
								original: query,
								sanitized: sanitizedQuery,
								harmful_indicators: harmfulIndicators.length
							},
							parameters: {
								count,
								country: country || 'auto',
								language: language || 'auto',
								safesearch,
								freshness: freshness || 'any',
								filter: result_filter
							},
							results: {
								total_found: results.length,
								web_results: results.filter(r => r.type === 'web').length,
								news_results: results.filter(r => r.type === 'news').length,
								video_results: results.filter(r => r.type === 'video').length
							},
							api: {
								key_source: apiKeySource,
								provider: 'Brave Search'
							},
							query_info: searchResponse.query
						};
						
						return {
							content: [
								{
									type: "text",
									text: `**Brave Web Search Results**\n\n**Query:** ${sanitizedQuery}\n**Results Found:** ${results.length}\n\n**Search Results:**\n${results.map((result, index) => 
										`**${index + 1}. ${result.title}** (${result.type})\n${result.url}\n${result.description}\n${result.age ? `*Age: ${result.age}*` : ''}\n`
									).join('\n')}\n\n**Search Summary:**\n\`\`\`json\n${JSON.stringify(searchSummary, null, 2)}\n\`\`\`\n\n**Performed by:** ${props.login} (${props.name})\n\n${harmfulIndicators.length > 0 ? `⚠️  **Warning:** Query contained potential harmful indicators: ${harmfulIndicators.join(', ')}` : '✅ **Security Check:** Query passed all validations'}`
								}
							]
						};
						
					} catch (error) {
						console.error('webSearch error:', error);
						span.setStatus({ code: 2 }); // error
						
						// Format Brave Search-specific errors
						const formattedError = formatBraveSearchError(error);
						return createErrorResponse(`Web search failed: ${formattedError}`);
					}
				});
			});
		}
	);

	// Tool 2: News Search - Available to all authenticated users
	server.tool(
		"newsSearch",
		"Search for news articles using Brave Search API with content filtering and recency options. Returns news results with titles, URLs, descriptions, and publication dates. API Key: Provide your Brave Search API key via header 'X-Brave-Search-API-Key' or use server default.",
		NewsSearchSchema,
		async ({ query, count = 10, country, freshness = 'pw' }) => {
			return await Sentry.startNewTrace(async () => {
				return await Sentry.startSpan({
					name: "mcp.tool/newsSearch",
					attributes: {
						'mcp.tool.name': 'newsSearch',
						'mcp.user.login': props.login,
						'mcp.search.query': query.substring(0, 50), // Truncate for security
						'mcp.search.count': count,
						'mcp.search.country': country || 'unspecified',
						'mcp.search.freshness': freshness,
					},
				}, async (span) => {
					// Set user context
					Sentry.setUser({
						username: props.login,
						email: props.email,
					});

					try {
						// Comprehensive validation
						
						// 1. Validate query content
						const queryValidation = validateSearchQuery(query);
						if (!queryValidation.isValid) {
							return createErrorResponse(`Query validation failed: ${queryValidation.error}`);
						}
						
						// 2. Check for harmful content
						const harmfulIndicators = detectHarmfulContent(query);
						if (harmfulIndicators.length > 0) {
							return createErrorResponse(
								`Search query contains potentially harmful content: ${harmfulIndicators.join(', ')}`
							);
						}
						
						// 3. Sanitize query
						const sanitizedQuery = sanitizeSearchQuery(query);
						
						// 4. Build search parameters for news
						const searchParams: BraveSearchParams = {
							q: sanitizedQuery,
							count,
							result_filter: 'news',
							freshness,
							safesearch: 'moderate' // Always use moderate safesearch for news
						};
						
						// Add optional parameters
						if (country) searchParams.country = country.toUpperCase();
						
						// 5. Validate all parameters
						const paramsValidation = validateSearchParams(searchParams);
						if (!paramsValidation.isValid) {
							return createErrorResponse(`Parameter validation failed: ${paramsValidation.error}`);
						}
						
						// 6. Get API key (from headers or environment)
						const currentHeaders = getCurrentRequestHeaders();
						const { apiKey, source: apiKeySource } = getBraveSearchApiKey(env, currentHeaders);
						if (!apiKey) {
							return createErrorResponse(
								"Brave Search API key not provided. Please provide API key via header 'X-Brave-Search-API-Key' or configure BRAVE_SEARCH_API_KEY environment variable."
							);
						}
						
						// Log API key source for debugging (without exposing the key)
						console.log(`Brave Search API key source: ${apiKeySource}`);
						span.setAttributes({
							'mcp.brave_search.api_key_source': apiKeySource
						});
						
						const searchResponse = await searchBrave(apiKey, searchParams);
						
						// 7. Format and sanitize results
						let results = formatSearchResults(searchResponse);
						results = sanitizeSearchResults(results);
						
						// Filter for news results only
						const newsResults = results.filter(r => r.type === 'news');
						
						// 8. Create comprehensive response
						const newsSummary = {
							query: {
								original: query,
								sanitized: sanitizedQuery,
								harmful_indicators: harmfulIndicators.length
							},
							parameters: {
								count,
								country: country || 'auto',
								freshness: freshness,
								filter: 'news'
							},
							results: {
								news_found: newsResults.length,
								total_results: results.length
							},
							api: {
								key_source: apiKeySource,
								provider: 'Brave Search'
							},
							query_info: searchResponse.query
						};
						
						return {
							content: [
								{
									type: "text",
									text: `**Brave News Search Results**\n\n**Query:** ${sanitizedQuery}\n**News Articles Found:** ${newsResults.length}\n**Freshness:** ${freshness === 'pd' ? 'Past Day' : freshness === 'pw' ? 'Past Week' : 'Past Month'}\n\n**News Results:**\n${newsResults.map((result, index) => 
										`**${index + 1}. ${result.title}**\n${result.url}\n${result.description}\n${result.age ? `*Published: ${result.age}*` : ''}\n${result.thumbnail ? `*Thumbnail: ${result.thumbnail}*` : ''}\n`
									).join('\n')}\n\n**Search Summary:**\n\`\`\`json\n${JSON.stringify(newsSummary, null, 2)}\n\`\`\`\n\n**Performed by:** ${props.login} (${props.name})\n\n${harmfulIndicators.length > 0 ? `⚠️  **Warning:** Query contained potential harmful indicators: ${harmfulIndicators.join(', ')}` : '✅ **Security Check:** Query passed all validations'}`
								}
							]
						};
						
					} catch (error) {
						console.error('newsSearch error:', error);
						span.setStatus({ code: 2 }); // error
						
						// Format Brave Search-specific errors
						const formattedError = formatBraveSearchError(error);
						return createErrorResponse(`News search failed: ${formattedError}`);
					}
				});
			});
		}
	);
}