/**
 * Structured client-side logger that stays silent during Vitest runs
 * while remaining spyable via `vi.spyOn(logger, 'warn')`.
 */

function isTestEnvironment(): boolean {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      return true;
    }
  }
  const viteMode = (import.meta as { env?: { MODE?: string } }).env?.MODE;
  return viteMode === 'test';
}

/** Application-wide browser logger with automatic test silencing. */
export const logger = {
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
