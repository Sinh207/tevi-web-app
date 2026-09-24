'use client'

import { useAuth } from '@features/auth'
import { useBalance, useRequireStars } from '@features/balance'
import { LiveRoomError } from '@shared/lib/socket/live-room'
import { requestLiveRoom } from '@shared/lib/socket/live-room-client'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { liveAnalyticsApi, liveAnalyticsKeys } from '../api/analytics-api'
import type { EventDetail } from '../api/types'
import { LIVE_CHAT_FEE, unlockApi } from '../api/unlock-api'
import {
    appendChatLine,
    type LiveChatLine,
    type LiveChatUser,
    type LivePinnedMessage,
    type LiveTopStar,
    liveChatUserSchema,
    parseChatHistory,
    parseChatLine,
    parsePinnedMessage,
    parseTopStars,
} from '../lib/live-message'
import type { LiveRoomState } from './use-live-room'

/**
 * **The transcript, the head count, and sending a line.**
 *
 * Sits on `useLiveRoom` rather than opening anything itself — one room per screen, and the screen
 * already has it.
 *
 * ## The history is asked for on every connect, not once
 *
 * Same reason `join_event` is re-emitted (see `live-room.ts`): a reconnect is a new membership,
 * and whatever was said while the wire was down is not in this client's list. Legacy asks once on
 * mount, so a reader whose wifi blinked has a permanent hole in the conversation with no way to
 * notice.
 *
 * Re-asking replaces rather than appends, which is what stops the reconnect from duplicating
 * everything already on screen.
 *
 * ## The list is capped
 *
 * A busy broadcast produces thousands of lines an hour, and each is a React element with an
 * avatar. `MAX_LINES` is what keeps a three-hour stream from turning the tab into a memory leak;
 * legacy has no cap at all.
 */

/**
 * How many lines are kept.
 *
 * Generous enough that scrolling back has somewhere to go, small enough that a long broadcast is
 * bounded. The chat scrolls, so nobody reads past a few screens of it anyway.
 */
export const MAX_LINES = 300

/** How long an arrival toast stays up. Legacy's `NOTIFICATION_DURATION`. */
const ARRIVAL_MS = 3_000

/**
 * How many arrivals may wait their turn.
 *
 * Legacy queues them without a bound, which is right until a broadcast opens its doors: five
 * hundred people walking in becomes twenty-five minutes of toasts announcing readers who left
 * long before their turn came. Past this, the newest are kept and the backlog is dropped — an
 * arrival is only worth showing while it is still news.
 */
const MAX_ARRIVAL_QUEUE = 3

/** The room's refusal code for "you may not post here" — legacy's `res.err_code === 403`. */
const CHAT_FORBIDDEN = 403

/** How long the "you have been muted" notice stays up. Legacy's own ten seconds. */
const MUTED_MS = 10_000

export interface LiveChatState {
    lines: LiveChatLine[]
    /** Concurrent viewers, or `null` before the first frame — never `0`, which is a real number. */
    ccu: number | null
    /** The reader may type. False for a guest, a blocked reader, or a wire that is down. */
    canSend: boolean
    /**
     * The wire is up.
     *
     * Separate from `canSend` because the composer has to *say* which of the two it is: legacy's
     * first placeholder is `Connecting...`, and collapsing it into the general refusal leaves a
     * disabled field inviting a message it cannot take.
     */
    isConnected: boolean
    /** A message is in flight. */
    isSending: boolean
    /** The host blocked this reader from the chat. */
    isBlocked: boolean
    /**
     * Somebody who has just walked in, for **three seconds**, then `null`.
     *
     * Not a transcript line. Legacy queues these and shows one at a time for
     * `NOTIFICATION_DURATION = 3000` — appending them instead leaves a busy room's chat as a wall
     * of "X has entered" with the conversation pushed off the top, which is what this did first.
     */
    arrival: LiveChatUser | null
    /** The gift leaderboard, best first. Empty until a `top_stars` frame lands. */
    topStars: LiveTopStar[]
    /**
     * No `top_stars` frame has arrived **yet** — which is not the same as an empty board.
     *
     * The distinction is the whole reason this exists: a room nobody has given anything in shows
     * "support the creator with a gift", and a room whose first frame is still in flight shows
     * skeleton rows. Collapsing them draws the empty state for a second on every broadcast.
     */
    isLoadingTopStars: boolean
    /**
     * Where the reader sits on the board, or `-1`.
     *
     * Resolved here rather than in the column: matching the reader against the board needs the
     * active account, and a view has no business reaching for auth to draw a row.
     */
    topStarsSelfIndex: number
    /** The host's pinned message, or `null`. Survives for as long as it stays pinned. */
    pinned: LivePinnedMessage | null
    /** The reader dismissed the pinned message for this session. */
    dismissPinned: () => void
    /**
     * The host has just muted this reader — shown for ten seconds, then gone.
     *
     * Separate from `isBlocked`, which is the lasting state that disables the box. Without the
     * notice the composer simply stops working with nothing to say why, which is what this
     * shipped as.
     */
    justMuted: boolean
    /** Chat is switched off for this broadcast — `allow_chat` is false. */
    isChatOff: boolean
    /** Sending failed, as a translation key. `null` once anything else happens. */
    errorKey: string | null
    /**
     * When a paid-chat line was last **charged** (epoch ms), or `null`.
     *
     * A signal for `usePremiumNudge`, which is legacy's `subscribePremium` opening five seconds
     * after a paid message (`sideBar/actions`). A timestamp rather than a flag so two charges in a
     * row are two changes — a boolean would stay `true` and the second would schedule nothing.
     */
    chargedAt: number | null
    send: (text: string) => Promise<void>
}

export function useLiveChat({
    event,
    room,
    enabled = true,
}: {
    event: EventDetail
    room: LiveRoomState
    /**
     * Off unless something is actually playing — the same gate the room is on.
     *
     * The leaderboard's HTTP read is the one part of this hook that does not wait for the socket,
     * so it needs its own gate: legacy asks for it once `playback` has landed, and a reader looking
     * at a refusal has no board to be shown.
     */
    enabled?: boolean
}): LiveChatState {
    const { isAuthenticated, activeId } = useAuth()
    const { star, isKnown } = useBalance()

    const [lines, setLines] = useState<LiveChatLine[]>([])
    const [ccu, setCcu] = useState<number | null>(null)
    const [isBlocked, setIsBlocked] = useState(false)
    const [arrival, setArrival] = useState<LiveChatUser | null>(null)
    const [topStars, setTopStars] = useState<LiveTopStar[]>([])
    const [hasTopStars, setHasTopStars] = useState(false)
    const [pinned, setPinned] = useState<LivePinnedMessage | null>(null)
    const [justMuted, setJustMuted] = useState(false)
    const mutedTimer = useRef<number | null>(null)
    const arrivalTimer = useRef<number | null>(null)
    /** Arrivals waiting their turn — see `showNextArrival`. */
    const arrivalQueue = useRef<LiveChatUser[]>([])
    const [isSending, setIsSending] = useState(false)
    const [errorKey, setErrorKey] = useState<string | null>(null)
    const [chargedAt, setChargedAt] = useState<number | null>(null)

    const code = event.code
    const { isConnected, subscribe } = room

    /**
     * ⚠ **Arrivals are shown one at a time, in order** — legacy's `Attendance` queue.
     *
     * This replaced whichever arrival was on screen with the newest, which in a room anybody is
     * actually joining means only the *last* person to walk in is ever announced: every earlier
     * toast is replaced before its three seconds are up. The queue is what makes the notice mean
     * what it says.
     *
     * Self-rescheduling rather than an effect over a state array: the timer *is* the state
     * machine, and an effect would restart the countdown every time the queue changed.
     */
    const showNextArrival = useCallback(() => {
        const next = arrivalQueue.current.shift()
        if (!next) {
            arrivalTimer.current = null
            setArrival(null)
            return
        }
        setArrival(next)
        arrivalTimer.current = window.setTimeout(showNextArrival, ARRIVAL_MS)
    }, [])

    /*
     * `push` keeps the list bounded and folds a burst of identical gifts into one line — see
     * `appendChatLine`. A ref-free `setLines` updater so it never closes over a stale list.
     */
    const push = useCallback((line: LiveChatLine) => {
        setLines(prev => {
            const next = appendChatLine(prev, line)
            return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next
        })
    }, [])

    /*
     * The generation of the current history load. A reconnect that lands while an earlier
     * `get_message_history` is still in flight must not have the older answer overwrite it — the
     * reader would silently lose everything said since.
     */
    const historyGeneration = useRef(0)

    useEffect(() => {
        if (!isConnected || !code) return

        const generation = ++historyGeneration.current
        let cancelled = false

        requestLiveRoom('get_message_history')
            .then(payload => {
                if (cancelled || generation !== historyGeneration.current) return
                // Replaces rather than appends: a reconnect would otherwise duplicate everything
                // already on screen.
                setLines(parseChatHistory(payload).slice(-MAX_LINES))
            })
            .catch(() => {
                /*
                 * A refused or timed-out history is **not** an empty chat. Leaving whatever is
                 * already there and letting live frames accumulate is the honest degradation —
                 * legacy's `if (err_code === 0)` with no `else` blanks it instead, permanently.
                 */
            })

        return () => {
            cancelled = true
        }
    }, [isConnected, code])

    /*
     * **The leaderboard at the moment of entry**, over HTTP — the socket keeps it current from there.
     *
     * ⚠ This is what the board was missing. It was built on the `top_stars` frame alone, and a room
     * nobody has gifted in never pushes one, so the column sat on skeleton rows for the whole
     * broadcast. A three-second grace window was added to end the wait; it ended the *symptom*, and
     * this read — legacy's `getTopStars`, fired once playback lands — is the cause it was covering.
     *
     * A frame outranks it the moment one arrives: the socket is the fresher of the two, and it is
     * the one that moves while the reader watches. `staleTime: 0` because a re-entry is a new room.
     */
    const topStarsQuery = useQuery({
        queryKey: liveAnalyticsKeys.topStars(code ?? ''),
        queryFn: ({ signal }) => liveAnalyticsApi.getTopStars({ code: code as string, signal }),
        enabled: enabled && isAuthenticated && Boolean(code),
        staleTime: 0,
        refetchOnWindowFocus: false,
    })
    const board = hasTopStars ? topStars : (topStarsQuery.data ?? [])

    /*
     * The pinned message, asked for on every connect for the same reason the history is: a
     * reconnect is a new membership, and the pin may have changed while the wire was down.
     */
    useEffect(() => {
        if (!isConnected || !code) return
        let cancelled = false
        requestLiveRoom('get_pinned_message')
            .then(payload => {
                if (!cancelled) setPinned(parsePinnedMessage(payload))
            })
            .catch(() => {
                // No pin, or the room refused. Either way there is nothing to show, and the
                // previous pin — if any — is no longer trustworthy.
                if (!cancelled) setPinned(null)
            })
        return () => {
            cancelled = true
        }
    }, [isConnected, code])

    useEffect(() => {
        if (!isConnected) return

        const offs = [
            /*
             * The host pinned or unpinned something. A **null** frame is the unpin and has to be
             * honoured — legacy treats it as one too, which is the one place its `if (message)`
             * guard has the right else.
             */
            subscribe('pinned_message', payload => setPinned(parsePinnedMessage(payload))),

            subscribe('msg', payload => {
                const line = parseChatLine(payload)
                if (line) push(line)
            }),

            /*
             * ⚠ Somebody walked in — a **toast**, not a line, and only on `join`.
             *
             * The channel carries leaves as well as joins, and legacy filters on
             * `message.action === 'join'`. Without that filter every departure also announced
             * itself as an arrival, which is half of why this read as a wall of repeats.
             */
            subscribe('attendance', payload => {
                const frame = payload as { action?: unknown; user?: unknown } | null
                if (frame?.action !== 'join') return
                const parsed = liveChatUserSchema.safeParse(frame.user)
                if (!parsed.success) return

                arrivalQueue.current.push(parsed.data)
                // Keep the newest, drop the backlog — see `MAX_ARRIVAL_QUEUE`.
                if (arrivalQueue.current.length > MAX_ARRIVAL_QUEUE) {
                    arrivalQueue.current = arrivalQueue.current.slice(-MAX_ARRIVAL_QUEUE)
                }
                // Nothing on screen means nothing is driving the queue, so start it.
                if (arrivalTimer.current === null) showNextArrival()
            }),

            subscribe('ccu', payload => {
                const value = (payload as { ccu?: unknown } | null)?.ccu
                // Only a real number moves it. A malformed frame must not blank a figure that
                // was correct a second ago.
                if (typeof value === 'number' && Number.isFinite(value)) setCcu(value)
            }),

            /*
             * The gift leaderboard. An **empty** frame is honoured, unlike legacy's
             * `if (message?.data?.length)` with no else — which leaves a stale board on screen
             * for the rest of the broadcast once the list is ever emptied.
             */
            subscribe('top_stars', payload => {
                setHasTopStars(true)
                setTopStars(parseTopStars(payload))
            }),

            subscribe('block_chat', () => {
                setIsBlocked(true)
                // Ten seconds of *why*, then the box just stays disabled. Legacy's
                // `MutedMessage` does the same; without it the composer dies silently.
                if (mutedTimer.current !== null) window.clearTimeout(mutedTimer.current)
                setJustMuted(true)
                mutedTimer.current = window.setTimeout(() => setJustMuted(false), MUTED_MS)
            }),
            subscribe('unblock_chat', () => {
                setIsBlocked(false)
                setJustMuted(false)
            }),
        ]

        return () => {
            for (const off of offs) off()
        }
    }, [isConnected, subscribe, push, showNextArrival])

    /**
     * ⚠ **Paid chat is billed by this client, after the message has posted.**
     *
     * That ordering is legacy's, not a choice made here — `post_message` succeeds and the charge
     * follows — and `unlockApi.purchaseChatMessage` carries the note. What is different is that
     * the charge is **awaited** and a failure is reported: legacy fires it and ignores the
     * result, so a reader whose purchase failed sees their message and never learns they were not
     * charged, and neither does the creator who was not paid.
     *
     * The balance is checked **before** posting, which is the only part of this the client can
     * get right on its own: refusing a message the reader cannot pay for is better than posting
     * it and failing to bill.
     */
    /*
     * The reader dismissing the pin only hides it here — the host's pin is still up for
     * everybody else, and a later `pinned_message` frame brings it back. Legacy behaves the
     * same: its close button is local.
     */
    const dismissPinned = useCallback(() => setPinned(null), [])

    /** Chat switched off for the whole broadcast — see `allow_chat` on the event schema. */
    const isChatOff = !event.allow_chat

    const isPaidChat = event.paid_chat
    const canAfford = !isPaidChat || (isKnown && star >= LIVE_CHAT_FEE)
    const canSend = isAuthenticated && isConnected && !isBlocked && !isSending && !isChatOff

    /*
     * ⚠ **Not enough Star opens the purchase sheet, it does not print a sentence.**
     *
     * This shipped setting an `errorKey` and stopping — a dead end: the reader is told they
     * cannot afford a message and given nothing to do about it. `useRequireStars` is the app's
     * existing answer (it composes `useRequireAuth` and raises
     * `payment:star-purchase-requested`), so paid chat now behaves like every other Star spend
     * in the app rather than inventing a worse one. Legacy opens its own `OutOfStar` dialog at
     * the same point.
     */
    const requireStars = useRequireStars()

    const send = useCallback(
        async (text: string) => {
            const body = text.trim()
            if (!body || !code || !canSend) return

            if (isPaidChat && !canAfford) {
                /*
                 * ⚠ **The trailing `()` is load-bearing.** `useRequireStars` follows
                 * `useRequireAuth`'s shape — it *returns* a handler rather than acting — so
                 * building one and dropping it does nothing at all: a reader in a paid chat with
                 * no Star pressed send and got silence, no sheet and no message. That is what
                 * shipped, and no test caught it because the assertion was on the call's
                 * arguments. `use-unlock-event.ts` has the same shape spelled correctly.
                 */
                requireStars(LIVE_CHAT_FEE, () => {
                    // Topped up. The reader presses send again rather than having the message
                    // fired on their behalf from inside a payment flow they may have abandoned.
                })()
                return
            }

            setIsSending(true)
            setErrorKey(null)
            try {
                await requestLiveRoom('post_message', { type: 'msg', msg: body })

                if (isPaidChat) {
                    try {
                        await unlockApi.purchaseChatMessage({
                            eventCode: code,
                            channelId: event.channel?.id ?? null,
                            accountId: activeId,
                        })
                        setChargedAt(Date.now())
                    } catch {
                        // The message is already public — see the note above. All this can do is
                        // say so rather than leave both sides believing a Star moved.
                        setErrorKey('event_studio_chat_charge_failed')
                    }
                }
            } catch (error) {
                /*
                 * ⚠ **A refused post is how a mute is usually learned.**
                 *
                 * `block_chat` only arrives if the reader is in the room when the host presses it;
                 * somebody muted before they joined, or while the wire was down, hears nothing.
                 * Legacy reads `err_code === 403` off the ack for exactly this and disables its
                 * box. Without it the composer keeps inviting messages the room will refuse, one
                 * generic failure at a time.
                 */
                if (error instanceof LiveRoomError && error.code === CHAT_FORBIDDEN) {
                    setIsBlocked(true)
                    setErrorKey(null)
                } else {
                    setErrorKey('event_studio_chat_send_failed')
                }
            } finally {
                setIsSending(false)
            }
        },
        [code, canSend, canAfford, isPaidChat, event.channel?.id, activeId, requireStars],
    )

    /* Cleared on unmount, so leaving inside three seconds is not a write to a dead tree. */
    useEffect(
        () => () => {
            if (arrivalTimer.current !== null) window.clearTimeout(arrivalTimer.current)
            arrivalTimer.current = null
            arrivalQueue.current = []
            if (mutedTimer.current !== null) window.clearTimeout(mutedTimer.current)
        },
        [],
    )

    return {
        lines,
        ccu,
        canSend: canSend && canAfford,
        isConnected,
        isSending,
        isBlocked,
        arrival,
        topStars: board,
        /*
         * Loading only while the entry read is genuinely in flight. A read that failed, or one the
         * gate never started, is not "loading": it falls through to the empty state that invites
         * the first gift, which is what legacy draws when its board is empty.
         */
        isLoadingTopStars: !hasTopStars && topStarsQuery.isLoading,
        topStarsSelfIndex: activeId
            ? board.findIndex(
                  row => row.user?.id != null && String(row.user.id) === String(activeId),
              )
            : -1,
        pinned,
        dismissPinned,
        justMuted,
        isChatOff,
        errorKey,
        chargedAt,
        send,
    }
}
