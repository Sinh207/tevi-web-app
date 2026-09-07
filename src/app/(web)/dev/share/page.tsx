'use client'

import { ShareDialog, spaceShareContext } from '@features/share'
import { Button } from '@shared/ui/button'
import { notFound } from 'next/navigation'
import { useState } from 'react'

/**
 * Dev-only harness for the share sheet: `pnpm dev`, then `/dev/share`. 404s in production, and
 * `proxy.ts` blocks `/dev/*` outright so the status is a real 404.
 *
 * ## Why it needs a harness rather than a screen
 *
 * Nothing raises the sheet in the app yet — the space bar and the follow-requests empty state still
 * open the platform share sheet (`features/share/index.ts` says why that swap is a product decision).
 * So this is the only place it can be looked at, and the two cases below are the ones that behave
 * differently rather than two examples of the same thing:
 *
 * - **With a context** → `POST v1/links` per channel, so pressing Telegram and then X mints two
 *   links and the analytics can tell them apart.
 * - **Without one** → `POST v1/shorten/`, one link for every row. Both are legitimate; the second is
 *   what a caller that cannot name its content gets.
 *
 * Neither mints anything against a real backend unless `pnpm dev` is pointed at one — a failed mint
 * is itself worth seeing here, because the sheet has to fall back to the plain URL rather than
 * showing an empty line, which is the bug this port exists to not repeat.
 *
 * The art is a committed illustration rather than a CDN avatar: `pnpm art:audit` fails on any remote
 * image URL in `src/`, and a harness is not an exception to that.
 */
const THUMB = '/illustrations/identification/verified.webp'

export default function ShareHarness() {
    if (process.env.NODE_ENV === 'production') notFound()

    const [open, setOpen] = useState<'context' | 'plain' | null>(null)

    return (
        <main className="mx-auto flex w-full max-w-[612px] flex-col gap-8 p-6">
            <h1 className="type-title-t1-semibold m-0 text-(--text-title)">Share sheet</h1>

            <section className="flex flex-col gap-4">
                <h2 className="type-dense-strong m-0 text-(--text-subtitle)">
                    A space — content context, so one link per channel
                </h2>
                <Button variant="accent" onClick={() => setOpen('context')}>
                    Share a space
                </Button>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="type-dense-strong m-0 text-(--text-subtitle)">
                    No context — one plain short link for every row
                </h2>
                <Button variant="secondary" onClick={() => setOpen('plain')}>
                    Share a URL
                </Button>
            </section>

            <ShareDialog
                open={open === 'context'}
                onOpenChange={next => setOpen(next ? 'context' : null)}
                url="https://tevi.com/@edwards"
                title="Edwards"
                image={THUMB}
                context={spaceShareContext({ id: '1234', slug: 'edwards' })}
            />
            <ShareDialog
                open={open === 'plain'}
                onOpenChange={next => setOpen(next ? 'plain' : null)}
                url="https://tevi.com/brand-assets"
                title="Brand assets"
            />
        </main>
    )
}
