/**
 * Stands in for the `server-only` package under Vitest — see `vitest.config.ts`.
 *
 * The real package throws on import so that a client component importing a server module
 * fails the build. That guard has to stay in the source, but it would also stop the test
 * runner from importing those modules at all, and they hold rules worth pinning (which
 * origins get signed, what a 5xx must not be turned into, whether an envelope is unwrapped).
 *
 * Empty on purpose. Nothing imports it directly.
 */
export {}
