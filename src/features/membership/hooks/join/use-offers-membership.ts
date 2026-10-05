'use client'

import { useChannelPackages } from './use-channel-packages'

/**
 * Whether a space offers any membership tier at all — `null` while that is not known yet.
 *
 * The one question `features/message`'s settings dialog asks: "members only" is offered only to a
 * creator who has members to restrict to, as legacy's `subscriptionPackages.length > 0`. A boolean
 * rather than the tiers, so no other feature comes to depend on the package DTO.
 */
export function useOffersMembership(slug: string | null): boolean | null {
    const { packages, isLoading } = useChannelPackages(slug ?? '', { enabled: Boolean(slug) })
    if (!slug || isLoading) return null
    return packages.length > 0
}
