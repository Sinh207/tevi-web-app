'use client'

import { useAuth } from '@features/auth'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { transferApi, transferKeys } from '../api/transfer-api'
import type { TransferParty } from '../api/types'
import { RECEIVER_ID_MIN_LENGTH, readTeviId } from '../lib/transfer-rules'

/**
 * Who is this Tevi ID? — the one field on this form whose answer only the server has.
 *
 * ## Five states, because collapsing them is what makes a form lie
 *
 * | state | what it means | what the field shows |
 * |---|---|---|
 * | `idle` | too short to ask about, or empty | nothing |
 * | `checking` | a request is in flight, or one is about to be | a spinner |
 * | `found` | somebody owns it | a tick, and their name and face |
 * | `invalid` | nobody owns it, or it is the reader themself | "this user ID is not valid" |
 * | `error` | we could not find out | "something went wrong" |
 *
 * The two that legacy folds together are the last two, and it is the fold that matters: a 500 from the
 * auth service becomes *"This user ID is not valid. Please check and try again."*, which sends somebody
 * to re-type a perfectly good ID they read off their friend's profile. `useSlugCheck` reaches the same
 * conclusion about the same shape of field and is worth reading beside this.
 *
 * `idle` and `found` are separate for the mirror-image reason: "not known to be wrong" must not render
 * a green tick.
 *
 * ## Why this is a query and not a `setTimeout` + `fetch`
 *
 * `useSlugCheck` does it by hand because a username check is a one-shot question about a value that is
 * about to change. A Tevi ID is the opposite: the same handful of IDs get looked up again and again —
 * pressing **Retransfer** on a history row re-asks about somebody the screen already knows — so a
 * cached answer is the common case, and `useQuery` also gives the abort-on-change and
 * out-of-order-response protection that hook has to write out longhand.
 *
 * The debounce is still needed and still ours: the key is the *deferred* value, so a keystroke does not
 * mount a query per character.
 *
 * ## Self-transfer is `invalid`, deliberately using the same words
 *
 * Legacy shows the "not valid" message for your own ID too, and that is right: the reader has almost
 * certainly pasted the wrong ID, and the useful instruction is the same one — check it and try again.
 * A dedicated "you cannot send Star to yourself" would be a sentence in nine languages to tell somebody
 * something they were not trying to do.
 */

export type RecipientStatus = 'idle' | 'checking' | 'found' | 'invalid' | 'error'

/**
 * 500ms, against legacy's 1000.
 *
 * A Tevi ID is a number being copied or typed in one run, not a word being composed — the pause that
 * means "I have finished" is shorter than it is for a username, and a full second after the last digit
 * is a second of the reader looking at a spinner they have already earned the answer to.
 */
const DEBOUNCE_MS = 500

export interface RecipientLookup {
    status: RecipientStatus
    /** The account found, or `null`. Only ever set when `status` is `'found'`. */
    party: TransferParty | null
}

export function useRecipientLookup(value: string): RecipientLookup {
    const { activeId, currentUser } = useAuth()
    const trimmed = value.trim()
    const askable = trimmed.length >= RECEIVER_ID_MIN_LENGTH
    const [deferred, setDeferred] = useState('')

    useEffect(() => {
        if (!askable) {
            // Cleared immediately rather than after the delay, so a field emptied by the reader does
            // not keep a stale verdict — or fire a request for a value that is no longer there.
            setDeferred('')
            return
        }
        const timer = setTimeout(() => setDeferred(trimmed), DEBOUNCE_MS)
        return () => clearTimeout(timer)
    }, [trimmed, askable])

    const query = useQuery({
        queryKey: transferKeys.recipient(activeId, deferred),
        queryFn: ({ signal }) =>
            transferApi.getRecipient(deferred, { accountId: activeId, signal }),
        enabled: deferred.length >= RECEIVER_ID_MIN_LENGTH,
        /*
         * An account's name and face are not something this screen needs to re-ask for while it is
         * open, and the reader may well go back and forth between two IDs. Five minutes, like the
         * permission grants and for the same reason: the value moves rarely and nothing here is
         * waiting on the change.
         */
        staleTime: 5 * 60_000,
    })

    if (!askable) return { status: 'idle', party: null }
    // The debounce has not fired yet, or it has fired for an older value: either way the answer on
    // hand is not about what is in the box, and showing it would be showing the wrong verdict.
    if (deferred !== trimmed) return { status: 'checking', party: null }
    if (query.isPending || query.isFetching) return { status: 'checking', party: null }
    // A failure is not a verdict — see the table above.
    if (query.isError) return { status: 'error', party: null }

    const party = query.data ?? null
    if (!party) return { status: 'invalid', party: null }
    if (party.id === readTeviId(currentUser?.id, activeId))
        return { status: 'invalid', party: null }
    return { status: 'found', party }
}
