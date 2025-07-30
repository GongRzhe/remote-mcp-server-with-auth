import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import type { Props, ExtendedEnv } from "../types";
import {
	clientIdAlreadyApproved,
	parseRedirectApproval,
	renderApprovalDialog,
	fetchUpstreamAuthToken,
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
		return redirectToGoogle(c.req.raw, oauthReqInfo, c.env, {});
	}

	return renderApprovalDialog(c.req.raw, {
		client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
		server: {
			description: "This is a demo MCP Remote Server using Google for authentication.",
			logo: "https://developers.google.com/identity/images/g-logo.png",
			name: "Cloudflare Google MCP Server", // optional
		},
		state: { oauthReqInfo }, // arbitrary data that flows through the form submission below
	});
});

app.post("/authorize", async (c) => {
	// Validates form submission, extracts state, and generates Set-Cookie headers to skip approval dialog next time
	const { state, headers } = await parseRedirectApproval(c.req.raw, (c.env as any).COOKIE_ENCRYPTION_KEY);
	if (!state.oauthReqInfo) {
		return c.text("Invalid request", 400);
	}

	return redirectToGoogle(c.req.raw, state.oauthReqInfo, c.env, headers);
});

async function redirectToGoogle(
	request: Request,
	oauthReqInfo: AuthRequest,
	env: Env,
	headers: Record<string, string> = {},
) {
	// Generate PKCE parameters
	const codeVerifier = generateCodeVerifier();
	const codeChallenge = await generateCodeChallenge(codeVerifier);
	
	// Store code verifier for later use (you might want to use KV storage or similar)
	const state = btoa(JSON.stringify({
		...oauthReqInfo,
		codeVerifier
	}));

	return new Response(null, {
		headers: {
			...headers,
			location: getUpstreamAuthorizeUrl({
				client_id: (env as any).GOOGLE_CLIENT_ID,
				redirect_uri: new URL("/google/callback", request.url).href,
				scope: "openid profile email https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly",
				state: state,
				upstream_url: "https://accounts.google.com/o/oauth2/v2/auth",
			}) + "&code_challenge=" + codeChallenge + "&code_challenge_method=S256",
		},
		status: 302,
	});
}

/**
 * OAuth Callback Endpoint
 *
 * This route handles the callback from Google after user authentication.
 * It exchanges the temporary code for an access token, then stores some
 * user metadata & the auth token as part of the 'props' on the token passed
 * down to the client. It ends by redirecting the client back to _its_ callback URL
 */
app.get("/callback", async (c) => {
	// Get the oathReqInfo out of state
	const stateData = JSON.parse(atob(c.req.query("state") as string));
	const oauthReqInfo = stateData as AuthRequest & { codeVerifier: string };
	if (!oauthReqInfo.clientId) {
		return c.text("Invalid state", 400);
	}

	// Validate the authorization code
	const authCode = c.req.query("code");
	if (!authCode) {
		console.error("Missing authorization code in callback");
		return c.text("Missing authorization code. Please try again.", 400);
	}

	// Exchange the code for an access token using PKCE
	const redirectUri = new URL("/google/callback", c.req.url).href;
	console.log("Google OAuth callback - redirect URI:", redirectUri);
	console.log("Google OAuth callback - code verifier present:", !!oauthReqInfo.codeVerifier);
	
	const tokenRequestData = {
		grant_type: 'authorization_code',
		client_id: (c.env as any).GOOGLE_CLIENT_ID,
		client_secret: (c.env as any).GOOGLE_CLIENT_SECRET,
		code: authCode,
		redirect_uri: redirectUri,
		code_verifier: oauthReqInfo.codeVerifier
	};

	let tokenResponse;
	let tokenData;
	
	try {
		tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams(tokenRequestData).toString(),
		});

		if (!tokenResponse.ok) {
			const errorText = await tokenResponse.text();
			console.error("Google token exchange failed:", errorText);
			return c.text(`Failed to fetch access token: ${tokenResponse.status}`, 500);
		}

		tokenData = await tokenResponse.json();
	} catch (error) {
		console.error("Network error during token exchange:", error);
		return c.text("Network error during authentication. Please try again.", 500);
	}
	const accessToken = tokenData.access_token;

	if (!accessToken) {
		return c.text("Missing access token", 400);
	}

	// Fetch the user info from Google
	let userResponse;
	let userData;
	
	try {
		userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});

		if (!userResponse.ok) {
			const errorText = await userResponse.text();
			console.error("Google user info fetch failed:", errorText);
			return c.text(`Failed to fetch user info: ${userResponse.status}`, 500);
		}

		userData = await userResponse.json();
	} catch (error) {
		console.error("Network error during user info fetch:", error);
		return c.text("Network error while fetching user information. Please try again.", 500);
	}
	const { id, email, verified_email, name, given_name, family_name, picture } = userData;

	// Use email as login for Google (since Google doesn't have a "login" field like GitHub)
	const login = email.split('@')[0]; // Use the part before @ as login

	// Return back to the MCP client a new token
	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		metadata: {
			label: name,
		},
		// This will be available on this.props inside MyMCP
		props: {
			accessToken,
			email,
			login,
			name,
			picture,
			verified_email,
		} as Props & { picture?: string; verified_email?: boolean },
		request: oauthReqInfo,
		scope: oauthReqInfo.scope,
		userId: login,
	});

	return Response.redirect(redirectTo);
});

// PKCE helper functions
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

export { app as GoogleHandler };