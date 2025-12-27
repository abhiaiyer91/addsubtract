/**
 * Better Auth Configuration
 * 
 * This file is at the project root so the better-auth CLI can find it.
 * The actual runtime auth is created in src/lib/auth.ts
 */

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { username } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

// Create a pool for the CLI (uses DATABASE_URL env var)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://wit:wit@localhost:5432/wit',
});

const db = drizzle(pool);

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
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

export default auth;
