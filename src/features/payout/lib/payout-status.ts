import type { TeviIconName } from '@shared/ui/icon-names'

/**
 * A payout's status: what it is called, what colour it carries, and which glyph marks it.
 *
 * ## Legacy's five, and the one bug not carried over
 *
 * `STATUS_MAP` in `payoutTracking/components/content/payoutRequestItem` is the source: `pending` →
 * *In progress*, `completed` → *Success*, `failed` → *Rejected*, `waiting` → *Waiting*, `on_hold` →
 * *Investigating* (a label it takes from the withdraw-detail screen's own namespace).
 *
 * **`failed` renders `<SuccessIcon />` there.** A rejected payout draws a tick — in legacy, today. It
 * is not carried over; `xmark-circle` is what a rejection looks like. The text and the colour were
 * already right, which is exactly why nobody noticed the glyph.
 *
 * ## Colours are DS tokens, and two of legacy's five collapse into one
 *
 * Legacy hard-codes hexes, which cannot work in dark mode. Mapped: `#2FC062` → `--text-success`,
 * `#E41F37` → `--text-error`, `#3E2EFF` → `--text-link`.
 *
 * `waiting` (`#FF7C00`) and `on_hold` (`#FF6100`) are two oranges a shade apart, and the DS has **one**
 * warning ink. So both take `--text-warning` and the *glyph* is what separates them — which is the
 * better distinction anyway: "we have not started" and "we are looking into it" are not different
 * intensities of the same thing, and two oranges nobody can tell apart said they were.
 *
 * ## An unknown status is shown, not hidden
 *
 * `resolve` returns `null` for a slug this table does not know, and the row then prints billy's own
 * value with neutral ink — legacy does the same (`payout?.status?.replace('_', ' ')`). A payout the
 * reader cannot account for is the one thing worse than an ugly label.
 */
export interface PayoutStatusPresentation {
    /** `{module}_{slug}` translation key. */
    label: string
    /** A `--text-*` token, without the `var()`. */
    tone: string
    icon: TeviIconName
}

const STATUS: Record<string, PayoutStatusPresentation> = {
    pending: { label: 'payout_status_in_progress', tone: '--text-link', icon: 'arrows-rotate' },
    completed: { label: 'payout_status_success', tone: '--text-success', icon: 'check-circle' },
    // `xmark-circle`, not legacy's tick. See the note above.
    failed: { label: 'payout_status_rejected', tone: '--text-error', icon: 'xmark-circle' },
    waiting: { label: 'payout_status_waiting', tone: '--text-warning', icon: 'clock' },
    /*
     * `money-search` — legacy draws a magnifier over a coin, and this is the DS's nearest: the sprite
     * has no bare magnifying glass (`search` is the search-bar affordance, a different idea) and
     * `money-search` is already this app's mark for looking at a payout, on `/my-wallet`'s tracking
     * row.
     */
    on_hold: { label: 'payout_status_investigating', tone: '--text-warning', icon: 'money-search' },
}

/** The presentation for a status slug, or `null` when it is one this table does not know. */
export function payoutStatus(status: string): PayoutStatusPresentation | null {
    return STATUS[status] ?? null
}

/**
 * A readable fallback for an unknown slug — `on_hold_review` → `on hold review`.
 *
 * Legacy replaces the **first** underscore only (`replace('_', ' ')`), so `payout_on_hold` came out
 * as `payout on_hold`. All of them here.
 */
export function humanisePayoutStatus(status: string): string {
    return status.replaceAll('_', ' ')
}
