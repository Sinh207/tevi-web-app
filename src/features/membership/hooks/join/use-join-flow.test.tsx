// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MembershipTarget } from '../../api/types'
import type { JoinOffer } from '../../lib/join-offer'
import { useJoinFlow } from './use-join-flow'

/**
 * One promise, and it is the one every future caller leans on: **`canOffer` is the whole gate**.
 *
 * Three unrelated facts make a join impossible — no tier, a tier this app cannot charge for, and a
 * reader who already holds one — and each one is answered by a different query. A surface that
 * re-derived them would eventually get one wrong and open a dialog whose only action cannot
 * complete, which is exactly what this hook exists to stop. So the composition is pinned here
 * rather than described in a comment: the button, and every paywall after it, reads one boolean.
 *
 * The write itself is `use-join-membership.test.tsx`'s subject and is not repeated.
 */

const offer = vi.hoisted(() => ({ value: null as JoinOffer | null }))
const member = vi.hoisted(() => ({ value: false }))
const packagesEnabled = vi.hoisted(() => ({ value: undefined as boolean | undefined }))

vi.mock('./use-channel-packages', () => ({
    useChannelPackages: (_slug: string, options?: { enabled?: boolean }) => {
        packagesEnabled.value = options?.enabled
        return { packages: [], offer: offer.value, isLoading: false }
    },
}))

vi.mock('./use-channel-membership', () => ({
    useChannelMembership: () => ({
        membership: member.value ? { id: 'sub-1' } : null,
        isMember: member.value,
        isLoading: false,
    }),
}))

/* The flow's own dependencies are irrelevant here — only that its shape passes through. */
vi.mock('./use-join-membership', () => ({
    useJoinMembership: ({ slug }: { slug: string }) => ({ step: 'closed', slug }),
}))

const TARGET: MembershipTarget = { slug: 'ada', name: 'Ada', id: 'ch_1' }
const STAR_OFFER: JoinOffer = {
    packageId: 'pkg_1',
    description: null,
    usd: null,
    cashPriceId: null,
    priceId: 'p_tvs',
    stars: 500,
    name: 'Gold',
}

/** Assigns the hook's return value out — the repo's `Probe` convention. */
function probe(target = TARGET, options?: { enabled?: boolean }) {
    const box: { flow: ReturnType<typeof useJoinFlow> | null } = { flow: null }
    function Probe() {
        box.flow = useJoinFlow(target, options)
        return null
    }
    render(<Probe />)
    if (!box.flow) throw new Error('probe did not render')
    return box.flow
}

describe('useJoinFlow', () => {
    beforeEach(() => {
        offer.value = null
        member.value = false
        packagesEnabled.value = undefined
    })

    it('offers nothing when the space sells no tier this app can charge for', () => {
        expect(probe().canOffer).toBe(false)
    })

    it('offers the tier when one is joinable and the reader does not hold it', () => {
        offer.value = STAR_OFFER
        const flow = probe()
        expect(flow.canOffer).toBe(true)
        expect(flow.isMember).toBe(false)
    })

    it('offers nothing to a reader who is already a member, tier or not', () => {
        offer.value = STAR_OFFER
        member.value = true
        const flow = probe()
        expect(flow.canOffer).toBe(false)
        // Kept separate from `canOffer`: a button says "Activated", a paywall shows nothing at all.
        expect(flow.isMember).toBe(true)
        expect(flow.membership).not.toBeNull()
    })

    it('passes `enabled` to the tier query only — the paywall asks nothing until it is opened', () => {
        probe(TARGET, { enabled: false })
        expect(packagesEnabled.value).toBe(false)
    })
})
