/**
 * Better Auth Server Configuration
 * 
 * Centralized authentication using better-auth with Drizzle adapter.
 * Supports email/password and GitHub OAuth.
 */

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { username } from 'better-auth/plugins';
import { getDb } from '../db';
import * as authSchema from '../db/auth-schema';

// Singleton auth instance
let authInstance: ReturnType<typeof betterAuth> | null = null;

/**
 * Create or get the better-auth instance
 * Must be called after database is initialized
 */
export function createAuth() {
  if (authInstance) {
    return authInstance;
  }

  const db = getDb();
  
  authInstance = betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: authSchema,
    }),
    
    // Email and password authentication
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
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
    
    // Trusted origins for CORS
    trustedOrigins: [
      'http://localhost:5173',
      'http://localhost:3000',
    ],
  });

  return authInstance;
}

export type Auth = ReturnType<typeof createAuth>;
