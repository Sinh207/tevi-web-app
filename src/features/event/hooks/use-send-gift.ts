'use client'

import { useAuth } from '@features/auth'
import { balanceKeys, useRequireStars } from '@features/balance'
import { useMyChannel } from '@features/channel'
import { ApiError } from '@shared/lib/api/errors'
import { requestLiveRoom } from '@shared/lib/socket/live-room-client'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { GIFT_INSUFFICIENT_BALANCE_CODE, giftApi } from '../api/gift-api'
import type { GiftPackage } from '../api/gift-types'
import type { LivePublisher } from '../api/live-types'
import type { EventDetail } from '../api/types'

/**
 * **Sending one gift** — the write, and the announcement that has to follow it.
 *
 * ```
 * press → enough Star?  ──no──→ the purchase sheet (useRequireStars)
 *            │yes
 *            ▼
 *   POST billy v1/gifting/send/        the charge
 *            │
 *            ▼
 *   post_message /give_gift            the room is told
 *            │
 *            ▼
 *   invalidate balanceKeys             the shell's figure catches up
 * ```
 *
 * ## ⚠ The client announces its own gift, and that is the protocol rather than a choice
 *
 * The room does not emit a gift frame of its own. Legacy sends the `/give_gift` command **from the
 * sender's browser** after the charge succeeds, which is how every other screen in the broadcast —
 * the chat sentence, the float banner, the leaderboard — learns that anything happened. Two things
 * follow, and both are stated here rather than discovered later:
 *
 * - **a client that skips the emit charges the reader and tells nobody.** The Star has moved, the
 *   creator has been paid, and the room shows nothing. That is why the emit is not fire-and-forget
 *   here: it is awaited, and a failure is reported to the sender (legacy discards the promise);
 * - **a client could announce a gift it never paid for.** Nothing in this flow is a guarantee to
 *   anybody else in the room — the transcript is decoration, the money is billy's record. Worth
 *   knowing before anybody builds a leaderboard out of chat frames. **B110** asks whether the
 *   server should emit instead.
 *
 * The sender's own banner comes from the **echo**: the room broadcasts `post_message` back to
 * everybody including the sender, and `useGiftBursts` draws whatever arrives. Nothing is inserted
 * locally, so the sender sees exactly what the room sees — and if the echo ever stops, every
 * client's view stays consistent rather than only the sender's being right.
 */

export interface SendGiftState {
    /**
     * A gift is in flight, by package id — so the tile that was pressed can say so and the rest of
     * the tray stays live. A single boolean would freeze the whole strip on every press.
     */
    pendingId: number | null
    /**
     * The last failure, as a translation key, or `null`.
     *
     * A key rather than the API's sentence: `docs/API_ERRORS.md`'s rule hands the backend the
     * wording on a failed write, and this is the documented shape of the exception — the one refusal
     * that carries meaning (`422 EC0001`, "not enough Star") is not shown as a sentence at all, it
     * **opens the purchase sheet**. Anything else is a generic failure, because billy's other codes
     * on this path are about the package rather than about the reader.
     */
    errorKey: string | null
    /**
     * Send `pkg` to `recipient`, or to the host when none is chosen.
     *
     * Composes `useRequireStars`, so a guest gets the sign-in dialog and a short balance gets the
     * top-up sheet — neither leaves the broadcast, which is the whole reason that hook exists.
     */
    send: (pkg: GiftPackage, recipient?: LivePublisher | null) => void
    /** Is there anybody to send to at all. False hides the tray rather than offering a dead press. */
    canSend: boolean
}

export function useSendGift({
    event,
    isConnected,
}: {
    event: EventDetail
    /** The live room's wire. A gift announced into a closed socket is a charge nobody sees. */
    isConnected: boolean
}): SendGiftState {
    const { currentUser, activeId } = useAuth()
    const { myChannel } = useMyChannel()
    const queryClient = useQueryClient()
    const requireStars = useRequireStars()

    const [pendingId, setPendingId] = useState<number | null>(null)
    const [errorKey, setErrorKey] = useState<string | null>(null)

    const code = event.code
    const host = event.host
    const channelId = event.channel?.id ?? null

    const run = useCallback(
        async (pkg: GiftPackage, recipient?: LivePublisher | null) => {
            /*
             * The recipient, and the fallback is legacy's: `recipient?.id || event?.host`. On a solo
             * broadcast nobody picks anything, so the host id is the entire answer — and without it
             * there is nobody to pay, which `canSend` already refuses. Re-checked here because the
             * two are separated by a press.
             */
            const recipientId = recipient?.id ?? host
            if (!code || !recipientId || pkg.id === null) return

            setPendingId(pkg.id)
            setErrorKey(null)
            try {
                await giftApi.send({
                    packageId: pkg.id,
                    recipientId,
                    eventCode: code,
                    channelId,
                    accountId: activeId,
                })
            } catch (error) {
                /*
                 * ⚠ **`422 EC0001` is "not enough Star", and it is not an error message.**
                 *
                 * The balance was checked before the press, so reaching this means it moved
                 * underneath the reader — another tab, the sustained fee, a gift already in flight.
                 * Printing "insufficient balance" would be a dead end; the sheet is what every other
                 * short balance in this app opens, and `requireStars` is what opens it. Re-running
                 * the guard is enough: the balance is now known to be short, so it diverts.
                 *
                 * Legacy raises a toast carrying billy's own sentence and stops there.
                 */
                if (isInsufficientBalance(error)) {
                    requireStars(pkg.price, () => {
                        // Topped up. The reader presses the gift again — a charge must not be
                        // fired on their behalf out of a payment flow they may have abandoned.
                    })()
                } else {
                    setErrorKey('event_gift_send_failed')
                }
                setPendingId(null)
                return
            }

            /*
             * **Tell the room.** See the header: no server frame announces a gift, so this emit is
             * the only thing that makes the gift visible to anybody, the sender included.
             *
             * The frame is built field by field from the package and the sender's own identity —
             * never spread from a tile — for the reason `features/mini-app` states about rebuilding
             * a body: a schema that grows a field should not start broadcasting it.
             */
            const product = pkg.product
            try {
                await requestLiveRoom('post_message', {
                    type: 'cmd',
                    msg: '/give_gift',
                    /*
                     * ⚠ **The package's own `quantity`, not a press counter.** A "10 roses" package
                     * is one request and one frame carrying `10`; `gift-burst.ts` is what turns two
                     * presses into `x20`. Sent as a **string**, which is legacy's spelling and what
                     * `parseChatLine` coerces back.
                     */
                    gift_amount: String(pkg.quantity),
                    gift_data: {
                        id: String(pkg.id),
                        name: product?.name ?? null,
                        price: pkg.price,
                        thumb: product?.images?.thumb ?? null,
                        anim_background: product?.images?.anim_background ?? null,
                        animation: product?.images?.animation ?? null,
                        /*
                         * Who it went to, **by name**, because the frame is what every other
                         * reader's chat sentence is built from and none of them can resolve an id.
                         * The space's own name is the fallback rather than a blank — a sentence
                         * ending in "to" says nothing.
                         */
                        recipient_name: recipient?.name ?? event.channel?.name ?? null,
                    },
                    user: senderFrame({ currentUser, myChannel, host }),
                })
            } catch {
                /*
                 * The charge landed and the announcement did not. The reader is the only person who
                 * can be told, and they must be: their Star is gone and the room looks as though
                 * nothing happened. Legacy fires this without awaiting, so nobody learns either.
                 */
                setErrorKey('event_gift_announce_failed')
            }

            /*
             * The balance the shell prints. A **signal, not a figure**: the send response carries
             * the new balances and is deliberately discarded — `features/balance` owns that number
             * and re-reads it, for the same reason a socket frame never writes one into the cache.
             */
            void queryClient.invalidateQueries({ queryKey: balanceKeys.all })
            setPendingId(null)
        },
        [
            code,
            host,
            channelId,
            activeId,
            currentUser,
            myChannel,
            event.channel?.name,
            queryClient,
            requireStars,
        ],
    )

    const send = useCallback(
        (pkg: GiftPackage, recipient?: LivePublisher | null) => {
            if (pendingId !== null) return
            requireStars(pkg.price, () => {
                void run(pkg, recipient)
            })()
        },
        [pendingId, requireStars, run],
    )

    return {
        pendingId,
        errorKey,
        /*
         * Three conditions, and each removes a press that could only fail: a code to send against,
         * somebody to send to, and a wire to announce it on. The wire is the one worth stating —
         * legacy disables its tiles on `!isSocketConnected` too, with a blur, because a gift sent
         * into a closed socket is a charge the room never hears about.
         */
        canSend: Boolean(code) && Boolean(host) && isConnected,
        send,
    }
}

/** billy's `422` with `EC0001` — see `giftApi.send`. */
function isInsufficientBalance(error: unknown): boolean {
    if (!(error instanceof ApiError) || error.status !== 422) return false
    const body = error.data as { code?: unknown } | null
    return body?.code === GIFT_INSUFFICIENT_BALANCE_CODE
}

/**
 * **Who the room is told sent it.**
 *
 * Legacy's own fallback chain, which is a space-first one: the reader appears in a live room as
 * their *space*, not as their account, so `myChannel` wins every field and the account is what is
 * left when they have no space. `channel_slug` is what the chat row links to, so a reader without a
 * space is announced without a link rather than with a broken one.
 *
 * `is_host` is the badge: the sender is the host when the event's `host` is their own account.
 */
function senderFrame({
    currentUser,
    myChannel,
    host,
}: {
    currentUser: { id: string | number; [key: string]: unknown } | null
    myChannel:
        | {
              id?: string | null
              name?: string | null
              slug?: string
              images?: { thumb?: string | null }
              verified_tick_badge?: { image: string | null } | null
          }
        | null
        | undefined
    host: string | null
}) {
    const accountId = currentUser?.id != null ? String(currentUser.id) : null
    return {
        is_host: Boolean(host && accountId && host === accountId),
        id: accountId ?? myChannel?.id ?? null,
        name: myChannel?.name ?? (currentUser?.display_name as string | undefined) ?? null,
        avatar:
            myChannel?.images?.thumb ??
            (currentUser?.avatar as { thumb?: string } | undefined)?.thumb ??
            null,
        verified_tick_badge: myChannel?.verified_tick_badge ?? null,
        channel_slug: myChannel?.slug ?? '',
    }
}
