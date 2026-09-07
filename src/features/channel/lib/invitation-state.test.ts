import { describe, expect, it } from 'vitest'
import { INVITATION_WINDOW_MS, type McnInvitation } from '../api/invitation-api'
import {
    canAnswerInvitation,
    formatRemaining,
    invitationRates,
    invitationRemainingMs,
    type McnInvitationStateInput,
    mcnInvitationState,
} from './invitation-state'

const invitation = {
    organization: { id: '1', name: 'Acme' },
    created_at: null,
    mcn_revenue_rate: 30,
} as McnInvitation

const input = (over: Partial<McnInvitationStateInput> = {}): McnInvitationStateInput => ({
    isBootstrapping: false,
    isAuthenticated: true,
    token: 'tok',
    invitation,
    isError: false,
    ...over,
})

/**
 * The **precedence** is what this screen gets wrong when it gets anything wrong, and three of the
 * orderings here are states legacy cannot reach at all — see `mcnInvitationState`'s own table.
 */
describe('mcnInvitationState', () => {
    it('bootstrapping outranks everything, including a missing token', () => {
        expect(mcnInvitationState(input({ isBootstrapping: true, token: null }))).toBe(
            'bootstrapping',
        )
        expect(mcnInvitationState(input({ isBootstrapping: true, isAuthenticated: false }))).toBe(
            'bootstrapping',
        )
    })

    /**
     * Legacy sits on the skeleton forever here: `getUserInvitation` returns early on
     * `!isAuthenticated` without clearing `isLoading`, and this screen is reached from an email.
     */
    it('is signed-out for a visitor with no real account, even with a good token', () => {
        expect(mcnInvitationState(input({ isAuthenticated: false }))).toBe('signed-out')
    })

    it('outranks a missing token with signed-out — the sign-in prompt is the useful one', () => {
        expect(mcnInvitationState(input({ isAuthenticated: false, token: null }))).toBe(
            'signed-out',
        )
    })

    it('is no-token for a URL that arrived without one', () => {
        expect(mcnInvitationState(input({ token: null }))).toBe('no-token')
    })

    it('is loading while the request is out, and only then error', () => {
        expect(mcnInvitationState(input({ invitation: undefined }))).toBe('loading')
        expect(mcnInvitationState(input({ invitation: undefined, isError: true }))).toBe('error')
    })

    /**
     * `features/permission`'s rule: a failure is not an answer. An invitation already on screen must
     * not be replaced by an error wall because a background refetch 502'd — and legacy does worse
     * than that, reporting *any* failure as an expired link.
     */
    it('keeps a fetched invitation through a failed refetch', () => {
        expect(mcnInvitationState(input({ isError: true }))).toBe('ready')
    })

    it('distinguishes a dead token from a failed request', () => {
        expect(mcnInvitationState(input({ invitation: null }))).toBe('invalid')
        expect(mcnInvitationState(input({ invitation: null, isError: false }))).toBe('invalid')
    })

    it('is ready when there is an invitation', () => {
        expect(mcnInvitationState(input())).toBe('ready')
    })
})

describe('invitationRates', () => {
    it('splits the remainder', () => {
        expect(invitationRates(30)).toEqual({ creator: 70, mcn: 30 })
    })

    it('keeps a genuine 0 and a genuine 100', () => {
        expect(invitationRates(0)).toEqual({ creator: 100, mcn: 0 })
        expect(invitationRates(100)).toEqual({ creator: 0, mcn: 100 })
    })

    /**
     * The defect this function exists for. Legacy computes `parseFloat(rate) || 0`, so a payload
     * with no rate renders **Creator Rate 100% · MCN Rate 0%** — a commercial term nobody agreed,
     * printed as fact, on the screen where a creator presses Agree.
     */
    it('answers null for both halves rather than inventing 100/0', () => {
        expect(invitationRates(null)).toEqual({ creator: null, mcn: null })
        expect(invitationRates(undefined)).toEqual({ creator: null, mcn: null })
        expect(invitationRates(Number.NaN)).toEqual({ creator: null, mcn: null })
    })

    it('rejects an out-of-range rate instead of printing a negative share', () => {
        expect(invitationRates(140)).toEqual({ creator: null, mcn: null })
        expect(invitationRates(-1)).toEqual({ creator: null, mcn: null })
    })

    /** `100 - 0.1` is `99.89999999999999` in binary floating point. */
    it('rounds both halves, so neither prints a float artefact', () => {
        expect(invitationRates(0.1)).toEqual({ creator: 99.9, mcn: 0.1 })
        expect(invitationRates(47.5)).toEqual({ creator: 52.5, mcn: 47.5 })
    })
})

describe('invitationRemainingMs', () => {
    const sent = '2026-09-01T00:00:00.000Z'
    const at = (iso: string) => new Date(iso).getTime()

    it('counts down from created_at + the window', () => {
        expect(invitationRemainingMs(sent, at('2026-09-01T00:00:00.000Z'))).toBe(
            INVITATION_WINDOW_MS,
        )
        expect(invitationRemainingMs(sent, at('2026-09-02T00:00:00.000Z'))).toBe(48 * 3600_000)
    })

    it('clamps at zero rather than going negative', () => {
        expect(invitationRemainingMs(sent, at('2026-09-10T00:00:00.000Z'))).toBe(0)
    })

    /**
     * `null`, not `0` — the two mean opposite things to the caller, and legacy collapses both to
     * `00:00:00`, so an invitation whose timestamp failed to parse displays as dead next to a
     * button that still works.
     */
    it('answers null for a timestamp it cannot read', () => {
        expect(invitationRemainingMs(null, Date.now())).toBeNull()
        expect(invitationRemainingMs(undefined, Date.now())).toBeNull()
        expect(invitationRemainingMs('nonsense', Date.now())).toBeNull()
    })
})

describe('formatRemaining', () => {
    it('pads to HH:MM:SS and does not wrap hours at 24', () => {
        expect(formatRemaining(INVITATION_WINDOW_MS - 1000)).toBe('71:59:59')
        expect(formatRemaining(3661_000)).toBe('01:01:01')
        expect(formatRemaining(0)).toBe('00:00:00')
    })

    it('floors rather than rounding, so it never shows a second that has not passed', () => {
        expect(formatRemaining(1999)).toBe('00:00:01')
    })

    it('passes null through, so the caller can drop the label', () => {
        expect(formatRemaining(null)).toBeNull()
    })
})

describe('canAnswerInvitation', () => {
    it('is true only with an invitation and a token', () => {
        expect(canAnswerInvitation({ state: 'ready', token: 'tok' })).toBe(true)
        expect(canAnswerInvitation({ state: 'ready', token: null })).toBe(false)
        expect(canAnswerInvitation({ state: 'invalid', token: 'tok' })).toBe(false)
        expect(canAnswerInvitation({ state: 'loading', token: 'tok' })).toBe(false)
        expect(canAnswerInvitation({ state: 'signed-out', token: 'tok' })).toBe(false)
    })
})
