import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import type { Props, ExtendedEnv } from "../types";
import {
	clientIdAlreadyApproved,
	parseRedirectApproval,
	renderApprovalDialog,
	getUpstreamAuthorizeUrl,
} from "./oauth-utils";

const app = new Hono<{ Bindings: ExtendedEnv }>();

app.get("/authorize", async (c) => {
	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	const { clientId } = oauthReqInfo;
	if (!clientId) {
		return c.text("Invalid request", 400);
	}

	if (
		await clientIdAlreadyApproved(c.req.raw, oauthReqInfo.clientId, (c.env as any).COOKIE_ENCRYPTION_KEY)
	) {
		return redirectToAuth0(c.req.raw, oauthReqInfo, c.env, {});
	}

	return renderApprovalDialog(c.req.raw, {
		client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
		server: {
			description: "This is a demo MCP Remote Server using Auth0 for authentication.",
			logo: "https://cdn.auth0.com/website/new-homepage/dark-favicon.png",
			name: "Cloudflare Auth0 MCP Server",
		},
		state: { oauthReqInfo },
	});
});

app.post("/authorize", async (c) => {
	// Validates form submission, extracts state, and generates Set-Cookie headers to skip approval dialog next time
	const { state, headers } = await parseRedirectApproval(c.req.raw, (c.env as any).COOKIE_ENCRYPTION_KEY);
	if (!state.oauthReqInfo) {
		return c.text("Invalid request", 400);
	}

	return redirectToAuth0(c.req.raw, state.oauthReqInfo, c.env, headers);
});

async function redirectToAuth0(
	request: Request,
	oauthReqInfo: AuthRequest,
	env: Env,
	headers: Record<string, string> = {},
) {
	// Generate PKCE parameters
	const codeVerifier = generateCodeVerifier();
	const codeChallenge = await generateCodeChallenge(codeVerifier);
	
	// Store code verifier with OAuth request info
	const state = btoa(JSON.stringify({
		...oauthReqInfo,
		codeVerifier
	}));

	// Get Auth0 domain from environment
	const auth0Domain = (env as any).AUTH0_DOMAIN;
	if (!auth0Domain) {
		throw new Error("AUTH0_DOMAIN environment variable is required");
	}

	// Build Auth0 authorization URL with PKCE
	const authUrl = getUpstreamAuthorizeUrl({
		client_id: (env as any).AUTH0_CLIENT_ID,
		redirect_uri: new URL("/auth0/callback", request.url).href,
		scope: "openid profile email",
		state: state,
		upstream_url: `https://${auth0Domain}/authorize`,
	});

	// Add PKCE parameters (response_type is already added by getUpstreamAuthorizeUrl)
	const finalAuthUrl = authUrl + 
		"&code_challenge=" + encodeURIComponent(codeChallenge) + 
		"&code_challenge_method=S256";

	// Add audience if configured
	const audience = (env as any).AUTH0_AUDIENCE;
	if (audience) {
		const urlWithAudience = finalAuthUrl + "&audience=" + encodeURIComponent(audience);
		return new Response(null, {
			headers: {
				...headers,
				location: urlWithAudience,
			},
			status: 302,
		});
	}

	return new Response(null, {
		headers: {
			...headers,
			location: finalAuthUrl,
		},
		status: 302,
	});
}

/**
 * OAuth Callback Endpoint
 *
 * This route handles the callback from Auth0 after user authentication.
 * It exchanges the temporary code for an access token using PKCE, then stores
 * user metadata & the auth token as part of the 'props' on the token passed
 * down to the client. It ends by redirecting the client back to _its_ callback URL
 */
app.get("/callback", async (c) => {
	// Get the OAuth request info from state
	const stateData = JSON.parse(atob(c.req.query("state") as string));
	const oauthReqInfo = stateData as AuthRequest & { codeVerifier: string };
	if (!oauthReqInfo.clientId) {
		return c.text("Invalid state", 400);
	}

	const auth0Domain = (c.env as any).AUTH0_DOMAIN;
	const code = c.req.query("code");
	const codeVerifier = oauthReqInfo.codeVerifier;

	if (!code) {
		return c.text("Missing authorization code", 400);
	}

	// Exchange the code for tokens using PKCE
	let tokenData, userData, accessToken;
	
	try {
		const tokenRequestData = {
			grant_type: 'authorization_code',
			client_id: (c.env as any).AUTH0_CLIENT_ID,
			client_secret: (c.env as any).AUTH0_CLIENT_SECRET,
			code: code,
			redirect_uri: new URL("/auth0/callback", c.req.url).href,
			code_verifier: codeVerifier
		};

		console.log(`Attempting Auth0 token exchange with domain: ${auth0Domain}`);
		
		const tokenResponse = await fetch(`https://${auth0Domain}/oauth/token`, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				"User-Agent": "Cloudflare-Worker/1.0",
			},
			body: new URLSearchParams(tokenRequestData).toString(),
		});

		if (!tokenResponse.ok) {
			const errorText = await tokenResponse.text();
			console.error("Auth0 token exchange failed:", {
				status: tokenResponse.status,
				statusText: tokenResponse.statusText,
				error: errorText
			});
			return c.text(`Failed to fetch access token: ${tokenResponse.status} ${tokenResponse.statusText}`, 500);
		}

		tokenData = await tokenResponse.json();
		accessToken = tokenData.access_token;

		if (!accessToken) {
			console.error("Auth0 token response missing access_token:", tokenData);
			return c.text("Missing access token in response", 400);
		}

		console.log("Auth0 token exchange successful, fetching user info");

		// Fetch the user info from Auth0
		const userResponse = await fetch(`https://${auth0Domain}/userinfo`, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"User-Agent": "Cloudflare-Worker/1.0",
			},
		});

		if (!userResponse.ok) {
			const errorText = await userResponse.text();
			console.error("Auth0 user info failed:", {
				status: userResponse.status,
				statusText: userResponse.statusText,
				error: errorText
			});
			return c.text(`Failed to fetch user info: ${userResponse.status} ${userResponse.statusText}`, 500);
		}

		userData = await userResponse.json();
		console.log("Auth0 user info retrieved successfully");

	} catch (error) {
		console.error("Auth0 network error:", {
			message: error.message,
			stack: error.stack,
			name: error.name
		});
		
		// Check if it's a network connectivity issue
		if (error.message.includes('Network connection lost') || 
		    error.message.includes('fetch failed') ||
		    error.name === 'TypeError') {
			return c.text("Network connectivity issue. Please check your internet connection and try again. If using a proxy, ensure it allows connections to Auth0.", 500);
		}
		
		return c.text(`Auth0 integration error: ${error.message}`, 500);
	}
	const { sub, email, email_verified, name, nickname, picture, updated_at } = userData;

	// Use nickname as login (Auth0 equivalent), fallback to email prefix
	const login = nickname || email?.split('@')[0] || sub.split('|')[1] || 'unknown';

	// Return back to the MCP client a new token
	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		metadata: {
			label: name || email,
		},
		// This will be available on this.props inside MyMCP
		props: {
			accessToken,
			email,
			login,
			name: name || nickname || 'Unknown User',
			picture,
			verified_email: email_verified,
			sub,
			updated_at,
		} as Props & { 
			sub?: string; 
			updated_at?: string;
		},
		request: oauthReqInfo,
		scope: oauthReqInfo.scope,
		userId: login,
	});

	return Response.redirect(redirectTo);
});

// PKCE helper functions (same as Google handler)
function generateCodeVerifier(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return btoa(String.fromCharCode.apply(null, Array.from(array)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=/g, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(verifier);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(digest))))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=/g, '');
}

export { app as Auth0Handler };