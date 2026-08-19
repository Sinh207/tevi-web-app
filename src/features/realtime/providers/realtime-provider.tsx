'use client'

import { useAuth } from '@features/auth'
import { performRefresh } from '@shared/lib/api/client'
import { getAccount } from '@shared/lib/api/token'
import {
    configureUserRoom,
    connectUserRoom,
    disconnectUserRoom,
} from '@shared/lib/socket/user-room-client'
import { useEffect, useRef } from 'react'

/**
 * Decides **when** the realtime user room is open. It renders nothing and holds no state.
 *
 * ## Only for a real account — and that is the whole gate
 *
 * `isAuthenticated` is already `id && !anonymous` (`auth-provider.tsx`), so it *is* "a real user";
 * writing `&& !isAnonymous` beside it would imply otherwise and mislead the next reader — the same
 * note `BalanceProvider` and `MyChannelProvider` carry.
 *
 * This matters more here than on a query. The app keeps an anonymous session for **every** visitor, so
 * without the gate every anonymous visit would open a websocket, hold it for the length of the visit,
 * and present a guest token to a gateway that has nothing to say about a guest. The two events the
 * room carries — a balance and a Premium state — do not exist for an account that has neither.
 *
 * So: a guest opens no socket, and `socket.io-client` is never even downloaded (the import lives
 * behind `connect`).
 *
 * ## Pinned to the account, and re-pinned on a switch
 *
 * The effect keys on `activeId`, so switching accounts closes the old wire before opening the new one.
 * The room pins the id on the instance too, so an event already in flight cannot be delivered against
 * the account that replaced it.
 *
 * ## An auth failure refreshes once, then stops
 *
 * The gateway refusing the credential is not a reason to end the session — legacy answers it by
 * revoking the tokens, which signs the user out over a socket error. Here it is one attempt to refresh
 * through the API layer's own single-flight (`performRefresh`, cross-tab locked, per account) and one
 * reconnect. If that fails the room stays closed and the app carries on without realtime: every
 * consumer of this is an *optimisation* over a query that already refetches on its own.
 *
 * `refreshedFor` is what makes it *once* — a retry loop against a genuinely dead credential would
 * burn a refresh token on every attempt, and rotating refresh tokens are how that ends a session for
 * real.
 *
 * ## Something has to try again after socket.io gives up
 *
 * socket.io retries ten times over about a minute and then stops for good. That is the right budget
 * for a flaky connection and the wrong one for a **suspended machine**: a laptop closed for an hour
 * comes back to a socket that will never reconnect, with nothing on screen to say so, for the rest of
 * the tab's life. The two moments worth retrying at are the two that mean "this device is back" —
 * coming online, and the tab becoming visible. `connect` is idempotent while the socket is alive, so
 * these cost nothing when the room is already healthy.
 *
 * This is only a recovery path, not the thing keeping the app correct: every consumer of the room is
 * an optimisation over a query that refetches on its own.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, activeId } = useAuth()

    /** The account whose credential has already been refreshed for this socket. */
    const refreshedFor = useRef<string | null>(null)

    useEffect(() => {
        if (!isAuthenticated || !activeId) {
            disconnectUserRoom()
            refreshedFor.current = null
            return
        }

        let cancelled = false

        configureUserRoom({
            /*
             * Synchronous by design: socket.io calls this on every connection attempt, so the room
             * gets whatever the API layer last stored — including a refresh it performed for an
             * ordinary request. Reading the account by id rather than "the active one" keeps a switch
             * mid-reconnect from presenting the wrong bearer.
             */
            getToken: () => getAccount(activeId)?.access_token ?? null,
            onAuthError: () => {
                if (cancelled) return
                if (refreshedFor.current === activeId) return
                refreshedFor.current = activeId
                performRefresh(activeId)
                    .then(() => {
                        if (!cancelled) connectUserRoom(activeId)
                    })
                    .catch(() => {
                        /*
                         * Swallowed on purpose. A dead refresh token is the API layer's business — it
                         * will surface on the next request as a 401 and go through
                         * `handleDeadAccount`, which drops the account properly. Reporting it from
                         * here would either duplicate that or race it.
                         */
                    })
            },
        })

        connectUserRoom(activeId)

        /*
         * `connect` is idempotent for the account already connected, so this is a no-op unless the
         * room has actually given up — which is the only case it exists for.
         */
        const reconnect = () => {
            if (cancelled) return
            if (document.visibilityState === 'hidden') return
            connectUserRoom(activeId)
        }

        window.addEventListener('online', reconnect)
        document.addEventListener('visibilitychange', reconnect)

        return () => {
            cancelled = true
            window.removeEventListener('online', reconnect)
            document.removeEventListener('visibilitychange', reconnect)
            disconnectUserRoom()
        }
    }, [isAuthenticated, activeId])

    return children
}
