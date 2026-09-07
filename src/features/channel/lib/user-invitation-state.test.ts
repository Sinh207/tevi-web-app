import { describe, expect, it } from 'vitest'
import {
    canAnswerUserInvitation,
    type McnUserInvitationStateInput,
    mcnUserInvitationState,
} from './user-invitation-state'

/**
 * The precedence chain, pinned. Three of these seven answers are ones legacy cannot give at all —
 * a signed-out visitor and a visitor with no token both sit on its skeleton forever, and its `catch`
 * reports a 500 as an expired link — so they are the cases worth a test rather than the happy path.
 */
const base: McnUserInvitationStateInput = {
    isBootstrapping: false,
    isAuthenticated: true,
    token: 'tok',
    invitation: { organization: null, created_at: null },
    isError: false,
}

const state = (over: Partial<McnUserInvitationStateInput> = {}) =>
    mcnUserInvitationState({ ...base, ...over })

describe('mcnUserInvitationState', () => {
    it('reads a live invitation as ready', () => {
        expect(state()).toBe('ready')
    })

    /** Bootstrapping outranks everything — a returning manager looks exactly like a guest. */
    it('holds while the session is still resolving, even with a token in hand', () => {
        expect(state({ isBootstrapping: true, isAuthenticated: false })).toBe('bootstrapping')
        expect(state({ isBootstrapping: true, invitation: undefined, isError: true })).toBe(
            'bootstrapping',
        )
    })

    /**
     * The state legacy has no branch for, on the one screen reached from an email — the entry point
     * most likely to be opened in a browser with no session.
     */
    it('asks a guest to sign in rather than showing them anything about the invitation', () => {
        expect(state({ isAuthenticated: false })).toBe('signed-out')
        // Even with nothing fetched and an error in flight: the session question is answered first.
        expect(state({ isAuthenticated: false, invitation: undefined, isError: true })).toBe(
            'signed-out',
        )
    })

    it('separates a missing token from a dead one', () => {
        expect(state({ token: null })).toBe('no-token')
        expect(state({ token: '' })).toBe('no-token')
        expect(state({ invitation: null })).toBe('invalid')
    })

    it('is loading only while there is a token and no answer yet', () => {
        expect(state({ invitation: undefined })).toBe('loading')
    })

    /**
     * **A failure is not a denial**, and it is not an expiry either. Legacy's `catch` writes the same
     * `null` a dead token produces, so a 500 tells somebody holding a live link that it has expired,
     * with nothing to press.
     */
    it('tells a failed request apart from a dead token', () => {
        expect(state({ invitation: undefined, isError: true })).toBe('error')
        expect(state({ invitation: null, isError: true })).toBe('invalid')
    })

    /**
     * `features/permission`'s rule: an invitation already in hand outranks a failed **refetch**.
     * Nobody should lose the letter they are reading because a poll 502'd.
     */
    it('keeps a screen it already has when a refetch fails', () => {
        expect(state({ isError: true })).toBe('ready')
    })
})

describe('canAnswerUserInvitation', () => {
    it('offers the two answers only on a live invitation', () => {
        expect(canAnswerUserInvitation({ state: 'ready', token: 'tok' })).toBe(true)
        for (const s of [
            'bootstrapping',
            'signed-out',
            'no-token',
            'loading',
            'error',
            'invalid',
        ]) {
            expect(
                canAnswerUserInvitation({
                    state: s as ReturnType<typeof mcnUserInvitationState>,
                    token: 'tok',
                }),
            ).toBe(false)
        }
    })

    /** `ready` without a token is not reachable through the state function, and is refused anyway. */
    it('refuses without a token', () => {
        expect(canAnswerUserInvitation({ state: 'ready', token: null })).toBe(false)
        expect(canAnswerUserInvitation({ state: 'ready', token: '' })).toBe(false)
    })
})
