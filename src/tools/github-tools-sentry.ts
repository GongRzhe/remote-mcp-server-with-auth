import * as Sentry from "@sentry/cloudflare";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { 
	Props, 
	SearchRepositoriesSchema, 
	GetRepositoryInfoSchema,
	createErrorResponse,
	createSuccessResponse
} from "../types";
import { validateSearchQuery, formatGitHubError } from "../github/security";
import { validateRepositoryFormat } from "../github/utils";
import { withGitHub } from "../github/utils";

const ALLOWED_USERNAMES = new Set<string>([
	// Add GitHub usernames of users who should have access to GitHub operations
	// For example: 'yourusername', 'coworkerusername'
	'coleam00'
]);

// Error handling helper for MCP tools with Sentry
function handleError(error: unknown): { content: Array<{ type: "text"; text: string; isError?: boolean }> } {
	const eventId = Sentry.captureException(error);

	const errorMessage = [
		"**Error**",
		"There was a problem with your GitHub request.",
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

export function registerGitHubToolsWithSentry(server: McpServer, env: Env, props: Props) {
	// Tool 1: Search Repositories - Available to all authenticated users
	server.tool(
		"searchRepositories",
		"Search for GitHub repositories using a query string. Returns repository information including name, description, stars, and language.",
		SearchRepositoriesSchema,
		async ({ query, limit = 10 }) => {
			return await Sentry.startNewTrace(async () => {
				return await Sentry.startSpan({
					name: "mcp.tool/searchRepositories",
					attributes: {
						'mcp.tool.name': 'searchRepositories',
						'mcp.user.login': props.login,
						'mcp.github.query': query.substring(0, 50), // Truncate for security
						'mcp.github.limit': limit,
					},
				}, async (span) => {
					// Set user context
					Sentry.setUser({
						username: props.login,
						email: props.email,
					});

					try {
						// Validate the search query
						const validation = validateSearchQuery(query);
						if (!validation.isValid) {
							return createErrorResponse(`Invalid search query: ${validation.error}`);
						}
						
						return await withGitHub(props.accessToken, async (octokit) => {
							const response = await octokit.rest.search.repos({
								q: query,
								per_page: Math.min(limit, 100),
								sort: 'stars',
								order: 'desc'
							});
							
							const repositories = response.data.items.map(repo => ({
								name: repo.name,
								full_name: repo.full_name,
								description: repo.description,
								html_url: repo.html_url,
								stars: repo.stargazers_count,
								forks: repo.forks_count,
								language: repo.language,
								created_at: repo.created_at,
								updated_at: repo.updated_at,
								owner: {
									login: repo.owner.login,
									type: repo.owner.type
								},
								private: repo.private,
								archived: repo.archived
							}));
							
							return {
								content: [
									{
										type: "text",
										text: `**GitHub Repository Search Results**\n\n**Query:** ${query}\n**Results found:** ${response.data.total_count} (showing ${repositories.length})\n\n**Repositories:**\n\`\`\`json\n${JSON.stringify(repositories, null, 2)}\n\`\`\`\n\n**Search performed by:** ${props.login} (${props.name})`
									}
								]
							};
						});
					} catch (error) {
						console.error('searchRepositories error:', error);
						span.setStatus({ code: 2 }); // error
						return handleError(error);
					}
				});
			});
		}
	);

	// Tool 2: Get Repository Information - Available to all authenticated users
	server.tool(
		"getRepositoryInfo",
		"Get detailed information about a specific GitHub repository including stats, languages, and recent activity.",
		GetRepositoryInfoSchema,
		async ({ repository }) => {
			return await Sentry.startNewTrace(async () => {
				return await Sentry.startSpan({
					name: "mcp.tool/getRepositoryInfo",
					attributes: {
						'mcp.tool.name': 'getRepositoryInfo',
						'mcp.user.login': props.login,
						'mcp.github.repository': repository,
					},
				}, async (span) => {
					// Set user context
					Sentry.setUser({
						username: props.login,
						email: props.email,
					});

					try {
						// Validate the repository format
						const validation = validateRepositoryFormat(repository);
						if (!validation.isValid) {
							return createErrorResponse(`Invalid repository format: ${validation.error}`);
						}
						
						const [owner, repo] = repository.split('/');
						
						return await withGitHub(props.accessToken, async (octokit) => {
							// Get repository information
							const repoResponse = await octokit.rest.repos.get({
								owner,
								repo
							});
							
							// Get languages (parallel request)
							const languagesResponse = await octokit.rest.repos.listLanguages({
								owner,
								repo
							});
							
							// Get recent commits (parallel request)  
							const commitsResponse = await octokit.rest.repos.listCommits({
								owner,
								repo,
								per_page: 5
							});
							
							const repoData = repoResponse.data;
							const languages = languagesResponse.data;
							const recentCommits = commitsResponse.data.map(commit => ({
								sha: commit.sha.substring(0, 7),
								message: commit.commit.message.split('\n')[0], // First line only
								author: commit.commit.author?.name,
								date: commit.commit.author?.date,
								url: commit.html_url
							}));
							
							const repositoryInfo = {
								name: repoData.name,
								full_name: repoData.full_name,
								description: repoData.description,
								html_url: repoData.html_url,
								clone_url: repoData.clone_url,
								ssh_url: repoData.ssh_url,
								homepage: repoData.homepage,
								size: repoData.size,
								stars: repoData.stargazers_count,
								watchers: repoData.watchers_count,
								forks: repoData.forks_count,
								issues: repoData.open_issues_count,
								language: repoData.language,
								languages: languages,
								topics: repoData.topics,
								license: repoData.license?.name,
								created_at: repoData.created_at,
								updated_at: repoData.updated_at,
								pushed_at: repoData.pushed_at,
								default_branch: repoData.default_branch,
								owner: {
									login: repoData.owner.login,
									type: repoData.owner.type,
									avatar_url: repoData.owner.avatar_url
								},
								private: repoData.private,
								archived: repoData.archived,
								disabled: repoData.disabled,
								recent_commits: recentCommits
							};
							
							return {
								content: [
									{
										type: "text",
										text: `**GitHub Repository Information**\n\n**Repository:** ${repository}\n\n**Details:**\n\`\`\`json\n${JSON.stringify(repositoryInfo, null, 2)}\n\`\`\`\n\n**Retrieved by:** ${props.login} (${props.name})`
									}
								]
							};
						});
					} catch (error) {
						console.error('getRepositoryInfo error:', error);
						span.setStatus({ code: 2 }); // error
						return handleError(error);
					}
				});
			});
		}
	);
}