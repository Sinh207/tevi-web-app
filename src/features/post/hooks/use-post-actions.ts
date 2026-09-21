'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { blocksApi } from '@shared/lib/api/blocks-api'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { postApi, postKeys } from '../api/post-api'
import type { Post } from '../api/types'

/**
 * The four writes a post's overflow menu can make: pin, open/close replies, delete, and block the
 * author.
 *
 * ## Why they are one hook and not four
 *
 * They share everything that is hard about them — the account has to be pinned at the press, each
 * announces itself with a toast because none of them has another visible consequence on this
 * screen, and all four have to tell the surrounding list that the post moved. Four hooks would be
 * four copies of that, and legacy has exactly that: `usePostLogic` repeats the same
 * `try / setLoading / status===200 / messageContext / finally` block **eight** times, which is how
 * three of its eight ended up not restoring their loading flag on the error path.
 *
 * They are still four **mutations**, not one with a discriminator: their inputs differ, their
 * optimism differs (see below), and `isPending` has to be answerable per row so the menu can
 * disable the one that is running rather than all of them.
 *
 * ## Pin is optimistic, and the other three are not
 *
 * Legacy flips `pinned` before the request and leaves the rest to wait, and that asymmetry is
 * right rather than accidental. Pinning has an immediate, *reversible*, visible result — a marker
 * in the header — so making the reader wait for it feels broken. The other three do not: closing
 * replies removes a control, deleting replaces the card, blocking removes the author from the feed.
 * Doing any of those optimistically means undoing them in front of the reader when the request
 * fails, which reads far worse than a half-second wait.
 *
 * ## Nothing here removes the card from a list
 *
 * Not even delete. The backend keeps the row and flips `deleted`, which is the tombstone
 * `postDisplay` renders — so the correct response to a successful delete is to **invalidate** and
 * let the list re-render the post as a tombstone, exactly as legacy does. A hook that spliced the
 * row out would make the tombstone unreachable and would have to know the shape of a list it does
 * not own.
 *
 * ## The invalidation is broad on purpose
 *
 * `postKeys.all` plus whatever the caller names. This feature does not own the queries that hold
 * post rows — a channel's threads are `features/channel`'s, home's will be home's — so it cannot
 * surgically patch them, and a wrong guess about their shape would be silent. `onChanged` is the
 * seam a list owner uses to invalidate its own key; without one, the card still corrects itself the
 * next time its list refetches. Legacy solves the same problem with nine event-emitter messages,
 * which `CLAUDE.md` is explicit this app does not add in anticipation.
 */
export function usePostActions(post: Post, { onChanged }: { onChanged?: () => void } = {}) {
    const { activeId } = useAuth()
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    /**
     * The pin state the card should draw, which is **not** `post.pinned` while a press is settling.
     *
     * Held here rather than in the menu because the marker it drives lives in the header — a
     * different component — and passing a setter down through two components to keep one boolean in
     * sync is how the two drift.
     */
    const [pinned, setPinned] = useState(post.pinned)

    function settled() {
        void queryClient.invalidateQueries({ queryKey: postKeys.all })
        onChanged?.()
    }

    const pin = useMutation({
        mutationFn: (next: boolean) => postApi.setPinned(post.id, next, activeId),
        onMutate: (next: boolean) => {
            setPinned(next)
            // The previous value, so the error path can put it back without re-reading the prop —
            // which may itself have changed by the time the request fails.
            return { previous: pinned }
        },
        onError: (_error, _next, context) => {
            if (context) setPinned(context.previous)
        },
        onSuccess: (updated, next) => {
            /*
             * The server's answer wins over our optimism. It is normally the same value; it is not
             * when another tab pinned something else first and this space allows only one pinned
             * post — a case no client-side guess can get right.
             */
            if (updated) setPinned(updated.pinned)
            toast.success(t(next ? 'post_pinned_toast' : 'post_unpinned_toast'))
        },
        onSettled: settled,
        meta: { showErrorToast: t('post_pin_failed') },
    })

    const replyAllowed = useMutation({
        mutationFn: (next: boolean) => postApi.setReplyAllowed(post.id, next, activeId),
        onSuccess: (_updated, next) => {
            toast.success(t(next ? 'post_replies_opened_toast' : 'post_replies_closed_toast'))
        },
        onSettled: settled,
        meta: { showErrorToast: t('post_replies_failed') },
    })

    const remove = useMutation({
        mutationFn: () => postApi.deletePost(post.id, activeId),
        onSuccess: () => toast.success(t('post_delete_success')),
        onSettled: settled,
        meta: { showErrorToast: t('post_delete_failed') },
    })

    const block = useMutation({
        /*
         * Keyed by **user** id, not channel id — `shared/lib/api/blocks-api.ts` carries the warning
         * and `postMenuVisibility` already withholds the row when `owner_id` is absent, so this
         * throw is the unreachable half of that pair rather than a case the menu can produce.
         */
        mutationFn: () => {
            const ownerId = post.channel?.owner_id
            if (!ownerId) throw new Error('post channel has no owner_id')
            return blocksApi.blockUser(ownerId)
        },
        onSuccess: () => {
            toast.success(
                t('post_block_success', { name: post.channel?.name ?? post.channel?.slug ?? '' }),
            )
            /*
             * Blocking changes what the *whole feed* may show, not one card, so it invalidates
             * everything this feature caches and hands the list owner its own signal. There is no
             * narrower key that would be correct.
             */
            settled()
        },
        meta: { showErrorToast: t('post_block_failed') },
    })

    return {
        pinned,
        pin: { run: (next: boolean) => pin.mutate(next), isPending: pin.isPending },
        replyAllowed: {
            run: (next: boolean) => replyAllowed.mutate(next),
            isPending: replyAllowed.isPending,
        },
        remove: { run: () => remove.mutate(), isPending: remove.isPending },
        block: { run: () => block.mutate(), isPending: block.isPending },
    }
}

/**
 * The shape `PostCard` hands to `PostHeader` and `PostMenu`.
 *
 * Exported as a type rather than having each consumer write `ReturnType<typeof usePostActions>`:
 * two files spelling the same inference is two places to update, and the name is what makes the
 * prop readable at the call site.
 */
export type PostActions = ReturnType<typeof usePostActions>
