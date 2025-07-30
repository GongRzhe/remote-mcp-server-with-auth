import { Octokit } from "octokit";

/**
 * Execute a GitHub API operation with proper error handling and authentication
 */
export async function withGitHub<T>(
	accessToken: string,
	operation: (octokit: Octokit) => Promise<T>
): Promise<T> {
	const octokit = new Octokit({ auth: accessToken });
	const startTime = Date.now();
	try {
		const result = await operation(octokit);
		const duration = Date.now() - startTime;
		console.log(`GitHub API operation completed successfully in ${duration}ms`);
		return result;
	} catch (error) {
		const duration = Date.now() - startTime;
		console.error(`GitHub API operation failed after ${duration}ms:`, error);
		// Re-throw the error so it can be caught by Sentry in the calling code
		throw error;
	}
}

/**
 * Format GitHub API errors for user-friendly display
 */
export function formatGitHubError(error: unknown): string {
	if (error && typeof error === 'object' && 'status' in error) {
		const ghError = error as any;
		switch (ghError.status) {
			case 401:
				return "GitHub authentication failed. Please check your access token.";
			case 403:
				return "GitHub API rate limit exceeded or insufficient permissions.";
			case 404:
				return "GitHub resource not found. Please check the repository or user exists.";
			case 422:
				return "GitHub API validation failed. Please check your input parameters.";
			default:
				return `GitHub API error (${ghError.status}): ${ghError.message || 'Unknown error'}`;
		}
	}
	
	if (error instanceof Error) {
		return `GitHub operation failed: ${error.message}`;
	}
	
	return "Unknown GitHub API error occurred.";
}

/**
 * Validate GitHub repository format (owner/repo)
 */
export function validateRepositoryFormat(repo: string): { isValid: boolean; error?: string } {
	const repoPattern = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
	
	if (!repo || repo.trim().length === 0) {
		return { isValid: false, error: "Repository cannot be empty" };
	}
	
	if (!repoPattern.test(repo.trim())) {
		return { isValid: false, error: "Repository must be in format 'owner/repo'" };
	}
	
	const parts = repo.split('/');
	if (parts.length !== 2) {
		return { isValid: false, error: "Repository must contain exactly one '/' separator" };
	}
	
	const [owner, repoName] = parts;
	if (owner.length === 0 || repoName.length === 0) {
		return { isValid: false, error: "Both owner and repository name must be non-empty" };
	}
	
	return { isValid: true };
}

/**
 * Validate GitHub username format
 */
export function validateUsernameFormat(username: string): { isValid: boolean; error?: string } {
	const usernamePattern = /^[a-zA-Z0-9]([a-zA-Z0-9-])*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;
	
	if (!username || username.trim().length === 0) {
		return { isValid: false, error: "Username cannot be empty" };
	}
	
	if (username.length > 39) {
		return { isValid: false, error: "Username cannot be longer than 39 characters" };
	}
	
	if (!usernamePattern.test(username)) {
		return { isValid: false, error: "Username can only contain alphanumeric characters and hyphens, and cannot start or end with a hyphen" };
	}
	
	return { isValid: true };
}