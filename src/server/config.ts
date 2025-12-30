/**
 * Server Configuration & Environment Validation
 * 
 * Validates all required environment variables on startup and provides
 * typed configuration access throughout the application.
 */

import { z } from 'zod';

// =============================================================================
// Environment Schema
// =============================================================================

const envSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Server
  PORT: z.string().transform(Number).default('3000'),
  HOST: z.string().default('0.0.0.0'),
  
  // Database (required in production)
  DATABASE_URL: z.string().url().optional(),
  DB_POOL_MAX: z.string().transform(Number).default('20'),
  DB_POOL_MIN: z.string().transform(Number).default('5'),
  DB_IDLE_TIMEOUT: z.string().transform(Number).default('30000'),
  DB_CONNECT_TIMEOUT: z.string().transform(Number).default('5000'),
  
  // Redis (optional, enables distributed features)
  REDIS_URL: z.string().url().optional(),
  
  // Authentication
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(16).optional(), // Deprecated, use BETTER_AUTH_SECRET
  
  // Repository storage
  REPOS_DIR: z.string().default('./repos'),
  
  // CORS
  CORS_ORIGINS: z.string().optional(),
  TRUSTED_ORIGINS: z.string().optional(),
  
  // AI Features
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_REVIEW_ENABLED: z.string().transform(v => v === 'true').default('false'),
  
  // Object Storage (S3-compatible)
  S3_BUCKET: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  
  // Vector Search
  QDRANT_URL: z.string().url().optional(),
  QDRANT_API_KEY: z.string().optional(),
  PINECONE_API_KEY: z.string().optional(),
  PINECONE_INDEX: z.string().optional(),
  
  // Email
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().email().optional(),
  EMAIL_FROM_NAME: z.string().default('wit'),
  
  // GitHub OAuth
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  WIT_GITHUB_CLIENT_ID: z.string().optional(),
  
  // Encryption
  ENCRYPTION_KEY: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

// =============================================================================
// Configuration Singleton
// =============================================================================

let config: EnvConfig | null = null;

/**
 * Validate and load environment configuration
 * Throws on validation failure with helpful error messages
 */
export function loadConfig(): EnvConfig {
  if (config) return config;
  
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    const errors = result.error.issues.map(issue => {
      return `  - ${issue.path.join('.')}: ${issue.message}`;
    });
    
    console.error('\n╔════════════════════════════════════════════════════════════╗');
    console.error('║  Environment Configuration Error                            ║');
    console.error('╠════════════════════════════════════════════════════════════╣');
    console.error('║  The following environment variables are invalid:          ║');
    console.error('╚════════════════════════════════════════════════════════════╝\n');
    console.error(errors.join('\n'));
    console.error('\nSee .env.example for required configuration.\n');
    
    throw new Error('Invalid environment configuration');
  }
  
  config = result.data;
  
  // Production-specific validation
  if (config.NODE_ENV === 'production') {
    const warnings: string[] = [];
    const errors: string[] = [];
    
    // Required in production
    if (!config.DATABASE_URL) {
      errors.push('DATABASE_URL is required in production');
    }
    if (!config.BETTER_AUTH_SECRET && !config.JWT_SECRET) {
      errors.push('BETTER_AUTH_SECRET is required in production');
    }
    if (!config.BETTER_AUTH_URL) {
      warnings.push('BETTER_AUTH_URL should be set to your public API URL');
    }
    
    // Recommended in production
    if (!config.REDIS_URL) {
      warnings.push('REDIS_URL not set - rate limiting will use in-memory store (not recommended for multiple instances)');
    }
    if (!config.CORS_ORIGINS) {
      warnings.push('CORS_ORIGINS not set - allowing all origins (not recommended)');
    }
    
    // Auth secret quality check
    if (config.BETTER_AUTH_SECRET && config.BETTER_AUTH_SECRET.length < 32) {
      warnings.push('BETTER_AUTH_SECRET should be at least 32 characters');
    }
    
    if (errors.length > 0) {
      console.error('\n╔════════════════════════════════════════════════════════════╗');
      console.error('║  Production Configuration Errors                            ║');
      console.error('╚════════════════════════════════════════════════════════════╝\n');
      errors.forEach(e => console.error(`  ✗ ${e}`));
      throw new Error('Production configuration requirements not met');
    }
    
    if (warnings.length > 0) {
      console.warn('\n╔════════════════════════════════════════════════════════════╗');
      console.warn('║  Production Configuration Warnings                          ║');
      console.warn('╚════════════════════════════════════════════════════════════╝\n');
      warnings.forEach(w => console.warn(`  ⚠ ${w}`));
      console.warn('');
    }
  }
  
  return config;
}

/**
 * Get the current configuration (throws if not loaded)
 */
export function getConfig(): EnvConfig {
  if (!config) {
    return loadConfig();
  }
  return config;
}

// =============================================================================
// Feature Flags
// =============================================================================

/**
 * Check if a feature is enabled based on configuration
 */
export const features = {
  /** Redis is configured for distributed caching */
  hasRedis: () => !!getConfig().REDIS_URL,
  
  /** Database is configured */
  hasDatabase: () => !!getConfig().DATABASE_URL,
  
  /** AI features are available */
  hasAI: () => !!(getConfig().OPENAI_API_KEY || getConfig().ANTHROPIC_API_KEY),
  
  /** S3-compatible object storage is configured */
  hasObjectStorage: () => !!(getConfig().S3_BUCKET && getConfig().AWS_ACCESS_KEY_ID),
  
  /** Vector search is configured */
  hasVectorSearch: () => !!(getConfig().QDRANT_URL || getConfig().PINECONE_API_KEY),
  
  /** Email sending is configured */
  hasEmail: () => !!getConfig().RESEND_API_KEY,
  
  /** GitHub OAuth is configured */
  hasGitHubOAuth: () => !!(getConfig().GITHUB_CLIENT_ID && getConfig().GITHUB_CLIENT_SECRET),
  
  /** Running in production mode */
  isProduction: () => getConfig().NODE_ENV === 'production',
};

// =============================================================================
// Configuration Helpers
// =============================================================================

/**
 * Get CORS origins as an array
 */
export function getCorsOrigins(): string[] {
  const origins = getConfig().CORS_ORIGINS;
  if (!origins) {
    return getConfig().NODE_ENV === 'production' 
      ? [] 
      : ['http://localhost:5173', 'http://localhost:3000'];
  }
  return origins.split(',').map(o => o.trim());
}

/**
 * Get trusted origins as an array
 */
export function getTrustedOrigins(): string[] {
  const origins = getConfig().TRUSTED_ORIGINS;
  if (!origins) {
    return getCorsOrigins();
  }
  return origins.split(',').map(o => o.trim());
}

/**
 * Get database pool configuration
 */
export function getDbPoolConfig() {
  const cfg = getConfig();
  return {
    connectionString: cfg.DATABASE_URL,
    max: cfg.DB_POOL_MAX,
    min: cfg.DB_POOL_MIN,
    idleTimeoutMillis: cfg.DB_IDLE_TIMEOUT,
    connectionTimeoutMillis: cfg.DB_CONNECT_TIMEOUT,
    allowExitOnIdle: false,
  };
}

/**
 * Print configuration summary (for debugging, redacts secrets)
 */
export function printConfigSummary(): void {
  const cfg = getConfig();
  
  const redact = (val: string | undefined) => val ? '***' : '(not set)';
  
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Configuration Summary                                      ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Environment:     ${cfg.NODE_ENV.padEnd(40)}║`);
  console.log(`║  Server:          ${cfg.HOST}:${cfg.PORT}`.padEnd(62) + '║');
  console.log(`║  Repos Directory: ${cfg.REPOS_DIR.slice(0, 38).padEnd(40)}║`);
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Database:        ${cfg.DATABASE_URL ? '✓ Connected' : '✗ Not configured'}`.padEnd(62) + '║');
  console.log(`║  Redis:           ${cfg.REDIS_URL ? '✓ Connected' : '○ Not configured'}`.padEnd(62) + '║');
  console.log(`║  Object Storage:  ${features.hasObjectStorage() ? '✓ S3' : '○ Local disk'}`.padEnd(62) + '║');
  console.log(`║  Vector Search:   ${features.hasVectorSearch() ? '✓ Enabled' : '○ File-based'}`.padEnd(62) + '║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  AI Features:     ${features.hasAI() ? '✓ Enabled' : '○ Disabled'}`.padEnd(62) + '║');
  console.log(`║  Email:           ${features.hasEmail() ? '✓ Enabled' : '○ Disabled'}`.padEnd(62) + '║');
  console.log(`║  GitHub OAuth:    ${features.hasGitHubOAuth() ? '✓ Enabled' : '○ Disabled'}`.padEnd(62) + '║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
}
