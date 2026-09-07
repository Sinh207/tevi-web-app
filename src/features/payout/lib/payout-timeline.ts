import type { PayoutRequestDetail } from '../api/types'

/**
 * The status timeline on a payout's detail screen: what happened, newest first.
 *
 * ## It is built from timestamps, not from the status
 *
 * A payout carries `pending_at`, `on_hold_at`, `completed_at`, `failed_at` and `created_at`, and a
 * step exists **only if its timestamp does**. That is what makes this a history rather than a
 * progress bar: a request that went `waiting → on_hold → completed` shows three steps, and one still
 * waiting shows one. Legacy builds the same list the same way (`allowed: completedAt` and friends).
 *
 * ## The current step is the one that is not a chip
 *
 * Legacy draws every past step as a grey chip and the **current** one as plain text (`type: 'status'`
 * vs `'text'`, keyed on `status === 'completed'` and so on). Reproduced: `isCurrent` marks the step
 * matching `request.status`, and the caller renders it differently. It reads as "here is where it got
 * to", which a row of identical chips does not.
 *
 * ## Newest first, and `waiting` is `created_at`
 *
 * The order is legacy's: completed, failed, pending, on_hold, then the submission itself. There is no
 * `waiting_at` — a request is waiting from the moment it is made — so that step reads `created_at`,
 * which is also why the last entry (the "submitted" line) shares the same timestamp and is not a
 * status at all.
 */
export interface PayoutTimelineStep {
    /** The status this step records, or `'submitted'` for the closing line. */
    status: 'completed' | 'failed' | 'pending' | 'on_hold' | 'waiting' | 'submitted'
    /** Epoch ms. */
    at: number
    /** The request is *at* this step now — render it as text rather than as a past chip. */
    isCurrent: boolean
}

export function payoutTimeline(request: PayoutRequestDetail): PayoutTimelineStep[] {
    const steps: PayoutTimelineStep[] = []

    const push = (status: PayoutTimelineStep['status'], at: number | null) => {
        // No timestamp, no step. A payout that never went on hold has no on-hold line.
        if (!at) return
        steps.push({ status, at, isCurrent: request.status === status })
    }

    push('completed', request.completedAt)
    push('failed', request.failedAt)
    push('pending', request.pendingAt)
    push('on_hold', request.onHoldAt)
    // `waiting` has no timestamp of its own: a request waits from the moment it exists.
    push('waiting', request.createdAt)

    if (request.createdAt) {
        /*
         * The closing line — "Withdraw submitted at …". Never current, because it is not a status: it
         * is the event the rest of the timeline hangs off, and legacy prints it as plain text under
         * every other step.
         */
        steps.push({ status: 'submitted', at: request.createdAt, isCurrent: false })
    }

    return steps
}

/** `{module}_{slug}` label for a timeline step. The submitted line has its own sentence. */
const STEP_LABELS: Record<PayoutTimelineStep['status'], string> = {
    completed: 'payout_status_success',
    failed: 'payout_status_rejected',
    pending: 'payout_status_in_progress',
    on_hold: 'payout_status_investigating',
    waiting: 'payout_status_waiting',
    submitted: 'payout_detail_submitted_at',
}

export function payoutStepLabel(status: PayoutTimelineStep['status']): string {
    return STEP_LABELS[status]
}
