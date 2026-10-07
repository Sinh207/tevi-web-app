// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BecomeAMemberButton } from './become-a-member-button'

/**
 * `onJoined` is the space page's cue to re-read the posts a membership unlocks. It must fire on the
 * **change** to "member" — whichever payment produced it — and not on any of the `false → true`s
 * that are not a purchase: the first answer arriving, or switching onto an account that already
 * holds the membership.
 */
const state = vi.hoisted(() => ({ activeId: 'acct-1', isMember: false, isMemberKnown: false }))

vi.mock('@features/auth', () => ({ useAuth: () => ({ activeId: state.activeId }) }))
vi.mock('@shared/hooks/use-url-intent', () => ({
    useUrlIntent: () => ({ intent: null, consume: () => false }),
}))
vi.mock('@shared/i18n/use-translation', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('../../hooks/join/use-join-flow', () => ({
    useJoinFlow: () => ({
        offer: { packageId: 'p', priceId: 'x', stars: 10 },
        isMember: state.isMember,
        isMemberKnown: state.isMemberKnown,
        membership: state.isMember ? { id: 'm' } : null,
        canOffer: !state.isMember,
        open: () => {},
    }),
}))
vi.mock('../holdings/membership-detail-dialog', () => ({ MembershipDetailDialog: () => null }))
vi.mock('./become-a-member-dialogs', () => ({ BecomeAMemberDialogs: () => null }))

const target = { slug: 'ada', name: 'Ada', id: 'ch-1', avatarUrl: null }

function setup() {
    const onJoined = vi.fn()
    const view = render(<BecomeAMemberButton target={target} onJoined={onJoined} />)
    const rerender = (next: Partial<typeof state>) => {
        Object.assign(state, next)
        view.rerender(<BecomeAMemberButton target={target} onJoined={onJoined} />)
    }
    return { onJoined, rerender }
}

beforeEach(() => {
    Object.assign(state, { activeId: 'acct-1', isMember: false, isMemberKnown: false })
})

describe('BecomeAMemberButton onJoined', () => {
    it('fires when a known "not a member" becomes "member"', () => {
        const { onJoined, rerender } = setup()
        rerender({ isMemberKnown: true })
        rerender({ isMember: true })
        expect(onJoined).toHaveBeenCalledTimes(1)
    })

    it('does not fire when the first answer is already "member"', () => {
        const { onJoined, rerender } = setup()
        rerender({ isMemberKnown: true, isMember: true })
        expect(onJoined).not.toHaveBeenCalled()
    })

    it('does not fire on switching to an account that already holds it', () => {
        const { onJoined, rerender } = setup()
        rerender({ isMemberKnown: true })
        rerender({ activeId: 'acct-2', isMember: true })
        expect(onJoined).not.toHaveBeenCalled()
    })
})
