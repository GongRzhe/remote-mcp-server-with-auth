import * as Sentry from "@sentry/cloudflare";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { 
	Props, 
	SendEmailSchema, 
	GetEmailProfileSchema,
	createErrorResponse,
	createSuccessResponse
} from "../types";
import { 
	validateEmailSubject, 
	validateEmailBody, 
	validateRecipientLimits,
	detectPhishingIndicators,
	sanitizeEmailContent
} from "../gmail/security";
import { 
	sendGmailMessage, 
	withGmail,
	validateEmailAddresses,
	formatGmailError,
	type GmailMessage 
} from "../gmail/utils";

const ALLOWED_USERNAMES = new Set<string>([
	// Add GitHub usernames of users who should have access to Gmail operations
	// For example: 'yourusername', 'coworkerusername'
	'coleam00'
]);

// Error handling helper for MCP tools with Sentry
function handleError(error: unknown): { content: Array<{ type: "text"; text: string; isError?: boolean }> } {
	const eventId = Sentry.captureException(error);

	const errorMessage = [
		"**Error**",
		"There was a problem with your Gmail request.",
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

export function registerGmailToolsWithSentry(server: McpServer, env: Env, props: Props) {
	// Tool 1: Send Email - Available to all authenticated users with comprehensive security checks
	server.tool(
		"sendEmail",
		"Send an email via Gmail with security validation and anti-phishing checks. Supports plain text and HTML emails with CC/BCC recipients.",
		SendEmailSchema,
		async ({ to, cc, bcc, subject, body, isHtml = false }) => {
			return await Sentry.startNewTrace(async () => {
				return await Sentry.startSpan({
					name: "mcp.tool/sendEmail",
					attributes: {
						'mcp.tool.name': 'sendEmail',
						'mcp.user.login': props.login,
						'mcp.gmail.recipients_count': to.length + (cc?.length || 0) + (bcc?.length || 0),
						'mcp.gmail.subject_length': subject.length,
						'mcp.gmail.body_length': body.length,
						'mcp.gmail.is_html': isHtml,
					},
				}, async (span) => {
					// Set user context
					Sentry.setUser({
						username: props.login,
						email: props.email,
					});

					try {
						// Comprehensive validation
						
						// 1. Validate recipient limits
						const recipientValidation = validateRecipientLimits(to, cc, bcc);
						if (!recipientValidation.isValid) {
							return createErrorResponse(`Recipient validation failed: ${recipientValidation.error}`);
						}
						
						// 2. Validate all email addresses
						const allEmails = [...to, ...(cc || []), ...(bcc || [])];
						const emailValidation = validateEmailAddresses(allEmails);
						if (!emailValidation.isValid) {
							return createErrorResponse(`Email validation failed: ${emailValidation.error}`);
						}
						
						// 3. Validate subject
						const subjectValidation = validateEmailSubject(subject);
						if (!subjectValidation.isValid) {
							return createErrorResponse(`Subject validation failed: ${subjectValidation.error}`);
						}
						
						// 4. Validate body content
						const bodyValidation = validateEmailBody(body);
						if (!bodyValidation.isValid) {
							return createErrorResponse(`Body validation failed: ${bodyValidation.error}`);
						}
						
						// 5. Check for phishing indicators
						const phishingIndicators = detectPhishingIndicators(subject, body);
						if (phishingIndicators.length > 2) {
							return createErrorResponse(
								`Email appears to contain suspicious content. Detected indicators: ${phishingIndicators.join(', ')}`
							);
						}
						
						// 6. Sanitize content
						const sanitizedSubject = sanitizeEmailContent(subject);
						const sanitizedBody = sanitizeEmailContent(body);
						
						// Create Gmail message
						const gmailMessage: GmailMessage = {
							to,
							cc,
							bcc,
							subject: sanitizedSubject,
							body: sanitizedBody,
							isHtml
						};
						
						// Send the email
						const result = await sendGmailMessage(props.accessToken, gmailMessage);
						
						// Create success response with security summary
						const securitySummary = {
							recipients: {
								to: to.length,
								cc: cc?.length || 0,
								bcc: bcc?.length || 0,
								total: to.length + (cc?.length || 0) + (bcc?.length || 0)
							},
							content: {
								subject_length: subject.length,
								body_length: body.length,
								format: isHtml ? 'HTML' : 'Plain Text',
								sanitized: sanitizedSubject !== subject || sanitizedBody !== body
							},
							security: {
								phishing_indicators: phishingIndicators.length,
								validation_passed: true
							}
						};
						
						return {
							content: [
								{
									type: "text",
									text: `**Email Sent Successfully**\n\n**Message ID:** ${result.id}\n**Thread ID:** ${result.threadId}\n\n**Recipients:**\n- To: ${to.join(', ')}\n${cc ? `- CC: ${cc.join(', ')}\n` : ''}${bcc ? `- BCC: ${bcc.join(', ')}\n` : ''}\n**Subject:** ${sanitizedSubject}\n\n**Security Summary:**\n\`\`\`json\n${JSON.stringify(securitySummary, null, 2)}\n\`\`\`\n\n**Sent by:** ${props.login} (${props.name})\n\n${phishingIndicators.length > 0 ? `⚠️  **Warning:** Detected potential phishing indicators: ${phishingIndicators.join(', ')}` : '✅ **Security Check:** All validations passed'}`
								}
							]
						};
						
					} catch (error) {
						console.error('sendEmail error:', error);
						span.setStatus({ code: 2 }); // error
						
						// Format Gmail-specific errors
						const formattedError = formatGmailError(error);
						return createErrorResponse(`Failed to send email: ${formattedError}`);
					}
				});
			});
		}
	);

	// Tool 2: Get Email Profile - Available to all authenticated users
	server.tool(
		"getEmailProfile",
		"Get Gmail profile information including email address, storage usage, and account details.",
		GetEmailProfileSchema,
		async () => {
			return await Sentry.startNewTrace(async () => {
				return await Sentry.startSpan({
					name: "mcp.tool/getEmailProfile",
					attributes: {
						'mcp.tool.name': 'getEmailProfile',
						'mcp.user.login': props.login,
					},
				}, async (span) => {
					// Set user context
					Sentry.setUser({
						username: props.login,
						email: props.email,
					});

					try {
						const profileData = await withGmail(props.accessToken, async (headers) => {
							const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
								method: 'GET',
								headers
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
						
						// Get additional user info if available
						const userInfoData = await withGmail(props.accessToken, async (headers) => {
							const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
								method: 'GET',
								headers
							});
							
							if (response.ok) {
								return await response.json();
							}
							return null; // Gracefully handle if user info is not available
						}).catch(() => null);
						
						const profileInfo = {
							email: profileData.emailAddress,
							messages_total: profileData.messagesTotal,
							threads_total: profileData.threadsTotal,
							history_id: profileData.historyId,
							user_info: userInfoData ? {
								name: userInfoData.name,
								given_name: userInfoData.given_name,
								family_name: userInfoData.family_name,
								picture: userInfoData.picture,
								verified_email: userInfoData.verified_email
							} : null,
							oauth_user: {
								login: props.login,
								name: props.name,
								email: props.email
							}
						};
						
						return {
							content: [
								{
									type: "text",
									text: `**Gmail Profile Information**\n\n**Account Details:**\n\`\`\`json\n${JSON.stringify(profileInfo, null, 2)}\n\`\`\`\n\n**Retrieved by:** ${props.login} (${props.name})`
								}
							]
						};
						
					} catch (error) {
						console.error('getEmailProfile error:', error);
						span.setStatus({ code: 2 }); // error
						
						// Format Gmail-specific errors
						const formattedError = formatGmailError(error);
						return createErrorResponse(`Failed to get email profile: ${formattedError}`);
					}
				});
			});
		}
	);
}