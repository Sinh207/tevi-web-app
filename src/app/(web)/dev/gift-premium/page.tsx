import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { GiftPremiumPreview } from './preview'

export const metadata: Metadata = {
    title: 'Gift Premium',
    robots: { index: false, follow: false },
}

/**
 * Dev-only preview of the `/gift-premium` pieces: `pnpm dev`, then open /dev/gift-premium. 404s in
 * production.
 *
 * The screen itself is at `/gift-premium` and is the thing to look at first. This page is for the
 * states it cannot show you, and on this screen most of them are properties of **other people's**
 * data rather than of the code:
 *
 * - **the catalogue's two unavailable answers.** Empty and failed are one sentence and one retry
 *   button apart, and `premium/v1/gift-packages/` is whatever the backoffice is selling today.
 * - **the picker's five states.** The invitation, the two-part skeleton, "nothing matched" and a
 *   failed search. The skeleton is a few hundred milliseconds on a warm cache; the two failures need
 *   a service to be down.
 * - **the Following strip with its arrows.** They exist only when there is somewhere to scroll, so on
 *   the real screen you would have to follow six or more people whose names all match one term.
 * - **the success screen**, otherwise reachable only by paying or by hand-crafting a `?gift_token=`.
 *
 * What it deliberately does not fake is the **charge**: nothing here is pressable through to
 * `checkout/`, so the confirmation and the checkout dialogs are not previewed. Those belong to
 * `features/payment` and are at `/dev/checkout-status`.
 */
export default function DevGiftPremiumPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="flex flex-col gap-6 p-6">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">Gift Premium</h1>
                <p className="type-dense-default text-(--text-body)">
                    `features/premium` — the gift cards against a fixed catalogue, the picker's five
                    states, the Following strip with its arrows, and the success screen.
                </p>
            </header>
            <GiftPremiumPreview />
        </main>
    )
}
