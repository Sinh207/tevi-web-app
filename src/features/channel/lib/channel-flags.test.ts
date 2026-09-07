import { describe, expect, it } from 'vitest'
import { normalizeChannel } from '../api/types'
import {
    type ChannelOwnership,
    channelVisibility,
    isTerminalVisibility,
    showsChannelActions,
    showsChannelStats,
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

    /**
     * Under a **mutual** block, the state the reader can act on wins — legacy's order
     * (`content/index.js` renders `BlockedChannel` before `BlockedUser`).
     *
     * This asserted the opposite for a while, on the reasoning that the condition the visitor
     * cannot undo is the truer one. It is the *less useful* one: "You blocked @ada" carries an
     * Unblock button and the block clears from this very page; "@ada has blocked you" is a dead end.
     * Answering with the dead end while the reader holds the key is the wrong half of the truth.
     */
    it('prefers blocking over blocked-by when both are set', () => {
        expect(visibility({ blocked_user: true, blocking_channel: true })).toEqual({
            kind: 'blocking',
        })
        expect(visibility({ blocking_channel: true })).toEqual({ kind: 'blocking' })
        expect(visibility({ blocked_user: true })).toEqual({ kind: 'blocked-by' })
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
     * `nsfwConfirmed` is **both** of legacy's conditions anded together by `channel-view.tsx`: the
     * account's `nsfw_settings.show_sensitive` *and* a confirmation for this space. This flag cannot
     * see the difference, which is the point — the two faces of the gate are the UI's problem, and
     * the resolver's job is to stay closed until whichever face is showing has been answered.
     *
     * It was an **or** for a while, which let anyone who had turned filtering off in Settings into
     * every sensitive space with no age confirmation at all.
     */
    it('stays gated until the caller says both conditions hold', () => {
        const nsfw = channel({ is_nsfw: true })
        expect(channelVisibility({ channel: nsfw, ownership: 'viewer' })).toEqual({ kind: 'nsfw' })
        expect(
            channelVisibility({ channel: nsfw, ownership: 'viewer', nsfwConfirmed: false }),
        ).toEqual({ kind: 'nsfw' })
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

describe('isTerminalVisibility / showsChannelTabs / showsChannelActions', () => {
    it('marks every wall terminal and nothing else', () => {
        expect(isTerminalVisibility({ kind: 'suspended' })).toBe(true)
        expect(isTerminalVisibility({ kind: 'blocked-by' })).toBe(true)
        expect(isTerminalVisibility({ kind: 'blocking' })).toBe(true)
        expect(isTerminalVisibility({ kind: 'unpublished' })).toBe(true)
        expect(isTerminalVisibility({ kind: 'protected', requested: false })).toBe(true)
        expect(isTerminalVisibility({ kind: 'normal' })).toBe(false)
        expect(isTerminalVisibility({ kind: 'owner-unpublished' })).toBe(false)
        // Not terminal — the space renders, with its art blurred and the gate where its tabs go.
        expect(isTerminalVisibility({ kind: 'nsfw' })).toBe(false)
    })

    it('hides the tabs behind the NSFW gate even though it is not terminal', () => {
        expect(showsChannelTabs({ kind: 'normal' })).toBe(true)
        expect(showsChannelTabs({ kind: 'owner-unpublished' })).toBe(true)
        expect(showsChannelTabs({ kind: 'nsfw' })).toBe(false)
        expect(showsChannelTabs({ kind: 'suspended' })).toBe(false)
    })

    it('shows the stats strip where legacy does, and hides it on the walls legacy names', () => {
        const open = { privacy: 'public' } as const

        expect(showsChannelStats(open, { kind: 'normal' })).toBe(true)
        // Their block hides their content, not the public count of who follows them — legacy's
        // `isShowChannelStats` names four states and this is deliberately not one of them.
        expect(showsChannelStats(open, { kind: 'blocked-by' })).toBe(true)
        // The gate withholds the tabs, not the identity, and the numbers are part of the identity.
        expect(showsChannelStats(open, { kind: 'nsfw' })).toBe(true)

        expect(showsChannelStats(open, { kind: 'suspended' })).toBe(false)
        expect(showsChannelStats(open, { kind: 'blocking' })).toBe(false)
        expect(showsChannelStats(open, { kind: 'unpublished' })).toBe(false)
        expect(showsChannelStats(open, { kind: 'protected', requested: false })).toBe(false)
    })

    /*
     * The two cases the payload-reading version got wrong, and the reason the branch below reads
     * `visibility` at all. Both are asserted **through `channelVisibility`**, because that is where
     * the distinction lives: a protected space resolves to `normal` for its owner and for a
     * follower, and to `protected` for everyone else. Assert them against a bare `{ kind: 'normal' }`
     * and the claim evaporates — there is nothing left in it about being protected.
     */
    it('keeps the figures on a protected space once the wall is down', () => {
        const walled = { privacy: 'protected' } as const
        const stats = (overrides: Record<string, unknown>, ownership?: ChannelOwnership) =>
            showsChannelStats(channel(overrides), visibility(overrides, ownership))

        // The owner's own figures are the point of their own page. Legacy cannot get this wrong:
        // `isShowChannelStats` lives only in its viewer tree.
        expect(stats(walled, 'owner')).toBe(true)

        // A follower sees the tabs, the posts and the socials; blanking the header protects nothing.
        // Deliberate divergence — legacy hides them here.
        expect(stats({ ...walled, is_followed: true })).toBe(true)

        // A stranger still gets no numbers: the wall is up, and that is the state legacy names.
        expect(stats(walled)).toBe(false)
    })

    /**
     * `channelVisibility` answers `blocked-by` **before** it looks at privacy, so the `kind` alone
     * cannot tell a walled space from an open one — and letting `blocked-by` through unconditionally
     * would show the blocked visitor a count the ordinary stranger beside them is refused. More than
     * a stranger sees is the one direction this strip must not leak.
     */
    it('withholds the numbers from a blocked visitor when the space is walled anyway', () => {
        const stats = (overrides: Record<string, unknown>) =>
            showsChannelStats(channel(overrides), visibility(overrides))

        expect(visibility({ blocked_user: true, privacy: 'protected' })).toEqual({
            kind: 'blocked-by',
        })

        expect(stats({ blocked_user: true })).toBe(true)
        expect(stats({ blocked_user: true, privacy: 'protected' })).toBe(false)
        expect(stats({ blocked_user: true, privacy: 'unpublished' })).toBe(false)
    })

    /** The owner of an unpublished space keeps its numbers under the publish banner. */
    it('shows the strip to an owner behind the publish banner', () => {
        const unpublished = { privacy: 'unpublished' } as const
        expect(showsChannelStats(channel(unpublished), visibility(unpublished, 'owner'))).toBe(true)
        expect(showsChannelStats(channel(unpublished), visibility(unpublished))).toBe(false)
    })

    it('offers the action row where legacy does, and nowhere else', () => {
        /*
         * Legacy's `content/buttonGroup` hides itself for `unpublished`, both blocks and
         * `suspended`, and shows otherwise — **protected included**, which is the one that matters:
         * Follow is how a stranger asks to be let in, so a protected space that hides the row hides
         * its own way in and the copy ("Tap the Follow button…") becomes a lie.
         */
        expect(showsChannelActions({ kind: 'protected', requested: false })).toBe(true)
        expect(showsChannelActions({ kind: 'normal' })).toBe(true)
        expect(showsChannelActions({ kind: 'owner-unpublished' })).toBe(true)

        for (const hidden of [
            { kind: 'suspended' },
            { kind: 'blocked-by' },
            { kind: 'blocking' },
            { kind: 'unpublished' },
            // This app's addition: the row is the transactional half, and a space whose content has
            // not been agreed to should not be selling a membership.
            { kind: 'nsfw' },
        ] as const) {
            expect(showsChannelActions(hidden)).toBe(false)
        }
    })
})
