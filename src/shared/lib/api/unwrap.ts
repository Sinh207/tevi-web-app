import { isApiUrl } from './origins'

/**
 * Backend wraps every success body in `{ data: <payload>, ... }`; unwrap to the
 * payload so models/hooks work with flat DTOs (matches the legacy app, which
 * reads `res.data.data` at every call site).
 *
 * Lives on its own rather than in `client.ts` because the RSC client
 * (`server-client.ts`) needs the same rule and must not pull axios, the token
 * store or the ETag cache into a server bundle to get it.
 */
export function unwrapEnvelope(body: unknown): unknown {
    if (body && typeof body === 'object' && !Array.isArray(body) && 'data' in body) {
        return (body as { data: unknown }).data
    }
    return body
}

/**
 * Unwrap only what the Tevi API sent.
 *
 * "Any object with a `data` key is an envelope" is true of W_API — it wraps
 * unconditionally — and false of everything else `apiClient` can be pointed at.
 * A storage service, a payment provider or an upload callback that happens to
 * answer `{ data: [...], cursor }` would have had its own payload torn open and
 * the rest of the body dropped. Scoping the rule to the origin that actually
 * defines it keeps the convenience without guessing.
 */
export function unwrapApiEnvelope(url: string, body: unknown): unknown {
    return isApiUrl(url) ? unwrapEnvelope(body) : body
}
