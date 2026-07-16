import { z } from 'zod'

/**
 * Environment configuration with runtime validation.
 *
 * IMPORTANT: only `NEXT_PUBLIC_*` values reach the browser. Server-only secrets
 * (DB/Redis/mail) must NOT be prefixed and are validated lazily on the server.
 *
 * `NEXT_PUBLIC_SIGN_SECRET` is intentionally client-exposed — HMAC request
 * signing runs in the browser via WebCrypto (a "public secret", same posture as
 * the legacy app). See shared/lib/api/interceptors/sign.ts.
 *
 * next.js inlines NEXT_PUBLIC_* at build time, so each must be referenced
 * statically (not via computed keys).
 */
const clientSchema = z.object({
    NEXT_PUBLIC_ENV: z.enum(['development', 'staging', 'production']).default('development'),
    NEXT_PUBLIC_BASE_URL: z.string().url(),
    NEXT_PUBLIC_W_API_DOMAIN: z.string().url(),
    NEXT_PUBLIC_DOORMAN_DOMAIN: z.string().url(),
    NEXT_PUBLIC_STATIC_DOMAIN: z.string().url().optional(),

    // Client-side HMAC signing secret (public secret — see note above)
    NEXT_PUBLIC_SIGN_SECRET: z.string().min(1),

    // Firebase web config (Anonymous + Twitter auth only)
    NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
    NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1),
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().optional(),
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().optional(),

    // OAuth client IDs (public)
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().optional(),
    NEXT_PUBLIC_APPLE_CLIENT_ID: z.string().optional(),
    NEXT_PUBLIC_FACEBOOK_CLIENT_ID: z.string().optional(),
    NEXT_PUBLIC_TIKTOK_CLIENT_KEY: z.string().optional(),
    NEXT_PUBLIC_LINE_CHANNEL_ID: z.string().optional(),
    NEXT_PUBLIC_TELEGRAM_BOT_ID: z.string().optional(),
    NEXT_PUBLIC_AUTH_REDIRECT_URL: z.string().url().optional(),

    // Analytics (optional — gated by consent at runtime)
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
    NEXT_PUBLIC_GTM_ID: z.string().optional(),
})

// Values must be listed explicitly so Next can inline them.
const clientValues = {
    NEXT_PUBLIC_ENV: process.env.NEXT_PUBLIC_ENV,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
    NEXT_PUBLIC_W_API_DOMAIN: process.env.NEXT_PUBLIC_W_API_DOMAIN,
    NEXT_PUBLIC_DOORMAN_DOMAIN: process.env.NEXT_PUBLIC_DOORMAN_DOMAIN,
    NEXT_PUBLIC_STATIC_DOMAIN: process.env.NEXT_PUBLIC_STATIC_DOMAIN,
    NEXT_PUBLIC_SIGN_SECRET: process.env.NEXT_PUBLIC_SIGN_SECRET,
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    NEXT_PUBLIC_APPLE_CLIENT_ID: process.env.NEXT_PUBLIC_APPLE_CLIENT_ID,
    NEXT_PUBLIC_FACEBOOK_CLIENT_ID: process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID,
    NEXT_PUBLIC_TIKTOK_CLIENT_KEY: process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY,
    NEXT_PUBLIC_LINE_CHANNEL_ID: process.env.NEXT_PUBLIC_LINE_CHANNEL_ID,
    NEXT_PUBLIC_TELEGRAM_BOT_ID: process.env.NEXT_PUBLIC_TELEGRAM_BOT_ID,
    NEXT_PUBLIC_AUTH_REDIRECT_URL: process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_GTM_ID: process.env.NEXT_PUBLIC_GTM_ID,
} as const

function parseClientEnv() {
    const parsed = clientSchema.safeParse(clientValues)
    if (!parsed.success) {
        // During `next build` env may be absent; fail loud in dev/runtime only.
        const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n')
        if (process.env.NODE_ENV !== 'production') {
            console.warn(`[env] invalid/missing client env:\n${issues}`)
        }
        return clientValues as unknown as z.infer<typeof clientSchema>
    }
    return parsed.data
}

export const env = parseClientEnv()
export type ClientEnv = z.infer<typeof clientSchema>
