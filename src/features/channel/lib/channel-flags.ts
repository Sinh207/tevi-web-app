import type { Channel } from '../api/types'

/**
 * Which of the channel page's mutually exclusive states applies — decided **once**, here.
 *
 * Legacy spreads this across nested ternaries in two component trees
 * (`containers/channel/components/{creator,viewer}/components/content`), so the precedence
 * only exists as an emergent property of JSX nesting. That is why it disagrees with itself:
 * the creator tree and the viewer tree each rediscover the order. One pure function with an
 * explicit order is testable, and the test is the highest-value one in the feature — the
 * failure mode of getting it wrong is showing a suspended or blocked channel's content.
 */
export type ChannelOwnership = 'unknown' | 'owner' | 'viewer'

export type ChannelVisibility =
    /** Nothing is wrong: render the shell and the tabs. */
    | { kind: 'normal' }
    /** Owner viewing their own unpublished space — full shell **plus** a publish banner. */
    | { kind: 'owner-unpublished' }
    /** Terminal states: identity only, no cover, no stats, no tabs. */
    | { kind: 'suspended' }
    | { kind: 'blocked-by' }
    | { kind: 'blocking' }
    | { kind: 'unpublished' }
    | { kind: 'protected'; requested: boolean }
    /**
     * Sensitive space, gate unanswered: the shell renders with its **art blurred** and the gate in
     * place of the tabs. Not terminal — see `showsChannelShell`.
     */
    | { kind: 'nsfw' }

export interface ChannelVisibilityInput {
    channel: Channel
    ownership: ChannelOwnership
    /**
     * Whether the NSFW gate has been satisfied. It takes **both** of legacy's conditions, and the
     * caller ands them together:
     *
     * 1. the account's global "disable filtering" setting (`nsfw_settings.show_sensitive`), **and**
     * 2. a per-space confirmation from this viewer (`shared/lib/nsfw-consent.ts`).
     *
     * ⚠ **And, not or.** This read `isConfirmed || showsSensitive` for a while, which let anyone who
     * had turned filtering off in Settings straight into every sensitive space with no age
     * confirmation at all — the opposite of what the setting is for. Legacy is explicit:
     * `isNsfw = !showSensitive || !confirmedList.includes(slug)`, i.e. pass only when both hold.
     *
     * The pairing is why the gate has **two faces**. With filtering on, the only useful offer is to
     * turn it off; with it already off, what is left to ask is the age confirmation for this space.
     * Legacy's dialog switches between exactly those two, and `channel-nsfw-gate.tsx` now does too.
     */
    nsfwConfirmed?: boolean
}

/**
 * The order below is legacy's effective order, made explicit. Each rule is here because
 * getting it wrong has a specific consequence:
 *
 * 1. **suspended** beats everything, including ownership. A suspended creator does not get
 *    their own dashboard back by visiting their own URL.
 * 2. **owner** short-circuits every *remaining* state — an owner cannot be blocked by
 *    themselves, is not "protected" from themselves, and does not need an NSFW gate on their
 *    own content. The one thing they still see is the unpublished banner, because that is a
 *    call to action rather than a wall.
 * 3. **blocked-by** before **blocking**: if both are somehow true, "they blocked you" is the
 *    one the visitor can do nothing about, so showing "unblock them" would be a dead end.
 * 4. **unpublished** before **protected**: unpublished is the stronger statement (nobody may
 *    see this), and a channel can be both.
 * 5. **protected** only walls a visitor who is *not* following. Once followed, it is normal.
 * 6. **nsfw** last, because it gates content that is otherwise visible.
 *
 * `ownership: 'unknown'` deliberately yields the **viewer** answer. That is what the server
 * render needs: it has no bearer and cannot know who is asking, so a crawler gets the
 * viewer's honest view rather than an empty div. It also means the first client paint never
 * shows an owner's affordances to a stranger.
 */
export function channelVisibility({
    channel,
    ownership,
    nsfwConfirmed = false,
}: ChannelVisibilityInput): ChannelVisibility {
    if (channel.is_suspended) return { kind: 'suspended' }

    const isOwner = ownership === 'owner'

    if (isOwner) {
        return channel.privacy === 'unpublished'
            ? { kind: 'owner-unpublished' }
            : { kind: 'normal' }
    }

    /*
     * **`blocking` before `blocked-by`**, which is legacy's order (`content/index.js` renders
     * `BlockedChannel` before `BlockedUser`) and the useful one. They differ only under a mutual
     * block, and there the state the reader can *act on* should win: "You blocked @ada" carries an
     * Unblock button, "@ada has blocked you" is a dead end. Answering with the dead end when the
     * reader holds the key is the wrong half of the truth.
     */
    if (channel.blocking_channel) return { kind: 'blocking' }
    if (channel.blocked_user) return { kind: 'blocked-by' }
    if (channel.privacy === 'unpublished') return { kind: 'unpublished' }
    if (channel.privacy === 'protected' && !channel.is_followed) {
        return { kind: 'protected', requested: channel.follow_requested }
    }
    if (channel.is_nsfw && !nsfwConfirmed) return { kind: 'nsfw' }

    return { kind: 'normal' }
}

/**
 * A terminal state renders identity and an explanation, and **nothing else** — no cover, no
 * stats, no tabs, no action row. Legacy expresses the same idea as two separate booleans
 * (`isShowChannelStats`, `isShowSecondaryData`) computed independently, which is how they
 * drifted apart.
 */
export function isTerminalVisibility(visibility: ChannelVisibility): boolean {
    switch (visibility.kind) {
        case 'suspended':
        case 'blocked-by':
        case 'blocking':
        case 'unpublished':
        case 'protected':
            return true
        default:
            return false
    }
}

/**
 * Whether the tab strip and its panels render at all.
 *
 * Separate from `isTerminalVisibility` because the sensitive-content gate is *not* terminal — the
 * space renders, header and all — yet its tabs must not render either. That is the whole difference
 * between this and `showsChannelShell` below, and it is the line the gate depends on: the tabs are
 * **not** drawn behind a blur, they are not drawn.
 */
export function showsChannelTabs(visibility: ChannelVisibility): boolean {
    return visibility.kind === 'normal' || visibility.kind === 'owner-unpublished'
}

/**
 * Whether the header shows its **stats strip** — followers, members, posts, income.
 *
 * Legacy's `isShowChannelStats` names four states and hides on them: **suspended**, **unpublished**,
 * **blocked by you**, **protected**. Shown otherwise, including — and this is the one that looks like
 * an oversight and is not — when the *other* account has blocked **you**: that state hides their
 * content, not the public count of who follows them. `nsfw` likewise keeps its numbers; the gate
 * withholds the tabs, not the identity (see `channel-nsfw-gate.tsx`).
 *
 * ## The wall, not the privacy — with one exception, and it is the exception that matters
 *
 * This tested `channel.privacy === 'protected'` the way legacy does. That is a rule about the
 * *space*, and the two cases it gets wrong are the two where the space and the **wall** disagree,
 * because `channelVisibility` has already resolved both to `normal`:
 *
 * - **The owner of a protected space saw no figures of their own.** Legacy cannot make that mistake:
 *   its `isShowChannelStats` exists only in the viewer tree, and the creator tree renders
 *   `AvatarAndStats` with no gate at all.
 * - **A follower of a protected space saw none either**, once the wall was already down and the
 *   tabs, posts and socials were all on screen. Legacy hides them there too — deliberately, as far
 *   as the source shows: `isShowSecondaryData` sits ten lines below with `!(isProtectedChannel &&
 *   !isFollowed)` and this one has the bare `!isProtectedChannel`. Ported verbatim at first for that
 *   reason. It is still a bug: nothing is protected by blanking a header whose whole body is open,
 *   and the counts are there to be tallied by scrolling. **Deliberate divergence from legacy.**
 *
 * So *mostly* the question is "is a wall up", which `visibility` answers on its own. **`blocked-by`
 * is where that stops being true**, and it is why this still takes a channel. `channelVisibility`
 * checks `blocked_user` **before** `unpublished` and `protected`, so a walled space that has blocked
 * you arrives here as `blocked-by` with its privacy nowhere in the `kind` — and reading the `kind`
 * alone hands the blocked visitor a follower count that an ordinary stranger is refused. More than a
 * stranger sees is the one direction this strip must never leak, so that branch reads the privacy.
 *
 * Otherwise an allowlist rather than a deny-list: a `kind` added later hides its numbers until
 * someone decides otherwise, which is the safe direction for a surface that publishes how big an
 * audience is.
 */
export function showsChannelStats(
    channel: Pick<Channel, 'privacy'>,
    visibility: ChannelVisibility,
): boolean {
    // Their block hides their content, not their public numbers — but "public" is the operative
    // word, and on a walled space there are none to show.
    if (visibility.kind === 'blocked-by') {
        return channel.privacy !== 'protected' && channel.privacy !== 'unpublished'
    }

    return (
        visibility.kind === 'normal' ||
        visibility.kind === 'owner-unpublished' ||
        visibility.kind === 'nsfw'
    )
}

/**
 * Whether the page renders the **action row** — Become a member, Donate, and the owner's own
 * controls.
 *
 * Legacy's rule, from `content/buttonGroup`: hidden for `unpublished`, both blocks and `suspended`;
 * shown otherwise, **including for a protected space** — where Follow is the whole point, since it
 * is how a stranger asks to be let in.
 *
 * `nsfw` is this app's addition to the hidden list: the row is the transactional half (donate, join)
 * and offering to spend money on a space whose content has not been agreed to yet is the one thing
 * on that screen that should wait. Identity is not withheld; the transaction is.
 */
export function showsChannelActions(visibility: ChannelVisibility): boolean {
    return (
        visibility.kind === 'normal' ||
        visibility.kind === 'owner-unpublished' ||
        visibility.kind === 'protected'
    )
}
