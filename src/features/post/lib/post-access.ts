import type { Post } from '../api/types'

/**
 * What stands between the reader and a post's body.
 *
 * ## Why this is a function and not four booleans on a component
 *
 * Legacy spreads it across five `useMemo`s in `usePostLogic.js` (`isOnlyMember`, `isOnlyUnlock`,
 * `isUnlockAndMember`, `isStargazersPost`, `isNeedUnlockPackage`) that are read in eight places and
 * are **not mutually exclusive** — `isStargazersPost` is true whenever either of the first two is,
 * so a component testing them in the wrong order shows the wrong call to action. Collapsing them
 * into one closed union is what makes the card's branch exhaustive: a new gate becomes a type error
 * at every call site instead of an `else` that silently renders the open body.
 *
 * ## The two inputs, and why both are needed
 *
 * - `product_id` — the post is individually purchasable, for `price` Star.
 * - `required_packages` — membership tiers that grant access. **Non-empty is the signal**; the rows
 *   themselves are not modelled, because no surface renders them.
 *
 * Neither is a statement about *this* reader. `isUnlocked` is.
 */
export type PostGate =
    /** No paywall. The overwhelming majority of posts. */
    | 'open'
    /** Membership only — there is no price to pay one-off. */
    | 'members'
    /** Buyable with Star, and membership is not a way in. */
    | 'purchase'
    /** Either route works: join a tier, or unlock this one post. */
    | 'members-or-purchase'

export function postGate(post: Pick<Post, 'product_id' | 'required_packages'>): PostGate {
    const purchasable = Boolean(post.product_id)
    const membersOnly = post.required_packages.length > 0

    if (purchasable && membersOnly) return 'members-or-purchase'
    if (purchasable) return 'purchase'
    if (membersOnly) return 'members'
    return 'open'
}

/** Whether a post is behind any paywall at all, regardless of which one. */
export function isGated(post: Pick<Post, 'product_id' | 'required_packages'>): boolean {
    return postGate(post) !== 'open'
}

/**
 * Whether **this reader** is currently locked out of a gated post's body.
 *
 * ## `viewer` is the backend's answer and `need_unlock_package` is not enough on its own
 *
 * Legacy reads `viewer === 'STARGAZERS' && need_unlock_package`, and the first half is what makes it
 * correct: `need_unlock_package` describes the *post* (it needs a package) and stays true after the
 * reader has bought one. `viewer` is the backend's statement about who is asking. Testing only the
 * flag leaves a paying member looking at the lock screen for content they own.
 *
 * A post with no gate is never locked, which is asserted here rather than assumed: a backend that
 * starts sending `need_unlock_package` on ungated posts would otherwise blank every feed.
 */
export function isLocked(
    post: Pick<Post, 'product_id' | 'required_packages' | 'viewer' | 'need_unlock_package'>,
): boolean {
    if (!isGated(post)) return false
    return post.viewer === 'STARGAZERS' && post.need_unlock_package
}

/**
 * Whether the reader has already paid for a gated post.
 *
 * The inverse of `isLocked` **only among gated posts** — an open post is neither locked nor
 * purchased, and conflating the two is how legacy's `PurchasedBadge` ends up on posts that were
 * never for sale.
 *
 * **Never the author's own post.** The author is not locked out of what they wrote, so without
 * this every paid post in their own space read *Purchased* — a sale that never happened. Legacy's
 * `isPurchasedPost` opens with `!isMyPost` for exactly this.
 */
export function isPurchased(
    post: Pick<
        Post,
        'product_id' | 'required_packages' | 'viewer' | 'need_unlock_package' | 'is_owner'
    >,
): boolean {
    return !post.is_owner && isGated(post) && !isLocked(post)
}

/**
 * Whether a post needs the sensitive-content gate.
 *
 * Two independent sources and **either** is enough: `detected_nsfw` is the classifier's verdict,
 * `marked_nsfw` is a human's. They disagree often — a creator marks a post the classifier missed,
 * or appeals one it flagged (`features/nsfw`) — and the safe reading of a disagreement is the
 * stricter one.
 */
export function isNsfw(post: Pick<Post, 'detected_nsfw' | 'marked_nsfw'>): boolean {
    return post.detected_nsfw || post.marked_nsfw
}

/**
 * What the card should actually draw, in the order the checks must happen.
 *
 * ## Order is the whole point
 *
 * `deleted` first: a deleted post has no body, no actions and no menu, and every field below it is
 * meaningless. `locked` before `nsfw`: a locked post's media is **not in the payload**, so there is
 * nothing to blur — running the NSFW gate first would offer "show sensitive content" on a post
 * whose content the reader cannot have either way, and tapping it would reveal an empty card.
 *
 * Returning one value rather than three booleans is again what makes the card exhaustive.
 */
export type PostDisplay = 'deleted' | 'locked' | 'nsfw' | 'body'

export function postDisplay(
    post: Pick<
        Post,
        | 'deleted'
        | 'product_id'
        | 'required_packages'
        | 'viewer'
        | 'need_unlock_package'
        | 'detected_nsfw'
        | 'marked_nsfw'
    >,
): PostDisplay {
    if (post.deleted) return 'deleted'
    if (isLocked(post)) return 'locked'
    if (isNsfw(post)) return 'nsfw'
    return 'body'
}

/**
 * Whether the reader may reply, and why not when they may not.
 *
 * `can_reply` is the backend's decision and it wins. `reply_allowed` is the *creator's* switch, and
 * the two are not the same question: a creator can leave replies on while restricting them to
 * followers, in which case `reply_allowed` is true and `can_reply` is false for a stranger. Legacy
 * reads whichever is nearer to hand — seven call sites, four of them the wrong one — which is how
 * its reply box renders for people whose reply the API then refuses.
 */
export function canReply(post: Pick<Post, 'reply_allowed' | 'can_reply' | 'deleted'>): boolean {
    if (post.deleted) return false
    return post.reply_allowed && post.can_reply
}

/**
 * The Star a reply costs, or `null` when replying is free.
 *
 * Paid interaction is the **channel's** setting, not the post's, and it never applies to the
 * creator's own posts — charging someone to comment on themselves is the sort of thing that only
 * shows up in production. Premium readers are exempt, but that is `features/premium`'s fact and is
 * therefore the caller's argument rather than something read from the post.
 */
export function replyCost(
    post: Pick<Post, 'channel' | 'is_owner'>,
    { isPremiumReader }: { isPremiumReader: boolean },
): number | null {
    if (post.is_owner || isPremiumReader) return null
    const channel = post.channel
    if (!channel?.paid_interaction_enabled) return null
    const cost = channel.paid_interaction_cost
    return cost !== null && cost > 0 ? cost : null
}

/**
 * Whether the reader has reacted.
 *
 * `user_reaction` is an object rather than a boolean because the reaction set may grow past `LIKE`;
 * a row with no `type` is treated as no reaction, since a reaction we cannot name cannot be drawn
 * in a pressed state either.
 */
export function hasReacted(post: Pick<Post, 'user_reaction'>): boolean {
    return Boolean(post.user_reaction?.type)
}

/**
 * Which controls the action row draws — legacy's four `return null` guards, in one place.
 *
 * ## Each guard answers a different question, and they are easy to mix up
 *
 * - **comment** is gated on `reply_allowed` **alone** — the *creator's* switch. Not `canReply`,
 *   which also consults `can_reply` and answers "may **this reader** submit one". A follower-only
 *   post still shows the button to a stranger; what it withholds from them is the box. Collapsing
 *   the two hides the reply count from everyone who is not allowed to reply, which is a different
 *   product decision and not the one legacy made.
 * - **send message** and **bookmark** are hidden on the reader's **own** post. Messaging yourself a
 *   link to your own post, and saving a list of things you wrote, are both noise.
 * - **quote** is off unless the console turns it on (`post.createPost.quote.isActive`), and the flag
 *   fails closed.
 *
 * Share and react carry no guard at all: every post can be shared, and a post nobody may reply to
 * can still be reacted to.
 */
export function postActionVisibility(
    post: Pick<Post, 'reply_allowed' | 'is_owner'>,
    { quoteEnabled }: { quoteEnabled: boolean },
): { comment: boolean; sendMessage: boolean; quote: boolean; bookmark: boolean } {
    return {
        comment: post.reply_allowed,
        sendMessage: !post.is_owner,
        quote: quoteEnabled,
        bookmark: !post.is_owner,
    }
}

/**
 * Which rows the overflow menu draws — legacy's `isMyPost ? [four] : [two]`, with the conditions
 * the two halves do not share.
 *
 * ## The split is total, not a superset
 *
 * Legacy renders **either** the owner's four rows **or** a stranger's two, never a mix. That is
 * worth keeping rather than tidying into per-row conditions: every owner row is a write on content
 * the reader authored, and every stranger row is a moderation action against somebody else. A menu
 * that could show *Delete* beside *Report* would be one wrong `is_owner` away from offering to
 * delete another person's post.
 *
 * ## `edit` is separated from the other three owner rows
 *
 * It is the only one whose destination is a **surface** rather than a request — the composer, which
 * does not exist yet. So it is its own flag, and the card passes `canEdit: false` until there is
 * something to open. `use-create-action.ts` sets the rule: a control whose destination is not built
 * is absent, not a button that navigates nowhere.
 *
 * ## `report` has a kill switch and `block` does not
 *
 * `report.post.isActive` is a Remote Config flag the console owns, and it fails **closed** — an
 * unreachable Firebase hides the row. That is the right direction for a moderation queue somebody
 * may need to drain. Block has no flag because blocking is an account-level action that does not
 * touch a queue.
 *
 * A **deleted** post offers nothing at all: legacy hides the whole trigger (`!isPostDeleted &&
 * <MenuButton/>`), and every row below would act on a tombstone.
 */
export function postMenuVisibility(
    post: Pick<Post, 'is_owner' | 'deleted' | 'channel'>,
    { reportEnabled, canEdit = false }: { reportEnabled: boolean; canEdit?: boolean },
): {
    pin: boolean
    replyAllowed: boolean
    edit: boolean
    delete: boolean
    report: boolean
    block: boolean
} {
    const none = {
        pin: false,
        replyAllowed: false,
        edit: false,
        delete: false,
        report: false,
        block: false,
    }
    if (post.deleted) return none

    if (post.is_owner) {
        return { ...none, pin: true, replyAllowed: true, edit: canEdit, delete: true }
    }

    return {
        ...none,
        report: reportEnabled,
        /*
         * Blocking is keyed by **user** id, not channel id (`shared/lib/api/blocks-api.ts` states
         * it), so a channel payload without `owner_id` cannot be blocked — the row would open a
         * confirmation whose confirm button has nothing to send.
         */
        block: Boolean(post.channel?.owner_id),
    }
}

/**
 * Who a post is for, **as its owner's list states it** — legacy's three readings of `viewer` ×
 * `price` in *Add posts* (`PostCollection`): members-and-a-price is a Star price, members-only is
 * *Member*, everyone-and-free is *Free*.
 *
 * Deliberately not `postGate`, which reads `product_id` / `required_packages`: the search service's
 * candidate rows are only guaranteed to carry these two. The fourth combination (everyone, with a
 * price) gets no label, as in legacy.
 */
export type CandidateAudience =
    | { kind: 'free' }
    | { kind: 'member' }
    | { kind: 'price'; amount: number }

export function candidateAudience(post: Pick<Post, 'viewer' | 'price'>): CandidateAudience | null {
    const price = Number(post.price) || 0
    if (post.viewer === 'STARGAZERS') {
        return price > 0 ? { kind: 'price', amount: price } : { kind: 'member' }
    }
    if (post.viewer === 'EVERYONE' && price === 0) return { kind: 'free' }
    return null
}
