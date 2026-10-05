'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { balanceKeys, useRequireStars } from '@features/balance'
import { useTranslation } from '@shared/i18n/use-translation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { postApi } from '../api/post-api'
import type { Post } from '../api/types'
import { hasReacted } from '../lib/post-access'

/**
 * Reacting to a post, and taking it back — including paying for it where the channel charges.
 *
 * ## Optimistic, and the animation is the reason it has to be
 *
 * The star plays a half-second burst on press. Waiting for the round trip before flipping the state
 * would either delay the burst until after the finger has left — which reads as a dropped tap — or
 * play it on a state that has not changed yet. So the flip is immediate and the request follows;
 * a failure puts the state **and the count** back, and the caller plays the animation in reverse,
 * which is exactly what legacy's `playSegments([60, 0])` in the failure branch is for.
 *
 * ## The Star charge is a **separate request that must land first**
 *
 * On a channel with paid interaction on, legacy's `handleReaction` calls `handlePurchase(...)`
 * before `apiAddReaction` and **returns early if it fails** — the reaction never happens. That
 * ordering is the whole control: reversed, or run in parallel, a reader reacts for free on a space
 * whose creator is selling reactions, and nothing on either side surfaces it. The card drew the
 * price chip long before this hook charged anything, which made the row *dishonest* rather than
 * merely incomplete.
 *
 * Three consequences worth stating, because each is a decision:
 *
 * - **Only the react direction charges.** `unreact` is free, as in legacy. Charging to take
 *   something back would make the second press cost more than the first.
 * - **The optimism covers both requests.** The star flips on press and rolls back if *either* the
 *   charge or the reaction fails, so a charge that fails looks identical to a reaction that fails.
 *   That is correct here — from the reader's side both mean "it did not happen" — and it is why the
 *   rollback lives in one place rather than in each mutation.
 * - **A failed reaction after a successful charge does not refund.** Nothing client-side can, and
 *   pretending otherwise would be worse. The balance is invalidated either way so the figure the
 *   reader sees is the server's. **B107** asks whether the backend reverses it.
 *
 * `useRequireStars` is what stands in front of the press: it composes `useRequireAuth`, so a guest
 * is asked to sign in, and a reader who cannot afford it is offered Star **without leaving the
 * feed** rather than being charged a round trip to be told no. The 422 branch below is the gap
 * between that check and the charge, not a replacement for it.
 *
 * ## Local state rather than cache surgery, for now — and why that is not a shortcut
 *
 * A post reaches this hook as a **prop**, from whichever list is rendering it, and those lists are
 * not this feature's: a channel's posts are `features/channel`'s infinite query today, home's and
 * search's will be their own. There is no single cache entry to rewrite, and inventing one here
 * would mean guessing the shape of three queries that do not exist yet.
 *
 * What that costs is honest and bounded: the flip survives as long as the card is mounted, and a
 * refetch of the owning list replaces it with the server's answer. The prop is still the source of
 * truth on arrival — `useEffect` re-seeds from it — so a list that *does* refetch corrects this hook
 * rather than being overridden by it.
 *
 * The **balance** is the exception and is invalidated properly: it is `features/balance`'s single
 * query, this feature knows its key, and a Star figure that lags is the one number a reader checks
 * against their own arithmetic.
 *
 * ## The account is pinned at the press, not read at the response
 *
 * `activeId` is captured when the mutation runs. The switcher is two taps from every feed, and a
 * reaction — or a charge — that resolves after a switch must still belong to the account that made
 * it.
 */
export function usePostReaction(post: Post, { cost = null }: { cost?: number | null } = {}) {
    const { activeId } = useAuth()
    const requireAuth = useRequireAuth()
    const requireStars = useRequireStars()
    const queryClient = useQueryClient()
    const { t } = useTranslation()

    const serverReacted = hasReacted(post)
    const [reacted, setReacted] = useState(serverReacted)
    const [count, setCount] = useState(post.reaction_count)

    /**
     * Re-seed when the post changes identity or the server's answer moves. Keyed on the id as well
     * as the value: without it, scrolling a virtualised list that reuses a component would carry
     * one post's reaction onto the next.
     */
    // biome-ignore lint/correctness/useExhaustiveDependencies: re-seeding is keyed on the post's identity, not on the local state it overwrites.
    useEffect(() => {
        setReacted(serverReacted)
        setCount(post.reaction_count)
    }, [post.id, serverReacted, post.reaction_count])

    /**
     * A **ref**, not `mutation.isPending`.
     *
     * `isPending` only becomes true after a render, so two presses in the same tick both read it as
     * false and both fire — which a test caught and a fast double-tap would too. The ref flips
     * synchronously, so the second press is refused before it can add a second row to the tally.
     * It matters more now than it did: a double press on a paid channel is a **double charge**.
     */
    const inFlight = useRef(false)

    const mutation = useMutation({
        mutationFn: async ({
            next,
            accountId,
            charge,
        }: {
            next: boolean
            accountId: string | null
            /** The Star to take before reacting, or `null` on a free channel or an un-react. */
            charge: { channelId: string; amount: number } | null
        }) => {
            if (charge) {
                await postApi.chargeInteraction(
                    { product: 'react', channelId: charge.channelId, cost: charge.amount },
                    accountId,
                )
            }
            return next ? postApi.react(post.id, accountId) : postApi.unreact(post.id, accountId)
        },
        onSettled: (_data, _error, variables) => {
            inFlight.current = false
            /*
             * Only when Star actually moved. An un-react and a free react change no balance, and an
             * invalidation on every reaction in a feed is a request per tap for a figure that did
             * not move.
             */
            if (variables?.charge) {
                void queryClient.invalidateQueries({ queryKey: balanceKeys.all })
            }
        },
        onError: (_error, variables) => {
            // Put both halves back — a count that stayed up is the visible half of a failed write.
            setReacted(!variables.next)
            setCount(current => Math.max(0, current + (variables.next ? -1 : 1)))
        },
        /**
         * The API's own sentence wins on a 4xx and ours is the fallback (`docs/API_ERRORS.md`).
         *
         * A toast at all is new here: the count rolling back is visible but says nothing about
         * *why*, and on a paid channel the two reasons a reader most needs distinguished — "you
         * cannot afford it" and "it failed" — look identical without one. `422 EC0001` is the
         * exception and never reaches this: `useRequireStars` has already offered a top-up.
         */
        meta: { showErrorToast: t('post_react_failed') },
    })

    /**
     * The channel to credit, or `null` when this press costs nothing.
     *
     * Both halves are required: a cost with no channel id cannot name a beneficiary, so it is not a
     * charge that can be made — and silently reacting for free would be the exact failure this hook
     * exists to close, so the control is better off doing nothing than doing the free half.
     */
    const priced = cost !== null && cost > 0
    const chargeable = priced ? (post.channel?.id ?? null) : null

    function press() {
        if (inFlight.current) return
        const next = !reacted
        /*
         * Priced, but with nobody to credit — a payload with `paid_interaction_cost` and no
         * `channel.id`. The request cannot be made, and making the *free* half instead is the exact
         * hole this hook exists to close: the reader would react without paying on a space that
         * charges. So the press does nothing.
         *
         * Only in the react direction. Taking a reaction back costs nothing, so a missing channel id
         * is irrelevant to it and refusing there would strand somebody on a reaction they undid.
         */

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

    /*
     * Which guard wraps the press is decided per render, and **taking a reaction back is never
     * guarded by the balance** — the reader is spending nothing, so asking them to top up first
     * would strand somebody with an empty wallet on a reaction they no longer want.
     *
     * Both hooks are called unconditionally above; only the wrapper chosen here varies.
     */
    const toggle = chargeable && !reacted ? requireStars(cost ?? 0, press) : requireAuth(press)

    return {
        reacted,
        count,
        toggle,
        isPending: mutation.isPending,
        /** `true` on the press that failed, so the caller can play the animation back. */
        didFail: mutation.isError,
    }
}
