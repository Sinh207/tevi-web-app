import type { Post } from '../api/types'
import { canReply, isLocked, postGate } from './post-access'

/**
 * What pressing a locked post — or a reply box the reader may not use — should actually *do*.
 *
 * ## Why the branching is here and not in the panel
 *
 * `PostLockPanel` draws a picture and a price. Deciding which of four flows a press opens is a
 * different question, it is asked from **three** places (the lock panel, the comment button, and
 * the detail page when it lands), and legacy answers it in a 40-line `useCallback` with four
 * sequential `if`s and an early `return` in each — `handleOpenUnlockThisPost`. Three call sites
 * reading four conditions in the right order is three chances to get it wrong silently: the failure
 * is not a crash, it is the *wrong dialog*, and a reader offered a membership for a post that is
 * only purchasable simply cannot buy it.
 *
 * So the branch is one pure function returning one value, and the caller switches on it. A fifth
 * intent becomes a type error at every call site instead of an `else` that does nothing.
 *
 * ## The order is legacy's, and the fourth branch is the surprising one
 *
 * | | when | what opens |
 * |---|---|---|
 * | `become-a-member` | membership is the only way in | the space's membership page |
 * | `purchase` | Star is the only way in | a confirmation naming the price |
 * | `choose` | **both** routes exist | a dialog offering the two |
 * | `become-a-member` | the post is **free** but replying is members-only | the membership page |
 * | `none` | nothing is gated | — |
 *
 * That fourth row is the one a reimplementation drops. A post can be fully readable and still have
 * its replies restricted to paying members (`reply_allowed_user === 'PAID_USERS'` with `can_reply`
 * false), and the way in is the same membership page the paywall uses. Legacy reaches it through
 * the same function for exactly that reason; splitting "unlock" from "may I reply" into two helpers
 * is what loses it.
 *
 * ## It says nothing about affordability
 *
 * Whether the reader *has* the Star is `useRequireStars`'s question and is asked at the press, not
 * here — this function would otherwise need a balance, which would make it a hook, which would make
 * it untestable as the table above. `purchase` means "Star is the route in", not "they can pay".
 */
export type PostIntent = 'none' | 'purchase' | 'become-a-member' | 'choose'

/**
 * Legacy's `KEY_WHO_CAN_REPLY.PAID_USERS` — the one value of `reply_allowed_user` that has a way
 * *in* rather than just being a refusal.
 *
 * The field carries several other values (everyone, followers, mentioned) and none of them is
 * something a reader can buy their way past, which is why only this one is named. Compared
 * case-insensitively: the wire has been seen sending both spellings and a silent mismatch here
 * means the membership offer never appears.
 */
const PAID_USERS = 'paid_users'

/*
 * ⚠ This is **not** the only reader of `reply_allowed_user`, and it is not the complete list of its
 * values. `lib/who-can-reply.ts` carries all six and the sentence each one puts on screen; this file
 * names the one value that has a *paywall* behind it, because that is the only one this function's
 * four-way branch can answer. A restriction with no paywall — followers, verified spaces, mentioned
 * spaces — is `'none'` here and is explained there.
 */

export function postIntent(post: Post): PostIntent {
    if (isLocked(post)) {
        const gate = postGate(post)
        if (gate === 'members-or-purchase') return 'choose'
        if (gate === 'purchase') return 'purchase'
        if (gate === 'members') return 'become-a-member'
    }

    /*
     * Legacy's fourth branch. Reached only when the post itself is *not* locked — an open post
     * whose replies are sold. `canReply` is the composite ("may this reader submit one"), so this
     * asks the narrower question the branch is actually about.
     */
    if (post.reply_allowed_user?.toLowerCase() === PAID_USERS && !canReply(post)) {
        return 'become-a-member'
    }

    return 'none'
}

/**
 * The Star a press of the paywall will cost, or `null` when the route in is not a purchase.
 *
 * Separated from `postIntent` rather than returned beside it because the two are consumed at
 * different moments: the intent decides which dialog opens, the price is what `useRequireStars`
 * needs **before** it opens, and a `choose` dialog needs the price only if the reader picks the
 * Star side. Returning a tuple would make every caller destructure a value most of them ignore.
 *
 * `0` is deliberately not treated as a price: a gated post with `price: 0` is a payload this client
 * cannot act on honestly — it would draw a confirm button saying "unlock for 0" — so it answers
 * `null` and the caller falls through to the failure it already has. **B105**.
 */
export function postUnlockPrice(post: Post): number | null {
    const intent = postIntent(post)
    if (intent !== 'purchase' && intent !== 'choose') return null
    const price = post.price
    return price !== null && Number.isFinite(price) && price > 0 ? price : null
}
