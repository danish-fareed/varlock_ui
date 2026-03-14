/** Terminal font configuration */
export const TERMINAL_FONT_FAMILY =
  '"Cascadia Code", "Fira Code", "JetBrains Mono", "Menlo", "Consolas", monospace';
export const TERMINAL_FONT_SIZE = 13;

/** Terminal theme matching the mockup dark background */
export const TERMINAL_THEME = {
  background: "#1a1a18",
  foreground: "#e8e6df",
  cursor: "#97C459",
  cursorAccent: "#1a1a18",
  selectionBackground: "#534AB740",
  selectionForeground: "#e8e6df",
  black: "#1a1a18",
  red: "#F09595",
  green: "#97C459",
  yellow: "#EF9F27",
  blue: "#85B7EB",
  magenta: "#AFA9EC",
  cyan: "#7EC4CF",
  white: "#e8e6df",
  brightBlack: "#555",
  brightRed: "#F09595",
  brightGreen: "#97C459",
  brightYellow: "#EF9F27",
  brightBlue: "#85B7EB",
  brightMagenta: "#AFA9EC",
  brightCyan: "#7EC4CF",
  brightWhite: "#ffffff",
} as const;

/** Color mapping for project status indicators */
export const STATUS_COLORS = {
  valid: "#639922",
  warning: "#BA7517",
  error: "#E24B4A",
  migrationNeeded: "#185FA5",
  unknown: "#888888",
} as const;

/** Environment badge colors */
export const ENV_BADGE_STYLES: Record<
  string,
  { bg: string; text: string }
> = {
  development: { bg: "#E1F5EE", text: "#0F6E56" },
  production: { bg: "#FCEBEB", text: "#A32D2D" },
  test: { bg: "#FAEEDA", text: "#633806" },
  staging: { bg: "#E6F1FB", text: "#185FA5" },
  preview: { bg: "#EEEDFE", text: "#534AB7" },
};

/** Variable type badge colors */
export const TYPE_BADGE_STYLES: Record<
  string,
  { bg: string; text: string }
> = {
  url: { bg: "#E6F1FB", text: "#185FA5" },
  string: { bg: "#F1EFE8", text: "#5F5E5A" },
  port: { bg: "#E1F5EE", text: "#0F6E56" },
  enum: { bg: "#FAEEDA", text: "#633806" },
  number: { bg: "#EEEDFE", text: "#534AB7" },
  boolean: { bg: "#E1F5EE", text: "#0F6E56" },
};

/** Default environment badge style for unknown environments */
export const DEFAULT_ENV_BADGE = { bg: "#F1EFE8", text: "#5F5E5A" };

/** Default type badge style for unknown types */
export const DEFAULT_TYPE_BADGE = { bg: "#F1EFE8", text: "#5F5E5A" };
