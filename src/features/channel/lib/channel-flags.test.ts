import { describe, expect, it } from 'vitest'
import { normalizeChannel } from '../api/types'
import {
    type ChannelOwnership,
    channelVisibility,
    isTerminalVisibility,
    showsChannelTabs,
} from './channel-flags'

/** A public, unremarkable channel. Each test perturbs one thing. */
function channel(overrides: Record<string, unknown> = {}) {
    const parsed = normalizeChannel({
        id: 1,
        owner_id: 9,
        slug: 'ada',
        name: 'Ada',
        privacy: 'public',
        ...overrides,
    })
    if (!parsed) throw new Error('fixture failed to parse')
    return parsed
}

const visibility = (
    overrides: Record<string, unknown> = {},
    ownership: ChannelOwnership = 'viewer',
) => channelVisibility({ channel: channel(overrides), ownership })

describe('channelVisibility — precedence', () => {
    it('renders a public channel normally', () => {
        expect(visibility()).toEqual({ kind: 'normal' })
    })

    /** A suspended creator does not get their space back by visiting their own URL. */
    it('suspension beats everything, including ownership', () => {
        expect(visibility({ is_suspended: true }, 'owner')).toEqual({ kind: 'suspended' })
        expect(
            visibility({ is_suspended: true, privacy: 'unpublished', is_nsfw: true }, 'owner'),
        ).toEqual({ kind: 'suspended' })
        expect(visibility({ is_suspended: true, blocked_user: true })).toEqual({
            kind: 'suspended',
        })
    })

    it('shows the owner their own space, with a banner when unpublished', () => {
        expect(visibility({}, 'owner')).toEqual({ kind: 'normal' })
        expect(visibility({ privacy: 'unpublished' }, 'owner')).toEqual({
            kind: 'owner-unpublished',
        })
        // Protected and NSFW are walls for strangers, not for the owner.
        expect(visibility({ privacy: 'protected' }, 'owner')).toEqual({ kind: 'normal' })
        expect(visibility({ is_nsfw: true }, 'owner')).toEqual({ kind: 'normal' })
    })

    /** "They blocked you" is the one the visitor cannot act on, so it must win. */
    it('prefers blocked-by over blocking when both are set', () => {
        expect(visibility({ blocked_user: true, blocking_channel: true })).toEqual({
            kind: 'blocked-by',
        })
        expect(visibility({ blocking_channel: true })).toEqual({ kind: 'blocking' })
    })

    it('walls an unpublished space from a stranger, ahead of protected', () => {
        expect(visibility({ privacy: 'unpublished' })).toEqual({ kind: 'unpublished' })
    })

    it('walls a protected space only while the visitor is not following', () => {
        expect(visibility({ privacy: 'protected' })).toEqual({
            kind: 'protected',
            requested: false,
        })
        expect(visibility({ privacy: 'protected', follow_requested: true })).toEqual({
            kind: 'protected',
            requested: true,
        })
        // Once followed, there is nothing left to gate.
        expect(visibility({ privacy: 'protected', is_followed: true })).toEqual({ kind: 'normal' })
    })

    /**
     * The two routes past the gate, and the second is the one that was missing: legacy's dialog carries
     * a "Disable filtering" checkbox writing `nsfw_settings.show_sensitive`, so a viewer who turned
     * filtering off in Settings must not be asked again on every space. `channel-view.tsx` collapses
     * both into this one flag.
     */
    it('accepts either per-channel consent or the account-wide setting', () => {
        const nsfw = channel({ is_nsfw: true })
        expect(channelVisibility({ channel: nsfw, ownership: 'viewer' })).toEqual({ kind: 'nsfw' })
        // per-channel
        expect(
            channelVisibility({ channel: nsfw, ownership: 'viewer', nsfwConfirmed: true }),
        ).toEqual({ kind: 'normal' })
    })

    it('gates NSFW last, and only until confirmed', () => {
        expect(visibility({ is_nsfw: true })).toEqual({ kind: 'nsfw' })
        expect(
            channelVisibility({
                channel: channel({ is_nsfw: true }),
                ownership: 'viewer',
                nsfwConfirmed: true,
            }),
        ).toEqual({ kind: 'normal' })
        // A blocked channel never reaches the NSFW question.
        expect(visibility({ is_nsfw: true, blocked_user: true })).toEqual({ kind: 'blocked-by' })
    })

    /**
     * The server has no bearer, so it renders with `ownership: 'unknown'`. That must yield the
     * *viewer* answer — a crawler gets honest, noindexed copy instead of an empty div, and the
     * first paint never flashes an owner's buttons at a stranger.
     */
    it('treats unknown ownership as a viewer, which is what the server render needs', () => {
        expect(visibility({ privacy: 'protected' }, 'unknown')).toEqual({
            kind: 'protected',
            requested: false,
        })
        expect(visibility({ privacy: 'unpublished' }, 'unknown')).toEqual({ kind: 'unpublished' })
        expect(visibility({ is_nsfw: true }, 'unknown')).toEqual({ kind: 'nsfw' })
        expect(visibility({}, 'unknown')).toEqual({ kind: 'normal' })
    })

    /** Fail-closed parsing feeds straight into a wall, which is the intent. */
    it('walls a channel whose privacy could not be parsed', () => {
        expect(visibility({ privacy: 'something-new' })).toEqual({
            kind: 'protected',
            requested: false,
        })
    })
})

describe('isTerminalVisibility / showsChannelTabs', () => {
    it('marks every wall terminal and nothing else', () => {
        expect(isTerminalVisibility({ kind: 'suspended' })).toBe(true)
        expect(isTerminalVisibility({ kind: 'blocked-by' })).toBe(true)
        expect(isTerminalVisibility({ kind: 'blocking' })).toBe(true)
        expect(isTerminalVisibility({ kind: 'unpublished' })).toBe(true)
        expect(isTerminalVisibility({ kind: 'protected', requested: false })).toBe(true)
        expect(isTerminalVisibility({ kind: 'normal' })).toBe(false)
        expect(isTerminalVisibility({ kind: 'owner-unpublished' })).toBe(false)
        // Not terminal — the page is whole, just behind a confirmation.
        expect(isTerminalVisibility({ kind: 'nsfw' })).toBe(false)
    })

    it('hides the tabs behind the NSFW gate even though it is not terminal', () => {
        expect(showsChannelTabs({ kind: 'normal' })).toBe(true)
        expect(showsChannelTabs({ kind: 'owner-unpublished' })).toBe(true)
        expect(showsChannelTabs({ kind: 'nsfw' })).toBe(false)
        expect(showsChannelTabs({ kind: 'suspended' })).toBe(false)
    })
})
