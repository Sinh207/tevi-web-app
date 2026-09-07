import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
    GatewayPreview,
    PackageGridPreview,
    SkeletonPreview,
    TransactionPreview,
    UnavailablePreview,
} from './preview'

export const metadata: Metadata = {
    title: 'Get Star',
    robots: { index: false, follow: false },
}

/**
 * Dev-only preview of the Star sheet's two data-driven steps: `pnpm dev`, then open /dev/get-star.
 * 404s in production (`proxy.ts` stops the request; the `notFound()` below is the belt to that braces).
 *
 * The **checkout itself** is not here, deliberately: it takes the machine's action and its submit
 * callbacks, so a harness would have to re-implement `PaymentProvider` and the two would drift. What
 * this previews is every piece whose state no URL can reach — the bonus badge and the "you receive"
 * line on the selected tile, the recommended badge, the gateway rows with their `≈ per Star` line,
 * the purchase history's month headers and three statuses, the *not supported* screen (which needs a
 * region with no gateway enabled), and both skeletons.
 */
export default function DevGetStarPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="flex flex-col gap-10 p-6">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">Get Star</h1>
                <p className="type-dense-default text-(--text-body)">
                    `features/payment` — step 1 (the package grid) and step 2&apos;s method list, as
                    the purchase sheet renders them. Pick a tile to see the bonus fold into
                    &quot;you receive&quot;.
                </p>
            </header>

            <section className="flex max-w-[400px] flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">
                    Packages — bonus, the recommended badge, and a selected tile
                </h2>
                <PackageGridPreview />
            </section>

            <section className="flex max-w-[400px] flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">
                    Methods — a card gateway, a wallet, and one with no conversion rate
                </h2>
                <GatewayPreview />
            </section>

            <section className="flex max-w-[560px] flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">
                    Transaction history — the three statuses, an unknown one, and a row whose
                    payment is missing entirely
                </h2>
                <TransactionPreview />
            </section>

            <section className="flex max-w-[400px] flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">
                    Not supported — the catalogue answered empty, and the way out is the app
                </h2>
                <UnavailablePreview />
            </section>

            <section className="flex max-w-[560px] flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">
                    Loading — the purchase page&apos;s skeleton, then the history&apos;s
                </h2>
                <SkeletonPreview />
            </section>
        </main>
    )
}
