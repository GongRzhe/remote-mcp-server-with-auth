/**
 * Gmail API operations with proper error handling and authentication
 * Uses Google APIs client library for Gmail operations
 */

/**
 * Gmail API client interface
 */
export interface GmailMessage {
	to: string[];
	cc?: string[];
	bcc?: string[];
	subject: string;
	body: string;
	isHtml?: boolean;
	attachments?: Array<{
		filename: string;
		content: string;
		mimeType: string;
	}>;
}

/**
 * Execute a Gmail API operation with proper error handling and authentication
 */
export async function withGmail<T>(
	accessToken: string,
	operation: (headers: Record<string, string>) => Promise<T>
): Promise<T> {
	const headers = {
		'Authorization': `Bearer ${accessToken}`,
		'Content-Type': 'application/json',
	};
	
	const startTime = Date.now();
	try {
		const result = await operation(headers);
		const duration = Date.now() - startTime;
		console.log(`Gmail API operation completed successfully in ${duration}ms`);
		return result;
	} catch (error) {
		const duration = Date.now() - startTime;
		console.error(`Gmail API operation failed after ${duration}ms:`, error);
		// Re-throw the error so it can be caught by Sentry in the calling code
		throw error;
	}
}

/**
 * Format Gmail API errors for user-friendly display
 */
export function formatGmailError(error: unknown): string {
	if (error && typeof error === 'object' && 'status' in error) {
		const gmailError = error as any;
		switch (gmailError.status) {
			case 401:
				return "Gmail authentication failed. Please check your access token or re-authenticate.";
			case 403:
				return "Gmail API access denied. Please check your OAuth scopes and permissions.";
			case 404:
				return "Gmail resource not found. Please check the message ID or mailbox.";
			case 429:
				return "Gmail API rate limit exceeded. Please try again later.";
			case 400:
				return "Gmail API request invalid. Please check your email parameters.";
			default:
				return `Gmail API error (${gmailError.status}): ${gmailError.message || 'Unknown error'}`;
		}
	}
	
	if (error instanceof Error) {
		return `Gmail operation failed: ${error.message}`;
	}
	
	return "Unknown Gmail API error occurred.";
}

/**
 * Validate email address format
 */
export function validateEmailAddress(email: string): { isValid: boolean; error?: string } {
	if (!email || email.trim().length === 0) {
		return { isValid: false, error: "Email address cannot be empty" };
	}
	
	// RFC 5322 compliant email regex (simplified)
	const emailPattern = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
	
	if (!emailPattern.test(email.trim())) {
		return { isValid: false, error: "Invalid email address format" };
	}
	
	if (email.length > 254) {
		return { isValid: false, error: "Email address too long (max 254 characters)" };
	}
	
	return { isValid: true };
}

/**
 * Validate multiple email addresses
 */
export function validateEmailAddresses(emails: string[]): { isValid: boolean; error?: string } {
	if (!emails || emails.length === 0) {
		return { isValid: false, error: "At least one email address is required" };
	}
	
	if (emails.length > 100) {
		return { isValid: false, error: "Too many recipients (max 100)" };
	}
	
	for (const email of emails) {
		const validation = validateEmailAddress(email);
		if (!validation.isValid) {
			return { isValid: false, error: `Invalid email "${email}": ${validation.error}` };
		}
	}
	
	return { isValid: true };
}

/**
 * Create Gmail API message payload
 */
export function createGmailMessage(message: GmailMessage): string {
	const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	
	// Build email headers
	const headers = [
		`To: ${message.to.join(', ')}`,
		message.cc && message.cc.length > 0 ? `Cc: ${message.cc.join(', ')}` : null,
		message.bcc && message.bcc.length > 0 ? `Bcc: ${message.bcc.join(', ')}` : null,
		`Subject: ${message.subject}`,
		'MIME-Version: 1.0',
		`Content-Type: multipart/mixed; boundary="${boundary}"`
	].filter(Boolean).join('\r\n');
	
	// Build email body
	let body = `${headers}\r\n\r\n`;
	
	// Add main content
	body += `--${boundary}\r\n`;
	body += `Content-Type: ${message.isHtml ? 'text/html' : 'text/plain'}; charset=UTF-8\r\n`;
	body += 'Content-Transfer-Encoding: quoted-printable\r\n\r\n';
	body += `${message.body}\r\n\r\n`;
	
	// Add attachments if any
	if (message.attachments && message.attachments.length > 0) {
		for (const attachment of message.attachments) {
			body += `--${boundary}\r\n`;
			body += `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"\r\n`;
			body += 'Content-Transfer-Encoding: base64\r\n';
			body += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n\r\n`;
			body += `${attachment.content}\r\n\r\n`;
		}
	}
	
	body += `--${boundary}--`;
	
	// Encode to base64url
	return Buffer.from(body)
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

/**
 * Send email using Gmail API
 */
export async function sendGmailMessage(accessToken: string, message: GmailMessage): Promise<any> {
	return await withGmail(accessToken, async (headers) => {
		const encodedMessage = createGmailMessage(message);
		
		const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
			method: 'POST',
			headers,
			body: JSON.stringify({
				raw: encodedMessage
			})
		});
		
		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw {
				status: response.status,
				message: errorData.error?.message || response.statusText,
				details: errorData
			};
		}
		
		return await response.json();
	});
}