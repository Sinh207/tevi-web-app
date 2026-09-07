import type { RedeemOutcome, RedeemResult } from '../api/types'
import { isCodeRejection } from './gift-code'

/**
 * One attempt at redeeming a code against one service. Resolves to what the code contained, or
 * `null` for "this service answered, and it was not one of ours".
 */
export type RedeemAttempt = () => Promise<RedeemOutcome | null>

/**
 * Try a code against each service in turn and **stop at the first one that accepts it**.
 *
 * ## Why there is a sequence at all
 *
 * Nothing about a Tevi code says which service owns it. A gift code lives on billing
 * (`billy/v1/gifting/redeem/`) and a Premium code on the Premium service (`premium/v1/redeem/`),
 * and the only way to find out which one a string is, is to offer it to both — **confirmed by the
 * backend** (B68), along with the signal that ends the sequence: a **2xx**, whatever its body. A single
 * endpoint that classified a code would remove this whole file; that request is logged in
 * `docs/BACKEND_QUESTIONS.md`.
 *
 * ## Stopping is the part that differs from legacy
 *
 * Legacy `await`s **both** calls on every press, unconditionally: it redeems the Premium code and
 * then posts the *same code* to the gifting service, whose refusal it then has to arrange not to
 * show (`isError` is suppressed once a result exists — by luck of evaluation order rather than by
 * design). That works only because neither service accepts the other's codes; the day one does, a
 * single press spends the code twice and the second grant is silently dropped on the floor.
 *
 * So: sequential, and short-circuit. A code is never offered to a second service after one has
 * consumed it. The cost is one extra round trip on the more common case (a Star gift, when Premium
 * is tried first) and it buys the guarantee that a press is at most one redemption.
 *
 * The **order** is legacy's — Premium, then gifting — and it is kept rather than optimised because
 * order is only observable for a code both services would accept, which is exactly the case above:
 * changing it would change which grant such a code produces, and that is not this client's call.
 *
 * ## A refusal is a result; a failure is thrown
 *
 * `isCodeRejection` draws the line (see its doc). A 4xx means "not ours" and moves on to the next
 * service; a 5xx, a network drop or a 429 means the answer is *unknown*, and the whole attempt
 * rejects so the caller can say "try again" instead of telling somebody with a valid gift card that
 * their card is invalid. Legacy prints "The code entered is not valid." for both.
 *
 * Running out of services is `{ kind: 'invalid' }` — a **resolved** value, not a throw, so the
 * mutation's error path stays reserved for things that actually went wrong (and its error toast
 * never fires for an ordinary typo).
 */
export async function redeemAcrossServices(attempts: RedeemAttempt[]): Promise<RedeemResult> {
    for (const attempt of attempts) {
        try {
            const outcome = await attempt()
            if (outcome) return outcome
        } catch (error) {
            if (!isCodeRejection(error)) throw error
        }
    }
    return { kind: 'invalid' }
}
