import { ProgramCard } from '@shared/components/program-card'
import { PromoCard } from '@shared/components/promo-card'
import { Button } from '@shared/ui/button'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

export const metadata: Metadata = { title: 'End rail', robots: { index: false, follow: false } }

/**
 * The end rail's cards, in every state, at the width they actually render.
 *
 * The rail itself is not mounted here — it needs a 1292px window and it is chrome, so it is on
 * `/` already. What this page is for is the **states a live rail cannot show you at once**: a
 * campaign that is joined next to one that is not, a card with a reward line next to one without,
 * a title long enough to run over the corner art, and all of it in both themes.
 *
 * Both card shells are `shared/components`, so nothing here reaches into a feature — the five real
 * cards are these two shells plus data.
 */
function Row({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-3">
            <h2 className="type-dense-strong text-(--text-subtitle)">{title}</h2>
            <div className="flex flex-wrap items-start gap-4">{children}</div>
        </section>
    )
}

/** The live rail column is 318 wide; every card is previewed at exactly that. */
function Column({ children }: { children: ReactNode }) {
    return <div className="w-[318px]">{children}</div>
}

export default function EndRailPreviewPage() {
    // `/dev/*` is a development surface; it must not exist in production.
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 p-8">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-semibold text-(--text-title)">End rail</h1>
                <p className="type-body-default text-(--text-body)">
                    Legacy&rsquo;s &ldquo;Trending&rdquo; column. Cards at their real 318 width.
                </p>
            </header>

            <Row title="PromoCard — with an action (Log in, Premium)">
                <Column>
                    <PromoCard
                        title="Log in or sign up for Tevi"
                        body="Log in now to join the talk, and see what your favorite creators are up to."
                        action={<Button variant="accent">Log in</Button>}
                    />
                </Column>
                <Column>
                    <PromoCard
                        title="Subscribe to Premium"
                        body="Get faster payouts, extra spins and ad-free perks to boost your creator journey."
                        action={<Button variant="accent">Subscribe</Button>}
                    />
                </Column>
            </Row>

            <Row title="PromoCard — the whole card is the control (Lucky Wheel)">
                <Column>
                    <PromoCard
                        as="button"
                        title="Lucky Wheel"
                        body="Spin, win and have fun on Tevi."
                        className="cursor-pointer text-start"
                    />
                </Column>
                <Column>
                    {/* Server copy is unbounded; this is the case that finds a broken clamp. */}
                    <PromoCard
                        as="button"
                        title="A campaign name long enough to wrap onto three separate lines"
                        body="And a description that keeps going well past the point where anyone would still be reading it, to prove the card grows rather than clipping."
                        className="cursor-pointer text-start"
                    />
                </Column>
            </Row>

            <Row title="ProgramCard — not joined / joined / no reward">
                <Column>
                    <ProgramCard
                        logo="/campaign/affiliate-logo.png"
                        logoAlt=""
                        title="Affiliate programs"
                        body="Earn affiliate commission with one tap"
                        reward="Reward up to: $1,500.00 per day"
                        actionLabel="Join now"
                    />
                </Column>
                <Column>
                    <ProgramCard
                        logo="/campaign/affiliate-logo.png"
                        logoAlt=""
                        title="Affiliate programs"
                        body="Earn affiliate commission with one tap"
                        reward="Reward up to: $1,500.00 per day"
                        actionLabel="Manage"
                        actionJoined
                    />
                </Column>
                <Column>
                    {/* No reward line: the action pill has to push itself to the far edge. */}
                    <ProgramCard
                        logo="/campaign/affiliate-logo.png"
                        logoAlt=""
                        title="Grow your fanbase"
                        body="Two lines of description, clamped — this one is written long enough to reach the clamp and prove the ellipsis lands."
                        actionLabel="Join now"
                    />
                </Column>
            </Row>
        </main>
    )
}
