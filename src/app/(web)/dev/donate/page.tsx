'use client'

import { useAuth } from '@features/auth'
import { balanceKeys } from '@features/balance'
import { DonateButton, DonateSupportCard } from '@features/donation'
import {
    type DirectDonate,
    DonateDialogs,
    DonationArt,
    donationFeeKeys,
    donationKeys,
    useDonateFlowPreview,
} from '@features/donation/dev'
import { Button } from '@shared/ui/button'
import { useQueryClient } from '@tanstack/react-query'
import { notFound } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * Dev-only preview of the direct-donation flow: `pnpm dev`, then `/dev/donate`. 404s in production.
 *
 * It exists because **every** screen in `features/donation` is behind a creator who has configured
 * an offer. There is no way to reach the dialog stack in a browser otherwise — not the amount field,
 * not the stepper's floor, not the confirm sentence, not the thank-you art — and a developer cannot
 * arrange the precondition, because it belongs to somebody else's account. Same reason as
 * `/dev/blocked-accounts` and `/dev/image-crop`.
 *
 * The offer is **seeded into the query cache** rather than passed as a prop: the components read it
 * through `useDirectDonate`, and giving them an injection point they would never use in production
 * is how a preview-only path ends up shipping. Seeding the real key exercises the real read.
 *
 * ## The seed has to land *before* the components mount, and the gate below is why
 *
 * `useQuery` fires on mount. Rendering the surfaces immediately meant the real endpoint was asked
 * about a slug that does not exist, answered 404 → `null`, and **overwrote the seed** — so the page
 * rendered nothing and looked like the components were broken. Seeding in an effect and holding the
 * surfaces back until it has run means the observer finds fresh data (60s `staleTime`) and never
 * fetches. `isBootstrapping` is part of the same gate: `activeId` is in the query key, and seeding
 * against the anonymous id before the session resolves seeds the wrong key.
 *
 * The **balance** and the card **fee** are seeded the same way, and for a reason worth naming: `useBalance` answers
 * `isKnown: false` for a signed-out visitor, so the summary's disclosure (Total folding open onto
 * "Your balance") and the shortfall warning are *both* invisible here without it — the two states
 * most worth looking at would be the two you could not reach. Two presets: comfortably funded, and
 * short of the default 300.
 *
 * ⚠ The **write** is real. Pressing through to "Yes, I want" posts to `billy/v1/gifting/…` for a slug
 * that does not exist and raises the error toast — which is itself the failure path worth looking at,
 * and is the honest limit of what a harness can fake without stubbing the model.
 */
const SLUG = 'dev-donation-preview'

const OFFERS: { label: string; note: string; offer: DirectDonate }[] = [
    {
        label: 'Coffee — the ordinary case',
        note: 'Star price, supporter count published, the creator wrote their own button text.',
        offer: {
            name: 'Coffee',
            icon: 'coffee',
            button_text: 'Buy me a coffee',
            thank_you_msg: null,
            display_supporter_count: true,
            donation_count: 128,
            prices: [
                { id: 'p1', amount: 100, amount_currency: 'TVS' },
                { id: 'p2', amount: 1, amount_currency: 'USD' },
            ],
        },
    },
    {
        label: 'Rose — no count, custom thank-you',
        note: 'display_supporter_count off, and the creator’s own thank-you line replaces ours.',
        offer: {
            name: 'Rose',
            icon: 'rose',
            button_text: null,
            thank_you_msg: 'You just made my whole week. See you in the next stream!',
            display_supporter_count: false,
            donation_count: 0,
            prices: [{ id: 'p3', amount: 250, amount_currency: 'TVS' }],
        },
    },
    {
        label: 'Unknown icon — art the client has none for',
        note: 'The backend adds a fifth metaphor. The gift glyph stands in; nothing breaks.',
        offer: {
            name: 'Taco',
            icon: null,
            button_text: null,
            thank_you_msg: null,
            display_supporter_count: true,
            donation_count: 7,
            prices: [{ id: 'p4', amount: 50, amount_currency: 'TVS' }],
        },
    },
    {
        label: 'Cash only — nothing renders',
        note: 'No TVS line, so both surfaces return null. This is the Stripe-shaped hole.',
        offer: {
            name: 'Pizza',
            icon: 'pizza',
            button_text: null,
            thank_you_msg: null,
            display_supporter_count: true,
            donation_count: 4,
            prices: [{ id: 'p5', amount: 5, amount_currency: 'USD' }],
        },
    },
]

export default function DonateDevPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    const { activeId, isBootstrapping } = useAuth()
    const queryClient = useQueryClient()
    const [index, setIndex] = useState(0)
    const [seeded, setSeeded] = useState(false)
    const [rich, setRich] = useState(true)

    useEffect(() => {
        if (isBootstrapping) return
        queryClient.setQueryData(donationKeys.offer(activeId, SLUG), OFFERS[index].offer)
        queryClient.setQueryData(balanceKeys.balance(activeId), { star: rich ? 1240 : 120, usd: 0 })
        /*
         * 2.9% + $0.30 grossed up, i.e. a card processor's ordinary shape. Seeded because the
         * payments service is a second host the harness has no account on — without it the Cash
         * tab shows an em dash for the fee, which is a real state but not the interesting one.
         */
        queryClient.setQueryData(donationFeeKeys.coefficients(activeId), {
            x: 0.029,
            y: 0.3,
            z: 0.971,
        })
        setSeeded(true)
    }, [queryClient, activeId, index, isBootstrapping, rich])

    const target = {
        slug: SLUG,
        name: 'Ada Lovelace',
        // A stand-in for the creator's photo — a bundled square, not a CDN URL. What is being
        // previewed is the badge's geometry against the tile, not the picture, and `src/` holds no
        // static CDN image any more (`docs/STATIC_ASSETS.md`).
        avatarUrl: '/campaign/affiliate-logo.png',
        shareUrl: 'https://tevi.com/@ada',
    }

    const preview = useDonateFlowPreview(OFFERS[index].offer, target)

    return (
        <main className="flex flex-col gap-8 p-6">
            <header className="flex max-w-2xl flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">Direct donate</h1>
                <p className="type-dense-default text-(--text-body)">
                    The Donate control from a space’s action row, the “Support” block from its About
                    tab, and the three dialogs behind both. Switch the offer to change what the
                    backend is pretending to say.
                </p>
                <ul className="type-caption-meta flex list-disc flex-col gap-1 ps-5 text-(--text-body)">
                    <li>
                        Star only. A cash-only offer renders <strong>nothing</strong> — the last
                        preset — because the checkout it needs does not exist in this repo yet.
                    </li>
                    <li>
                        The stepper floor is 1: press <code>−</code> at one and it disables rather
                        than silently refusing.
                    </li>
                    <li>
                        Type an amount between two units (150 at 100 a coffee) — the counter floors
                        to 1 and the amount stays 150. The amount is what is charged.
                    </li>
                    <li>
                        Signed out? Pressing Donate opens the login dialog instead of the form.
                        Signed in without enough Star? The shortfall toast appears <em>over</em> the
                        confirm dialog, which stays open.
                    </li>
                    <li>
                        Toggle the theme and an Arabic locale — tokens and logical properties
                        throughout.
                    </li>
                </ul>
            </header>

            <section className="flex max-w-[612px] flex-col gap-3">
                <h2 className="type-subheading-strong text-(--text-title)">Offer</h2>
                <div className="flex flex-wrap gap-2">
                    {OFFERS.map((preset, i) => (
                        <button
                            key={preset.label}
                            type="button"
                            onClick={() => setIndex(i)}
                            className={
                                i === index
                                    ? 'type-dense-emphasis rounded-[var(--radius-md)] bg-(--background-segment) px-3 py-2 text-(--text-title)'
                                    : 'type-dense-default rounded-[var(--radius-md)] px-3 py-2 text-(--text-body)'
                            }
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>
                <p className="type-caption-meta text-(--text-body)">{OFFERS[index].note}</p>

                <h2 className="type-subheading-strong text-(--text-title)">Star balance</h2>
                <div className="flex flex-wrap gap-2">
                    {(
                        [
                            [true, '1,240 Star — can afford it'],
                            [false, '120 Star — short of the default 300'],
                        ] as const
                    ).map(([value, labelText]) => (
                        <Button
                            key={labelText}
                            variant={rich === value ? 'primary' : 'secondary'}
                            size="medium"
                            onClick={() => setRich(value)}
                        >
                            {labelText}
                        </Button>
                    ))}
                </div>
            </section>

            <section className="flex max-w-[612px] flex-col gap-3">
                <h2 className="type-subheading-strong text-(--text-title)">
                    Action row — the two widths
                </h2>
                <p className="type-caption-meta text-(--text-body)">
                    Legacy’s rule, and the app’s: Donate <strong>hugs its label</strong> when it
                    shares the row and stretches when it is the only control. Done with{' '}
                    <code>w-fit only:w-full</code> rather than either button learning about the
                    other — so the class here has to match <code>channel-viewer-actions.tsx</code>{' '}
                    exactly, or this page previews a layout the app does not render. It did, once.
                </p>
                <div className="flex min-w-0 items-center gap-2">
                    <div className="type-dense-emphasis flex h-12 flex-1 items-center justify-center rounded-[var(--radius-lg)] bg-(--background-segment) text-(--text-body)">
                        Become a member (stand-in)
                    </div>
                    {seeded && <DonateButton target={target} className="w-fit only:w-full" />}
                </div>
                <p className="type-caption-meta text-(--text-body)">
                    …and alone, on a space that sells no membership:
                </p>
                <div className="flex min-w-0 items-center gap-2">
                    {seeded && <DonateButton target={target} className="w-fit only:w-full" />}
                </div>
            </section>

            <section className="flex max-w-[612px] flex-col gap-3">
                <h2 className="type-subheading-strong text-(--text-title)">
                    About tab — the Support block, in its card
                </h2>
                {/* The bordered card belongs to `features/channel`; reproduced here so the block is
                    previewed in the chrome it actually ships inside. */}
                <div className="min-w-0 rounded-[var(--radius-xl)] border border-(--separator-default) bg-(--background-surface)">
                    {seeded && <DonateSupportCard target={target} />}
                </div>
            </section>

            <section className="flex max-w-[612px] flex-col gap-3">
                <h2 className="type-subheading-strong text-(--text-title)">
                    The three dialogs, driven by hand
                </h2>
                <p className="type-caption-meta text-(--text-body)">
                    The real button runs through <code>useRequireAuth</code>, so signed out it opens
                    the login dialog and these are unreachable. This section drives{' '}
                    <code>useDonateFlowPreview</code> — the feature’s own arithmetic with the two
                    guards and the write taken out, so the form here behaves exactly like the real
                    one. Type into Amount, switch to Cash, paste something absurd.
                </p>
                <div className="flex flex-wrap gap-2">
                    {(['details', 'confirm', 'success'] as const).map(name => (
                        <Button
                            key={name}
                            variant="secondary"
                            size="medium"
                            onClick={() => preview.setStep(name)}
                        >
                            {name}
                        </Button>
                    ))}
                </div>
                <DonateDialogs flow={preview} target={target} />
            </section>

            <section className="flex max-w-[612px] flex-col gap-3">
                <h2 className="type-subheading-strong text-(--text-title)">
                    Art, and its fallback
                </h2>
                <div className="flex items-center gap-4">
                    {(['coffee', 'pizza', 'book', 'rose', null] as const).map(icon => (
                        <span key={icon ?? 'fallback'} className="flex flex-col items-center gap-1">
                            <DonationArt icon={icon} size={24} />
                            <span className="type-caption-meta text-(--text-body)">
                                {icon ?? 'none'}
                            </span>
                        </span>
                    ))}
                </div>
            </section>
        </main>
    )
}
