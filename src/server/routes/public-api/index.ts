/**
 * Public REST API v1
 *
 * This module exports the official public REST API for wit.
 * All endpoints are versioned under /api/v1/ and follow REST conventions.
 *
 * Authentication:
 * - Bearer token (session token or OAuth access token)
 * - Personal access tokens
 *
 * Rate limiting:
 * - Authenticated: 5000 requests per hour
 * - Unauthenticated: 60 requests per hour
 */

import { Hono } from 'hono';
import { createUserRoutes } from './users';
import { createRepoRoutes } from './repos';
import { createIssueRoutes } from './issues';
import { createPullRoutes } from './pulls';
import { createOrgRoutes } from './orgs';
import { createSearchRoutes } from './search';
import { publicApiAuth, rateLimiter, apiResponseHeaders } from './middleware';

/**
 * Create the public API v1 router
 */
export function createPublicApiV1(): Hono {
  const app = new Hono();

  // Apply global middleware
  app.use('*', apiResponseHeaders);
  app.use('*', publicApiAuth);
  app.use('*', rateLimiter);

  // API root - returns API information
  app.get('/', (c) => {
    return c.json({
      name: 'Wit API',
      version: 'v1',
      documentation_url: 'https://docs.wit.dev/api',
      endpoints: {
        user: '/api/v1/user',
        users: '/api/v1/users/{username}',
        repos: '/api/v1/repos/{owner}/{repo}',
        orgs: '/api/v1/orgs/{org}',
        search: '/api/v1/search',
      },
    });
  });

  // Mount route modules
  app.route('/user', createUserRoutes());
  app.route('/users', createUserRoutes());
  app.route('/repos', createRepoRoutes());
  app.route('/orgs', createOrgRoutes());
  app.route('/search', createSearchRoutes());

  // Repository-scoped routes for issues and pulls
  app.route('/repos', createIssueRoutes());
  app.route('/repos', createPullRoutes());

  // Rate limit status endpoint
  app.get('/rate_limit', (c) => {
    const user = c.get('user');
    const limit = user ? 5000 : 60;
    const remaining = c.get('rateLimitRemaining') || limit;
    const reset = c.get('rateLimitReset') || Math.floor(Date.now() / 1000) + 3600;

    return c.json({
      resources: {
        core: {
          limit,
          remaining,
          reset,
          used: limit - remaining,
        },
        search: {
          limit: user ? 30 : 10,
          remaining: user ? 30 : 10,
          reset,
          used: 0,
        },
      },
      rate: {
        limit,
        remaining,
        reset,
        used: limit - remaining,
      },
    });
  });

  return app;
}

export { publicApiAuth, rateLimiter } from './middleware';
