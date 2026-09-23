'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { postApi, postKeys } from '../api/post-api'
import type { Reply } from '../api/reply-types'

/**
 * Removing a reply — the author's own, or the post owner's moderation.
 *
 * ## The row is **not** removed locally, and that is the deliberate half
 *
 * `deletePost`'s note explains the post case: the backend keeps the row and flips `deleted`, so a
 * caller that spliced the card out of its list would hide a tombstone the product means to show. A
 * reply carries the same `deleted` flag, but whether this endpoint behaves the same way is
 * **unmeasured** — so the safest thing is the thing that is correct either way: invalidate and let
 * the server's next answer decide. If the row comes back flagged, `ReplyRow` draws its tombstone; if
 * it comes back missing, it is gone. Neither outcome needs a guess here. **B109**.
 *
 * ## The account is pinned, and the write is not retried
 *
 * Both for the reasons `post-api.ts` states once: a delete that resolves after an account switch
 * must still be the one the reader made, and a replayed `DELETE` on an id that is already gone is a
 * 404 dressed up as a failure.
 */
export function useDeleteReply(reply: Reply, { onDeleted }: { onDeleted?: () => void } = {}) {
    const { activeId } = useAuth()
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    const mutation = useMutation({
        mutationFn: (accountId: string | null) => postApi.deleteReply(reply.id, accountId),
        onSuccess: () => {
            /*
             * The whole feature's prefix: the reply list loses a row **and** the parent post's
             * `reply_count` — which is what the heading prints — goes down. Two queries, one
             * invalidation, neither of them guessed at.
             */
            void queryClient.invalidateQueries({ queryKey: postKeys.all })
            onDeleted?.()
        },
        /** The API's own sentence wins on a 4xx; ours is the fallback (`docs/API_ERRORS.md`). */
        meta: { showErrorToast: t('reply_delete_failed') },
    })

    return {
        run: () => mutation.mutate(activeId),
        isPending: mutation.isPending,
    }
}
