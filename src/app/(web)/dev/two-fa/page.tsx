import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { TwoFaPreview } from './preview'

export const metadata: Metadata = {
    title: 'Two-Step Verification',
    robots: { index: false, follow: false },
}

/**
 * `/dev/two-fa` — the five steps of the passcode dialog, side by side.
 *
 * **Four of them are otherwise unreachable in development.** The dialog opens only on a withdrawal by
 * an account carrying `two_fa_passcode: true`, and the recovery chain behind *Forgot passcode?* needs a
 * real email and the six-digit code inside it. So without this page the recovery UI could not be
 * reviewed at all — the same argument `/dev/payout` makes for its tracking rows.
 *
 * Rendered as **panels, not dialogs**: five popups would stack on one another at `z-50` and only the
 * last would be visible. The panel repeats `DialogContent`'s surface so the geometry is the real one;
 * what it cannot show is the overlay and the focus trap, which need the actual dialog.
 */
export default function DevTwoFaPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return <TwoFaPreview />
}
