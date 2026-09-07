import { describe, expect, it } from 'vitest'
import {
    canRequestLeave,
    type McnPartnershipInput,
    mcnPartnershipState,
} from './mcn-partnership-state'

const base: McnPartnershipInput = {
    isBootstrapping: false,
    isAuthenticated: true,
    mcn: { is_owner: false },
    isMyChannelError: false,
}

describe('mcnPartnershipState', () => {
    it('reports the bootstrap before anything else — a returning creator is not a guest yet', () => {
        expect(
            mcnPartnershipState({
                ...base,
                isBootstrapping: true,
                isAuthenticated: false,
                mcn: undefined,
            }),
        ).toBe('bootstrapping')
    })

    it('asks a guest to sign in', () => {
        expect(mcnPartnershipState({ ...base, isAuthenticated: false, mcn: undefined })).toBe(
            'signed-out',
        )
    })

    /**
     * The regression this file exists for. Legacy renders "No MCN Partnership" here, because its
     * one condition is `!mcn` and an unanswered query is falsy — so a managed creator reads that
     * they are in no network for as long as the round trip takes.
     */
    it('loads rather than claiming there is no network, while my-channel is unanswered', () => {
        expect(mcnPartnershipState({ ...base, mcn: undefined })).toBe('loading')
    })

    it('errors only when the failure left nothing to show', () => {
        expect(mcnPartnershipState({ ...base, mcn: undefined, isMyChannelError: true })).toBe(
            'error',
        )
    })

    it('keeps the terms on screen when a refetch fails but a body is cached', () => {
        expect(mcnPartnershipState({ ...base, isMyChannelError: true })).toBe('ready')
    })

    it('is empty for an account in no network, and for the operator of one', () => {
        expect(mcnPartnershipState({ ...base, mcn: null })).toBe('none')
        expect(mcnPartnershipState({ ...base, mcn: { is_owner: true } })).toBe('none')
    })
})

describe('canRequestLeave', () => {
    it('offers the action only once the departure query has answered', () => {
        expect(canRequestLeave({ state: 'ready', leave: undefined })).toBe(false)
        expect(canRequestLeave({ state: 'ready', leave: null })).toBe(true)
    })

    it('withdraws it while a departure stands — you cannot leave twice', () => {
        expect(
            canRequestLeave({
                state: 'ready',
                leave: { expected_departure_at: '2026-01-01T00:00:00.000Z' },
            }),
        ).toBe(false)
    })

    /**
     * The control **survives its own press**. It opens a dialog, and a dialog hands focus back to
     * its trigger when it closes — so a version of this that also tested "is a request in flight"
     * would unmount the trigger at exactly the moment focus returns to it, dropping a keyboard
     * reader to the top of the page. The caller marks it `aria-disabled` instead.
     */
    it('stays offered while a request is in flight — the caller disables, it does not unmount', () => {
        expect(canRequestLeave({ state: 'ready', leave: null })).toBe(true)
    })

    it('never offers it off the ready screen', () => {
        for (const state of ['bootstrapping', 'signed-out', 'loading', 'error', 'none'] as const) {
            expect(canRequestLeave({ state, leave: null })).toBe(false)
        }
    })
})
