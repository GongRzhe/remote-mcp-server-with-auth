/**
 * Security validation for GitHub operations
 */

/**
 * Check if a GitHub operation is potentially dangerous
 */
export function isDangerousOperation(operation: string): boolean {
	const dangerousOperations = [
		'delete',
		'remove',
		'destroy',
		'force',
		'admin',
		'owner',
		'transfer',
		'archive'
	];
	
	const lowerOp = operation.toLowerCase();
	return dangerousOperations.some(dangerous => lowerOp.includes(dangerous));
}

/**
 * Validate GitHub search query for safety
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
	];
	
	for (const pattern of maliciousPatterns) {
		if (pattern.test(query)) {
			return { isValid: false, error: "Search query contains invalid characters" };
		}
	}
	
	// Limit query length
	if (query.length > 256) {
		return { isValid: false, error: "Search query too long (max 256 characters)" };
	}
	
	return { isValid: true };
}

/**
 * Validate file path for GitHub operations
 */
export function validateFilePath(path: string): { isValid: boolean; error?: string } {
	if (!path || path.trim().length === 0) {
		return { isValid: false, error: "File path cannot be empty" };
	}
	
	// Check for path traversal attempts
	if (path.includes('..') || path.includes('./') || path.includes('.\\')) {
		return { isValid: false, error: "Path traversal attempts are not allowed" };
	}
	
	// Check for absolute paths
	if (path.startsWith('/') || path.match(/^[a-zA-Z]:/)) {
		return { isValid: false, error: "Absolute paths are not allowed" };
	}
	
	// Check for potentially dangerous file extensions
	const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.com'];
	const extension = path.toLowerCase().substring(path.lastIndexOf('.'));
	if (dangerousExtensions.includes(extension)) {
		return { isValid: false, error: "Potentially dangerous file extension" };
	}
	
	return { isValid: true };
}

/**
 * Sanitize GitHub content for display
 */
export function sanitizeGitHubContent(content: string): string {
	// Remove or escape potentially dangerous content
	return content
		.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters except \t, \n, \r
		.replace(/javascript:/gi, 'javascript_') // Neutralize JavaScript protocols
		.replace(/data:/gi, 'data_') // Neutralize data protocols
		.replace(/vbscript:/gi, 'vbscript_'); // Neutralize VBScript protocols
}

/**
 * Rate limiting configuration for GitHub API operations
 */
export const GITHUB_RATE_LIMITS = {
	// Conservative limits to avoid hitting GitHub's rate limits
	SEARCH_REPOSITORIES: 10,  // per minute
	GET_REPOSITORY_INFO: 30,  // per minute
	LIST_FILES: 20,          // per minute
	GET_FILE_CONTENT: 50,    // per minute
} as const;

/**
 * Check if GitHub operation is read-only
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