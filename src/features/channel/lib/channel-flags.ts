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
    /** Shell renders blurred behind a confirm. */
    | { kind: 'nsfw' }

export interface ChannelVisibilityInput {
    channel: Channel
    ownership: ChannelOwnership
    /**
     * Whether the NSFW gate has already been satisfied — by **either** of the two routes legacy
     * offers, which the caller collapses into one boolean:
     *
     * 1. a per-channel confirmation for this viewer (`lib/nsfw-consent.ts`), or
     * 2. the account's own **global** "disable filtering" setting
     *    (`nsfw_settings.show_sensitive`, `accountShowSensitive`).
     *
     * The second is easy to miss — an earlier version of this feature only knew about the first, so a
     * viewer who had turned filtering off in Settings was still gated on every channel, once each.
     * Legacy's dialog puts the checkbox that writes that setting *inside* the gate, which is where the
     * pairing comes from.
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

    if (channel.blocked_user) return { kind: 'blocked-by' }
    if (channel.blocking_channel) return { kind: 'blocking' }
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
 * Separate from `isTerminalVisibility` because the NSFW gate is *not* terminal — the page is
 * whole, just behind a confirmation — yet its tabs must not render either.
 */
export function showsChannelTabs(visibility: ChannelVisibility): boolean {
    return visibility.kind === 'normal' || visibility.kind === 'owner-unpublished'
}
