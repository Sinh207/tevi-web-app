import { env } from '@shared/config/env'
import { CACHE_TTL } from '@shared/lib/api/interceptors/etag'
import { createApiModel } from '@shared/lib/api/model'
import { z } from 'zod'

/**
 * Reporting a space — `report/v1/report/…`.
 *
 * ⚠ **On `core`, not on a `report` service.** Legacy ships an `apiReport` model whose base *is*
 * `${W_API}/report` — and its report model does not use it: `models/report.js` imports the plain
 * `@models/api`, whose base is `${W_API}/core`. So the path is `core/v1/report/report/…`, with
 * `report` appearing twice for real.
 *
 * Measured, not read: the obvious base returns **404 `{"detail":"Not Found"}`**. The unused
 * `apiReport` model is exactly the trap — it looks like the answer and is not.
 *
 * Two calls, and legacy has four more beside them (`post`, `comment`, `livestream`). Only the space
 * pair is here, because only the space menu exists — the others land with the surfaces that open
 * them, in whichever feature owns those.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/core` })

export const reportKeys = {
    /**
     * The reason list. **Not account-scoped**, unlike almost every other key in this app: it is a
     * fixed catalogue with no viewer in it, so two accounts on one device may share the answer.
     */
    channelReasons: ['report', 'channel-reasons'] as const,
}

/**
 * A reason: a **stable id** and the backend's own wording of it.
 *
 * ```json
 * { "type": "CHANNEL_SEXUAL_CONTENT", "text": "Sexual content" }
 * ```
 *
 * `type` is what gets filed — legacy posts `content?.type`, never the prose — and it is also what
 * makes the list translatable: `reasonLabel` maps the id to this app's own copy and falls back to
 * `text` for an id that ships after this client. Legacy instead loads the whole English resource
 * bundle and reverse-looks-up each row's English string to find its key
 * (`formReport/content`: `Object.keys(bundle).find(k => bundle[k] === text)`), which silently falls
 * back to English the day anyone edits a translation.
 *
 * A row without a `type` is dropped rather than shown: it could be displayed, but it could not be
 * *submitted*, and a radio that cannot be chosen is worse than a shorter list.
 */
const reasonSchema = z.looseObject({
    type: z.string().min(1),
    text: z
        .unknown()
        .transform(v => (typeof v === 'string' && v.trim() ? v.trim() : ''))
        .catch(''),
})

export type ReportReason = z.infer<typeof reasonSchema>

export const reportApi = {
    /** The reasons a space can be reported for, in the order the backend lists them. */
    async getChannelReasons({ signal }: { signal?: AbortSignal } = {}): Promise<ReportReason[]> {
        const body = await api.get<{ results?: unknown }>(
            'v1/report/report/channel/contents/',
            undefined,
            // A fixed list of reasons, the same for everybody.
            { signal, cache: { persist: true, shared: true, ttlMs: CACHE_TTL.day } },
        )
        const rows = Array.isArray(body?.results) ? body.results : []
        /*
         * A row that will not parse is dropped, the list is not — the rule every other list in this
         * app follows. One odd reason must not turn into "this space cannot be reported".
         */
        return rows
            .map(row => reasonSchema.safeParse(row))
            .filter(result => result.success)
            .map(result => result.data)
    },

    /**
     * File the report. `content` is the chosen reason, `description` the reader's own words.
     *
     * ⚠ **Not retried.** `apiClient` replays a POST only with `{ retry: true }`, and nothing says
     * this endpoint deduplicates — a 502 arriving after it landed would file the same report twice
     * against somebody's account.
     */
    reportChannel({
        channelId,
        content,
        description,
    }: {
        channelId: string
        content: string
        description?: string
    }) {
        return api.post(`v1/report/report/channels/${encodeURIComponent(channelId)}/`, {
            content,
            // Legacy sends the key whether or not it is filled; an empty string is a valid "no note".
            description: description ?? '',
        })
    },
}

/**
 * The reason's label in the reader's language, with the backend's own wording behind it.
 *
 * The nine ids the endpoint returns today each have copy in every locale
 * (`channel_report_reason_*`). A tenth that ships tomorrow falls through to `text` — English, but
 * present and selectable, which is the right failure for a moderation list.
 */
export function reasonLabelKey(type: string): string {
    return `channel_report_reason_${type.replace(/^CHANNEL_/, '').toLowerCase()}`
}
