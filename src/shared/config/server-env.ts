import 'server-only'
import { z } from 'zod'

/**
 * Server-only configuration — **never** prefixed `NEXT_PUBLIC_`.
 *
 * `shared/config/env.ts` validates the values Next inlines into the client bundle. These
 * are the opposite: they exist only in the running server's environment, they are read
 * lazily rather than inlined, and `'server-only'` makes importing this from a client
 * component a build error instead of a leak.
 *
 * ## Why an internal base URL at all
 *
 * Public pages are server-rendered for SEO, and there is no bearer available on the server
 * — auth lives in `localStorage`, by design (see `shared/lib/api/token.ts`). Rather than
 * inventing a way to authenticate the render, the server reads the **in-cluster service
 * directly**, which needs no credentials. That is exactly what legacy does for the same
 * pages (`../tevi-web-app/src/services/seo.js`).
 *
 * Two things follow, and both are easy to get wrong:
 *
 * - The internal origin does not match `NEXT_PUBLIC_W_API_DOMAIN`, so `isApiUrl()` is false
 *   for it. HMAC signing is skipped, which is **correct** — `?verify=` is a bot speed bump
 *   on the public gateway and means nothing inside the cluster. But envelope unwrapping is
 *   gated on the same predicate, and the internal service *does* wrap in `{ data }`, so its
 *   model must pass `unwrapEnvelope: true`. Legacy unwraps it by hand for the same reason.
 * - Cluster DNS only resolves when the app runs **in** the cluster. Unset, the models fall
 *   back to the public gateway, so a local `pnpm dev` and a non-cluster deploy both keep
 *   working — they just serve whatever the public endpoint gives an anonymous caller.
 */
const schema = z.object({
    /**
     * The channel service's in-cluster base, e.g. `http://tevi-channel/tevi-channel`.
     * Include the path prefix; the model appends `v3/channel/...` to it.
     */
    INTERNAL_CHANNEL_API: z.string().url().optional(),
})

export type ServerEnv = z.infer<typeof schema>

let cached: ServerEnv | undefined

/**
 * Parsed once per process, lazily.
 *
 * Warns rather than throws on a bad value, matching `env.ts`: a malformed internal host
 * should degrade to the public gateway, not take the whole render down. A typo'd URL that
 * hard-failed at import time would break every page, including the ones that never read it.
 */
export function serverEnv(): ServerEnv {
    if (cached) return cached
    const parsed = schema.safeParse({
        INTERNAL_CHANNEL_API: process.env.INTERNAL_CHANNEL_API,
    })
    if (!parsed.success) {
        console.warn(
            '[server-env] invalid server configuration; falling back to the public API.',
            parsed.error.flatten().fieldErrors,
        )
        cached = {}
        return cached
    }
    cached = parsed.data
    return cached
}
