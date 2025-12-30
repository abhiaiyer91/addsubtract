/**
 * Structured Logging for wit Server
 * 
 * Provides JSON-formatted logs in production and pretty logs in development.
 * Includes request tracing, timing, and contextual metadata.
 */

// =============================================================================
// Types
// =============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  service?: string;
  traceId?: string;
  spanId?: string;
  duration?: number;
  [key: string]: unknown;
}

export interface LoggerContext {
  service?: string;
  traceId?: string;
  spanId?: string;
  [key: string]: unknown;
}

// =============================================================================
// Configuration
// =============================================================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const isProduction = process.env.NODE_ENV === 'production';
const minLevel = LOG_LEVELS[process.env.LOG_LEVEL as LogLevel] ?? (isProduction ? 1 : 0);
const useJsonFormat = isProduction || process.env.LOG_FORMAT === 'json';

// ANSI color codes for pretty printing
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
};

const levelColors: Record<LogLevel, string> = {
  debug: colors.dim,
  info: colors.cyan,
  warn: colors.yellow,
  error: colors.red,
  fatal: colors.magenta,
};

const levelIcons: Record<LogLevel, string> = {
  debug: '🔍',
  info: '📘',
  warn: '⚠️ ',
  error: '❌',
  fatal: '💀',
};

// =============================================================================
// Formatters
// =============================================================================

/**
 * Format log entry as JSON for production
 */
function formatJson(entry: LogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Format log entry with colors for development
 */
function formatPretty(entry: LogEntry): string {
  const { level, message, timestamp, service, traceId, duration, ...rest } = entry;
  
  const color = levelColors[level];
  const icon = levelIcons[level];
  const time = new Date(timestamp).toLocaleTimeString();
  
  let output = `${colors.dim}${time}${colors.reset} ${icon} ${color}[${level.toUpperCase()}]${colors.reset}`;
  
  if (service) {
    output += ` ${colors.blue}[${service}]${colors.reset}`;
  }
  
  output += ` ${message}`;
  
  if (duration !== undefined) {
    output += ` ${colors.dim}(${duration}ms)${colors.reset}`;
  }
  
  if (traceId) {
    output += ` ${colors.dim}trace=${traceId}${colors.reset}`;
  }
  
  // Add extra fields
  const extras = Object.entries(rest).filter(([_, v]) => v !== undefined);
  if (extras.length > 0) {
    const extraStr = extras.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ');
    output += ` ${colors.dim}${extraStr}${colors.reset}`;
  }
  
  return output;
}

// =============================================================================
// Logger Class
// =============================================================================

export class Logger {
  private context: LoggerContext;

  constructor(context: LoggerContext = {}) {
    this.context = context;
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LoggerContext): Logger {
    return new Logger({ ...this.context, ...context });
  }

  /**
   * Log at the specified level
   */
  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LOG_LEVELS[level] < minLevel) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...this.context,
      ...meta,
    };

    const formatted = useJsonFormat ? formatJson(entry) : formatPretty(entry);

    switch (level) {
      case 'error':
      case 'fatal':
        console.error(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      default:
        console.log(formatted);
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log('error', message, meta);
  }

  fatal(message: string, meta?: Record<string, unknown>): void {
    this.log('fatal', message, meta);
  }

  /**
   * Log with timing information
   */
  time(label: string): () => void {
    const start = Date.now();
    return () => {
      this.debug(label, { duration: Date.now() - start });
    };
  }

  /**
   * Create a timer that logs on completion
   */
  startTimer(message: string, meta?: Record<string, unknown>): { end: () => void } {
    const start = Date.now();
    return {
      end: () => {
        this.info(message, { ...meta, duration: Date.now() - start });
      },
    };
  }
}

// =============================================================================
// Default Logger Instance
// =============================================================================

export const logger = new Logger({ service: 'wit' });

// =============================================================================
// Request Logging Middleware
// =============================================================================

import { Context, MiddlewareHandler } from 'hono';

/**
 * Generate a unique request trace ID
 */
function generateTraceId(): string {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * HTTP request logging middleware
 */
export function requestLogger(options: {
  skip?: (c: Context) => boolean;
  includeBody?: boolean;
} = {}): MiddlewareHandler {
  const { skip, includeBody = false } = options;

  return async (c, next) => {
    // Skip logging for certain paths
    if (skip?.(c)) {
      return next();
    }

    const traceId = c.req.header('x-trace-id') || generateTraceId();
    const start = Date.now();

    // Add trace ID to response headers
    c.header('x-trace-id', traceId);

    // Create request logger
    const reqLogger = logger.child({
      traceId,
      method: c.req.method,
      path: c.req.path,
    });

    // Store logger in context for use in handlers
    c.set('logger', reqLogger);
    c.set('traceId', traceId);

    // Log request start
    reqLogger.debug('Request started', {
      query: Object.fromEntries(new URL(c.req.url).searchParams),
      userAgent: c.req.header('user-agent'),
      ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
    });

    try {
      await next();

      // Log request completion
      const duration = Date.now() - start;
      const status = c.res.status;

      if (status >= 500) {
        reqLogger.error('Request failed', { status, duration });
      } else if (status >= 400) {
        reqLogger.warn('Request error', { status, duration });
      } else {
        reqLogger.info('Request completed', { status, duration });
      }
    } catch (error) {
      const duration = Date.now() - start;
      reqLogger.error('Request exception', {
        duration,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  };
}

// =============================================================================
// Metrics Collection
// =============================================================================

interface MetricValue {
  count: number;
  sum: number;
  min: number;
  max: number;
  lastValue: number;
}

class Metrics {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, MetricValue>();

  /**
   * Increment a counter
   */
  inc(name: string, value = 1, labels?: Record<string, string>): void {
    const key = this.formatKey(name, labels);
    this.counters.set(key, (this.counters.get(key) || 0) + value);
  }

  /**
   * Set a gauge value
   */
  set(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.formatKey(name, labels);
    this.gauges.set(key, value);
  }

  /**
   * Record a value in a histogram
   */
  observe(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.formatKey(name, labels);
    const existing = this.histograms.get(key);
    
    if (existing) {
      existing.count++;
      existing.sum += value;
      existing.min = Math.min(existing.min, value);
      existing.max = Math.max(existing.max, value);
      existing.lastValue = value;
    } else {
      this.histograms.set(key, {
        count: 1,
        sum: value,
        min: value,
        max: value,
        lastValue: value,
      });
    }
  }

  /**
   * Time a function execution
   */
  async time<T>(name: string, fn: () => Promise<T>, labels?: Record<string, string>): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      this.observe(name, Date.now() - start, labels);
    }
  }

  /**
   * Get all metrics as a snapshot
   */
  getSnapshot(): {
    counters: Record<string, number>;
    gauges: Record<string, number>;
    histograms: Record<string, MetricValue & { avg: number }>;
  } {
    const histograms: Record<string, MetricValue & { avg: number }> = {};
    
    for (const [key, value] of this.histograms) {
      histograms[key] = {
        ...value,
        avg: value.sum / value.count,
      };
    }

    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms,
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  private formatKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${name}{${labelStr}}`;
  }
}

export const metrics = new Metrics();

// =============================================================================
// Metrics Endpoint Handler
// =============================================================================

/**
 * Create a /metrics endpoint handler
 */
export function metricsHandler(c: Context): Response {
  const snapshot = metrics.getSnapshot();
  
  // Simple Prometheus-like format
  const lines: string[] = [];
  
  for (const [key, value] of Object.entries(snapshot.counters)) {
    lines.push(`# TYPE ${key.split('{')[0]} counter`);
    lines.push(`${key} ${value}`);
  }
  
  for (const [key, value] of Object.entries(snapshot.gauges)) {
    lines.push(`# TYPE ${key.split('{')[0]} gauge`);
    lines.push(`${key} ${value}`);
  }
  
  for (const [key, value] of Object.entries(snapshot.histograms)) {
    const baseName = key.split('{')[0];
    lines.push(`# TYPE ${baseName} histogram`);
    lines.push(`${baseName}_count${key.includes('{') ? key.slice(key.indexOf('{')) : ''} ${value.count}`);
    lines.push(`${baseName}_sum${key.includes('{') ? key.slice(key.indexOf('{')) : ''} ${value.sum}`);
    lines.push(`${baseName}_avg${key.includes('{') ? key.slice(key.indexOf('{')) : ''} ${value.avg}`);
    lines.push(`${baseName}_min${key.includes('{') ? key.slice(key.indexOf('{')) : ''} ${value.min}`);
    lines.push(`${baseName}_max${key.includes('{') ? key.slice(key.indexOf('{')) : ''} ${value.max}`);
  }
  
  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

// =============================================================================
// Exports
// =============================================================================

export default logger;
