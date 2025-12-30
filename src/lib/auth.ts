/**
 * Better Auth Server Configuration
 * 
 * Centralized authentication using better-auth with Drizzle adapter.
 * Supports email/password, GitHub OAuth, password reset, and email verification.
 */

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { username } from 'better-auth/plugins';
import { getDb } from '../db';
import * as authSchema from '../db/auth-schema';
import { getGlobalEmailService } from '../core/email';

/**
 * GitHub OAuth configuration
 * 
 * To enable GitHub OAuth:
 * 1. Create an OAuth App at https://github.com/settings/developers
 * 2. Set callback URL to: {YOUR_API_URL}/api/auth/callback/github
 * 3. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET env vars
 * 
 * Scopes requested: repo (for private repo access), user:email
 */
function getGitHubOAuthConfig() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    return undefined;
  }
  
  return {
    clientId,
    clientSecret,
    // Request repo scope for importing private repos
    scope: ['repo', 'user:email'],
    // Map GitHub profile to wit user
    mapProfileToUser: (profile: { login?: string; name?: string; avatar_url?: string; bio?: string }) => ({
      username: profile.login,
      name: profile.name || profile.login,
      avatarUrl: profile.avatar_url,
      bio: profile.bio,
    }),
  };
}

// Singleton auth instance
let authInstance: ReturnType<typeof betterAuth> | null = null;

/**
 * Get trusted origins from environment or use defaults
 * In production, set TRUSTED_ORIGINS env var (comma-separated list)
 */
function getTrustedOrigins(): string[] {
  if (process.env.TRUSTED_ORIGINS) {
    return process.env.TRUSTED_ORIGINS.split(',').map(o => o.trim());
  }
  return ['http://localhost:5173', 'http://localhost:3000'];
}

/**
 * Create or get the better-auth instance
 * Must be called after database is initialized
 */
export function createAuth() {
  if (authInstance) {
    return authInstance;
  }

  // Enforce secret in production
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && !process.env.BETTER_AUTH_SECRET) {
    throw new Error('BETTER_AUTH_SECRET is required in production');
  }

  const db = getDb();
  // appUrl available from process.env.APP_URL || 'http://localhost:5173'
  const emailService = getGlobalEmailService();
  
  const githubConfig = getGitHubOAuthConfig();
  
  authInstance = betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: authSchema,
    }),
    
    // Base URL for auth - required for cross-domain cookies
    baseURL: process.env.AUTH_BASE_URL || 'http://localhost:3000',
    
    // Secret for signing tokens - required in production
    secret: process.env.BETTER_AUTH_SECRET,
    
    // Social providers (GitHub for repo imports)
    ...(githubConfig && {
      socialProviders: {
        github: githubConfig,
      },
    }),
    
    // Email and password authentication with password reset
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      // Password reset configuration
      sendResetPassword: async ({ user, url }) => {
        const result = await emailService.sendPasswordReset({
          email: user.email,
          name: user.name,
          resetUrl: url,
          expiresInMinutes: 60,
        });
        if (!result.success) {
          console.error('[Auth] Failed to send password reset email:', result.error);
        }
      },
    },
    
    // Email verification configuration
    emailVerification: {
      sendOnSignUp: emailService.isConfigured(),
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        const result = await emailService.sendEmailVerification({
          email: user.email,
          name: user.name,
          verifyUrl: url,
          expiresInMinutes: 1440, // 24 hours
        });
        if (!result.success) {
          console.error('[Auth] Failed to send verification email:', result.error);
        }
      },
    },
    
    // Use username plugin for GitHub-style usernames
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 39,
      }),
    ],
    
    // Session configuration
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // Update session every 24 hours
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5, // 5 minutes
      },
    },
    
    // Cookie settings for cross-domain auth
    advanced: {
      crossSubDomainCookies: {
        enabled: isProduction,
        domain: process.env.COOKIE_DOMAIN || '.wit.sh', // Root domain for cross-subdomain cookies
      },
      defaultCookieAttributes: {
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
      },
    },
    
    // User configuration - add custom fields
    user: {
      additionalFields: {
        bio: {
          type: 'string',
          required: false,
        },
        location: {
          type: 'string', 
          required: false,
        },
        website: {
          type: 'string',
          required: false,
        },
        avatarUrl: {
          type: 'string',
          required: false,
        },
      },
    },
    
    // Trusted origins for CORS - configurable via TRUSTED_ORIGINS env var
    trustedOrigins: getTrustedOrigins(),
    
    // Callbacks for welcome email and other events
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // Send welcome email on new user creation
            // Note: username comes from the username plugin and may be typed as object
            const username = typeof user.username === 'string' ? user.username : (user.username as unknown as string);
            if (emailService.isConfigured() && username) {
              const result = await emailService.sendWelcomeEmail({
                email: user.email,
                name: user.name,
                username,
              });
              if (!result.success) {
                console.error('[Auth] Failed to send welcome email:', result.error);
              }
            }
          },
        },
      },
    },
  });

  return authInstance;
}

export type Auth = ReturnType<typeof createAuth>;
