/**
 * Tiny prefixed logger. Wrapping `console` directly makes packaged log
 * output hard to grep through; a single prefix gives every line an
 * obvious owner without pulling in a logging dependency.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const envLevel = (process.env.INSOMNIAC_LOG_LEVEL ?? "info").toLowerCase();
const minLevel: number =
  LEVEL_ORDER[envLevel as Level] ?? LEVEL_ORDER.info;

function emit(level: Level, scope: string, args: unknown[]): void {
  if (LEVEL_ORDER[level] < minLevel) return;
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level}] [${scope}]`;
  switch (level) {
    case "error":
      console.error(prefix, ...args);
      break;
    case "warn":
      console.warn(prefix, ...args);
      break;
    default:
      console.log(prefix, ...args);
  }
}

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  child(scope: string): Logger;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (...args) => emit("debug", scope, args),
    info: (...args) => emit("info", scope, args),
    warn: (...args) => emit("warn", scope, args),
    error: (...args) => emit("error", scope, args),
    child: (sub: string) => createLogger(`${scope}:${sub}`),
  };
}

export const rootLogger = createLogger("insomniac");
