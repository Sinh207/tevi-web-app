'use client'

import { useAuth } from '@features/auth'
import { grantAgeConsent, hasAgeConsent } from '@shared/lib/age-consent'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Has this reader confirmed they are over 18, **for this event**?
 *
 * ## Not `useNsfwGate`, and the difference is not cosmetic
 *
 * `features/nsfw` answers a question about a **space** — `channel.is_nsfw` *and* the account's
 * `nsfw_settings.show_sensitive`, both of which have to hold, which is why that gate has two faces
 * and offers to change a setting. This answers a question about **one broadcast**: a creator marked
 * this stream 18+, there is no account setting that overrides it, and agreeing to Friday's 18+
 * stream is not agreeing to Saturday's family one. Two different questions, two different consent
 * keys, and merging them would mean one call site passing a value that means something else.
 *
 * Both are still the same *shape* of gate, and `docs/EVENT.md` §2 records the relationship so
 * neither drifts.
 *
 * ## A guest may confirm, and their answer is **not** persisted
 *
 * This is the one place this app deliberately does not require an account: an 18+ stream reached
 * from a shared link must not turn into a sign-in wall, and legacy does not put one there either.
 * So a guest's answer lives in component state for the life of the page and nothing is written.
 *
 * Legacy *does* write it — to `` `${currentUser?.id}_age_restricted_confirmed_list` ``, which for a
 * signed-out visitor is the literal key `undefined_age_restricted_confirmed_list`: **a bucket every
 * guest on that device inherits**, so one person's confirmation silently answers for the next. Not
 * persisting is both the honest behaviour and the fix.
 *
 * ## Read in an effect, not in the initialiser
 *
 * `localStorage` does not exist on the server, so `useState(() => hasAgeConsent(...))` returns
 * `false` there and the stored value on the client's **first** render — the render that has to match
 * the server's HTML. For anyone who had already confirmed that is a hydration mismatch, and React
 * resolves it by throwing the server's markup away. This page is server-rendered, so that is not
 * hypothetical.
 *
 * The cost is a flash of the gate for someone who already agreed. That is the **safe** direction:
 * the alternative is a flash of 18+ artwork for someone who has not. Same trade, same reasoning, as
 * `useNsfwGate`.
 *
 * ## Pressing before the session is known
 *
 * `activeId` is `null` for the moment the bootstrap takes, and the gate is on screen for all of it.
 * Consent is filed per account, so a press in that window would be written under a placeholder and
 * then looked up under the real id — the reader agrees, the effect re-runs when the id arrives, and
 * the gate comes straight back. The answer is held in `pending` and written once there is an account
 * to file it under. A reader who never signs in simply keeps it in state, which is the guest case
 * above.
 */
export function useAgeGate({
    /** The event's code — the key consent is filed under. */
    code,
    /** Whether the question applies at all. `false` opens the gate without reading anything. */
    required,
}: {
    code: string
    required: boolean
}) {
    const { activeId, isBootstrapping } = useAuth()
    const [isConfirmed, setConfirmed] = useState(false)
    /** Agreed to, not yet persisted — see the note above. */
    const pending = useRef(false)

    useEffect(() => {
        if (!required || !code) return
        if (!activeId) {
            /*
             * No account to read from. Anything already confirmed in state stays confirmed — a
             * signed-in reader who signs out mid-page is not re-asked, and a guest's answer is not
             * thrown away by an unrelated re-render.
             */
            return
        }
        if (pending.current) {
            pending.current = false
            grantAgeConsent(code, activeId)
            setConfirmed(true)
            return
        }
        // Also re-reads on an account switch: consent is per account, so the answer changes with it.
        setConfirmed(hasAgeConsent(code, activeId))
    }, [code, activeId, required])

    const confirm = useCallback(() => {
        if (activeId) grantAgeConsent(code, activeId)
        else pending.current = true
        setConfirmed(true)
    }, [code, activeId])

    return {
        /** The gate is satisfied — either the question does not apply, or it has been answered. */
        isAllowed: !required || isConfirmed,
        /**
         * The session is still resolving, so a stored answer may be about to arrive.
         *
         * The caller holds the gate rather than drawing it: without this, a returning reader who had
         * already confirmed sees the wall for the length of the bootstrap. Held, they see the page's
         * skeleton — which is what they would have seen anyway.
         */
        isResolving: required && !isConfirmed && isBootstrapping,
        confirm,
    }
}
