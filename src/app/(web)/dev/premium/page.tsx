import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PremiumPreview } from './preview'

export const metadata: Metadata = {
    title: 'Tevi Premium',
    robots: { index: false, follow: false },
}

/**
 * Dev-only preview of the `/premium` pieces: `pnpm dev`, then open /dev/premium. 404s in production.
 *
 * The screen itself is at `/premium` and is the thing to look at first — this page is for the states
 * it cannot show you:
 *
 * - **the plan cards against a known catalogue.** `/premium` shows whatever the backoffice is selling
 *   today, so the 25% discount line, the strike-through and the "no monthly plan, therefore no
 *   discount" degradation are not reproducible on demand. `features/premium/dev.ts` has the prices.
 * - **the two skeletons**, which are a few hundred milliseconds on a warm cache.
 * - **the benefit carousel**, whose slides are backoffice content — including the comparison table,
 *   a perk the translation bundle has no copy for (it must read in English rather than disappear)
 *   and a comparison payload with no usable rows, which is the shape legacy throws on.
 *
 * What it deliberately does **not** fake is the member state: the hero's thank-you, its gold heading
 * and its sparkle backdrop are behind the reader's real `isPremium`, and a harness that forged that
 * flag would be previewing a screen nobody can reach. Sign in as an account that has Premium.
 */
export default function DevPremiumPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="flex flex-col gap-6 p-6">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">Tevi Premium</h1>
                <p className="type-dense-default text-(--text-body)">
                    `features/premium` — the plan cards against a fixed catalogue, both skeletons,
                    and the benefit carousel's four slide shapes.
                </p>
            </header>
            <PremiumPreview />
        </main>
    )
}
