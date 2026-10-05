'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { postApi } from '../api/post-api'
import type { Post } from '../api/types'

/**
 * Bookmarking a post, and taking the bookmark off.
 *
 * ## Confirm-then-flip, where reacting is optimistic — and the difference is legacy's, not a mood
 *
 * `usePostReaction` flips before the request because the star plays a burst on press and an
 * animation that waits for a round trip reads as a dropped tap. **Nothing is animated here.** So
 * this waits, exactly as legacy does: `handleBookmark` only writes `is_bookmark: true` once the
 * response comes back `201` with `success`, and `handleDeleteBookmark` only writes `false` on a
 * `200` with `success`.
 *
 * That is the better trade for this control. A bookmark is a promise that the post will be in a
 * list later; flipping the icon and quietly failing means the reader finds out when the list is
 * empty, which is far past the point where they could do anything about it. A reaction that fails
 * costs a number that was already approximate.
 *
 * The `success` flag is why this cannot be a plain "it did not throw" check — see
 * `postApi.addBookmark`, and **B106** for whether the flag can be `false` on a 2xx at all.
 *
 * ## Both outcomes are announced
 *
 * Legacy toasts on success *and* on failure, and the failure toast prefers **the API's own
 * message**. Kept: a bookmark has no other visible consequence on this screen — there is no list
 * to watch a row appear in — so a silent success is indistinguishable from a silent failure.
 * `docs/API_ERRORS.md` is why the backend's sentence wins on a 4xx and ours is the fallback.
 *
 * ## No event on the bus
 *
 * Legacy emits `BOOKMARK_ADD` / `BOOKMARK_REMOVE` so its bookmarks screen can update. That screen
 * is not ported, and `CLAUDE.md` is explicit that an event is added **when the thing that fires it
 * exists**, not in anticipation. When the list lands it will be a query, and the primitive for
 * "server state changed" is an invalidation of its key — not a ninth event.
 */
export function usePostBookmark(post: Post) {
    const { activeId } = useAuth()
    const requireAuth = useRequireAuth()
    const { t } = useTranslation()

    const [bookmarked, setBookmarked] = useState(post.is_bookmark)

    /** Re-seed on identity as well as value, so a reused card cannot carry the last post's state. */
    // biome-ignore lint/correctness/useExhaustiveDependencies: the re-seed is keyed on the post's identity, not on the local state it overwrites.
    useEffect(() => {
        setBookmarked(post.is_bookmark)
    }, [post.id, post.is_bookmark])

    /**
     * A ref, not `isPending`: that flag only turns true after a render, so two presses in the same
     * tick would both fire — the same trap `usePostReaction` documents, and a double-tap is more
     * likely on a control whose state does not move until the response lands.
     */
    const inFlight = useRef(false)

    const mutation = useMutation({
        mutationFn: ({ next, accountId }: { next: boolean; accountId: string | null }) =>
            next
                ? postApi.addBookmark(post.id, accountId)
                : postApi.removeBookmark(post.id, accountId),
        onSuccess: (landed, variables) => {
            inFlight.current = false
            if (!landed) {
                toast.error(t('post_bookmark_failed'))
                return
            }
            setBookmarked(variables.next)
            toast.success(t(variables.next ? 'post_bookmark_added' : 'post_bookmark_removed'))
        },
        onError: () => {
            inFlight.current = false
        },
        /**
         * The API's own sentence wins on a 4xx; ours is the fallback. Typed as a string rather than
         * `true` on purpose — `true` would print `error.message`, whose fallback chain ends in
         * axios's own English (`docs/API_ERRORS.md`).
         */
        meta: { showErrorToast: t('post_bookmark_failed') },
    })

    /** The **press** is gated, never the row: a guest sees the control and is asked to sign in. */
    const toggle = requireAuth(() => {
        if (inFlight.current) return
        inFlight.current = true
        mutation.mutate({ next: !bookmarked, accountId: activeId })
    })

    return { bookmarked, toggle, isPending: mutation.isPending }
}
