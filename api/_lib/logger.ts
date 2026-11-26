/**
 * Structured server-side logger for Vercel Node ESM serverless functions (`api/`).
 *
 * Silences console output during Vitest runs while preserving spyable method calls.
 */

function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

/** Server-side logger used across `api/` handlers and helpers. */
export const serverLogger = {
  /** Logs an informational message outside of test runs. */
  info(message: string, ...args: unknown[]): void {
    if (isTestEnvironment()) return;
    console.info(message, ...args);
  },

  /** Logs a warning message outside of test runs. */
  warn(message: string, ...args: unknown[]): void {
    if (isTestEnvironment()) return;
    console.warn(message, ...args);
  },

  /** Logs an error message outside of test runs. */
  error(message: string, ...args: unknown[]): void {
    if (isTestEnvironment()) return;
    console.error(message, ...args);
  },
};
