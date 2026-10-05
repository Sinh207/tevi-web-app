import { ApiError } from '@shared/lib/api/errors'
import { type Channel, normalizeChannel } from '../api/types'

/** The refusal's own code — legacy's `CODE_PROTECTED_CHANNEL` (`postDetail/provider`). */
export const PROTECTED_CHANNEL_CODE = 'CHN0009'

/**
 * **"This belongs to a protected space you do not follow"** — read off a refusal, with the space.
 *
 * A protected space's *content* endpoints (a post, a live's details) answer a non-follower with
 * `422 CHN0009` and the **channel** in the body's `data` — so the refusal carries everything a
 * screen needs to explain itself: whose space, whether a request is already pending, and the slug
 * to follow from. Legacy reads exactly that (`error.redirectSlug = data.data.slug`) and then
 * throws the rest away by bouncing to the space; this keeps it.
 *
 * `null` for anything else, including a `CHN0009` whose body is not a readable channel — a wall
 * that cannot name the space is not one this client may draw, and the caller's generic error
 * stands instead.
 */
export function protectedChannelOf(error: unknown): Channel | null {
    if (!(error instanceof ApiError)) return null
    if (error.status !== 422 || error.code?.trim().toUpperCase() !== PROTECTED_CHANNEL_CODE) {
        return null
    }
    const body = error.data as { data?: unknown } | null | undefined
    return normalizeChannel(body?.data ?? null)
}
