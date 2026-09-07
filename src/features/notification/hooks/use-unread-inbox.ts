'use client'

import { useAuth } from '@features/auth'
import { useSocketEvent } from '@features/realtime'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { notificationApi, notificationKeys } from '../api/notification-api'

/**
 * Whether this account has anything unread — the dot on the bell, in the rail and in the mobile
 * top bar.
 *
 * ## One small request, and a socket that only says "ask again"
 *
 * There is no count-only route, so the count *is* a one-row list request (`INBOX_UNREAD_PAGE`).
 * That is cheap and it is asked **once**: `staleTime` is the app's default 60s and there is no
 * refetch on focus, so the dot does not poll. What keeps it live is `inbox_change`, the user-room
 * event this feature is the first consumer of.
 *
 * The frame is used **only** as a signal. CLAUDE.md's rule — a socket event is a signal, never a
 * source — is not a stylistic preference here: the frame carries no count, and even if it did, a
 * websocket frame has no ordering guarantee against the HTTP responses beside it, so trusting one
 * can move the number backwards. Legacy reads the payload no more than this does; it just sets a
 * boolean to `true` and never learns when the last unread notification was read on another device.
 * Invalidating instead means the dot goes *out* as well as on.
 *
 * ## Why a number and not the boolean legacy keeps
 *
 * The endpoint answers `count`, so the number is already in hand — and the DS navbar has a `badge`
 * type that can carry one. This hook returns both: `hasUnread` for the dot, `count` for the day a
 * numeral is wanted. Legacy discards the count and keeps `isNewNotification`, which is why its dot
 * cannot become a number without a second endpoint.
 *
 * ## It must not run for a guest
 *
 * Every visitor carries an anonymous session, so `currentUser` being present says nothing —
 * `enabled: isAuthenticated` is what keeps a request per guest from being made to be told the
 * obvious. A guest's bell renders undotted and its press raises the login dialog, which is the
 * gate-the-action rule (`useRequireAuth`), not a gated route.
 *
 * ## A failure shows **no** dot, and that is the honest answer
 *
 * `count` falls back to 0 on error, so the bell is bare. The alternative — an error state on a
 * 20px glyph — is not something a reader can act on, and a dot that means "we could not find out"
 * is indistinguishable from one that means "you have mail". The screen behind it reports its own
 * failure properly.
 *
 * ## …which is exactly why `isKnown` exists
 *
 * `count: 0` means three different things — nothing unread, still loading, and the request failed
 * (plus a fourth: no real account, so the query never ran). That collapse is *correct* for a dot,
 * where all four outcomes are "draw nothing". It is wrong for anything that has to distinguish
 * them, and a control did: the page bar's "Mark all as read" was hidden on `!hasUnread` and
 * therefore hidden while loading, hidden after a 502, and hidden forever in a session with no
 * account. A menu row that disappears for a transport reason reads as a missing feature.
 *
 * So `isKnown` answers the transport question on its own — *did the server tell us* — and a caller
 * that needs the distinction asks for it. Same split, and the same word, as
 * `shared/lib/remote-config`: `isKnown` there is "Firebase answered", not a per-field claim.
 */
export interface UseUnreadInboxResult {
    /** Unread notifications, as the server counts them. `0` while loading and on failure. */
    count: number
    /** What the dot is bound to. */
    hasUnread: boolean
    /** The first answer has not arrived. Callers may ignore it — a bare bell is the right
     *  placeholder for "we do not know yet", and a skeleton on a 24px glyph is noise. */
    isLoading: boolean
    /**
     * The server actually answered. `false` while loading, after a failure, **and for a session
     * with no real account**, where the query never runs at all.
     *
     * This is what separates "there is nothing unread" from "we do not know", and only a caller
     * that acts differently on the two should read it — the dot does not. See the note above.
     */
    isKnown: boolean
}

export function useUnreadInbox(): UseUnreadInboxResult {
    const { activeId, isAuthenticated } = useAuth()
    const queryClient = useQueryClient()

    /** Memoised because `notificationKeys.unread` builds a new array per call, and the socket
     *  handler below closes over it. */
    const queryKey = useMemo(() => notificationKeys.unread(activeId), [activeId])

    const query = useQuery({
        queryKey,
        queryFn: ({ signal }) => notificationApi.getUnreadCount({ accountId: activeId, signal }),
        enabled: isAuthenticated,
    })

    /*
     * Subscribed unconditionally, which is safe by construction: subscriptions live outside the
     * connection (`user-room.ts`), and for a guest the room never opens — so the handler simply
     * never fires. No `isAuthenticated` branch, because a conditional hook is worse than a
     * handler that is never called.
     */
    useSocketEvent('inbox_change', () => {
        queryClient.invalidateQueries({ queryKey })
    })

    const count = query.data ?? 0
    /*
     * `isSuccess`, not `!isLoading && !isError`: a query that is **disabled** (no real account) is
     * neither loading nor errored, so the negative form would report an answer that was never
     * requested — which is the case that hid the menu row in a signed-out session.
     */
    return { count, hasUnread: count > 0, isLoading: query.isLoading, isKnown: query.isSuccess }
}
