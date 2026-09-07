'use client'

import { useAuth } from '@features/auth'
import {
    addSearchRecent,
    clearSearchRecents,
    getSearchRecents,
    removeSearchRecent,
    subscribeSearchRecents,
} from '@shared/lib/search-recents'
import { useCallback, useSyncExternalStore } from 'react'

/**
 * The recent-terms list, bound to the account that is active *now*.
 *
 * ## `useSyncExternalStore`, and the bug that made it necessary
 *
 * This hook is mounted **twice** on the search screen: `useChannelSearch` calls it to *write* a
 * term when the reader commits one, and `SearchView` calls it to *render* the list. The first
 * version held the list in `useState` and mirrored `localStorage` into it — which meant two
 * independent copies of one store, and a write through one instance left the other stale. Pressing
 * Enter and then clearing the field showed a Recents list with the term you had just searched
 * missing from it.
 *
 * `useSyncExternalStore` is the fix rather than "hoist it into a provider": the store is already
 * outside React (it is `localStorage`), so the honest shape is to subscribe to it, which is exactly
 * what `shared/lib/api/token.ts` does for the account map. One value, every reader.
 *
 * The three arguments in order: `subscribeSearchRecents` (which also forwards the `storage` event,
 * so a search in another tab shows up here), a snapshot scoped to the active account, and
 * `getServerSnapshot` returning the shared empty array.
 *
 * ## Empty on the server, and that is not a hydration mismatch
 *
 * This list is *device* state, so there is nothing the server could have known — hence
 * `getServerSnapshot` is `EMPTY`. The server's HTML and the client's first paint agree; the terms
 * arrive in the commit after hydration.
 *
 * ## …which is why there is an `isReady`, and why it rides the same mechanism
 *
 * "Empty" and "not read yet" are the same value here, and a screen that alternates a **list** with
 * an **empty state** has to tell them apart: `/search`'s idle body painted the "Search creators"
 * prompt on every first paint and then swapped it for the history a returning reader actually has
 * — a whole block of content replaced one frame in, which is the flash a skeleton exists to
 * prevent.
 *
 * `isReady` is a second `useSyncExternalStore` over the *same* subscription whose snapshot is
 * simply `true` on the client and `false` on the server. That is deliberately not a
 * `useState` + `useEffect` pair: it is the identical mechanism that delivers the list itself, so
 * "the terms are here" and "we know whether there are terms" cannot arrive in different commits
 * and produce the very flash this removes. `TRUE`/`FALSE` are module constants, because
 * `useSyncExternalStore` compares snapshots by identity.
 *
 * ## Anonymous accounts have recents too
 *
 * `activeId`, not "the signed-in user's id". The app always keeps a session, so an anonymous
 * visitor has a real account id and their searches are remembered under it — which is the whole
 * point of a device-local convenience list, and is what legacy silently fails to do (its key is
 * `''` without a real user, so every write is a no-op). Those recents leave with the account:
 * anonymous accounts are purged after a real sign-in, and `forgetAccount` clears the history with
 * the rest of the account's traces.
 *
 * An account switch needs no effect and no cleanup — the snapshot is keyed on `activeId`, so the
 * incoming account's list is simply what the next render reads.
 */

/** The server's answer, and every empty one. Stable, or `useSyncExternalStore` re-renders forever. */
const EMPTY: string[] = []

/** `isReady`'s two snapshots. Constants for the same identity reason `EMPTY` is one. */
const TRUE = () => true
const FALSE = () => false

export interface UseSearchRecentsResult {
    /** Newest first. Empty on the server, and for a visitor with no account id yet. */
    recents: string[]
    /**
     * The device's list has been read — i.e. `recents` is an answer rather than a placeholder.
     *
     * `false` on the server and on the hydrating render, `true` from the commit after. A screen
     * whose idle state is *either* this list or an empty state must wait for it, or it paints the
     * empty state at every reader and corrects itself a frame later. See the note above.
     */
    isReady: boolean
    /** Record a term the reader **committed** to — see `useChannelSearch` for what that means. */
    remember: (term: string) => void
    forget: (term: string) => void
    clear: () => void
}

export function useSearchRecents(): UseSearchRecentsResult {
    const { activeId } = useAuth()

    /*
     * Subscribed rather than derived from `recents`: an empty array is a legitimate answer, so the
     * list itself cannot say whether it has been read.
     */
    const isReady = useSyncExternalStore(subscribeSearchRecents, TRUE, FALSE)

    const recents = useSyncExternalStore(
        subscribeSearchRecents,
        /*
         * `''` rather than a branch: `getSearchRecents` answers the shared `EMPTY` for a falsy id,
         * so "no account yet" needs no special case here and the snapshot stays stable.
         */
        () => getSearchRecents(activeId ?? ''),
        () => EMPTY,
    )

    /*
     * The mutators write and let the store notify — they hold no state of their own, which is what
     * makes two mounted copies of this hook agree. Their return values are ignored here for the
     * same reason.
     */
    const remember = useCallback(
        (term: string) => {
            if (activeId) addSearchRecent(term, activeId)
        },
        [activeId],
    )

    const forget = useCallback(
        (term: string) => {
            if (activeId) removeSearchRecent(term, activeId)
        },
        [activeId],
    )

    const clear = useCallback(() => {
        if (activeId) clearSearchRecents(activeId)
    }, [activeId])

    return { recents, isReady, remember, forget, clear }
}
