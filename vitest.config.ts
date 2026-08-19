import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
    resolve: {
        tsconfigPaths: true,
        alias: {
            /**
             * `server-only` throws on import outside a React Server Component, which is the
             * point of it — but that also makes every module carrying the marker
             * (`api/server-client.ts`, `config/server-env.ts`, a feature's `server.ts`)
             * untestable, and those are exactly the modules whose rules are worth pinning.
             *
             * Stubbed to an empty module rather than dropped from the source: the marker
             * still has to be there, because it is what turns "a client component imported
             * the server barrel" into a build error instead of a leak.
             */
            'server-only': resolve(__dirname, 'test/stubs/server-only.ts'),
        },
    },
    test: {
        globals: true,
        environment: 'node', // per-file override via `// @vitest-environment jsdom`
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
        // Public env the modules read at import time.
        env: {
            NEXT_PUBLIC_ENV: 'development',
            NEXT_PUBLIC_BASE_URL: 'https://tevi.dev',
            NEXT_PUBLIC_W_API_DOMAIN: 'https://wapi.tevi.dev',
            NEXT_PUBLIC_DOORMAN_DOMAIN: 'https://doorman.tevi.dev',
            NEXT_PUBLIC_SIGN_SECRET: 'test-secret',
            NEXT_PUBLIC_FIREBASE_API_KEY: 'test',
            NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'test',
            NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'test',
            NEXT_PUBLIC_FIREBASE_APP_ID: 'test',
            // `LoginForm` bails out of rendering the Google button without this
            // (login-form.tsx), so a component test would silently assert nothing.
            NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'test-google-client-id',
        },
    },
})
