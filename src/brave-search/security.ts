/**
 * Security validation for Brave Search operations
 */

/**
 * Check if a search operation is potentially dangerous
 */
export function isDangerousSearchOperation(operation: string): boolean {
	const dangerousOperations = [
		'hack',
		'exploit',
		'malware',
		'virus',
		'phishing',
		'scam',
		'illegal',
		'piracy'
	];
	
	const lowerOp = operation.toLowerCase();
	return dangerousOperations.some(dangerous => lowerOp.includes(dangerous));
}

/**
 * Validate search query for safety and content policy
 */
export function validateSearchQuery(query: string): { isValid: boolean; error?: string } {
	if (!query || query.trim().length === 0) {
		return { isValid: false, error: "Search query cannot be empty" };
	}
	
	// Check for potentially malicious patterns
	const maliciousPatterns = [
		/[\x00-\x1f\x7f]/,  // Control characters
		/[<>]/,             // HTML/XML injection attempts
		/javascript:/i,      // JavaScript protocol
		/data:/i,           // Data protocol
		/vbscript:/i,       // VBScript protocol
		/file:/i,           // File protocol
		/ftp:/i,            // FTP protocol
	];
	
	for (const pattern of maliciousPatterns) {
		if (pattern.test(query)) {
			return { isValid: false, error: "Search query contains invalid characters or protocols" };
		}
	}
	
	// Limit query length
	if (query.length > 400) {
		return { isValid: false, error: "Search query too long (max 400 characters)" };
	}
	
	// Check for minimum meaningful length
	if (query.trim().length < 2) {
		return { isValid: false, error: "Search query too short (minimum 2 characters)" };
	}
	
	// Check for excessive repetition (potential spam)
	const words = query.toLowerCase().split(/\s+/);
	const wordCount = new Map<string, number>();
	for (const word of words) {
		wordCount.set(word, (wordCount.get(word) || 0) + 1);
	}
	
	for (const [word, count] of wordCount) {
		if (word.length > 2 && count > 5) {
			return { isValid: false, error: "Search query contains excessive repetition" };
		}
	}
	
	return { isValid: true };
}

/**
 * Validate search filters and parameters for safety
 */
export function validateSearchFilters(filters: Record<string, any>): { isValid: boolean; error?: string } {
	// Validate country code
	if (filters.country) {
		const validCountryCodes = ['US', 'GB', 'CA', 'AU', 'DE', 'FR', 'ES', 'IT', 'JP', 'CN', 'IN', 'BR', 'RU', 'KR'];
		if (!validCountryCodes.includes(filters.country.toUpperCase())) {
			return { isValid: false, error: `Invalid country code: ${filters.country}` };
		}
	}
	
	// Validate language code
	if (filters.search_lang) {
		const validLangCodes = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar', 'hi'];
		if (!validLangCodes.includes(filters.search_lang.toLowerCase())) {
			return { isValid: false, error: `Invalid language code: ${filters.search_lang}` };
		}
	}
	
	// Validate result count
	if (filters.count !== undefined) {
		if (typeof filters.count !== 'number' || filters.count < 1 || filters.count > 20) {
			return { isValid: false, error: "Result count must be between 1 and 20" };
		}
	}
	
	// Validate offset
	if (filters.offset !== undefined) {
		if (typeof filters.offset !== 'number' || filters.offset < 0 || filters.offset > 9000) {
			return { isValid: false, error: "Offset must be between 0 and 9000" };
		}
	}
	
	// Validate safesearch setting
	if (filters.safesearch) {
		const validSafesearch = ['strict', 'moderate', 'off'];
		if (!validSafesearch.includes(filters.safesearch.toLowerCase())) {
			return { isValid: false, error: `Invalid safesearch setting: ${filters.safesearch}` };
		}
	}
	
	// Validate freshness filter
	if (filters.freshness) {
		const validFreshness = ['pd', 'pw', 'pm', 'py']; // past day, week, month, year
		if (!validFreshness.includes(filters.freshness.toLowerCase())) {
			return { isValid: false, error: `Invalid freshness filter: ${filters.freshness}` };
		}
	}
	
	// Validate result filter
	if (filters.result_filter) {
		const validResultFilters = ['web', 'news', 'videos'];
		if (!validResultFilters.includes(filters.result_filter.toLowerCase())) {
			return { isValid: false, error: `Invalid result filter: ${filters.result_filter}` };
		}
	}
	
	return { isValid: true };
}

/**
 * Sanitize search query content for display and processing
 */
export function sanitizeSearchQuery(query: string): string {
	// Remove or escape potentially dangerous content
	return query
		.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters except \t, \n, \r
		.replace(/javascript:/gi, 'javascript_') // Neutralize JavaScript protocols
		.replace(/data:/gi, 'data_') // Neutralize data protocols
		.replace(/vbscript:/gi, 'vbscript_') // Neutralize VBScript protocols
		.replace(/file:/gi, 'file_') // Neutralize file protocols
		.replace(/ftp:/gi, 'ftp_') // Neutralize FTP protocols
		.trim();
}

/**
 * Sanitize search results for display
 */
export function sanitizeSearchResults(results: Array<any>): Array<any> {
	return results.map(result => ({
		...result,
		title: sanitizeContent(result.title || ''),
		description: sanitizeContent(result.description || ''),
		url: sanitizeUrl(result.url || ''),
	}));
}

/**
 * Sanitize content for safe display
 */
function sanitizeContent(content: string): string {
	return content
		.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
		.replace(/<script[^>]*>.*?<\/script>/gis, '[SCRIPT_REMOVED]') // Remove script tags
		.replace(/<iframe[^>]*>.*?<\/iframe>/gis, '[IFRAME_REMOVED]') // Remove iframe tags
		.replace(/on\w+\s*=/gi, 'on_event_removed=') // Remove event handlers
		.replace(/javascript:/gi, 'javascript_') // Neutralize JavaScript protocols
		.substring(0, 1000); // Limit length for safety
}

/**
 * Sanitize URLs for safe display
 */
function sanitizeUrl(url: string): string {
	try {
		const parsedUrl = new URL(url);
		
		// Block dangerous protocols
		const allowedProtocols = ['http:', 'https:'];
		if (!allowedProtocols.includes(parsedUrl.protocol)) {
			return `[BLOCKED_PROTOCOL]${url}`;
		}
		
		// Block localhost and internal IPs for security
		const hostname = parsedUrl.hostname.toLowerCase();
		if (hostname === 'localhost' || 
			hostname.startsWith('127.') || 
			hostname.startsWith('10.') ||
			hostname.startsWith('192.168.') ||
			hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) {
			return `[BLOCKED_INTERNAL]${url}`;
		}
		
		return url;
	} catch {
		// Invalid URL
		return `[INVALID_URL]${url}`;
	}
}

/**
 * Rate limiting configuration for Brave Search API operations
 */
export const BRAVE_SEARCH_RATE_LIMITS = {
	// Conservative limits to avoid hitting Brave Search's rate limits
	WEB_SEARCH: 30,       // per minute for web searches
	NEWS_SEARCH: 20,      // per minute for news searches
	VIDEO_SEARCH: 15,     // per minute for video searches
	IMAGE_SEARCH: 25,     // per minute for image searches
} as const;

/**
 * Check if search operation is read-only (all Brave Search operations are read-only)
 */
export function isReadOnlyOperation(operation: string): boolean {
	// All Brave Search operations are read-only by nature
	const readOnlyOperations = [
		'search',
		'web',
		'news',
		'videos',
		'images',
		'query',
		'find',
		'lookup'
	];
	
	const lowerOp = operation.toLowerCase();
	return readOnlyOperations.some(readonly => lowerOp.includes(readonly));
}

/**
 * Detect potentially harmful search queries
 */
export function detectHarmfulContent(query: string): string[] {
	const indicators: string[] = [];
	
	const harmfulPatterns = [
		{ pattern: /hack|crack|exploit/gi, indicator: "Hacking/exploitation content" },
		{ pattern: /malware|virus|trojan/gi, indicator: "Malware-related content" },
		{ pattern: /phishing|scam|fraud/gi, indicator: "Fraud/scam-related content" },
		{ pattern: /illegal|piracy|torrent/gi, indicator: "Potentially illegal content" },
		{ pattern: /bomb|weapon|explosive/gi, indicator: "Dangerous content" },
		{ pattern: /drug|narcotic|cocaine/gi, indicator: "Drug-related content" },
	];
	
	const lowerQuery = query.toLowerCase();
	
	for (const { pattern, indicator } of harmfulPatterns) {
		if (pattern.test(lowerQuery)) {
			indicators.push(indicator);
		}
	}
	
	return indicators;
}

/**
 * Validate API key format (basic validation)
 */
export function validateApiKey(apiKey: string): { isValid: boolean; error?: string } {
	if (!apiKey || apiKey.trim().length === 0) {
		return { isValid: false, error: "API key cannot be empty" };
	}
	
	// Basic format check - Brave Search API keys are typically alphanumeric
	if (!/^[a-zA-Z0-9\-_]+$/.test(apiKey)) {
		return { isValid: false, error: "Invalid API key format" };
	}
	
	// Length check - API keys should be reasonably long
	if (apiKey.length < 10 || apiKey.length > 100) {
		return { isValid: false, error: "API key length invalid" };
	}
	
	return { isValid: true };
}

/**
 * Check for search query abuse patterns
 */
export function detectQueryAbuse(queries: string[], timeWindow: number = 60000): { isAbuse: boolean; reason?: string } {
	// Check for too many identical queries
	const queryCount = new Map<string, number>();
	for (const query of queries) {
		const normalizedQuery = query.toLowerCase().trim();
		queryCount.set(normalizedQuery, (queryCount.get(normalizedQuery) || 0) + 1);
	}
	
	for (const [query, count] of queryCount) {
		if (count > 10) {
			return { isAbuse: true, reason: `Too many identical queries: "${query}" (${count} times)` };
		}
	}
	
	// Check for too many queries in time window
	if (queries.length > 100) {
		return { isAbuse: true, reason: `Too many queries in time window: ${queries.length}` };
	}
	
	// Check for suspicious patterns
	const suspiciousPatterns = queries.filter(q => detectHarmfulContent(q).length > 0);
	if (suspiciousPatterns.length > 5) {
		return { isAbuse: true, reason: `Too many suspicious queries: ${suspiciousPatterns.length}` };
	}
	
	return { isAbuse: false };
}