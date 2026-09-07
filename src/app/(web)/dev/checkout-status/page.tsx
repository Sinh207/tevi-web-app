import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { StatusPreview } from './preview'

export const metadata: Metadata = {
    title: 'Checkout status',
    robots: { index: false, follow: false },
}

/**
 * Dev-only preview of `CheckoutStatusDialog`'s five states: `pnpm dev`, then open
 * /dev/checkout-status. 404s in production.
 *
 * The dialog is pure props — a machine state in, a dialog out — so this is the shipped component, not a
 * mock. It exists because reaching `settling` or `slow` for real means a card payment that the bank
 * holds for the better part of a minute, and reaching `failed` means one that declines: three states
 * that are unreachable on purpose.
 */
export default function DevCheckoutStatusPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="flex flex-col gap-6 p-6">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">Checkout status</h1>
                <p className="type-dense-default text-(--text-body)">
                    `features/payment` — the five states, and the copy each `type` gets. The two
                    working states share the 60×60 tile with the three verdicts.
                </p>
            </header>
            <StatusPreview />
        </main>
    )
}
