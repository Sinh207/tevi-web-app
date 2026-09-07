import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CardListPreview, CardSkeletonPreview } from './preview'

export const metadata: Metadata = {
    title: 'Card management',
    robots: { index: false, follow: false },
}

/**
 * Dev-only preview of `/card-management`'s list: `pnpm dev`, then open /dev/card-management. 404s in
 * production (`proxy.ts` stops the request; the `notFound()` below is the belt to that braces).
 *
 * It exists because the real screen needs **a saved card**, i.e. a real Stripe SetupIntent and a real
 * card number — the same argument `/dev/my-membership` makes about needing a live subscription. Every
 * state below is pure props, so this is the shipped component with the shipped copy.
 *
 * What it cannot preview is the **empty** state: that lives inside `CardManagementView`, which owns the
 * query and the auth gate. `/card-management` itself shows it to any signed-in account with no cards,
 * which is every account until the payment sheet ships.
 */
export default function DevCardManagementPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="flex flex-col gap-10 py-6">
            <header className="flex flex-col gap-1 px-6">
                <h1 className="type-title-t1-bold text-(--text-title)">Card management</h1>
                <p className="type-dense-default text-(--text-body)">
                    `features/payment` — the saved-card list as /card-management renders it:
                    legacy&apos;s arrangement (a sticky section header, one bordered box per card,
                    the scheme strip and the PCI line), with the scheme marks from the same package
                    the web app uses.
                </p>
            </header>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline px-6 text-(--text-body)">
                    List — default, an expired card, and a wallet with no card block
                </h2>
                <CardListPreview />
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline px-6 text-(--text-body)">
                    At the cap — the button becomes a count
                </h2>
                <CardListPreview full />
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline px-6 text-(--text-body)">Loading</h2>
                <CardSkeletonPreview />
            </section>
        </main>
    )
}
