'use client'

import type { Capability, CapabilityState } from '../lib/capabilities'
import { usePermission } from '../providers/permission-provider'

/**
 * Gate one **screen** on one capability.
 *
 * ```tsx
 * const { state, refresh } = useCapability('payout-agency')
 * if (state === 'loading') return <PayoutSkeleton />
 * if (state === 'error') return <RetryPanel onRetry={refresh} />
 * if (state === 'denied') return <AccessDenied />
 * return <PayoutConsole />
 * ```
 *
 * ## Why the four states are the whole hook
 *
 * Because collapsing them is the bug this feature exists to not repeat. Legacy's star-transfer screen
 * asks one question — "is it explicitly allowed?" — and renders **Access denied** for every other
 * answer, so an agency sees a permanent denial after a single failed request and has no retry. The
 * four states are what let a screen be right in each case, and they are computed in one place
 * (`lib/capabilities.ts`) so two gated screens cannot disagree about what a 502 means.
 *
 * `allowed` is deliberately *not* also exposed as a bare boolean here. A screen that branches on
 * `if (!allowed)` has, by construction, folded loading and error back into denial — which is the thing
 * this replaces. A row in a list wants the boolean and should call `can()` from `usePermission()`,
 * where the trade-off is stated and correct.
 */
export function useCapability(capability: Capability): {
    state: CapabilityState
    /** Re-read the grants — what an error state's retry button calls. */
    refresh: () => Promise<void>
} {
    const { state, refresh } = usePermission()
    return { state: state(capability), refresh }
}
