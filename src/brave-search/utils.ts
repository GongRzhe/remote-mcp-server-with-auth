/**
 * Brave Search API operations with proper error handling and authentication
 * Uses Brave Search API for web search operations
 */

/**
 * Brave Search API response interfaces
 */
export interface BraveSearchResult {
	title: string;
	url: string;
	description: string;
	age?: string;
	language?: string;
	locations?: number[];
	family_friendly?: boolean;
}

export interface BraveSearchResponse {
	query: {
		original: string;
		show_strict_warning: boolean;
		altered?: string;
		safesearch: boolean;
		is_navigational: boolean;
		is_news_breaking: boolean;
		spellcheck_off: boolean;
		country: string;
		bad_results: boolean;
		should_fallback: boolean;
		postal_code?: string;
		city?: string;
		header_country?: string;
		more_results_available: boolean;
		custom_location_label?: string;
		reddit_cluster?: boolean;
	};
	mixed?: {
		type: string;
		main: BraveSearchResult[];
		top: BraveSearchResult[];
		side: BraveSearchResult[];
	};
	web?: {
		type: string;
		results: BraveSearchResult[];
		family_friendly: boolean;
	};
	news?: {
		type: string;
		results: Array<{
			title: string;
			url: string;
			description: string;
			age: string;
			breaking: boolean;
			thumbnail?: {
				src: string;
			};
		}>;
	};
	videos?: {
		type: string;
		results: Array<{
			title: string;
			url: string;
			description: string;
			age: string;
			thumbnail: {
				src: string;
			};
		}>;
	};
}

/**
 * Search parameters for Brave Search API
 */
export interface BraveSearchParams {
	q: string;                    // Search query
	country?: string;             // Country code (e.g., 'US', 'GB')
	search_lang?: string;         // Search language (e.g., 'en', 'es')
	ui_lang?: string;             // UI language
	count?: number;               // Number of results (max 20)
	offset?: number;              // Offset for pagination
	safesearch?: 'strict' | 'moderate' | 'off';
	freshness?: 'pd' | 'pw' | 'pm' | 'py';  // Past day, week, month, year
	text_decorations?: boolean;   // Enable text decorations
	spellcheck?: boolean;         // Enable spellcheck
	result_filter?: 'web' | 'news' | 'videos';  // Filter results
}

/**
 * Execute a Brave Search API operation with proper error handling and authentication
 */
export async function withBraveSearch<T>(
	apiKey: string,
	operation: (headers: Record<string, string>) => Promise<T>
): Promise<T> {
	const headers = {
		'X-Subscription-Token': apiKey,
		'Accept': 'application/json',
		'Accept-Encoding': 'gzip',
	};
	
	const startTime = Date.now();
	try {
		const result = await operation(headers);
		const duration = Date.now() - startTime;
		console.log(`Brave Search API operation completed successfully in ${duration}ms`);
		return result;
	} catch (error) {
		const duration = Date.now() - startTime;
		console.error(`Brave Search API operation failed after ${duration}ms:`, error);
		// Re-throw the error so it can be caught by Sentry in the calling code
		throw error;
	}
}

/**
 * Format Brave Search API errors for user-friendly display
 */
export function formatBraveSearchError(error: unknown): string {
	if (error && typeof error === 'object' && 'status' in error) {
		const searchError = error as any;
		switch (searchError.status) {
			case 400:
				return "Brave Search API request invalid. Please check your search parameters.";
			case 401:
				return "Brave Search API authentication failed. Please check your API key.";
			case 403:
				return "Brave Search API access denied. Please check your subscription and permissions.";
			case 429:
				return "Brave Search API rate limit exceeded. Please try again later.";
			case 500:
				return "Brave Search API server error. Please try again later.";
			case 502:
			case 503:
			case 504:
				return "Brave Search API temporarily unavailable. Please try again later.";
			default:
				return `Brave Search API error (${searchError.status}): ${searchError.message || 'Unknown error'}`;
		}
	}
	
	if (error instanceof Error) {
		return `Brave Search operation failed: ${error.message}`;
	}
	
	return "Unknown Brave Search API error occurred.";
}

/**
 * Validate search query format
 */
export function validateSearchQuery(query: string): { isValid: boolean; error?: string } {
	if (!query || query.trim().length === 0) {
		return { isValid: false, error: "Search query cannot be empty" };
	}
	
	// Check query length (Brave Search has reasonable limits)
	if (query.length > 400) {
		return { isValid: false, error: "Search query too long (max 400 characters)" };
	}
	
	// Check for minimum meaningful length
	if (query.trim().length < 2) {
		return { isValid: false, error: "Search query too short (minimum 2 characters)" };
	}
	
	return { isValid: true };
}

/**
 * Validate search parameters
 */
export function validateSearchParams(params: BraveSearchParams): { isValid: boolean; error?: string } {
	// Validate query
	const queryValidation = validateSearchQuery(params.q);
	if (!queryValidation.isValid) {
		return queryValidation;
	}
	
	// Validate count parameter
	if (params.count !== undefined) {
		if (params.count < 1 || params.count > 20) {
			return { isValid: false, error: "Count must be between 1 and 20" };
		}
	}
	
	// Validate offset parameter
	if (params.offset !== undefined) {
		if (params.offset < 0 || params.offset > 9000) {
			return { isValid: false, error: "Offset must be between 0 and 9000" };
		}
	}
	
	// Validate country code
	if (params.country !== undefined) {
		const validCountryCodes = ['US', 'GB', 'CA', 'AU', 'DE', 'FR', 'ES', 'IT', 'JP', 'IN', 'BR'];
		if (!validCountryCodes.includes(params.country.toUpperCase())) {
			return { isValid: false, error: `Invalid country code. Supported: ${validCountryCodes.join(', ')}` };
		}
	}
	
	// Validate language codes
	if (params.search_lang !== undefined) {
		const validLangCodes = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'];
		if (!validLangCodes.includes(params.search_lang.toLowerCase())) {
			return { isValid: false, error: `Invalid language code. Supported: ${validLangCodes.join(', ')}` };
		}
	}
	
	return { isValid: true };
}

/**
 * Build URL parameters for Brave Search API
 */
export function buildSearchUrl(params: BraveSearchParams): string {
	const baseUrl = 'https://api.search.brave.com/res/v1/web/search';
	const searchParams = new URLSearchParams();
	
	// Required parameter
	searchParams.append('q', params.q);
	
	// Optional parameters
	if (params.country) searchParams.append('country', params.country.toUpperCase());
	if (params.search_lang) searchParams.append('search_lang', params.search_lang.toLowerCase());
	if (params.ui_lang) searchParams.append('ui_lang', params.ui_lang.toLowerCase());
	if (params.count) searchParams.append('count', params.count.toString());
	if (params.offset) searchParams.append('offset', params.offset.toString());
	if (params.safesearch) searchParams.append('safesearch', params.safesearch);
	if (params.freshness) searchParams.append('freshness', params.freshness);
	if (params.text_decorations !== undefined) searchParams.append('text_decorations', params.text_decorations.toString());
	if (params.spellcheck !== undefined) searchParams.append('spellcheck', params.spellcheck.toString());
	if (params.result_filter) searchParams.append('result_filter', params.result_filter);
	
	return `${baseUrl}?${searchParams.toString()}`;
}

/**
 * Perform web search using Brave Search API
 */
export async function searchBrave(apiKey: string, params: BraveSearchParams): Promise<BraveSearchResponse> {
	return await withBraveSearch(apiKey, async (headers) => {
		const searchUrl = buildSearchUrl(params);
		
		const response = await fetch(searchUrl, {
			method: 'GET',
			headers
		});
		
		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw {
				status: response.status,
				message: errorData.message || response.statusText,
				details: errorData
			};
		}
		
		return await response.json();
	});
}

/**
 * Extract and format search results from Brave Search response
 */
export function formatSearchResults(response: BraveSearchResponse): Array<{
	title: string;
	url: string;
	description: string;
	type: string;
	age?: string;
	thumbnail?: string;
}> {
	const results: Array<{
		title: string;
		url: string;
		description: string;
		type: string;
		age?: string;
		thumbnail?: string;
	}> = [];
	
	// Add web results
	if (response.web?.results) {
		response.web.results.forEach(result => {
			results.push({
				title: result.title,
				url: result.url,
				description: result.description,
				type: 'web',
				age: result.age
			});
		});
	}
	
	// Add mixed results
	if (response.mixed?.main) {
		response.mixed.main.forEach(result => {
			results.push({
				title: result.title,
				url: result.url,
				description: result.description,
				type: 'mixed_main',
				age: result.age
			});
		});
	}
	
	// Add news results
	if (response.news?.results) {
		response.news.results.forEach(result => {
			results.push({
				title: result.title,
				url: result.url,
				description: result.description,
				type: 'news',
				age: result.age,
				thumbnail: result.thumbnail?.src
			});
		});
	}
	
	// Add video results
	if (response.videos?.results) {
		response.videos.results.forEach(result => {
			results.push({
				title: result.title,
				url: result.url,
				description: result.description,
				type: 'video',
				age: result.age,
				thumbnail: result.thumbnail?.src
			});
		});
	}
	
	return results;
}