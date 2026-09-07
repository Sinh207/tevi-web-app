'use client'

import type { MembershipTarget } from '../../api/types'
import { useChannelMembership } from './use-channel-membership'
import { useChannelPackages } from './use-channel-packages'
import { type JoinMembershipFlow, useJoinMembership } from './use-join-membership'

/**
 * Everything a surface needs to sell a membership, from one target and nothing else.
 *
 * The three join hooks are individually narrow on purpose — the tiers a space offers, whether this
 * account already holds one, and the write — and a surface that wants to offer the flow needs all
 * three wired the same way every time. `BecomeAMemberButton` did that wiring inline, which was fine
 * while the space page was the only caller. It is not: a locked post, a live room and a direct
 * message all sell the same tier (legacy wires it by hand in five places, and each one drifts).
 *
 * So this is the **headless** half of the button: same composition, no markup, no opinion about what
 * the trigger looks like. A caller renders its own control, then mounts `<BecomeAMemberDialogs/>`
 * with the returned flow.
 *
 * ```tsx
 * const join = useJoinFlow(target)
 * if (!join.canOffer) return null
 * return (
 *     <>
 *         <button onClick={join.open}>…</button>
 *         <BecomeAMemberDialogs flow={join} target={target} />
 *     </>
 * )
 * ```
 *
 * ## `canOffer` is the one gate every caller shares
 *
 * Three things make a join impossible, and none of them is an error: the space sells no tier, every
 * tier it sells is cash-only (`lib/join-offer.ts`, and `docs/PAYMENT.md` §8 pass 4 is where that
 * changes), or the reader already holds one. Each caller would otherwise re-derive it, and a surface
 * that got it half-right would offer a dialog whose only action cannot complete.
 *
 * `isMember` stays separate from it because a *button* has something to say about it — "Activated
 * membership" — while a paywall does not: a member is not shown the lock at all.
 *
 * ## `enabled` exists for the paywall, not for the button
 *
 * A locked post asks about tiers only once the reader tries to unlock it; the space page asks on
 * sight, because the action row has to know whether to render at all. So the packages query takes
 * the flag and the membership query does not — the latter is already gated on a real account.
 */
export function useJoinFlow(
    target: MembershipTarget,
    { enabled = true }: { enabled?: boolean } = {},
): JoinMembershipFlow & {
    /** The tier can be bought by this reader, right now, with Stars. The gate every caller shares. */
    canOffer: boolean
    /** Holds an **active** membership to this space — `undefined` id and anonymous both read false. */
    isMember: boolean
    /** The membership itself, so an activated state can name the tier. `null` when not a member. */
    membership: ReturnType<typeof useChannelMembership>['membership']
} {
    const { offer } = useChannelPackages(target.slug, { enabled })
    const { isMember, membership } = useChannelMembership(target.id)
    const flow = useJoinMembership({ slug: target.slug, channelId: target.id, offer })

    return {
        ...flow,
        canOffer: Boolean(offer) && !isMember,
        isMember,
        membership,
    }
}
