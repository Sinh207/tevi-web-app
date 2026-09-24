import type { SustainedFeeRule } from '@shared/lib/remote-config'
import { isExclusiveLive } from '../access'
import type { EventDetail } from '../api/types'

/**
 * **The sustained fee** — Star charged every few minutes to keep watching, going to the streamer.
 *
 * Two halves, in two features. `shared/lib/remote-config` resolves **which rule** applies (per
 * country, `resolveSustainedFeeRule`); this decides **whether it applies to this broadcast**,
 * because that needs the event and `shared/` may not import a feature. Its own doc says so, and
 * leaves a note addressed to whoever writes this file.
 *
 * ```
 * a rule for this country?        no → nothing. Not "0 Star", not "off" — silence.
 * rule.enable                     no → off
 * event.paid_interactions         no → off   ← the creator's own master switch
 * visibility in the rule's list?  no → off   ← absent list means no restriction
 * live type in the rule's list?   no → off
 * ```
 *
 * ## The bug this does not copy
 *
 * Legacy's `useChargeStar` ends its live-type check like this:
 *
 * ```js
 * if (isExclusive) {
 *     const supportsExclusive = types.includes('paid') || types.includes('member')
 *     if (!supportsExclusive) return false
 * }
 * return types.includes('free')     // ← always, even for an exclusive live
 * ```
 *
 * So a rule listing `['paid', 'member']` — an **exclusive-only** sustained fee, which is the
 * exact case the branch above it exists to serve — falls through to the free check and resolves
 * to `false`. The feature has therefore never charged on an exclusive-only rule. `types.ts` in
 * the remote-config module records it from the other side.
 *
 * Here the two branches are exclusive: an exclusive live asks for `paid`/`member`, a free one
 * asks for `free`, and neither overrules the other.
 */
export interface SustainedFee {
    /** Star per interval. */
    fee: number
    /** Minutes between charges. */
    durationMinutes: number
}

/**
 * Does this broadcast charge a sustained fee, and how much?
 *
 * `null` means **no fee**, and it is deliberately not a `{ enabled: false }` object: a screen that
 * has to say "you will be charged 1 Star every 5 minutes" must be unable to say it by accident
 * when the answer is "nobody is charged here". The fallbacks (1 Star, 5 minutes) live on the rule
 * and are only reachable once a rule exists.
 */
export function sustainedFee(
    event: EventDetail,
    rule: SustainedFeeRule | null,
): SustainedFee | null {
    if (!rule?.enable) return null

    /*
     * The creator's own switch, and it outranks every console rule. A broadcast with paid
     * interactions off charges nobody, whatever the country config says — so this is checked
     * before anything about the rule's own conditions.
     */
    if (!event.paid_interactions) return null

    /*
     * `null` is "no restriction" and `[]` is "nothing passes" — the distinction the remote-config
     * schema keeps `optionalTextList` around for. An event whose `visibility` the payload omits
     * cannot satisfy a list, so it is excluded rather than waved through: this gate spends money.
     */
    if (rule.enableWithEventVisibility !== null) {
        if (!event.visibility) return null
        if (!rule.enableWithEventVisibility.includes(event.visibility)) return null
    }

    const types = rule.enableWithLiveType
    const allowed = isExclusiveLive(event)
        ? types.includes('paid') || types.includes('member')
        : types.includes('free')
    if (!allowed) return null

    /*
     * Both are guarded rather than trusted. A console typo that makes `charge_duration` zero
     * would be an interval of 0ms — a charge every tick, which is a runaway bill; a negative fee
     * would be a refund. The schema's fallbacks (1 and 5) already cover *absence*, so these cover
     * the other thing a human-edited console produces.
     */
    const fee = Number.isFinite(rule.fee) && rule.fee > 0 ? rule.fee : null
    const durationMinutes =
        Number.isFinite(rule.chargeDuration) && rule.chargeDuration > 0 ? rule.chargeDuration : null
    if (fee === null || durationMinutes === null) return null

    return { fee, durationMinutes }
}
