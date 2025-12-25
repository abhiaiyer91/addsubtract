/**
 * Advanced Theme System for wit
 * Supports multiple themes with customization
 */

/**
 * Theme color palette
 */
export interface ThemeColors {
  // Backgrounds
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgElevated: string;
  bgOverlay: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;

  // Accents
  accentPrimary: string;
  accentSecondary: string;
  accentSuccess: string;
  accentWarning: string;
  accentDanger: string;
  accentInfo: string;

  // Git-specific
  gitAdded: string;
  gitModified: string;
  gitDeleted: string;
  gitUntracked: string;
  gitConflict: string;
  gitRenamed: string;

  // Borders
  borderDefault: string;
  borderHover: string;
  borderFocus: string;

  // Syntax highlighting
  syntaxKeyword: string;
  syntaxString: string;
  syntaxNumber: string;
  syntaxComment: string;
  syntaxFunction: string;
  syntaxVariable: string;
  syntaxOperator: string;
  syntaxType: string;

  // Graph colors (for branch visualization)
  graphColors: string[];

  // Selection
  selectionBg: string;
  selectionText: string;
}

/**
 * Theme typography
 */
export interface ThemeTypography {
  fontFamily: string;
  fontFamilyMono: string;
  fontSizeXs: string;
  fontSizeSm: string;
  fontSizeBase: string;
  fontSizeLg: string;
  fontSizeXl: string;
  fontSizeXxl: string;
  lineHeight: number;
  lineHeightTight: number;
  lineHeightRelaxed: number;
}

/**
 * Theme spacing
 */
export interface ThemeSpacing {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  xxl: string;
}

/**
 * Theme effects
 */
export interface ThemeEffects {
  borderRadius: string;
  borderRadiusLg: string;
  borderRadiusFull: string;
  shadow: string;
  shadowLg: string;
  shadowXl: string;
  transitionFast: string;
  transitionBase: string;
  transitionSlow: string;
  blur: string;
}

/**
 * Complete theme definition
 */
export interface Theme {
  name: string;
  displayName: string;
  isDark: boolean;
  colors: ThemeColors;
  typography: ThemeTypography;
  spacing: ThemeSpacing;
  effects: ThemeEffects;
}

/**
 * Default typography settings
 */
const defaultTypography: ThemeTypography = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontFamilyMono: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, Monaco, 'Courier New', monospace",
  fontSizeXs: '11px',
  fontSizeSm: '12px',
  fontSizeBase: '14px',
  fontSizeLg: '16px',
  fontSizeXl: '20px',
  fontSizeXxl: '24px',
  lineHeight: 1.5,
  lineHeightTight: 1.25,
  lineHeightRelaxed: 1.75,
};

/**
 * Default spacing
 */
const defaultSpacing: ThemeSpacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  xxl: '48px',
};

/**
 * Default effects
 */
const defaultEffects: ThemeEffects = {
  borderRadius: '6px',
  borderRadiusLg: '12px',
  borderRadiusFull: '9999px',
  shadow: '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)',
  shadowLg: '0 10px 40px rgba(0, 0, 0, 0.2)',
  shadowXl: '0 25px 50px rgba(0, 0, 0, 0.25)',
  transitionFast: '0.1s ease',
  transitionBase: '0.2s ease',
  transitionSlow: '0.3s ease',
  blur: 'blur(10px)',
};

/**
 * GitHub Dark Theme (Default)
 */
export const githubDark: Theme = {
  name: 'github-dark',
  displayName: 'GitHub Dark',
  isDark: true,
  colors: {
    bgPrimary: '#0d1117',
    bgSecondary: '#161b22',
    bgTertiary: '#21262d',
    bgElevated: '#1c2128',
    bgOverlay: 'rgba(13, 17, 23, 0.8)',

    textPrimary: '#e6edf3',
    textSecondary: '#8b949e',
    textMuted: '#6e7681',
    textInverse: '#0d1117',

    accentPrimary: '#58a6ff',
    accentSecondary: '#a371f7',
    accentSuccess: '#3fb950',
    accentWarning: '#d29922',
    accentDanger: '#f85149',
    accentInfo: '#58a6ff',

    gitAdded: '#3fb950',
    gitModified: '#d29922',
    gitDeleted: '#f85149',
    gitUntracked: '#8b949e',
    gitConflict: '#f85149',
    gitRenamed: '#a371f7',

    borderDefault: '#30363d',
    borderHover: '#484f58',
    borderFocus: '#58a6ff',

    syntaxKeyword: '#ff7b72',
    syntaxString: '#a5d6ff',
    syntaxNumber: '#79c0ff',
    syntaxComment: '#8b949e',
    syntaxFunction: '#d2a8ff',
    syntaxVariable: '#ffa657',
    syntaxOperator: '#ff7b72',
    syntaxType: '#7ee787',

    graphColors: [
      '#58a6ff', '#3fb950', '#f85149', '#a371f7',
      '#d29922', '#f778ba', '#79c0ff', '#7ee787',
    ],

    selectionBg: 'rgba(56, 139, 253, 0.25)',
    selectionText: '#e6edf3',
  },
  typography: defaultTypography,
  spacing: defaultSpacing,
  effects: defaultEffects,
};

/**
 * GitHub Light Theme
 */
export const githubLight: Theme = {
  name: 'github-light',
  displayName: 'GitHub Light',
  isDark: false,
  colors: {
    bgPrimary: '#ffffff',
    bgSecondary: '#f6f8fa',
    bgTertiary: '#eaeef2',
    bgElevated: '#ffffff',
    bgOverlay: 'rgba(255, 255, 255, 0.8)',

    textPrimary: '#1f2328',
    textSecondary: '#656d76',
    textMuted: '#8c959f',
    textInverse: '#ffffff',

    accentPrimary: '#0969da',
    accentSecondary: '#8250df',
    accentSuccess: '#1a7f37',
    accentWarning: '#9a6700',
    accentDanger: '#cf222e',
    accentInfo: '#0969da',

    gitAdded: '#1a7f37',
    gitModified: '#9a6700',
    gitDeleted: '#cf222e',
    gitUntracked: '#656d76',
    gitConflict: '#cf222e',
    gitRenamed: '#8250df',

    borderDefault: '#d0d7de',
    borderHover: '#afb8c1',
    borderFocus: '#0969da',

    syntaxKeyword: '#cf222e',
    syntaxString: '#0a3069',
    syntaxNumber: '#0550ae',
    syntaxComment: '#6e7781',
    syntaxFunction: '#8250df',
    syntaxVariable: '#953800',
    syntaxOperator: '#cf222e',
    syntaxType: '#1a7f37',

    graphColors: [
      '#0969da', '#1a7f37', '#cf222e', '#8250df',
      '#9a6700', '#bf3989', '#0550ae', '#116329',
    ],

    selectionBg: 'rgba(9, 105, 218, 0.15)',
    selectionText: '#1f2328',
  },
  typography: defaultTypography,
  spacing: defaultSpacing,
  effects: defaultEffects,
};

/**
 * Dracula Theme
 */
export const dracula: Theme = {
  name: 'dracula',
  displayName: 'Dracula',
  isDark: true,
  colors: {
    bgPrimary: '#282a36',
    bgSecondary: '#21222c',
    bgTertiary: '#343746',
    bgElevated: '#2d2f3f',
    bgOverlay: 'rgba(40, 42, 54, 0.9)',

    textPrimary: '#f8f8f2',
    textSecondary: '#6272a4',
    textMuted: '#44475a',
    textInverse: '#282a36',

    accentPrimary: '#8be9fd',
    accentSecondary: '#bd93f9',
    accentSuccess: '#50fa7b',
    accentWarning: '#f1fa8c',
    accentDanger: '#ff5555',
    accentInfo: '#8be9fd',

    gitAdded: '#50fa7b',
    gitModified: '#f1fa8c',
    gitDeleted: '#ff5555',
    gitUntracked: '#6272a4',
    gitConflict: '#ff5555',
    gitRenamed: '#bd93f9',

    borderDefault: '#44475a',
    borderHover: '#6272a4',
    borderFocus: '#bd93f9',

    syntaxKeyword: '#ff79c6',
    syntaxString: '#f1fa8c',
    syntaxNumber: '#bd93f9',
    syntaxComment: '#6272a4',
    syntaxFunction: '#50fa7b',
    syntaxVariable: '#8be9fd',
    syntaxOperator: '#ff79c6',
    syntaxType: '#8be9fd',

    graphColors: [
      '#8be9fd', '#50fa7b', '#ff5555', '#bd93f9',
      '#f1fa8c', '#ff79c6', '#ffb86c', '#6272a4',
    ],

    selectionBg: 'rgba(139, 233, 253, 0.2)',
    selectionText: '#f8f8f2',
  },
  typography: defaultTypography,
  spacing: defaultSpacing,
  effects: defaultEffects,
};

/**
 * Nord Theme
 */
export const nord: Theme = {
  name: 'nord',
  displayName: 'Nord',
  isDark: true,
  colors: {
    bgPrimary: '#2e3440',
    bgSecondary: '#3b4252',
    bgTertiary: '#434c5e',
    bgElevated: '#3b4252',
    bgOverlay: 'rgba(46, 52, 64, 0.9)',

    textPrimary: '#eceff4',
    textSecondary: '#d8dee9',
    textMuted: '#4c566a',
    textInverse: '#2e3440',

    accentPrimary: '#88c0d0',
    accentSecondary: '#b48ead',
    accentSuccess: '#a3be8c',
    accentWarning: '#ebcb8b',
    accentDanger: '#bf616a',
    accentInfo: '#81a1c1',

    gitAdded: '#a3be8c',
    gitModified: '#ebcb8b',
    gitDeleted: '#bf616a',
    gitUntracked: '#4c566a',
    gitConflict: '#bf616a',
    gitRenamed: '#b48ead',

    borderDefault: '#4c566a',
    borderHover: '#5e81ac',
    borderFocus: '#88c0d0',

    syntaxKeyword: '#81a1c1',
    syntaxString: '#a3be8c',
    syntaxNumber: '#b48ead',
    syntaxComment: '#616e88',
    syntaxFunction: '#88c0d0',
    syntaxVariable: '#d8dee9',
    syntaxOperator: '#81a1c1',
    syntaxType: '#8fbcbb',

    graphColors: [
      '#88c0d0', '#a3be8c', '#bf616a', '#b48ead',
      '#ebcb8b', '#d08770', '#81a1c1', '#8fbcbb',
    ],

    selectionBg: 'rgba(136, 192, 208, 0.2)',
    selectionText: '#eceff4',
  },
  typography: defaultTypography,
  spacing: defaultSpacing,
  effects: defaultEffects,
};

/**
 * One Dark Theme
 */
export const oneDark: Theme = {
  name: 'one-dark',
  displayName: 'One Dark',
  isDark: true,
  colors: {
    bgPrimary: '#282c34',
    bgSecondary: '#21252b',
    bgTertiary: '#2c313a',
    bgElevated: '#2c313a',
    bgOverlay: 'rgba(40, 44, 52, 0.9)',

    textPrimary: '#abb2bf',
    textSecondary: '#7f848e',
    textMuted: '#5c6370',
    textInverse: '#282c34',

    accentPrimary: '#61afef',
    accentSecondary: '#c678dd',
    accentSuccess: '#98c379',
    accentWarning: '#e5c07b',
    accentDanger: '#e06c75',
    accentInfo: '#56b6c2',

    gitAdded: '#98c379',
    gitModified: '#e5c07b',
    gitDeleted: '#e06c75',
    gitUntracked: '#5c6370',
    gitConflict: '#e06c75',
    gitRenamed: '#c678dd',

    borderDefault: '#3e4452',
    borderHover: '#4d5566',
    borderFocus: '#61afef',

    syntaxKeyword: '#c678dd',
    syntaxString: '#98c379',
    syntaxNumber: '#d19a66',
    syntaxComment: '#5c6370',
    syntaxFunction: '#61afef',
    syntaxVariable: '#e06c75',
    syntaxOperator: '#56b6c2',
    syntaxType: '#e5c07b',

    graphColors: [
      '#61afef', '#98c379', '#e06c75', '#c678dd',
      '#e5c07b', '#56b6c2', '#d19a66', '#abb2bf',
    ],

    selectionBg: 'rgba(97, 175, 239, 0.2)',
    selectionText: '#abb2bf',
  },
  typography: defaultTypography,
  spacing: defaultSpacing,
  effects: defaultEffects,
};

/**
 * High Contrast Theme (Accessibility)
 */
export const highContrast: Theme = {
  name: 'high-contrast',
  displayName: 'High Contrast',
  isDark: true,
  colors: {
    bgPrimary: '#000000',
    bgSecondary: '#0a0a0a',
    bgTertiary: '#1a1a1a',
    bgElevated: '#1a1a1a',
    bgOverlay: 'rgba(0, 0, 0, 0.95)',

    textPrimary: '#ffffff',
    textSecondary: '#cccccc',
    textMuted: '#999999',
    textInverse: '#000000',

    accentPrimary: '#00ffff',
    accentSecondary: '#ff00ff',
    accentSuccess: '#00ff00',
    accentWarning: '#ffff00',
    accentDanger: '#ff0000',
    accentInfo: '#00ffff',

    gitAdded: '#00ff00',
    gitModified: '#ffff00',
    gitDeleted: '#ff0000',
    gitUntracked: '#cccccc',
    gitConflict: '#ff0000',
    gitRenamed: '#ff00ff',

    borderDefault: '#ffffff',
    borderHover: '#00ffff',
    borderFocus: '#00ffff',

    syntaxKeyword: '#ff00ff',
    syntaxString: '#00ff00',
    syntaxNumber: '#00ffff',
    syntaxComment: '#888888',
    syntaxFunction: '#ffff00',
    syntaxVariable: '#ff8800',
    syntaxOperator: '#ffffff',
    syntaxType: '#00ffff',

    graphColors: [
      '#00ffff', '#00ff00', '#ff0000', '#ff00ff',
      '#ffff00', '#ff8800', '#00ff88', '#8800ff',
    ],

    selectionBg: 'rgba(0, 255, 255, 0.3)',
    selectionText: '#ffffff',
  },
  typography: defaultTypography,
  spacing: defaultSpacing,
  effects: {
    ...defaultEffects,
    borderRadius: '0px',
    borderRadiusLg: '0px',
  },
};

/**
 * Monokai Theme
 */
export const monokai: Theme = {
  name: 'monokai',
  displayName: 'Monokai',
  isDark: true,
  colors: {
    bgPrimary: '#272822',
    bgSecondary: '#1e1f1c',
    bgTertiary: '#3e3d32',
    bgElevated: '#3e3d32',
    bgOverlay: 'rgba(39, 40, 34, 0.9)',

    textPrimary: '#f8f8f2',
    textSecondary: '#a59f85',
    textMuted: '#75715e',
    textInverse: '#272822',

    accentPrimary: '#66d9ef',
    accentSecondary: '#ae81ff',
    accentSuccess: '#a6e22e',
    accentWarning: '#e6db74',
    accentDanger: '#f92672',
    accentInfo: '#66d9ef',

    gitAdded: '#a6e22e',
    gitModified: '#e6db74',
    gitDeleted: '#f92672',
    gitUntracked: '#75715e',
    gitConflict: '#f92672',
    gitRenamed: '#ae81ff',

    borderDefault: '#49483e',
    borderHover: '#75715e',
    borderFocus: '#66d9ef',

    syntaxKeyword: '#f92672',
    syntaxString: '#e6db74',
    syntaxNumber: '#ae81ff',
    syntaxComment: '#75715e',
    syntaxFunction: '#a6e22e',
    syntaxVariable: '#fd971f',
    syntaxOperator: '#f92672',
    syntaxType: '#66d9ef',

    graphColors: [
      '#66d9ef', '#a6e22e', '#f92672', '#ae81ff',
      '#e6db74', '#fd971f', '#a1efe4', '#f8f8f2',
    ],

    selectionBg: 'rgba(102, 217, 239, 0.2)',
    selectionText: '#f8f8f2',
  },
  typography: defaultTypography,
  spacing: defaultSpacing,
  effects: defaultEffects,
};

/**
 * All available themes
 */
export const themes: Record<string, Theme> = {
  'github-dark': githubDark,
  'github-light': githubLight,
  'dracula': dracula,
  'nord': nord,
  'one-dark': oneDark,
  'high-contrast': highContrast,
  'monokai': monokai,
};

/**
 * Get a theme by name
 */
export function getTheme(name: string): Theme {
  return themes[name] || githubDark;
}

/**
 * Get all available theme names
 */
export function getThemeNames(): string[] {
  return Object.keys(themes);
}

/**
 * Generate CSS custom properties from a theme
 */
export function generateThemeCSS(theme: Theme): string {
  const { colors, typography, spacing, effects } = theme;

  return `
    :root {
      /* Colors - Backgrounds */
      --bg-primary: ${colors.bgPrimary};
      --bg-secondary: ${colors.bgSecondary};
      --bg-tertiary: ${colors.bgTertiary};
      --bg-elevated: ${colors.bgElevated};
      --bg-overlay: ${colors.bgOverlay};
      
      /* Colors - Text */
      --text-primary: ${colors.textPrimary};
      --text-secondary: ${colors.textSecondary};
      --text-muted: ${colors.textMuted};
      --text-inverse: ${colors.textInverse};
      
      /* Colors - Accents */
      --accent-primary: ${colors.accentPrimary};
      --accent-secondary: ${colors.accentSecondary};
      --accent-success: ${colors.accentSuccess};
      --accent-warning: ${colors.accentWarning};
      --accent-danger: ${colors.accentDanger};
      --accent-info: ${colors.accentInfo};
      
      /* Colors - Git */
      --git-added: ${colors.gitAdded};
      --git-modified: ${colors.gitModified};
      --git-deleted: ${colors.gitDeleted};
      --git-untracked: ${colors.gitUntracked};
      --git-conflict: ${colors.gitConflict};
      --git-renamed: ${colors.gitRenamed};
      
      /* Colors - Borders */
      --border-default: ${colors.borderDefault};
      --border-hover: ${colors.borderHover};
      --border-focus: ${colors.borderFocus};
      
      /* Colors - Syntax */
      --syntax-keyword: ${colors.syntaxKeyword};
      --syntax-string: ${colors.syntaxString};
      --syntax-number: ${colors.syntaxNumber};
      --syntax-comment: ${colors.syntaxComment};
      --syntax-function: ${colors.syntaxFunction};
      --syntax-variable: ${colors.syntaxVariable};
      --syntax-operator: ${colors.syntaxOperator};
      --syntax-type: ${colors.syntaxType};
      
      /* Colors - Selection */
      --selection-bg: ${colors.selectionBg};
      --selection-text: ${colors.selectionText};
      
      /* Colors - Graph */
      --graph-color-1: ${colors.graphColors[0]};
      --graph-color-2: ${colors.graphColors[1]};
      --graph-color-3: ${colors.graphColors[2]};
      --graph-color-4: ${colors.graphColors[3]};
      --graph-color-5: ${colors.graphColors[4]};
      --graph-color-6: ${colors.graphColors[5]};
      --graph-color-7: ${colors.graphColors[6]};
      --graph-color-8: ${colors.graphColors[7]};
      
      /* Typography */
      --font-family: ${typography.fontFamily};
      --font-family-mono: ${typography.fontFamilyMono};
      --font-size-xs: ${typography.fontSizeXs};
      --font-size-sm: ${typography.fontSizeSm};
      --font-size-base: ${typography.fontSizeBase};
      --font-size-lg: ${typography.fontSizeLg};
      --font-size-xl: ${typography.fontSizeXl};
      --font-size-xxl: ${typography.fontSizeXxl};
      --line-height: ${typography.lineHeight};
      --line-height-tight: ${typography.lineHeightTight};
      --line-height-relaxed: ${typography.lineHeightRelaxed};
      
      /* Spacing */
      --spacing-xs: ${spacing.xs};
      --spacing-sm: ${spacing.sm};
      --spacing-md: ${spacing.md};
      --spacing-lg: ${spacing.lg};
      --spacing-xl: ${spacing.xl};
      --spacing-xxl: ${spacing.xxl};
      
      /* Effects */
      --border-radius: ${effects.borderRadius};
      --border-radius-lg: ${effects.borderRadiusLg};
      --border-radius-full: ${effects.borderRadiusFull};
      --shadow: ${effects.shadow};
      --shadow-lg: ${effects.shadowLg};
      --shadow-xl: ${effects.shadowXl};
      --transition-fast: ${effects.transitionFast};
      --transition-base: ${effects.transitionBase};
      --transition-slow: ${effects.transitionSlow};
      --blur: ${effects.blur};
    }
    
    /* Apply selection styles */
    ::selection {
      background: var(--selection-bg);
      color: var(--selection-text);
    }
  `;
}

/**
 * Generate terminal ANSI color codes from a theme
 */
export function generateTerminalTheme(theme: Theme): Record<string, string> {
  const { colors } = theme;
  return {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    italic: '\x1b[3m',
    underline: '\x1b[4m',
    
    // Use ANSI 256 colors for better compatibility
    primary: `\x1b[38;2;${hexToRgb(colors.textPrimary)}m`,
    secondary: `\x1b[38;2;${hexToRgb(colors.textSecondary)}m`,
    muted: `\x1b[38;2;${hexToRgb(colors.textMuted)}m`,
    
    success: `\x1b[38;2;${hexToRgb(colors.accentSuccess)}m`,
    warning: `\x1b[38;2;${hexToRgb(colors.accentWarning)}m`,
    danger: `\x1b[38;2;${hexToRgb(colors.accentDanger)}m`,
    info: `\x1b[38;2;${hexToRgb(colors.accentInfo)}m`,
    
    added: `\x1b[38;2;${hexToRgb(colors.gitAdded)}m`,
    modified: `\x1b[38;2;${hexToRgb(colors.gitModified)}m`,
    deleted: `\x1b[38;2;${hexToRgb(colors.gitDeleted)}m`,
    untracked: `\x1b[38;2;${hexToRgb(colors.gitUntracked)}m`,
    
    bgAdded: `\x1b[48;2;${hexToRgb(colors.gitAdded)}m`,
    bgDeleted: `\x1b[48;2;${hexToRgb(colors.gitDeleted)}m`,
  };
}

/**
 * Convert hex color to RGB string
 */
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '255;255;255';
  return `${parseInt(result[1], 16)};${parseInt(result[2], 16)};${parseInt(result[3], 16)}`;
}

/**
 * Theme manager for runtime theme switching
 */
export class ThemeManager {
  private currentTheme: Theme = githubDark;
  private listeners: ((theme: Theme) => void)[] = [];

  /**
   * Get current theme
   */
  getTheme(): Theme {
    return this.currentTheme;
  }

  /**
   * Set theme by name
   */
  setTheme(name: string): void {
    const theme = getTheme(name);
    if (theme.name !== this.currentTheme.name) {
      this.currentTheme = theme;
      this.notifyListeners();
    }
  }

  /**
   * Toggle between light and dark themes
   */
  toggleDarkMode(): void {
    if (this.currentTheme.isDark) {
      this.setTheme('github-light');
    } else {
      this.setTheme('github-dark');
    }
  }

  /**
   * Subscribe to theme changes
   */
  subscribe(listener: (theme: Theme) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Notify all listeners of theme change
   */
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.currentTheme);
    }
  }
}

/**
 * Singleton theme manager instance
 */
export const themeManager = new ThemeManager();
