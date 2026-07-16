import { defineConfig } from 'vitest/config'

export default defineConfig({
    resolve: { tsconfigPaths: true },
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
        },
    },
})
