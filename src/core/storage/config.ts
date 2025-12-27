/**
 * Storage Configuration
 * 
 * Manages the wit configuration file that controls where repositories are stored.
 * 
 * Config file location: ~/.wit/config.json
 * 
 * Example config:
 * {
 *   "storage": {
 *     "type": "disk",
 *     "disk": {
 *       "projectsDir": "~/projects"
 *     }
 *   }
 * }
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { StorageConfig } from './types';

/**
 * Full wit configuration
 */
export interface WitConfig {
  /** Storage backend configuration */
  storage: StorageConfig;
  
  /** Server configuration */
  server?: {
    port?: number;
    host?: string;
  };

  /** Additional settings can be added here */
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: WitConfig = {
  storage: {
    type: 'disk',
    disk: {
      // Default to ~/wit-projects for local development
      projectsDir: path.join(os.homedir(), 'wit-projects'),
    },
  },
  server: {
    port: 3000,
    host: 'localhost',
  },
};

/**
 * Get the config directory path
 */
export function getConfigDir(): string {
  // Check for custom config dir via env
  if (process.env.WIT_CONFIG_DIR) {
    return process.env.WIT_CONFIG_DIR;
  }
  
  // Default to ~/.wit
  return path.join(os.homedir(), '.wit');
}

/**
 * Get the config file path
 */
export function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json');
}

/**
 * Expand ~ to home directory
 */
function expandPath(p: string): string {
  if (p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(2));
  }
  if (p === '~') {
    return os.homedir();
  }
  return p;
}

/**
 * Load configuration from disk
 * Falls back to defaults if config doesn't exist
 */
export function loadConfig(): WitConfig {
  const configPath = getConfigPath();

  // Check for env overrides first
  const envConfig = loadEnvConfig();
  
  // If no config file exists, use defaults + env
  if (!fs.existsSync(configPath)) {
    return mergeConfig(DEFAULT_CONFIG, envConfig);
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const fileConfig = JSON.parse(content) as Partial<WitConfig>;
    
    // Expand paths
    if (fileConfig.storage?.disk?.projectsDir) {
      fileConfig.storage.disk.projectsDir = expandPath(fileConfig.storage.disk.projectsDir);
    }

    // Merge: defaults < file < env
    return mergeConfig(mergeConfig(DEFAULT_CONFIG, fileConfig), envConfig);
  } catch (error) {
    console.warn(`[config] Failed to load config from ${configPath}:`, error);
    return mergeConfig(DEFAULT_CONFIG, envConfig);
  }
}

/**
 * Load configuration from environment variables
 */
function loadEnvConfig(): Partial<WitConfig> {
  const config: Partial<WitConfig> = {};

  // Storage type
  if (process.env.WIT_STORAGE_TYPE) {
    config.storage = config.storage || { type: 'disk' };
    config.storage.type = process.env.WIT_STORAGE_TYPE as 'disk' | 'database' | 's3';
  }

  // Disk storage - projects directory
  if (process.env.WIT_PROJECTS_DIR) {
    config.storage = config.storage || { type: 'disk' };
    config.storage.disk = config.storage.disk || { projectsDir: '' };
    config.storage.disk.projectsDir = expandPath(process.env.WIT_PROJECTS_DIR);
  }

  // Legacy: REPOS_DIR for backwards compatibility
  if (process.env.REPOS_DIR && !process.env.WIT_PROJECTS_DIR) {
    config.storage = config.storage || { type: 'disk' };
    config.storage.disk = config.storage.disk || { projectsDir: '' };
    config.storage.disk.projectsDir = expandPath(process.env.REPOS_DIR);
  }

  // Server config
  if (process.env.WIT_PORT || process.env.PORT) {
    config.server = config.server || {};
    config.server.port = parseInt(process.env.WIT_PORT || process.env.PORT || '3000', 10);
  }

  if (process.env.WIT_HOST || process.env.HOST) {
    config.server = config.server || {};
    config.server.host = process.env.WIT_HOST || process.env.HOST;
  }

  return config;
}

/**
 * Deep merge two configs
 */
function mergeConfig(base: WitConfig, override: Partial<WitConfig>): WitConfig {
  return {
    storage: {
      ...base.storage,
      ...override.storage,
      disk: override.storage?.disk ? {
        ...base.storage.disk,
        ...override.storage.disk,
      } : base.storage.disk,
      database: override.storage?.database ? {
        ...base.storage.database,
        ...override.storage.database,
      } : base.storage.database,
      s3: override.storage?.s3 ? {
        ...base.storage.s3,
        ...override.storage.s3,
      } : base.storage.s3,
    },
    server: {
      ...base.server,
      ...override.server,
    },
  };
}

/**
 * Save configuration to disk
 */
export function saveConfig(config: WitConfig): void {
  const configDir = getConfigDir();
  const configPath = getConfigPath();

  // Ensure config directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Write config
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Initialize configuration with prompts (for CLI setup)
 */
export function initConfig(options: {
  projectsDir?: string;
  storageType?: 'disk' | 'database' | 's3';
}): WitConfig {
  const config = loadConfig();

  if (options.storageType) {
    config.storage.type = options.storageType;
  }

  if (options.projectsDir) {
    config.storage.disk = {
      projectsDir: expandPath(options.projectsDir),
    };
  }

  saveConfig(config);
  return config;
}

/**
 * Get storage configuration
 */
export function getStorageConfig(): StorageConfig {
  return loadConfig().storage;
}

// Singleton cached config
let cachedConfig: WitConfig | null = null;

/**
 * Get cached configuration (for performance)
 */
export function getCachedConfig(): WitConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

/**
 * Clear cached configuration
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}
