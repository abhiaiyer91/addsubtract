/**
 * OAuth Routes
 *
 * Implements OAuth 2.0 authorization code flow for Wit Apps.
 * Supports PKCE for public clients.
 *
 * Endpoints:
 * - GET /oauth/authorize - Authorization endpoint (user consent)
 * - POST /oauth/token - Token endpoint (exchange code for tokens)
 * - POST /oauth/revoke - Token revocation
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { createAuth } from '../../lib/auth';
import {
  oauthAppModel,
  oauthAuthorizationModel,
  oauthAuthCodeModel,
  oauthAccessTokenModel,
  oauthRefreshTokenModel,
  validateScopes,
  parseScopes,
  OAUTH_SCOPES,
  OAUTH_SCOPE_DESCRIPTIONS,
  hashToken,
} from '../../db/models/oauth-app';
import type { OAuthAppScope } from '../../db/schema';

/**
 * Create OAuth routes
 */
export function createOAuthRoutes(): Hono {
  const app = new Hono();

  /**
   * GET /oauth/authorize
   *
   * OAuth authorization endpoint.
   * If user is authenticated, shows consent screen.
   * If not authenticated, redirects to login.
   *
   * Query parameters:
   * - client_id: App's client ID (required)
   * - redirect_uri: Callback URL (required)
   * - response_type: Must be "code" (required)
   * - scope: Space-separated list of scopes (required)
   * - state: CSRF protection token (recommended)
   * - code_challenge: PKCE code challenge (optional, for public clients)
   * - code_challenge_method: "plain" or "S256" (required if code_challenge provided)
   */
  app.get('/authorize', async (c) => {
    const auth = createAuth();
    const session = await auth.api.getSession({ headers: c.req.raw.headers });

    // Parse query parameters
    const clientId = c.req.query('client_id');
    const redirectUri = c.req.query('redirect_uri');
    const responseType = c.req.query('response_type');
    const scopeParam = c.req.query('scope');
    const state = c.req.query('state');
    const codeChallenge = c.req.query('code_challenge');
    const codeChallengeMethod = c.req.query('code_challenge_method') as 'plain' | 'S256' | undefined;

    // Validate required parameters
    if (!clientId) {
      return c.json({ error: 'invalid_request', error_description: 'client_id is required' }, 400);
    }

    if (!redirectUri) {
      return c.json({ error: 'invalid_request', error_description: 'redirect_uri is required' }, 400);
    }

    if (responseType !== 'code') {
      return c.json({
        error: 'unsupported_response_type',
        error_description: 'Only response_type=code is supported',
      }, 400);
    }

    if (!scopeParam) {
      return c.json({ error: 'invalid_request', error_description: 'scope is required' }, 400);
    }

    // Find the app
    const app = await oauthAppModel.findByClientId(clientId);
    if (!app) {
      return c.json({ error: 'invalid_client', error_description: 'Unknown client_id' }, 400);
    }

    // Validate redirect URI
    if (!oauthAppModel.isValidRedirectUri(app, redirectUri)) {
      return c.json({
        error: 'invalid_request',
        error_description: 'redirect_uri does not match registered callback URLs',
      }, 400);
    }

    // Parse and validate scopes
    const requestedScopes = scopeParam.split(' ').filter(Boolean);
    const validScopes = validateScopes(requestedScopes);

    if (validScopes.length === 0) {
      return redirectWithError(redirectUri, 'invalid_scope', 'No valid scopes provided', state);
    }

    // Validate PKCE parameters
    if (codeChallenge && !codeChallengeMethod) {
      return redirectWithError(
        redirectUri,
        'invalid_request',
        'code_challenge_method is required when code_challenge is provided',
        state
      );
    }

    if (codeChallengeMethod && codeChallengeMethod !== 'plain' && codeChallengeMethod !== 'S256') {
      return redirectWithError(
        redirectUri,
        'invalid_request',
        'code_challenge_method must be "plain" or "S256"',
        state
      );
    }

    // Check if user is authenticated
    if (!session?.user) {
      // Redirect to login with return URL
      const returnUrl = encodeURIComponent(c.req.url);
      return c.redirect(`/login?returnTo=${returnUrl}`);
    }

    const user = session.user;

    // Check for existing authorization
    const existingAuth = await oauthAuthorizationModel.findByAppAndUser(app.id, user.id);

    // If user has approved a query param, create the authorization
    const approved = c.req.query('approved');
    if (approved === 'true') {
      // Create or update authorization
      await oauthAuthorizationModel.upsert({
        appId: app.id,
        userId: user.id,
        scopes: validScopes,
      });

      // Generate authorization code
      const code = await oauthAuthCodeModel.create({
        appId: app.id,
        userId: user.id,
        scopes: validScopes,
        redirectUri,
        codeChallenge,
        codeChallengeMethod,
        state,
      });

      // Redirect back to app with code
      const url = new URL(redirectUri);
      url.searchParams.set('code', code);
      if (state) {
        url.searchParams.set('state', state);
      }
      return c.redirect(url.toString());
    }

    // If user denied, redirect with error
    if (approved === 'false') {
      return redirectWithError(redirectUri, 'access_denied', 'User denied the request', state);
    }

    // Show consent screen (return HTML or JSON for API consumption)
    const acceptsHtml = c.req.header('Accept')?.includes('text/html');

    if (acceptsHtml) {
      // Return HTML consent page
      return c.html(renderConsentPage({
        app,
        scopes: validScopes,
        redirectUri,
        state,
        codeChallenge,
        codeChallengeMethod,
        existingAuth: !!existingAuth,
        user: {
          id: user.id,
          name: user.name || 'Unknown',
          email: user.email,
        },
      }));
    }

    // Return JSON for API/SPA consumption
    return c.json({
      app: {
        id: app.id,
        name: app.name,
        description: app.description,
        logoUrl: app.logoUrl,
        websiteUrl: app.websiteUrl,
        isVerified: app.isVerified,
        ownerId: app.ownerId,
      },
      scopes: validScopes.map((scope) => ({
        name: scope,
        description: OAUTH_SCOPE_DESCRIPTIONS[scope],
      })),
      existingAuthorization: existingAuth
        ? {
            scopes: parseScopes(existingAuth.scopes),
            createdAt: existingAuth.createdAt,
          }
        : null,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      // URLs for approving/denying
      approveUrl: `${c.req.url}&approved=true`,
      denyUrl: `${c.req.url}&approved=false`,
    });
  });

  /**
   * POST /oauth/token
   *
   * OAuth token endpoint.
   * Exchanges authorization code for access token.
   *
   * Body parameters:
   * - grant_type: "authorization_code" or "refresh_token" (required)
   * - code: Authorization code (required for authorization_code grant)
   * - redirect_uri: Must match the one used in /authorize (required for authorization_code grant)
   * - client_id: App's client ID (required)
   * - client_secret: App's client secret (required for confidential clients)
   * - code_verifier: PKCE code verifier (required if code_challenge was used)
   * - refresh_token: Refresh token (required for refresh_token grant)
   */
  app.post('/token', async (c) => {
    const body = await c.req.parseBody();

    const grantType = body.grant_type as string;
    const clientId = body.client_id as string;
    const clientSecret = body.client_secret as string;

    // Validate client_id
    if (!clientId) {
      return c.json({ error: 'invalid_request', error_description: 'client_id is required' }, 400);
    }

    // Find the app
    const app = await oauthAppModel.findByClientId(clientId);
    if (!app) {
      return c.json({ error: 'invalid_client', error_description: 'Unknown client_id' }, 401);
    }

    // Verify client secret if provided
    if (clientSecret) {
      const verified = await oauthAppModel.verifyCredentials(clientId, clientSecret);
      if (!verified) {
        return c.json({ error: 'invalid_client', error_description: 'Invalid client credentials' }, 401);
      }
    }

    if (grantType === 'authorization_code') {
      return handleAuthorizationCodeGrant(c, app, body);
    }

    if (grantType === 'refresh_token') {
      return handleRefreshTokenGrant(c, app, body);
    }

    return c.json({
      error: 'unsupported_grant_type',
      error_description: 'Only authorization_code and refresh_token grants are supported',
    }, 400);
  });

  /**
   * POST /oauth/revoke
   *
   * Revoke an access or refresh token.
   *
   * Body parameters:
   * - token: The token to revoke (required)
   * - token_type_hint: "access_token" or "refresh_token" (optional)
   */
  app.post('/revoke', async (c) => {
    const body = await c.req.parseBody();
    const token = body.token as string;

    if (!token) {
      return c.json({ error: 'invalid_request', error_description: 'token is required' }, 400);
    }

    // Try to revoke as access token
    const tokenHash = hashToken(token);
    const accessToken = await oauthAccessTokenModel.findByHash(tokenHash);

    if (accessToken) {
      await oauthAccessTokenModel.revoke(accessToken.id);
    }

    // Always return success per RFC 7009
    return c.json({ success: true });
  });

  /**
   * GET /oauth/apps
   *
   * List user's OAuth apps (apps they've created).
   * Requires authentication.
   */
  app.get('/apps', async (c) => {
    const auth = createAuth();
    const session = await auth.api.getSession({ headers: c.req.raw.headers });

    if (!session?.user) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    const apps = await oauthAppModel.findByOwnerId(session.user.id);

    return c.json({
      apps: apps.map((app) => ({
        id: app.id,
        name: app.name,
        description: app.description,
        clientId: app.clientId,
        clientSecretPrefix: app.clientSecretPrefix,
        callbackUrl: app.callbackUrl,
        additionalCallbackUrls: app.additionalCallbackUrls
          ? JSON.parse(app.additionalCallbackUrls)
          : [],
        logoUrl: app.logoUrl,
        websiteUrl: app.websiteUrl,
        isPublished: app.isPublished,
        isVerified: app.isVerified,
        installationsCount: app.installationsCount,
        createdAt: app.createdAt,
        updatedAt: app.updatedAt,
      })),
    });
  });

  /**
   * GET /oauth/authorizations
   *
   * List user's authorized apps.
   * Requires authentication.
   */
  app.get('/authorizations', async (c) => {
    const auth = createAuth();
    const session = await auth.api.getSession({ headers: c.req.raw.headers });

    if (!session?.user) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    const authorizations = await oauthAuthorizationModel.findByUserId(session.user.id);

    // Get app details for each authorization
    const result = await Promise.all(
      authorizations.map(async (auth) => {
        const app = await oauthAppModel.findById(auth.appId);
        return {
          id: auth.id,
          app: app
            ? {
                id: app.id,
                name: app.name,
                description: app.description,
                logoUrl: app.logoUrl,
                websiteUrl: app.websiteUrl,
                isVerified: app.isVerified,
              }
            : null,
          scopes: parseScopes(auth.scopes),
          createdAt: auth.createdAt,
          updatedAt: auth.updatedAt,
        };
      })
    );

    return c.json({ authorizations: result });
  });

  /**
   * DELETE /oauth/authorizations/:id
   *
   * Revoke an authorization.
   * Requires authentication.
   */
  app.delete('/authorizations/:id', async (c) => {
    const auth = createAuth();
    const session = await auth.api.getSession({ headers: c.req.raw.headers });

    if (!session?.user) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    const authId = c.req.param('id');
    const authorization = await oauthAuthorizationModel.findById(authId);

    if (!authorization) {
      return c.json({ error: 'not_found' }, 404);
    }

    if (authorization.userId !== session.user.id) {
      return c.json({ error: 'forbidden' }, 403);
    }

    // Revoke all tokens for this authorization
    await oauthAccessTokenModel.revokeAllForUser(authorization.appId, session.user.id);

    // Revoke the authorization
    await oauthAuthorizationModel.revoke(authId);

    return c.json({ success: true });
  });

  /**
   * GET /oauth/scopes
   *
   * List all available OAuth scopes.
   */
  app.get('/scopes', (c) => {
    return c.json({
      scopes: OAUTH_SCOPES.map((scope) => ({
        name: scope,
        description: OAUTH_SCOPE_DESCRIPTIONS[scope],
      })),
    });
  });

  return app;
}

/**
 * Handle authorization_code grant type
 */
async function handleAuthorizationCodeGrant(
  c: any,
  app: any,
  body: Record<string, unknown>
) {
  const code = body.code as string;
  const redirectUri = body.redirect_uri as string;
  const codeVerifier = body.code_verifier as string;

  if (!code) {
    return c.json({ error: 'invalid_request', error_description: 'code is required' }, 400);
  }

  if (!redirectUri) {
    return c.json({ error: 'invalid_request', error_description: 'redirect_uri is required' }, 400);
  }

  // Exchange code for tokens
  const result = await oauthAuthCodeModel.exchange(code, app.clientId, redirectUri, codeVerifier);

  if (!result) {
    return c.json({ error: 'invalid_grant', error_description: 'Invalid or expired authorization code' }, 400);
  }

  // Create or get authorization
  const authorization = await oauthAuthorizationModel.findByAppAndUser(result.appId, result.userId);

  // Create access token
  const { accessToken, tokenId, expiresAt } = await oauthAccessTokenModel.create({
    appId: result.appId,
    userId: result.userId,
    authorizationId: authorization?.id,
    scopes: result.scopes,
    expiresInHours: 8, // 8 hour expiration
  });

  // Create refresh token
  const refreshToken = await oauthRefreshTokenModel.create(tokenId);

  return c.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresAt ? Math.floor((expiresAt.getTime() - Date.now()) / 1000) : null,
    refresh_token: refreshToken,
    scope: result.scopes.join(' '),
  });
}

/**
 * Handle refresh_token grant type
 */
async function handleRefreshTokenGrant(
  c: any,
  app: any,
  body: Record<string, unknown>
) {
  const refreshToken = body.refresh_token as string;

  if (!refreshToken) {
    return c.json({ error: 'invalid_request', error_description: 'refresh_token is required' }, 400);
  }

  // Exchange refresh token
  const result = await oauthRefreshTokenModel.exchange(refreshToken);

  if (!result) {
    return c.json({ error: 'invalid_grant', error_description: 'Invalid or expired refresh token' }, 400);
  }

  // Get the old access token to get scopes and user info
  const oldToken = await oauthAccessTokenModel.findById(result.accessTokenId);

  if (!oldToken) {
    return c.json({ error: 'invalid_grant', error_description: 'Associated access token not found' }, 400);
  }

  // Verify app matches
  if (oldToken.appId !== app.id) {
    return c.json({ error: 'invalid_grant', error_description: 'Token was not issued to this client' }, 400);
  }

  // Revoke old access token
  await oauthAccessTokenModel.revoke(oldToken.id);

  // Create new access token
  const { accessToken, tokenId, expiresAt } = await oauthAccessTokenModel.create({
    appId: oldToken.appId,
    userId: oldToken.userId,
    authorizationId: oldToken.authorizationId || undefined,
    scopes: parseScopes(oldToken.scopes),
    expiresInHours: 8,
  });

  // Create new refresh token
  const newRefreshToken = await oauthRefreshTokenModel.create(tokenId);

  return c.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresAt ? Math.floor((expiresAt.getTime() - Date.now()) / 1000) : null,
    refresh_token: newRefreshToken,
    scope: parseScopes(oldToken.scopes).join(' '),
  });
}

/**
 * Redirect with error
 */
function redirectWithError(
  redirectUri: string,
  error: string,
  errorDescription: string,
  state?: string
) {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', errorDescription);
  if (state) {
    url.searchParams.set('state', state);
  }
  return Response.redirect(url.toString(), 302);
}

/**
 * Render HTML consent page
 */
function renderConsentPage(data: {
  app: any;
  scopes: OAuthAppScope[];
  redirectUri: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  existingAuth: boolean;
  user: { id: string; name: string; email: string };
}): string {
  const scopeList = data.scopes
    .map((scope) => `<li><strong>${scope}</strong>: ${OAUTH_SCOPE_DESCRIPTIONS[scope]}</li>`)
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize ${data.app.name}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      margin: 0;
      padding: 20px;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 12px;
      padding: 32px;
      max-width: 480px;
      width: 100%;
    }
    .header {
      text-align: center;
      margin-bottom: 24px;
    }
    .app-logo {
      width: 64px;
      height: 64px;
      border-radius: 12px;
      margin-bottom: 16px;
    }
    .app-name {
      font-size: 24px;
      font-weight: 600;
      margin: 0 0 8px;
    }
    .app-desc {
      color: #8b949e;
      margin: 0;
    }
    .verified-badge {
      background: #238636;
      color: white;
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 4px;
      margin-left: 8px;
    }
    .user-info {
      background: #21262d;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 24px;
    }
    .user-info p {
      margin: 0;
      color: #8b949e;
    }
    .user-info strong {
      color: #c9d1d9;
    }
    h3 {
      font-size: 16px;
      margin: 0 0 12px;
    }
    .scopes {
      background: #21262d;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .scopes ul {
      margin: 0;
      padding: 0 0 0 20px;
    }
    .scopes li {
      margin-bottom: 8px;
      line-height: 1.5;
    }
    .scopes li:last-child {
      margin-bottom: 0;
    }
    .scopes strong {
      color: #58a6ff;
    }
    .existing-auth {
      background: #30363d;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 24px;
      font-size: 14px;
    }
    .buttons {
      display: flex;
      gap: 12px;
    }
    button {
      flex: 1;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: background 0.2s;
    }
    .btn-authorize {
      background: #238636;
      color: white;
    }
    .btn-authorize:hover {
      background: #2ea043;
    }
    .btn-cancel {
      background: #21262d;
      color: #c9d1d9;
      border: 1px solid #30363d;
    }
    .btn-cancel:hover {
      background: #30363d;
    }
    .warning {
      background: #21262d;
      border: 1px solid #f85149;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 24px;
      font-size: 14px;
      color: #f85149;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${data.app.logoUrl ? `<img src="${data.app.logoUrl}" alt="${data.app.name}" class="app-logo">` : ''}
      <h1 class="app-name">
        ${data.app.name}
        ${data.app.isVerified ? '<span class="verified-badge">Verified</span>' : ''}
      </h1>
      ${data.app.description ? `<p class="app-desc">${data.app.description}</p>` : ''}
    </div>

    <div class="user-info">
      <p>Authorizing as <strong>${data.user.name}</strong> (${data.user.email})</p>
    </div>

    <h3>${data.app.name} wants to access your Wit account</h3>

    <div class="scopes">
      <ul>
        ${scopeList}
      </ul>
    </div>

    ${data.existingAuth ? `
    <div class="existing-auth">
      You have previously authorized this app. This will update your authorization with the requested permissions.
    </div>
    ` : ''}

    ${!data.app.isVerified ? `
    <div class="warning">
      This app has not been verified by Wit. Proceed with caution.
    </div>
    ` : ''}

    <div class="buttons">
      <button class="btn-cancel" onclick="deny()">Cancel</button>
      <button class="btn-authorize" onclick="authorize()">Authorize</button>
    </div>
  </div>

  <script>
    function authorize() {
      window.location.href = window.location.href + '&approved=true';
    }
    function deny() {
      window.location.href = window.location.href + '&approved=false';
    }
  </script>
</body>
</html>`;
}


