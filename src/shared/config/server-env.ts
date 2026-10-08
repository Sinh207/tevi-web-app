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
 * - Cluster DNS only resolves when the app runs **in** the cluster. A machine outside it —
 *   `pnpm dev`, the CI e2e job — sets `SERVER_API_VIA_GATEWAY=1`, and the models read the
 *   public gateway instead, which answers the same content to an anonymous caller.
 */
const schema = z.object({
    /**
     * Overrides for the three in-cluster bases in `INTERNAL_API` — set one only to point a service
     * somewhere other than legacy's host. Include the path prefix; the models append the rest.
     */
    INTERNAL_CHANNEL_API: z.string().url().optional(),
    INTERNAL_POST_API: z.string().url().optional(),
    INTERNAL_LIVESTREAM_API: z.string().url().optional(),
    /**
     * `1` on a machine **outside the cluster** — `pnpm dev`, the CI e2e job — where the internal
     * hosts do not resolve. The server reads then go through the public gateway instead, which
     * answers the same paths anonymously. Never set in a deployment: there the internal service is
     * the only source, as it is in legacy.
     */
    SERVER_API_VIA_GATEWAY: z.enum(['1', 'true']).optional(),
    /**
     * The **image proxy** that resizes a creator's avatar into the square icons a PWA install
     * needs — base URL only, no trailing slash, e.g. `https://imge.cdn.flowstreamx.com/unsafe`.
     * `shared/lib/thumbor.ts` appends `<w>x<h>/<source url>` and owns the fallback when this is
     * unset, so nothing here has to be set for the feature to work.
     *
     * Server-only rather than `NEXT_PUBLIC_`: the URLs it builds are public (they go into a
     * manifest and a `<link>`), but the *base* is only ever read while rendering, so there is
     * nothing to inline into the client bundle.
     */
    THUMBOR_IMAGE_BASE: z.string().url().optional(),
})

export type ServerEnv = z.infer<typeof schema>

let cached: ServerEnv | undefined

/**
 * Parsed once per process, lazily.
 *
 * Warns rather than throws on a bad value, matching `env.ts`: a malformed override should
 * degrade to the default internal host, not take the whole render down. A typo'd URL that
 * hard-failed at import time would break every page, including the ones that never read it.
 */
export function serverEnv(): ServerEnv {
    if (cached) return cached
    const parsed = schema.safeParse({
        INTERNAL_CHANNEL_API: process.env.INTERNAL_CHANNEL_API,
        INTERNAL_POST_API: process.env.INTERNAL_POST_API,
        INTERNAL_LIVESTREAM_API: process.env.INTERNAL_LIVESTREAM_API,
        SERVER_API_VIA_GATEWAY: process.env.SERVER_API_VIA_GATEWAY,
        THUMBOR_IMAGE_BASE: process.env.THUMBOR_IMAGE_BASE,
    })
    if (!parsed.success) {
        console.warn(
            '[server-env] invalid server configuration; using the in-cluster defaults.',
            parsed.error.flatten().fieldErrors,
        )
        cached = {}
        return cached
    }
    cached = parsed.data
    return cached
}

/**
 * Where the server reads public content from: **the in-cluster services, always** — legacy's three
 * constants (`services/seo.js`), so a deployment needs no configuration to get them right.
 *
 * Every server read of metadata goes here — the space, the post, the event, the home feed. Three
 * services, and getting the service wrong does not fail loudly: a post asked of the channel
 * service is a 404 the post page renders as "deleted", an event asked of it is `unavailable` and
 * a default share card. Which is how two of the three shipped pointing at the channel service.
 *
 * The livestream prefix is `live`, not the service name, and it answers an event at
 * `v1/public-events/{code}/` where the gateway's is `core/v4/public/events/{code}/`.
 */
export const INTERNAL_API = {
    channel: 'http://tevi-channel/tevi-channel',
    post: 'http://tevi-post/tevi-post',
    livestream: 'http://tevi-livestream/live',
} as const

export type InternalService = keyof typeof INTERNAL_API

/**
 * The in-cluster base for `service`, or `null` on a machine outside the cluster
 * (`SERVER_API_VIA_GATEWAY`), where the caller reads the public gateway instead.
 */
export function internalApiBase(service: InternalService): string | null {
    const config = serverEnv()
    if (config.SERVER_API_VIA_GATEWAY) return null
    const override = {
        channel: config.INTERNAL_CHANNEL_API,
        post: config.INTERNAL_POST_API,
        livestream: config.INTERNAL_LIVESTREAM_API,
    }[service]
    return override ?? INTERNAL_API[service]
}
