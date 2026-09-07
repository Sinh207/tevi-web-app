'use client'

import {
    accountNsfwSettings,
    accountShowSensitive,
    useAuth,
    useRequireAuth,
    useUpdateMe,
} from '@features/auth'
import { grantNsfwConsent, hasNsfwConsent } from '@shared/lib/nsfw-consent'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Whether a viewer may see one space's sensitive content, and the two ways they can say yes.
 *
 * ## Both conditions, not either
 *
 * Legacy: `isNsfw = !showSensitive || !confirmedList.includes(slug)` — the gate opens only when the
 * account's `nsfw_settings.show_sensitive` is on **and** this space has been confirmed. This read as
 * an *or* here for a while, which let anyone who had turned filtering off in Settings into every
 * sensitive space with no age confirmation at all — the opposite of what that setting is for.
 *
 * That pairing is why the gate has **two faces**, and why they are mutually exclusive: with
 * filtering on, an age confirmation would be answered and then overruled by the setting, so the only
 * offer worth making is to turn the setting off. With it already off, the setting is not the
 * obstacle and the age question is.
 *
 * ## Read in an effect, not in the initialiser
 *
 * `localStorage` does not exist on the server, so `useState(() => hasNsfwConsent(...))` returns
 * `false` there and the stored value on the client's **first** render — the render that has to match
 * the server's HTML. For anyone who had already consented that is a hydration mismatch, and React
 * resolves it by throwing the server's markup away.
 *
 * The cost is a flash of the gate for someone who already agreed. That is the **safe** direction:
 * the alternative is a flash of the content for someone who has not.
 *
 * ## Pressing the button before the session is known
 *
 * `activeId` is `null` for the moment the bootstrap takes, and the gate is on screen for all of it.
 * Consent is filed per account, so a press in that window used to be written under a placeholder and
 * then looked up under the real id — the reader agreed, the effect re-ran when the id arrived, and
 * the gate came straight back. The answer is held in `pending` and written once there is an account
 * to file it under.
 */
export function useNsfwGate(slug: string) {
    const { currentUser, activeId } = useAuth()
    const requireAuth = useRequireAuth()
    const { update, isPending } = useUpdateMe()
    const [isConfirmed, setIsConfirmed] = useState(false)
    /** Agreed to, not yet persisted — see the note above. */
    const pending = useRef(false)

    const showsSensitive = accountShowSensitive(currentUser)

    useEffect(() => {
        if (!activeId) return
        if (pending.current) {
            pending.current = false
            grantNsfwConsent(slug, activeId)
            setIsConfirmed(true)
            return
        }
        // Also re-reads on an account switch: consent is per account, so the answer changes with it.
        setIsConfirmed(hasNsfwConsent(slug, activeId))
    }, [slug, activeId])

    const remember = useCallback(() => {
        if (activeId) grantNsfwConsent(slug, activeId)
        else pending.current = true
        setIsConfirmed(true)
    }, [slug, activeId])

    /**
     * Both actions require an account, as they do in legacy (`useNSFW` opens the login dialog for
     * each). Consent is filed per account, so there is nobody to file an anonymous answer under —
     * and the setting below is a field on a profile that does not exist yet.
     */
    const confirmAge = requireAuth(remember)

    /*
     * "Disable filtering" writes the **account** setting and records consent for **this space**, in
     * that order — both, as legacy does, because the gate needs both to open.
     *
     * `update` is optimistic with a rollback, and this does not wait for the server: if the write
     * fails, `show_sensitive` reverts, the gate reopens on this same face, and the recorded consent
     * is simply unused. Waiting would need `mutateAsync` threaded out of `useUpdateMe` to buy a
     * marginally tidier failure.
     */
    const disableFiltering = requireAuth(() => {
        update({
            // Sent whole: the endpoint replaces the object, so its other keys have to come back
            // with it. Same call the Settings screen makes.
            nsfw_settings: { ...accountNsfwSettings(currentUser), show_sensitive: true },
        })
        remember()
    })

    return {
        /** The gate is satisfied — both halves hold. */
        isAllowed: isConfirmed && showsSensitive,
        /** Which face to show: the age confirmation, or the offer to turn filtering off. */
        showsSensitive,
        confirmAge,
        disableFiltering,
        isSaving: isPending,
    }
}
