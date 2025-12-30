/**
 * Terminal color utilities for wit CLI output
 * Centralized to ensure consistent styling across all commands
 */

// Check if colors should be disabled (piped output, CI, NO_COLOR env)
const supportsColor = (): boolean => {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  if (!process.stdout.isTTY) return false;
  return true;
};

const colorEnabled = supportsColor();

const wrap =
  (code: string) =>
  (s: string): string =>
    colorEnabled ? `\x1b[${code}m${s}\x1b[0m` : s;

export const colors = {
  // Standard colors
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  blue: wrap('34'),
  magenta: wrap('35'),
  cyan: wrap('36'),
  white: wrap('37'),

  // 256-color (extended palette)
  orange: wrap('38;5;208'),

  // Bright colors
  brightRed: wrap('91'),
  brightGreen: wrap('92'),
  brightYellow: wrap('93'),
  brightBlue: wrap('94'),
  brightMagenta: wrap('95'),
  brightCyan: wrap('96'),

  // Styles
  bold: wrap('1'),
  dim: wrap('2'),
  italic: wrap('3'),
  underline: wrap('4'),

  // Background colors
  bgGreen: (s: string): string =>
    colorEnabled ? `\x1b[42m\x1b[30m${s}\x1b[0m` : s,
  bgYellow: (s: string): string =>
    colorEnabled ? `\x1b[43m\x1b[30m${s}\x1b[0m` : s,
  bgRed: (s: string): string =>
    colorEnabled ? `\x1b[41m\x1b[37m${s}\x1b[0m` : s,
  bgBlue: (s: string): string =>
    colorEnabled ? `\x1b[44m\x1b[37m${s}\x1b[0m` : s,
  bgMagenta: (s: string): string =>
    colorEnabled ? `\x1b[45m\x1b[37m${s}\x1b[0m` : s,

  // Semantic aliases (for consistency)
  error: wrap('31'), // red
  success: wrap('32'), // green
  warning: wrap('33'), // yellow
  info: wrap('36'), // cyan
  hint: wrap('33'), // yellow
  command: wrap('36'), // cyan

  // Reset
  reset: '\x1b[0m',
};

/**
 * Raw ANSI codes for manual string construction (used by smart-status.ts)
 * These are the raw escape sequences without the wrapper function
 */
export const ansi = {
  reset: colorEnabled ? '\x1b[0m' : '',
  bold: colorEnabled ? '\x1b[1m' : '',
  dim: colorEnabled ? '\x1b[2m' : '',
  italic: colorEnabled ? '\x1b[3m' : '',

  red: colorEnabled ? '\x1b[31m' : '',
  green: colorEnabled ? '\x1b[32m' : '',
  yellow: colorEnabled ? '\x1b[33m' : '',
  blue: colorEnabled ? '\x1b[34m' : '',
  magenta: colorEnabled ? '\x1b[35m' : '',
  cyan: colorEnabled ? '\x1b[36m' : '',
  white: colorEnabled ? '\x1b[37m' : '',
  gray: colorEnabled ? '\x1b[90m' : '',

  bgBlue: colorEnabled ? '\x1b[44m' : '',
  bgMagenta: colorEnabled ? '\x1b[45m' : '',
  bgYellow: colorEnabled ? '\x1b[43m' : '',
};

/**
 * Helper function for manual color application (used by smart-status.ts)
 */
export const c = (color: keyof typeof ansi, text: string): string =>
  `${ansi[color]}${text}${ansi.reset}`;

// Re-export for convenience
export default colors;
