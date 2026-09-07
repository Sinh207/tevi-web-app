import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MembershipCheckoutHarness } from './harness'

export const metadata: Metadata = {
    title: 'Membership checkout (webview)',
    robots: { index: false, follow: false },
}

/**
 * Dev-only harness for `/app/[channelSlug]/membership/[packageId]`: `pnpm dev`, then open
 * `/app/dev-checkout`. It `notFound()`s in production, and `robots.ts` disallows the whole `/app`
 * namespace.
 *
 * ⚠ It is under `/app/`, not `/dev/`, and that is not filing: `/dev/*` is a `(web)` route, so the
 * website's `PaymentProvider` would sit above it and claim the returning 3DS callback before the
 * screen could see it. `harness.tsx` has the full account. The short version is that a harness
 * rendering this screen inside providers the real route does not have is not testing the real screen.
 *
 * ## Why this one cannot be a props preview like the other harnesses
 *
 * Every other `/dev/*` page renders a component with fixtures. This screen has no fixture-shaped
 * surface: it is a *flow*, and the flow is gated on a **native host** being present
 * (`hasNativeBridge()`). In a browser the shipped screen correctly draws `unsupported` and stops —
 * which is the right behaviour and completely untestable.
 *
 * So the harness supplies the missing half: `bridge-stub.ts` installs a `TeviJSInterface` that answers
 * the four messages by making the same backend calls the app would, as the account this browser is
 * signed in as. Everything downstream is real — the tier, the saved cards, the PaymentIntent, Stripe
 * Elements, the settle poll and its `PM0003` branch.
 *
 * What it does **not** prove is the app's own envelope. See the caveat in `bridge-stub.ts` and
 * **B85**.
 */
export default function DevCheckoutHarnessPage() {
    if (process.env.NODE_ENV === 'production') notFound()
    return <MembershipCheckoutHarness />
}
