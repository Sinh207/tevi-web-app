import type { Post } from '../api/types'
import { canReply } from './post-access'

/**
 * Who the creator let reply — `reply_allowed_user`, as a closed union.
 *
 * ## Six values, and this client acted on one of them
 *
 * Legacy's `KEY_WHO_CAN_REPLY` is `FOLLOWERS | PAID_USERS | FOLLOWINGS | VERIFIED_SPACES |
 * MENTIONED_SPACES | NONE`, and its `WhoCanReply` panel has a sentence for each. This client knew
 * only `PAID_USERS` (in `post-intent.ts`, for the membership offer) and treated the other five as
 * nothing — so a reader barred from replying was told **nothing at all**, and on a followers-only
 * post the *Comment* button called an unlock flow that had nothing to unlock and did nothing.
 *
 * ## `NONE` and `reply_allowed: false` are two ways to say the same thing, and both must be read
 *
 * The creator's switch (`reply_allowed`) closes replies outright; `reply_allowed_user: 'NONE'` says
 * the audience is nobody. Legacy sets the second when the first is off. Reading only one leaves a
 * post whose replies are shut looking merely restricted.
 *
 * ## ⚠ There is no "everyone", and the ordinary post is `FOLLOWERS`
 *
 * Measured: 20 consecutive posts off `wapi.tevi.dev` all carried the field, 18 of them `FOLLOWERS`
 * and 2 `PAID_USERS`. The iOS client agrees — its `ReplyAllowedUser` enum has the same six cases and
 * **no** "everyone", and it defaults a value it cannot parse to `.followers`. So a post whose
 * replies are open to all is not a thing the backend expresses; the default *is* followers-only.
 *
 * `'everyone'` therefore stays in this union as the answer to a payload that carries **nothing** —
 * a shape neither client has seen — and not as "the ordinary post". It draws no panel, which is the
 * right outcome for a restriction that cannot be named. iOS defaults the other way (to
 * `.followers`), and that is the one divergence worth stating: guessing a restriction onto a post
 * that did not declare one would put a rule on screen the creator may never have set.
 */
export type ReplyAudience =
    /** The field was absent. Not a state the wire has been seen in — see the note above. */
    | 'everyone'
    /** Followers of the space — **the default**, and 18 posts in 20. */
    | 'followers'
    /** Members, or whoever bought the post. */
    | 'paid-users'
    /** Spaces the **creator** follows — not the reader's own following list. */
    | 'followings'
    | 'verified-spaces'
    /** Spaces mentioned in the post. */
    | 'mentioned-spaces'
    /** Nobody: replies are off. */
    | 'none'

/**
 * The wire spellings, lower-cased.
 *
 * Compared case-insensitively for the reason `post-intent.ts` gives about `PAID_USERS`: both
 * spellings have been seen, and a silent mismatch here means the notice never appears — which is
 * indistinguishable from a post that has no restriction.
 */
const AUDIENCES: Record<string, ReplyAudience> = {
    followers: 'followers',
    paid_users: 'paid-users',
    followings: 'followings',
    verified_spaces: 'verified-spaces',
    mentioned_spaces: 'mentioned-spaces',
    none: 'none',
}

export function replyAudience(
    post: Pick<Post, 'reply_allowed' | 'reply_allowed_user'>,
): ReplyAudience {
    // The creator's switch wins: replies off is replies off, whatever the audience field says.
    if (!post.reply_allowed) return 'none'

    const raw = post.reply_allowed_user?.trim().toLowerCase()
    if (!raw) return 'everyone'
    /*
     * An audience this client has not been taught is **not** treated as a restriction. It is a
     * value the backend added after this build, and inventing a sentence for it would put made-up
     * words on screen; `can_reply` still governs whether the box is drawn, so the reader is never
     * shown a form they cannot submit. They are simply not told why.
     */
    return AUDIENCES[raw] ?? 'everyone'
}

/**
 * The way past the restriction, where there is one.
 *
 * Legacy's own table: two of the six audiences have a control beside the sentence, four are
 * statements of fact.
 *
 * ## `PAID_USERS` has **two** controls, and legacy's web client only has one
 *
 * The iOS client splits it on `need_unlock_package`: a post the reader cannot read yet says
 * *Unlock post to reply*, and one they can read but may not reply to says *Become a member*. Legacy
 * web says "unlock" in both cases, which on the second is an offer to buy something the reader
 * already has. The split is ported here — `'unlock'` and `'join'` — and it is the same distinction
 * `postIntent`'s fourth branch already makes, now visible in the label rather than only in which
 * dialog opens.
 *
 * Both hand over to `postIntent` for the *flow*; only the wording is decided here.
 */
export type ReplyAudienceAction = 'none' | 'follow' | 'unlock' | 'join'

/**
 * What the *Who can reply?* panel should say, or `null` when there is nothing to say.
 *
 * `null` for `'everyone'`, which is the common case and the one that must draw no panel.
 *
 * The key is returned rather than the sentence so this stays pure and testable across the nine
 * locales; the component translates it.
 */
export function replyAudienceNotice(
    audience: ReplyAudience,
    /**
     * Is the post itself still behind its paywall for this reader?
     *
     * Only `'paid-users'` reads it, and only to choose between two labels — iOS's own
     * `post.needUnlockPackage` branch. Defaulted, so a caller asking a question about wording alone
     * need not supply it.
     */
    { locked = false }: { locked?: boolean } = {},
): { descriptionKey: string; action: ReplyAudienceAction } | null {
    switch (audience) {
        case 'everyone':
            return null
        case 'followers':
            return { descriptionKey: 'who_can_reply_followers', action: 'follow' }
        case 'paid-users':
            return {
                descriptionKey: 'who_can_reply_paid_users',
                action: locked ? 'unlock' : 'join',
            }
        case 'followings':
            return { descriptionKey: 'who_can_reply_followings', action: 'none' }
        case 'verified-spaces':
            return { descriptionKey: 'who_can_reply_verified_spaces', action: 'none' }
        case 'mentioned-spaces':
            return { descriptionKey: 'who_can_reply_mentioned_spaces', action: 'none' }
        case 'none':
            return { descriptionKey: 'who_can_reply_none', action: 'none' }
    }
}

/**
 * May this reader reply — the backend's answer, **plus the one case iOS does not defer on**.
 *
 * ## Why `canReply` alone is not enough
 *
 * iOS computes reply permission itself rather than reading `can_reply`
 * (`PostDetailViewController.isGrantedReplyPermission`): `.followers` from `channel.isFollowed`,
 * `.paidUsers` from `isPayPerPost && !needUnlockPackage || isSubscribed`, and `can_reply` only for
 * the four audiences nobody can satisfy on the spot. The reason is latency — after the reader
 * follows the space, the `can_reply` on the body in hand is still `false` until something refetches,
 * so a server-truth-only client leaves the panel up over a rule the reader has just satisfied.
 *
 * This client has the same exposure (60s `staleTime`, and the follow happens on the space page, a
 * navigation away), so the **followers** half is ported: a reader who already follows the space may
 * reply to a followers-only post, whatever the cached `can_reply` says.
 *
 * ## The `paidUsers` half is deliberately **not** ported
 *
 * iOS answers it with `isSubscribed`, which it fills by firing a second request —
 * `MembershipAPIClient.fetchMySubscriptions(channelId:)` — from the detail screen. `my-subscriptions/`
 * belongs to `features/membership`, and the dependency runs membership → channel → post, so reading
 * it from here would close a barrel cycle. The post payload carries no substitute. That half stays
 * on `can_reply`, and **B109** asks how quickly the field moves.
 *
 * ## What this can get wrong, and why that is the better failure
 *
 * `is_followed` says the reader follows the space; it does not say the backend will accept their
 * reply — a block, or a restriction the payload does not name, can still refuse it. So this can
 * open the box for somebody who is then refused on submit. That refusal arrives as the API's own
 * sentence (`useCreateReply`'s toast, `docs/API_ERRORS.md`), which is a worse moment but an
 * accurate one; the alternative failure — telling a follower they must follow — is wrong at a
 * moment when nothing can correct it.
 *
 * Both guards below are load-bearing and neither is implied by the other: the creator's switch
 * (`reply_allowed`) closes replies for followers too, and a post with a different audience is not
 * made repliable by following.
 */
export function mayReply(
    post: Pick<Post, 'reply_allowed' | 'can_reply' | 'deleted' | 'reply_allowed_user' | 'channel'>,
): boolean {
    if (canReply(post)) return true
    if (post.deleted) return false
    // Replies are shut. Following the space does not reopen them.
    if (!post.reply_allowed) return false
    if (replyAudience(post) !== 'followers') return false
    return post.channel?.is_followed === true
}

/**
 * Should the post draw the *Who can reply?* panel?
 *
 * Both halves, and the order is the point: a reader who **may** reply is never shown it, however
 * restricted the post is — a member of a members-only space gets the box, not an explanation of a
 * rule they already satisfy. Legacy's condition is exactly `!canReply`; this uses `mayReply`, which is
 * that plus the followers case iOS settles locally — see its note above.
 *
 * Then: a restriction that has no sentence (`'everyone'`, or an audience this build does not know)
 * draws nothing. A post can be un-repliable for a reason the payload does not name — the backend
 * says `can_reply: false` and nothing else — and an empty panel would be worse than none.
 */
export function showsReplyAudienceNotice(
    post: Pick<
        Post,
        'reply_allowed' | 'can_reply' | 'deleted' | 'is_owner' | 'reply_allowed_user' | 'channel'
    >,
): boolean {
    /*
     * A deleted post is a tombstone, and a tombstone takes no replies for a reason that has nothing
     * to do with its audience. Explaining that the reader would need to follow the space in order
     * to reply to something that is gone is the sort of sentence only a `!canReply` shortcut
     * produces — `canReply` answers `false` for a deleted post, so without this line every
     * tombstone grows a panel.
     */
    if (post.deleted) return false
    /*
     * The creator never sees it. A panel explaining who may reply to *your own* post is telling the
     * reader about a rule they set — and on a post whose replies they closed, `can_reply` is false
     * for them too, so without this line every author gets lectured about their own switch. iOS
     * guards the same way (`!post.isOwner`, and `isGrantedReplyPermission` returns `true` outright
     * for an owner).
     */
    if (post.is_owner) return false
    /*
     * `mayReply`, not `canReply`: a reader who already follows the space must get the box, not a
     * panel telling them to follow it. That is the whole point of the followers branch above.
     */
    if (mayReply(post)) return false
    return replyAudienceNotice(replyAudience(post)) !== null
}
