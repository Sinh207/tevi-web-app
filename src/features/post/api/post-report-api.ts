import { env } from '@shared/config/env'
import { CACHE_TTL } from '@shared/lib/api/interceptors/etag'
import { createApiModel } from '@shared/lib/api/model'
import {
    normalizeReasons,
    type ReportReason,
    reasonLabelKey as sharedReasonLabelKey,
} from '@shared/lib/api/report-reasons'

/**
 * Reporting a post — the second of legacy's four report surfaces.
 *
 * ## Why this is a file of its own and not two more methods on `post-api.ts`
 *
 * `features/channel/api/report-api.ts` already made this split and said why: legacy has four report
 * lists (`channel`, `post`, `comment`, `livestream`) and each *"lands with the surface that opens
 * it"*. `features/post` owns two of the four. They are here rather than on `post-api.ts` because
 * the base differs in spirit if not in string — reporting is moderation, not the post's own CRUD —
 * and because the reason **catalogue** has caching rules nothing else in this feature has.
 *
 * ⚠ **On `core`, and the path says `report` twice.** `core/v1/report/report/post/contents/`. That is
 * not a transcription slip: legacy ships an `apiReport` model whose base *is* `${W_API}/report` and
 * then does not use it — `models/report.js` imports the plain `@models/api`, based on `core`.
 * `features/channel`'s copy of this note records that the obvious base answers **404**.
 *
 * ## The comment list is the missing third, and it is missing on purpose
 *
 * `v1/report/report/reply/contents/` + `v1/report/report/replies/{id}/` are the same pair one level
 * down, and they belong with the comment row — a surface this cut does not build. Adding them here
 * "while we are in the file" would be two exported methods with no caller, which is how a wrong
 * guess about a payload survives long enough to be copied.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/core` })

export const postReportKeys = {
    /**
     * The reason list. **Not account-scoped**, for the same reason the channel list is not: a fixed
     * catalogue with no viewer in it, so every account on a device may share one answer.
     */
    reasons: ['post', 'report-reasons'] as const,
}

export const postReportApi = {
    /** The reasons a post can be reported for, in the order the backend lists them. */
    async getReasons({ signal }: { signal?: AbortSignal } = {}): Promise<ReportReason[]> {
        const body = await api.get<{ results?: unknown }>(
            'v1/report/report/post/contents/',
            undefined,
            /*
             * `shared: true` is safe here and is the exception rather than the rule in this feature
             * — every other key under `post` is account-scoped because the payload is
             * viewer-relative. This one is not: the response does not vary by bearer, so one copy
             * on the device serves every account. `persist` without `shared` would file a
             * catalogue under each account in turn and re-fetch it on every switch.
             */
            { signal, cache: { persist: true, shared: true, ttlMs: CACHE_TTL.day } },
        )
        /*
         * A row that will not parse is dropped, the list is not. One odd reason must not turn into
         * "this post cannot be reported" — the same rule every list in this app follows.
         */
        return normalizeReasons(body?.results)
    },

    /**
     * File the report. `content` is the chosen reason's stable `type`, `description` the reader's
     * own words.
     *
     * ⚠ **Not retried**, and this is one of the cases where that matters most: `apiClient` replays a
     * POST only with `{ retry: true }`, and a 502 arriving after this landed would file the same
     * report twice against somebody's post. Moderation queues count.
     *
     * Legacy omits `description` from the body when it is empty where the channel endpoint always
     * sends it. Sent unconditionally here, matching `reportChannel`: an empty string is a valid
     * "no note", and two report calls in one product disagreeing about whether a key exists is the
     * sort of difference that becomes a backend `if` nobody can explain later. **B108**.
     */
    reportPost({
        postId,
        content,
        description,
    }: {
        postId: string
        content: string
        description?: string
    }) {
        return api.post(`v1/report/report/posts/${encodeURIComponent(postId)}/`, {
            content,
            description: description ?? '',
        })
    },
}

/**
 * The reason's label in the reader's language, with the backend's own wording behind it.
 *
 * The ids this endpoint returns are prefixed `POST_` where the channel list's are `CHANNEL_`, so
 * the prefix is stripped before the key is built and the copy keys read `post_report_reason_*`. A
 * reason that ships after this client falls through to the backend's `text` — English, but present
 * and selectable, which is the right failure for a moderation list.
 */
export function reasonLabelKey(type: string): string {
    return sharedReasonLabelKey(type, {
        keyPrefix: 'post_report_reason',
        stripPrefix: ['POST_'],
    })
}
