import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright harness.
 *
 * `@playwright/test` and `pnpm test:e2e` have been in the repo since Phase 1, but there was no
 * config and no specs — so the script silently did nothing. This is the config; specs live in
 * `e2e/`.
 *
 * ## Division of labour with Vitest
 *
 * There is no component-render testing in this repo (no `@testing-library/react`): Vitest covers
 * pure logic, Playwright covers anything that needs a browser or a server render. That makes
 * Playwright the **only** place certain rules can be checked at all — whether a channel's name is
 * in the HTML a crawler receives, whether a wall renders instead of content, whether the sticky
 * bars stack. Those are exactly the assertions that matter most and unit tests cannot reach.
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100)
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`

export default defineConfig({
    testDir: './e2e',
    /**
     * Fail rather than pass when someone leaves a `test.only` in. On a local run that is a
     * convenience; in CI it is a whole suite silently reduced to one test.
     */
    forbidOnly: !!process.env.CI,
    fullyParallel: true,
    /**
     * No retries locally, so a flake is visible while it is still cheap to diagnose. One in CI,
     * because a genuinely flaky browser start should not fail a branch on its own — but only one,
     * so a real intermittent bug still shows up as a failure rather than being retried away.
     */
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

    use: {
        baseURL: BASE_URL,
        /**
         * Playwright's default already — stated out loud so a major version cannot change it under
         * the suite, and so it is visibly the same attribute QC's Selenium suite locates by.
         * Contract: `docs/TEST_IDS.md`.
         */
        testIdAttribute: 'data-testid',
        /** Kept only for a failure — the artefacts are useless when everything passed. */
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'off',
    },

    /**
     * Chromium only, deliberately.
     *
     * The specs here assert behaviour (server-rendered content, routing, ARIA wiring), not
     * rendering differences, so a second engine would triple the runtime to re-check the same
     * logic. Add WebKit the day there is a spec that is actually about Safari.
     */
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

    /**
     * `next build && next start`, not `next dev`.
     *
     * The rules worth testing only exist in a production build: `generateMetadata`, the ISR
     * `revalidate` window, real 404 statuses, and the `'server-only'` boundary. `next dev` is
     * lenient about several of them, so a suite that passed against dev would prove less than it
     * appears to. A dedicated port keeps it clear of whatever is on :3000.
     */
    webServer: {
        command: `pnpm build && pnpm start --port ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
    },
})
