'use client'

import { hasStarPrice } from '../lib/donation-amount'
import { useDirectDonate } from './use-direct-donate'

/**
 * Whether a Support block will actually render for this space.
 *
 * The one question a **host** surface asks, and the reason it is a hook rather than a boolean the
 * caller derives: the answer has two parts — the creator takes donations at all, and the offer can
 * be completed with Star — and only the second is a property of what this repo has shipped rather
 * than of the creator. `features/channel`'s About tab needs the answer to decide whether its "nothing
 * here yet" state is honest; it must not have to learn *why* a cash-only offer is not offerable,
 * because that reason disappears the day the payment feature lands.
 *
 * Shares its query with every other reader of the same slug, so asking costs no request.
 *
 * ## Two values, because "no" and "not yet" are different answers
 *
 * The boolean alone is `false` while the request is in flight, and a host surface that treats that as
 * "this creator takes no donations" prints its empty state and then replaces it with the Support card
 * a moment later. `isLoading` is what lets the caller wait instead of guessing — see the About tab,
 * which is the surface that showed the flash.
 */
export function useDonationOffered(slug: string, { enabled = true }: { enabled?: boolean } = {}) {
    const { offer, isLoading } = useDirectDonate(slug, { enabled })
    return {
        /** The Support block will render. `false` while loading — check `isLoading` first. */
        offered: Boolean(offer && hasStarPrice(offer)),
        /** The offer has not answered yet, so neither has this hook. */
        isLoading,
    }
}
