/**
 * Security validation for Gmail operations
 */

/**
 * Check if an email operation is potentially dangerous
 */
export function isDangerousEmailOperation(operation: string): boolean {
	const dangerousOperations = [
		'spam',
		'phishing',
		'malware',
		'virus',
		'bulk',
		'mass',
		'blast'
	];
	
	const lowerOp = operation.toLowerCase();
	return dangerousOperations.some(dangerous => lowerOp.includes(dangerous));
}

/**
 * Validate email subject for safety
 */
export function validateEmailSubject(subject: string): { isValid: boolean; error?: string } {
	if (!subject || subject.trim().length === 0) {
		return { isValid: false, error: "Email subject cannot be empty" };
	}
	
	// Check for potentially malicious patterns
	const maliciousPatterns = [
		/[\x00-\x1f\x7f]/,  // Control characters
		/javascript:/i,      // JavaScript protocol
		/data:/i,           // Data protocol
		/vbscript:/i,       // VBScript protocol
		/<script/i,         // Script tags
		/<iframe/i,         // Iframe tags
		/on\w+=/i,          // Event handlers (onclick, onload, etc.)
	];
	
	for (const pattern of maliciousPatterns) {
		if (pattern.test(subject)) {
			return { isValid: false, error: "Subject contains potentially dangerous content" };
		}
	}
	
	// Limit subject length
	if (subject.length > 998) { // RFC 5322 limit
		return { isValid: false, error: "Subject too long (max 998 characters)" };
	}
	
	return { isValid: true };
}

/**
 * Validate email body content for safety
 */
export function validateEmailBody(body: string): { isValid: boolean; error?: string } {
	if (!body || body.trim().length === 0) {
		return { isValid: false, error: "Email body cannot be empty" };
	}
	
	// Check for suspicious content patterns
	const suspiciousPatterns = [
		/<script[^>]*>.*<\/script>/is,  // Script blocks
		/<iframe[^>]*>/i,              // Iframes
		/javascript:/gi,               // JavaScript protocols
		/data:\s*text\/html/gi,        // Data URLs with HTML
		/vbscript:/gi,                 // VBScript protocols
		/<object[^>]*>/i,              // Object tags
		/<embed[^>]*>/i,               // Embed tags
		/<applet[^>]*>/i,              // Applet tags
		/<form[^>]*>/i,                // Form tags (potential phishing)
	];
	
	for (const pattern of suspiciousPatterns) {
		if (pattern.test(body)) {
			return { isValid: false, error: "Email body contains potentially dangerous content" };
		}
	}
	
	// Check for excessive length (prevent abuse)
	if (body.length > 10485760) { // 10MB limit
		return { isValid: false, error: "Email body too large (max 10MB)" };
	}
	
	// Check for potential spam indicators
	const spamIndicators = [
		/URGENT|IMMEDIATE|ACT NOW|LIMITED TIME/gi,
		/\$\$\$|\$\d+[,\d]*|\bmoney\b.*\bfast\b/gi,
		/click here|click now|click below/gi,
		/congratulations.*won|winner|prize.*claim/gi,
		/viagra|cialis|pharmacy|prescription/gi,
	];
	
	let spamScore = 0;
	for (const pattern of spamIndicators) {
		if (pattern.test(body)) {
			spamScore++;
		}
	}
	
	if (spamScore >= 3) {
		return { isValid: false, error: "Email content appears to be spam-like" };
	}
	
	return { isValid: true };
}

/**
 * Validate attachment for safety
 */
export function validateAttachment(filename: string, mimeType: string, size: number): { isValid: boolean; error?: string } {
	// Check filename for dangerous extensions
	const dangerousExtensions = [
		'.exe', '.bat', '.cmd', '.scr', '.pif', '.com', '.jar',
		'.vbs', '.js', '.jse', '.wsf', '.wsh', '.ps1', '.reg'
	];
	
	const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
	if (dangerousExtensions.includes(extension)) {
		return { isValid: false, error: `Dangerous file extension: ${extension}` };
	}
	
	// Check for path traversal in filename
	if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
		return { isValid: false, error: "Invalid characters in filename" };
	}
	
	// Check file size (25MB Gmail limit)
	if (size > 25 * 1024 * 1024) {
		return { isValid: false, error: "Attachment too large (max 25MB)" };
	}
	
	// Validate MIME type
	const allowedMimePatterns = [
		/^text\//,
		/^image\//,
		/^application\/pdf$/,
		/^application\/msword$/,
		/^application\/vnd\.openxmlformats-officedocument\./,
		/^application\/vnd\.ms-excel$/,
		/^application\/vnd\.ms-powerpoint$/,
		/^application\/zip$/,
		/^application\/x-zip-compressed$/,
	];
	
	const isMimeTypeAllowed = allowedMimePatterns.some(pattern => pattern.test(mimeType));
	if (!isMimeTypeAllowed) {
		return { isValid: false, error: `Unsupported MIME type: ${mimeType}` };
	}
	
	return { isValid: true };
}

/**
 * Sanitize email content for display
 */
export function sanitizeEmailContent(content: string): string {
	// Remove or escape potentially dangerous content
	return content
		.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters except \t, \n, \r
		.replace(/javascript:/gi, 'javascript_') // Neutralize JavaScript protocols
		.replace(/data:/gi, 'data_') // Neutralize data protocols
		.replace(/vbscript:/gi, 'vbscript_') // Neutralize VBScript protocols
		.replace(/<script[^>]*>.*?<\/script>/gis, '[SCRIPT_REMOVED]') // Remove script tags
		.replace(/<iframe[^>]*>/gi, '[IFRAME_REMOVED]') // Remove iframe tags
		.replace(/on\w+\s*=/gi, 'on_event_removed='); // Remove event handlers
}

/**
 * Rate limiting configuration for Gmail API operations
 */
export const GMAIL_RATE_LIMITS = {
	// Conservative limits to avoid hitting Gmail's rate limits
	SEND_EMAIL: 5,      // per minute for sending emails
	READ_EMAIL: 50,     // per minute for reading emails
	SEARCH_EMAIL: 20,   // per minute for searching emails
} as const;

/**
 * Check if Gmail operation is read-only
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
		'info',
		'profile'
	];
	
	const lowerOp = operation.toLowerCase();
	return readOnlyOperations.some(readonly => lowerOp.includes(readonly));
}

/**
 * Validate recipient limits to prevent abuse
 */
export function validateRecipientLimits(to: string[], cc?: string[], bcc?: string[]): { isValid: boolean; error?: string } {
	const totalRecipients = to.length + (cc?.length || 0) + (bcc?.length || 0);
	
	// Gmail allows up to 500 recipients per message, but we'll be more conservative
	if (totalRecipients > 50) {
		return { isValid: false, error: "Too many recipients (max 50 total)" };
	}
	
	if (to.length === 0) {
		return { isValid: false, error: "At least one 'To' recipient is required" };
	}
	
	if (to.length > 25) {
		return { isValid: false, error: "Too many 'To' recipients (max 25)" };
	}
	
	if (cc && cc.length > 25) {
		return { isValid: false, error: "Too many 'CC' recipients (max 25)" };
	}
	
	if (bcc && bcc.length > 25) {
		return { isValid: false, error: "Too many 'BCC' recipients (max 25)" };
	}
	
	return { isValid: true };
}

/**
 * Check for potential phishing indicators
 */
export function detectPhishingIndicators(subject: string, body: string): string[] {
	const indicators: string[] = [];
	
	const phishingPatterns = [
		{ pattern: /urgent.*action.*required/gi, indicator: "Urgent action required language" },
		{ pattern: /verify.*account.*suspended/gi, indicator: "Account suspension threat" },
		{ pattern: /click.*here.*immediately/gi, indicator: "Suspicious call-to-action" },
		{ pattern: /limited.*time.*expires/gi, indicator: "False urgency" },
		{ pattern: /congratulations.*winner.*prize/gi, indicator: "Prize/winner scam language" },
		{ pattern: /confirm.*identity.*details/gi, indicator: "Identity confirmation request" },
		{ pattern: /security.*alert.*unauthorized/gi, indicator: "Security alert spoofing" },
	];
	
	const combinedText = `${subject} ${body}`.toLowerCase();
	
	for (const { pattern, indicator } of phishingPatterns) {
		if (pattern.test(combinedText)) {
			indicators.push(indicator);
		}
	}
	
	return indicators;
}