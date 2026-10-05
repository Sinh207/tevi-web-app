import { isOwnReply, type Reply } from '../api/reply-types'

/**
 * What a reader may do with a reply, and what it costs them — `post-access.ts` for the other DTO.
 *
 * A separate file because a reply answers these questions from different fields (`post_channel`
 * rather than `channel`, no `is_owner` at all), and the two are easy to mix up in a way nothing
 * catches: every wrong field simply reads as `false`.
 */

/**
 * The Star reacting to this reply costs, or `null` when it is free.
 *
 * ## Four exemptions, and legacy applies all four
 *
 * `btnReact`'s condition is
 * `!isMyPremium && post_channel.paid_interaction_enabled && !isMyComment && !isMyPost`, so a reader
 * pays only when they are none of: Premium, the reply's author, or the post's owner. The last two
 * matter more here than on a post card — a creator reading their own post's replies would otherwise
 * be charged to acknowledge each one.
 *
 * Both of those are **derived**, because a reply carries no `is_owner`: the author through
 * `owner.id`, the post's owner through `post_channel.owner_id`, each compared against `/me`'s id
 * (**B11** — one identifier space, string-compared because the services disagree about the type).
 *
 * A cost of `0` is treated as free rather than as a price, the same reading `replyCost` uses: a
 * control that says "react for 0" is one nobody can honestly confirm.
 */
export function replyReactionCost(
    reply: Pick<Reply, 'owner' | 'post_channel'>,
    { userId, isPremiumReader }: { userId: string | number | null; isPremiumReader: boolean },
): number | null {
    if (isPremiumReader) return null
    if (isOwnReply(reply, userId)) return null

    const channel = reply.post_channel
    if (!channel?.paid_interaction_enabled) return null

    // The post's owner does not pay to interact on their own post.
    const postOwnerId = channel.owner_id
    if (postOwnerId && userId !== null && String(userId) === postOwnerId) return null

    const cost = channel.paid_interaction_cost
    return cost !== null && cost > 0 ? cost : null
}

/**
 * Which rows the reply's overflow menu draws.
 *
 * ## Only *Delete*, and only for two people — for now
 *
 * The reply's **author** may remove it, and so may the **owner of the post** it sits under: that is
 * moderation on one's own page, and legacy offers it (`menuItemDelete` renders on either). Both are
 * derived, since a reply carries no ownership flag of its own.
 *
 * *Report* and *Block* are **absent**, and deliberately so rather than by omission. Reporting a
 * reply is a different endpoint pair from reporting a post — `v1/report/report/reply/contents/` and
 * `v1/report/report/replies/{id}/`, which `post-report-api.ts` names and does not implement — and
 * the dialog that collects a reason is built around the post pair. Until that lands, a *Report* row
 * here could only submit a reply's id to the post endpoint, which is what the previous
 * post-card-shaped reply row did. An absent control beats one that files nothing; the rule is the
 * one `postMenuVisibility` states for *Edit*.
 *
 * A **deleted** reply offers nothing: every row below acts on a tombstone.
 */
export function replyMenuVisibility(
    reply: Pick<Reply, 'owner' | 'post_channel' | 'deleted'>,
    { userId }: { userId: string | number | null },
): { delete: boolean } {
    if (reply.deleted) return { delete: false }
    if (isOwnReply(reply, userId)) return { delete: true }

    const postOwnerId = reply.post_channel?.owner_id
    const ownsPost = Boolean(postOwnerId) && userId !== null && String(userId) === postOwnerId
    return { delete: ownsPost }
}
