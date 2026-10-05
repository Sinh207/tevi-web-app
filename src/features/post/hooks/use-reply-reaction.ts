'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { balanceKeys, useRequireStars } from '@features/balance'
import { useTranslation } from '@shared/i18n/use-translation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { postApi } from '../api/post-api'
import type { Reply } from '../api/reply-types'

/**
 * Reacting to a **reply**, and taking it back.
 *
 * ## Why this is not `usePostReaction` with an argument
 *
 * Three things differ, and each of them is the kind that fails silently if folded:
 *
 * - **The endpoints.** `v1/posts/replies/{id}/reaction/`, not `v1/posts/{id}/reaction/`. A reply's
 *   id addressed as a post's is a 404 — which is what the detail page was doing while it drew
 *   replies as post cards.
 * - **The price comes from somewhere else.** A post is priced by its own `channel`; a reply is
 *   priced by **`post_channel`** — the space the parent post lives in — and the reply's own
 *   `owner_channel` has nothing to do with it. Reading the wrong one charges the reader for
 *   reacting on the wrong space's terms.
 * - **There is no `is_owner`.** `replyCost` exempts a post's author from paying to interact with
 *   their own; here the exemption has to be computed by the caller and passed in.
 *
 * Everything else is deliberately the same as `usePostReaction`, down to the reasoning, and that
 * file is where it is written out in full: **optimistic** because the star animates on press, the
 * **charge lands first** or the reaction does not happen, the ref rather than `isPending` so a
 * double tap cannot become a double charge, and no refund if the reaction fails after the charge.
 */
export function useReplyReaction(reply: Reply, { cost = null }: { cost?: number | null } = {}) {
    const { activeId } = useAuth()
    const requireAuth = useRequireAuth()
    const requireStars = useRequireStars()
    const queryClient = useQueryClient()
    const { t } = useTranslation()

    const serverReacted = Boolean(reply.user_reaction?.type)
    const [reacted, setReacted] = useState(serverReacted)
    const [count, setCount] = useState(reply.reaction_count)

    /** Re-seeded on the reply's identity as well as its values — see `usePostReaction`. */
    // biome-ignore lint/correctness/useExhaustiveDependencies: re-seeding is keyed on the reply's identity, not on the local state it overwrites.
    useEffect(() => {
        setReacted(serverReacted)
        setCount(reply.reaction_count)
    }, [reply.id, serverReacted, reply.reaction_count])

    /** Synchronous, because `isPending` only flips after a render. A second press is a second charge. */
    const inFlight = useRef(false)

    const mutation = useMutation({
        mutationFn: async ({
            next,
            accountId,
            charge,
        }: {
            next: boolean
            accountId: string | null
            charge: { channelId: string; amount: number } | null
        }) => {
            if (charge) {
                await postApi.chargeInteraction(
                    { product: 'react', channelId: charge.channelId, cost: charge.amount },
                    accountId,
                )
            }
            return next
                ? postApi.reactToReply(reply.id, accountId)
                : postApi.unreactFromReply(reply.id, accountId)
        },
        onSettled: (_data, _error, variables) => {
            inFlight.current = false
            if (variables?.charge) {
                void queryClient.invalidateQueries({ queryKey: balanceKeys.all })
            }
        },
        onError: (_error, variables) => {
            setReacted(!variables.next)
            setCount(current => Math.max(0, current + (variables.next ? -1 : 1)))
        },
        meta: { showErrorToast: t('post_react_failed') },
    })

    const priced = cost !== null && cost > 0
    /**
     * Who is credited — **the parent post's space**, not the reply's author.
     *
     * Paid interaction is the space's setting. Crediting `owner_channel` would pay whoever happened
     * to write the reply, out of a reader's balance, on a rule that space never set.
     */
    const chargeable = priced ? (reply.post_channel?.id ?? null) : null

    function press() {
        if (inFlight.current) return
        const next = !reacted
        // Priced with nobody to credit: doing the free half is the hole this exists to close.
        if (next && priced && !chargeable) return

        inFlight.current = true
        setReacted(next)
        setCount(current => Math.max(0, current + (next ? 1 : -1)))
        mutation.mutate({
            next,
            accountId: activeId,
            charge: next && chargeable ? { channelId: chargeable, amount: cost ?? 0 } : null,
        })
    }

    /** Un-reacting is never gated on the balance — it spends nothing. */
    const toggle = chargeable && !reacted ? requireStars(cost ?? 0, press) : requireAuth(press)

    return { reacted, count, toggle, isPending: mutation.isPending }
}
