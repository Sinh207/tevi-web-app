// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel } from '../api/types'
import type { ChannelOwnership } from '../lib/channel-flags'
import { useChannelOwnership } from './use-channel-ownership'

/**
 * The rule this hook exists for is a **race**, and a race is the one thing a comment cannot pin.
 *
 * The bug these tests were written after: `isAuthenticated` is false for *everybody* while the
 * session bootstraps, because it is derived from a `/me` that has not landed. The hook opened with
 * `if (!isAuthenticated) return 'viewer'`, so every load of a creator's own space rendered "Follow"
 * and swapped it for "Custom profile" a beat later. Nothing threw, nothing failed a type check, and
 * the doc comment above the function already claimed the opposite behaviour — which is exactly why
 * it needs a test rather than a better sentence.
 *
 * So the assertions are ordered by what they protect:
 * 1. bootstrapping outranks everything → `'unknown'`, for owner and stranger alike;
 * 2. once resolved, the cheap answers still work without a request.
 */

const auth = vi.hoisted(() => ({
    state: {
        currentUser: null as { id: string } | null,
        isAuthenticated: false,
        isBootstrapping: true,
    },
}))
const myChannel = vi.hoisted(() => ({
    state: { myChannel: null as { slug: string } | null, isLoading: false },
}))

vi.mock('@features/auth', () => ({ useAuth: () => auth.state }))
vi.mock('../providers/my-channel-provider', () => ({ useMyChannel: () => myChannel.state }))

const CHANNEL = { slug: 'ada', owner_id: 'user-1' } as Channel

function ownershipOf(channel: Channel | null = CHANNEL): ChannelOwnership {
    let result: ChannelOwnership = 'unknown'
    function Probe() {
        result = useChannelOwnership(channel)
        return null
    }
    render(<Probe />)
    return result
}

beforeEach(() => {
    auth.state = { currentUser: null, isAuthenticated: false, isBootstrapping: true }
    myChannel.state = { myChannel: null, isLoading: false }
})

describe('useChannelOwnership', () => {
    describe('while the session is bootstrapping', () => {
        it("answers 'unknown', not 'viewer' — the owner must never be shown Follow", () => {
            // The state every single load starts in: no `/me` yet, so `isAuthenticated` is false
            // even for the creator whose space this is.
            expect(ownershipOf()).toBe('unknown')
        })

        it("stays 'unknown' even once the owner's own channel is known", () => {
            // The slug already matches, so the answer *could* be 'owner' — but `currentUser` has not
            // arrived, and a hook that starts guessing here is one refactor away from guessing the
            // other way too.
            myChannel.state = { myChannel: { slug: 'ada' }, isLoading: false }
            expect(ownershipOf()).toBe('unknown')
        })
    })

    describe('once bootstrapped', () => {
        beforeEach(() => {
            auth.state = { ...auth.state, isBootstrapping: false }
        })

        it("answers 'viewer' for a logged-out visitor, with no request", () => {
            expect(ownershipOf()).toBe('viewer')
        })

        it('matches owner_id against /me synchronously', () => {
            auth.state = {
                currentUser: { id: 'user-1' },
                isAuthenticated: true,
                isBootstrapping: false,
            }
            expect(ownershipOf()).toBe('owner')
        })

        it('compares ids as strings — /me may send a number where the DTO sends text', () => {
            auth.state = {
                currentUser: { id: 1 as unknown as string },
                isAuthenticated: true,
                isBootstrapping: false,
            }
            expect(ownershipOf({ ...CHANNEL, owner_id: '1' } as Channel)).toBe('owner')
        })

        it('falls back to the slug comparison when owner_id does not match', () => {
            auth.state = {
                currentUser: { id: 'other' },
                isAuthenticated: true,
                isBootstrapping: false,
            }
            myChannel.state = { myChannel: { slug: 'ada' }, isLoading: false }
            expect(ownershipOf()).toBe('owner')
        })

        it("is 'unknown' only for a signed-in visitor whose own channel is still loading", () => {
            auth.state = {
                currentUser: { id: 'other' },
                isAuthenticated: true,
                isBootstrapping: false,
            }
            myChannel.state = { myChannel: null, isLoading: true }
            expect(ownershipOf()).toBe('unknown')
        })

        it("resolves to 'viewer' once that visitor turns out to have no channel", () => {
            auth.state = {
                currentUser: { id: 'other' },
                isAuthenticated: true,
                isBootstrapping: false,
            }
            myChannel.state = { myChannel: null, isLoading: false }
            expect(ownershipOf()).toBe('viewer')
        })
    })

    it("answers 'viewer' with no channel, at any stage — there is nothing to own", () => {
        expect(ownershipOf(null)).toBe('viewer')
    })
})
