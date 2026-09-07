import { VerifiedBadge } from '@shared/components/verified-badge'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

export const metadata: Metadata = {
    title: 'Verified badge',
    robots: { index: false, follow: false },
}

/**
 * Dev-only harness for the verified tick: `pnpm dev`, then `/dev/verified-badge`. 404s in production
 * (and `proxy.ts` blocks `/dev/*` outright, so the status is a real 404 rather than a 200 with a 404
 * body).
 *
 * ## Why it cannot just be looked at on a space page
 *
 * The mark is **CDN art the backend chooses** (`verified_tick_badge.image` — bespoke per programme),
 * so drawing one needs a verified account in whatever environment is running. The three sizes below
 * are the three the app actually renders — 14 in a live card, 16 in a compact row, 24 beside a
 * display name — and the fourth is the only interactive one in the product: the space header's,
 * which opens the panel.
 *
 * `ART` stands in for that CDN asset with a **committed** illustration, because `pnpm art:audit`
 * fails on any remote image URL in `src/` and a harness is not an exception to that. It is the wrong
 * *drawing* on purpose: what this page is for is the geometry, the tap target, the dialog and how all
 * four behave in dark mode and under RTL.
 */
const ART = '/illustrations/identification/verified.webp'

export default function VerifiedBadgeHarness() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="mx-auto flex w-full max-w-[612px] flex-col gap-8 p-6">
            <h1 className="type-title-t1-semibold m-0 text-(--text-title)">Verified badge</h1>

            <section className="flex flex-col gap-4">
                <h2 className="type-dense-strong m-0 text-(--text-subtitle)">
                    Decorative — 14 / 16 / 24
                </h2>
                <div className="flex items-center gap-4">
                    <VerifiedBadge image={ART} size={14} />
                    <VerifiedBadge image={ART} size={16} />
                    <VerifiedBadge image={ART} size={24} />
                </div>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="type-dense-strong m-0 text-(--text-subtitle)">
                    Interactive — press it
                </h2>
                <div className="flex items-center gap-2">
                    <span className="type-title-t2-semibold text-(--text-title)">Test app</span>
                    <VerifiedBadge
                        image={ART}
                        size={24}
                        interactive
                        learnMoreHref="/@support/messages"
                    />
                </div>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="type-dense-strong m-0 text-(--text-subtitle)">No art — the gate</h2>
                {/* An unverified account still sends the object, so this row must be empty. */}
                <div className="flex h-6 items-center gap-2 text-(--text-body)">
                    <VerifiedBadge image={null} size={24} />
                    <span className="type-dense-default">nothing should be drawn to my left</span>
                </div>
            </section>
        </main>
    )
}
