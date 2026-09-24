import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import { type LivePlayback, type LiveRoom, livePlaybackSchema, liveRoomSchema } from './live-types'

/**
 * **The live room's three reads.** See `live-types.ts` for the payloads and for why two bases.
 *
 * ⚠ **None of these is cacheable and none of them may be `persist`ed.** `interceptors/etag.ts`
 * spells out the rule and this is the sharpest case of it: `viewer_token` is a short-lived
 * per-account credential for joining an RTC channel, and `alternative_playlist` URLs are signed and
 * expire. A disk record of either is a stale key on a shared device — the **B72** failure, with a
 * credential in it rather than a billing figure. The default (memory-only, tab-lifetime) is what
 * these get, and `staleTime` is 0 so a re-mount re-asks.
 */
const core = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/core` })
const live = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/live` })

export const liveKeys = {
    all: ['event', 'live'] as const,
    /**
     * Keyed on the **account**, not only the event.
     *
     * `viewer_token` authorises *this* reader into the channel, and the preview quota is counted
     * per device against an account's session. Sharing one cache entry across an account switch
     * would hand the second account the first one's join credential — which Agora will refuse, so
     * the symptom is a room that silently never connects rather than a leak.
     */
    room: (code: string, accountId: string | null) =>
        [...liveKeys.all, 'room', code, accountId ?? 'anon'] as const,
    playback: (code: string, accountId: string | null) =>
        [...liveKeys.all, 'playback', code, accountId ?? 'anon'] as const,
    preview: (code: string, accountId: string | null) =>
        [...liveKeys.all, 'preview', code, accountId ?? 'anon'] as const,
}

/**
 * The refusals the **preview** endpoint answers with, as legacy's switch records them.
 *
 * Legacy reads all six and acts on exactly one (`E003` → geo-restricted); the rest fall through to
 * an empty `default:`, which is why a members-only preview and an unpublished one look identical
 * to a reader. They are enumerated here because the code is the *only* place some of these states
 * are knowable at all — `lib/watch-state.ts` names geo-restriction as unreachable precisely because
 * this call had not been ported.
 */
export const PREVIEW_REFUSAL = {
    /** Exclusive content — a paywall this client already knows about from the event payload. */
    C001: 'exclusive',
    /** ⚠ The one state nothing else can tell us. `lib/watch-state.ts` has the note. */
    E003: 'geo-restricted',
    /** Members only. */
    E004: 'members-only',
    /** Members only, second spelling. Both are live; neither is documented. */
    E010: 'members-only',
    /** Not published yet. */
    E005: 'unpublished',
    /** Sign-in required. */
    E012: 'sign-in-required',
} as const

export type PreviewRefusal = (typeof PREVIEW_REFUSAL)[keyof typeof PREVIEW_REFUSAL]

/** Read a refusal code off a failed response body. `null` for anything unrecognised — an unknown
 *  code is not a state this client may claim to understand. */
export function previewRefusal(body: unknown): PreviewRefusal | null {
    if (!body || typeof body !== 'object') return null
    const code = (body as { code?: unknown }).code
    if (typeof code !== 'string') return null
    return PREVIEW_REFUSAL[code.trim().toUpperCase() as keyof typeof PREVIEW_REFUSAL] ?? null
}

export const liveApi = {
    /** Who is on camera and how they are arranged. */
    async getRoom({
        code,
        accountId,
        signal,
    }: {
        code: string
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<LiveRoom | null> {
        const body = await core.get<unknown>(
            `v4/live/event/${encodeURIComponent(code)}/layout/`,
            undefined,
            { signal, ...(accountId ? { accountId } : {}) },
        )
        const parsed = liveRoomSchema.safeParse(body)
        return parsed.success ? parsed.data : null
    },

    /** The real stream, for a reader who is allowed in. */
    async getPlayback({
        code,
        accountId,
        signal,
    }: {
        code: string
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<LivePlayback | null> {
        const body = await core.get<unknown>(
            `v4/live/event/${encodeURIComponent(code)}/playback/`,
            undefined,
            { signal, ...(accountId ? { accountId } : {}) },
        )
        const parsed = livePlaybackSchema.safeParse(body)
        return parsed.success ? parsed.data : null
    },

    /**
     * The free sample, for a reader who is not.
     *
     * ⚠ **Calling this spends one of the reader's three previews on the backend's count**, whatever
     * this client does with the answer. `useLivePreview` therefore checks the local quota *before*
     * the call — so a fourth attempt costs nothing — and marks the look spent on its **success**,
     * so a network failure does not take a preview nobody watched.
     *
     * A retry, a refetch-on-focus or React's strict-mode double-mount would each cost a real look.
     * That is held off by the hook's query options, not by anything here, which is why this is
     * deliberately not something a component may call directly.
     */
    async getPreview({
        code,
        accountId,
        signal,
    }: {
        code: string
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<LivePlayback | null> {
        const body = await live.get<unknown>(
            `v1/streaming-events/${encodeURIComponent(code)}/preview/`,
            undefined,
            { signal, ...(accountId ? { accountId } : {}) },
        )
        const parsed = livePlaybackSchema.safeParse(body)
        return parsed.success ? parsed.data : null
    },
}
