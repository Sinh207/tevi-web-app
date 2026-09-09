'use client'

import { MONETIZATION_MEMBERSHIP_PATH, MONETIZATION_PATH } from '@features/monetization/routes'
import { useUrlIntent } from '@shared/hooks/use-url-intent'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { CUSTOM_PROFILE_PATH } from '../lib/routes'
import { type ChannelAction, channelBasePath, parseChannelIntent } from '../routes'

/**
 * **A creator who follows their own deep link is sent to the screen that manages it.**
 *
 * `/@ada/direct-donation` says "support Ada"; opened by Ada it can only mean "take me to my
 * donation settings", and there is no version of the donate dialog that makes sense for the person
 * being donated to. Legacy has no answer at all here: its `?action=` handlers live on the viewer's
 * controls, which the owner never renders, so the parameter sat in the URL and nothing happened —
 * a dead end reachable from any link a creator shares and then taps themselves.
 *
 * ## Where it is called from is the whole gate
 *
 * `ChannelOwnerActions`, and nowhere else — the same reasoning `use-auto-open-mini-app.ts` sets out
 * for the mirror-image hook on the viewer's row. That component renders only when
 * `useChannelOwnership` has resolved to `'owner'` **and** the space's actions are offered at all, so
 * a suspended space, a blocked account, a sensitive space that has not been agreed to, and the beat
 * before ownership is known each withhold this redirect for free. Re-deriving those conditions here
 * would be a second copy of a rule that is already hard to get right, and the two would drift.
 *
 * It also settles the two cases a broader placement would get wrong: a **guest** is never redirected
 * (they are not the owner, so this never mounts for them, and a page load must not raise a sign-in
 * dialog), and a **second account** signed in beside the creator's sees the viewer's row and the
 * ordinary dialog.
 *
 * ## `replace`, not `push`
 *
 * The space must not become a step in the history. With `push`, back from `/monetization` lands on
 * `/@ada/direct-donation`, which redirects to `/monetization` again — a loop rebuilt out of history
 * entries. `replace` leaves whatever they came from as the back target.
 */

/**
 * ⚠ `direct_donation` lands on the **hub**, not on a donation screen.
 *
 * `/monetization/donation` does not exist yet — `features/monetization/routes.ts` states the rule
 * that a method's constant lands with its screen and not before, so there is nothing to point at.
 * The hub is the honest answer: it is one tap from where they were going, and it is not a 404. When
 * that screen ships, this line moves with it.
 */
const OWNER_DESTINATIONS: Record<ChannelAction, string> = {
    direct_donation: MONETIZATION_PATH,
    become_a_member: MONETIZATION_MEMBERSHIP_PATH,
    /*
     * Legacy's own drawer emits `/@{slug}?action=custom_profile`, so this is the one intent that was
     * *only* ever a query — and until now the only one with no listener anywhere in this app.
     */
    custom_profile: CUSTOM_PROFILE_PATH,
}

export function useOwnerDeepLink() {
    const router = useRouter()
    const { intent, consume } = useUrlIntent(parseChannelIntent, channelBasePath)

    useEffect(() => {
        if (!intent) return
        // `consume` before navigating: it answers `true` once, so a re-fired effect cannot push a
        // second navigation, and the URL is cleaned in case the navigation is interrupted.
        if (!consume()) return
        router.replace(OWNER_DESTINATIONS[intent])
    }, [intent, consume, router])
}
