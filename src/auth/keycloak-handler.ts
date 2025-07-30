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
		return redirectToKeycloak(c.req.raw, oauthReqInfo, c.env, {});
	}

	return renderApprovalDialog(c.req.raw, {
		client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
		server: {
			description: "This is a demo MCP Remote Server using Keycloak for authentication.",
			logo: "https://www.keycloak.org/resources/images/keycloak_logo_480x108.png",
			name: "Cloudflare Keycloak MCP Server",
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

	return redirectToKeycloak(c.req.raw, state.oauthReqInfo, c.env, headers);
});

async function redirectToKeycloak(
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

	// Get Keycloak configuration from environment
	const keycloakDomain = (env as any).KEYCLOAK_DOMAIN;
	const keycloakRealm = (env as any).KEYCLOAK_REALM;
	
	if (!keycloakDomain) {
		throw new Error("KEYCLOAK_DOMAIN environment variable is required");
	}
	
	if (!keycloakRealm) {
		throw new Error("KEYCLOAK_REALM environment variable is required");
	}

	// Build Keycloak authorization URL with PKCE
	// Keycloak follows OpenID Connect standard with realm-specific endpoints
	const encodedRealm = encodeURIComponent(keycloakRealm);
	const keycloakAuthUrl = `${keycloakDomain}/realms/${encodedRealm}/protocol/openid-connect/auth`;
	
	const authUrl = getUpstreamAuthorizeUrl({
		client_id: (env as any).KEYCLOAK_CLIENT_ID,
		redirect_uri: new URL("/keycloak/callback", request.url).href,
		scope: "openid profile email",
		state: state,
		upstream_url: keycloakAuthUrl,
	});

	// Add PKCE parameters (response_type is already added by getUpstreamAuthorizeUrl)
	const finalAuthUrl = authUrl + 
		"&code_challenge=" + encodeURIComponent(codeChallenge) + 
		"&code_challenge_method=S256";

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
 * This route handles the callback from Keycloak after user authentication.
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

	const keycloakDomain = (c.env as any).KEYCLOAK_DOMAIN;
	const keycloakRealm = (c.env as any).KEYCLOAK_REALM;
	const code = c.req.query("code");
	const codeVerifier = oauthReqInfo.codeVerifier;

	if (!code) {
		return c.text("Missing authorization code", 400);
	}

	// Exchange the code for tokens using PKCE
	let tokenData, userData, accessToken;
	
	try {
		const encodedRealm = encodeURIComponent(keycloakRealm);
		const tokenEndpoint = `${keycloakDomain}/realms/${encodedRealm}/protocol/openid-connect/token`;
		
		const tokenRequestData = {
			grant_type: 'authorization_code',
			client_id: (c.env as any).KEYCLOAK_CLIENT_ID,
			code: code,
			redirect_uri: new URL("/keycloak/callback", c.req.url).href,
			code_verifier: codeVerifier
		};

		// Add client secret if configured (for confidential clients)
		const clientSecret = (c.env as any).KEYCLOAK_CLIENT_SECRET;
		if (clientSecret) {
			tokenRequestData.client_secret = clientSecret;
		}

		console.log(`Attempting Keycloak token exchange with domain: ${keycloakDomain}, realm: ${keycloakRealm}`);
		
		const tokenResponse = await fetch(tokenEndpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				"User-Agent": "Cloudflare-Worker/1.0",
			},
			body: new URLSearchParams(tokenRequestData).toString(),
		});

		if (!tokenResponse.ok) {
			const errorText = await tokenResponse.text();
			console.error("Keycloak token exchange failed:", {
				status: tokenResponse.status,
				statusText: tokenResponse.statusText,
				error: errorText
			});
			return c.text(`Failed to fetch access token: ${tokenResponse.status} ${tokenResponse.statusText}`, 500);
		}

		tokenData = await tokenResponse.json();
		accessToken = tokenData.access_token;

		if (!accessToken) {
			console.error("Keycloak token response missing access_token:", tokenData);
			return c.text("Missing access token in response", 400);
		}

		console.log("Keycloak token exchange successful, fetching user info");

		// Fetch the user info from Keycloak
		const userinfoEndpoint = `${keycloakDomain}/realms/${encodedRealm}/protocol/openid-connect/userinfo`;
		const userResponse = await fetch(userinfoEndpoint, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"User-Agent": "Cloudflare-Worker/1.0",
			},
		});

		if (!userResponse.ok) {
			const errorText = await userResponse.text();
			console.error("Keycloak user info failed:", {
				status: userResponse.status,
				statusText: userResponse.statusText,
				error: errorText
			});
			return c.text(`Failed to fetch user info: ${userResponse.status} ${userResponse.statusText}`, 500);
		}

		userData = await userResponse.json();
		console.log("Keycloak user info retrieved successfully");

	} catch (error) {
		console.error("Keycloak network error:", {
			message: error.message,
			stack: error.stack,
			name: error.name
		});
		
		// Check if it's a network connectivity issue
		if (error.message.includes('Network connection lost') || 
		    error.message.includes('fetch failed') ||
		    error.name === 'TypeError') {
			return c.text("Network connectivity issue. Please check your internet connection and try again. If using a proxy, ensure it allows connections to Keycloak.", 500);
		}
		
		return c.text(`Keycloak integration error: ${error.message}`, 500);
	}

	const { sub, email, email_verified, name, preferred_username, given_name, family_name, picture, updated_at } = userData;

	// Use preferred_username as login (Keycloak equivalent), fallback to email prefix
	const login = preferred_username || email?.split('@')[0] || sub || 'unknown';

	// Return back to the MCP client a new token
	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		metadata: {
			label: name || preferred_username || email,
		},
		// This will be available on this.props inside MyMCP
		props: {
			accessToken,
			email,
			login,
			name: name || `${given_name || ''} ${family_name || ''}`.trim() || preferred_username || 'Unknown User',
			picture,
			verified_email: email_verified,
			sub,
			updated_at,
			preferred_username,
			given_name,
			family_name,
		} as Props & { 
			preferred_username?: string;
			given_name?: string;
			family_name?: string;
		},
		request: oauthReqInfo,
		scope: oauthReqInfo.scope,
		userId: login,
	});

	return Response.redirect(redirectTo);
});

// PKCE helper functions (same as other handlers)
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

export { app as KeycloakHandler };