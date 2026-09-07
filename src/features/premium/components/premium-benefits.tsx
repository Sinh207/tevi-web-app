'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import Image from 'next/image'
import { useState } from 'react'
import type { PremiumBenefit } from '../api/types'
import { useBenefitCopy } from '../hooks/use-benefit-copy'
import { usePremiumBenefits } from '../hooks/use-premium-benefits'
import type { SubscribePremiumFlow } from '../hooks/use-subscribe-premium'
import { PREMIUM_INSET, PREMIUM_PANEL } from '../lib/container'
import { PremiumBenefitDialog } from './premium-benefit-dialog'

/**
 * "What's included" — the list of perks, and the detail carousel behind it.
 *
 * ## The whole row opens the detail, and it is a real `<button>`
 *
 * Legacy puts an `onClick` on a `<Box>`: not focusable, not reachable by keyboard, and not announced
 * as anything. A row that opens a dialog is a button, so it is one — which also gives it the focus
 * ring and the return-focus behaviour the dialog needs to be usable at all.
 *
 * ## Failure is silent here, and only here
 *
 * This section is the *argument* for Premium, not a control. If the request fails the section is
 * simply absent and the page above and below it is unaffected — no toast, no retry button over
 * copy that is still correct. Legacy raises a toast for exactly this, on a page whose prices are
 * fine. The prices are the opposite case and `PremiumPlans` says so out loud.
 *
 * ## The copy is the server's, translated by lookup
 *
 * `useBenefitCopy` runs the English bundle backwards to find a key for each string — the mechanism,
 * and the way it fails soft, are in `lib/benefit-copy.ts`. A perk with no copy in the bundle reads
 * in English rather than disappearing.
 */
export function PremiumBenefits({
    /**
     * The screen's subscribe flow, or `null` for a member — it reaches the detail dialog's footer
     * button. The list itself never subscribes; it only opens the dialog.
     */
    subscribe,
}: {
    subscribe: SubscribePremiumFlow | null
}) {
    const { t } = useTranslation()
    const { benefits, isLoading, isError } = usePremiumBenefits()
    /** Which benefit the carousel opens on, or `null` for "closed". */
    const [openAt, setOpenAt] = useState<number | null>(null)

    if (isLoading) return <PremiumBenefitsSkeleton />
    if (isError || benefits.length === 0) return null

    /** See `reserveIcon` below — one decision for the whole list. */
    const hasIcons = benefits.some(benefit => benefit.icon !== null)

    return (
        <section className={cn(PREMIUM_INSET, 'flex flex-col gap-3')}>
            {/*
             * `onBrand`, because this heading sits on the band's **fade tail** — the violet that
             * runs on past the plan cards (see `PremiumHero`). Legacy paints the same label
             * `#E0E0E0` for exactly that reason; `--text-subtitle` here would be dark grey on
             * violet. The "About Tevi Premium" label below is the opposite case and keeps the token.
             */}
            <SectionRule label={t('premium_whats_included')} onBrand />

            <ul data-testid="premium-benefits" className={cn(PREMIUM_PANEL, 'flex flex-col')}>
                {benefits.map((benefit, index) => (
                    <li
                        /*
                         * **Position is the identity**, as it is in `CardCarousel`: the benefits are
                         * a fixed ordered set the backend decided, the list cannot be reordered or
                         * filtered here, and `slug` is *optional* on the wire — two rows without one
                         * (or two with the same one, which the payload does not forbid) would
                         * collide onto a single React key and reuse the wrong row's DOM. The slug is
                         * published as `data-row-key` on the row instead, where a duplicate is
                         * visible rather than destructive.
                         */
                        // biome-ignore lint/suspicious/noArrayIndexKey: positional by nature; see above
                        key={index}
                    >
                        <BenefitRow
                            benefit={benefit}
                            /*
                             * The icon column is reserved for the **list**, not per row, so rows
                             * with a mark and rows without still line their text up. And it is
                             * dropped entirely when *no* benefit has one, because a 44px hanging
                             * indent down a list of plain rows reads as a rendering fault — which
                             * is the state the payload is in whenever the backoffice has not
                             * uploaded marks yet.
                             */
                            reserveIcon={hasIcons}
                            onOpen={() => setOpenAt(index)}
                        />
                        {/*
                         * The hairline, **inset past the icon column** — legacy's
                         * `width: calc(100% - 45px); marginLeft: auto`, which is what makes the rule
                         * start under the text rather than cutting across the marks. A `divide-y`
                         * cannot do that (and would draw one above the first row), and putting the
                         * border on the `<li>` — which this had first — spans the whole panel.
                         *
                         * Drawn between rows only, and it is an element rather than a border so the
                         * inset can follow `reserveIcon`: with no marks in the payload there is no
                         * icon column to clear.
                         */}
                        {index < benefits.length - 1 && (
                            <span
                                aria-hidden
                                className={cn(
                                    'block h-px bg-(--separator-default)',
                                    hasIcons && 'ms-11',
                                )}
                            />
                        )}
                    </li>
                ))}
            </ul>

            {/*
             * Mounted only while open, so `initialIndex` is seeded on a fresh carousel every time —
             * see that prop's own note. Closing unmounts it, which is also what returns focus.
             */}
            {openAt !== null && (
                <PremiumBenefitDialog
                    benefits={benefits}
                    initialIndex={openAt}
                    subscribe={subscribe}
                    onClose={() => setOpenAt(null)}
                />
            )}
        </section>
    )
}

/**
 * A rule with the section's name in it — legacy's two 100px dividers either side of the label.
 *
 * `aria-hidden` on the lines: they are decoration, and the label is the heading. It is an `<h2>`
 * rather than a styled `<span>` so the section is reachable in a screen reader's outline, which the
 * legacy version is not.
 */
function SectionRule({ label, onBrand }: { label: string; onBrand?: boolean }) {
    return (
        <div className="flex items-center justify-center gap-3">
            <span
                aria-hidden
                className={cn(
                    'h-px w-[100px]',
                    onBrand ? 'bg-white/30' : 'bg-(--separator-default)',
                )}
            />
            <h2
                className={cn(
                    'type-body-strong',
                    onBrand ? 'text-white/80' : 'text-(--text-subtitle)',
                )}
            >
                {label}
            </h2>
            <span
                aria-hidden
                className={cn(
                    'h-px w-[100px]',
                    onBrand ? 'bg-white/30' : 'bg-(--separator-default)',
                )}
            />
        </div>
    )
}

function BenefitRow({
    benefit,
    reserveIcon,
    onOpen,
}: {
    benefit: PremiumBenefit
    /** Whether *any* benefit in the list has a mark — see the call site. */
    reserveIcon: boolean
    onOpen: () => void
}) {
    const copy = useBenefitCopy()

    return (
        <button
            type="button"
            data-testid="premium-benefit-row"
            data-row-key={benefit.slug ?? ''}
            onClick={onOpen}
            /*
             * `py-2.5` is 10px, so two rows sit 21px apart with the hairline between them — legacy's
             * spacing, measured. `py-3` put them 47 apart, which turns a list of four perks into a
             * list that has to be scrolled.
             */
            className="flex w-full cursor-pointer items-center gap-4 py-2.5 text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
        >
            {reserveIcon && <BenefitIcon benefit={benefit} />}
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="type-body-strong text-(--text-title)">
                    {copy(benefit.name)}
                    {benefit.tag && (
                        /*
                         * Inline with the name, as legacy has it — it qualifies the perk ("New"),
                         * so a block-level chip beside it would read as a second thing.
                         *
                         * `--accents-indigo-active` is the DS's own information blue; legacy's
                         * `#0061FF` has no token and this is the rung it lands on. Its ink is a
                         * fixed `white`, because the ground is fixed: `--text-on-brand` resolves to
                         * `--primary-500` — violet on blue, which is what this said first — and
                         * `--text-on-primary` flips to black in Dark. A tinted ground needs its own
                         * ink, and the trap is only visible when both modes are looked at.
                         */
                        <span className="type-caption-label ms-1 whitespace-nowrap rounded-[4px] bg-(--accents-indigo-active) px-1.5 py-0.5 text-white">
                            {copy(benefit.tag)}
                        </span>
                    )}
                </span>
                {benefit.description && (
                    <span className="type-dense-default text-(--text-subtitle)">
                        {copy(benefit.description)}
                    </span>
                )}
            </span>
            {/*
             * `rtl:-scale-x-100`, so it points the other way in Arabic — the glyph means "forward",
             * not "right". Same idiom as `PromotingCard`'s row chevron. Decorative: the button's own
             * text is its accessible name.
             */}
            <Icon
                name="angle-right"
                size={20}
                className="flex-none text-(--icon-secondary) rtl:-scale-x-100"
            />
        </button>
    )
}

/**
 * A benefit's mark, or nothing.
 *
 * ## Optimised, now that the host is known
 *
 * The URL is the **backend's**, and while the host was a guess this drew with `unoptimized`: an
 * unlisted host does not cost a 28px mark, it takes the list down — `next/image` validates the
 * hostname against `images.remotePatterns` and *throws* in development, 400s out of the optimizer in
 * production (`shared/config/image-hosts.test.ts` exists because of exactly that, on avatars).
 *
 * A captured payload settled it: `tevi-cdn.tevi.dev`, already configured. So these are ordinary
 * optimised images — and they are **PNGs** (`Spin.png`, `Payout.png`), not the SVGs legacy serves
 * elsewhere, so the 28px box genuinely saves bytes rather than passing a vector through.
 */
function BenefitIcon({ benefit }: { benefit: PremiumBenefit }) {
    if (!benefit.icon) {
        // No mark is a legitimate payload, and an empty 28px box keeps the text column aligned with
        // the rows that have one.
        return <span aria-hidden className="size-7 shrink-0" />
    }
    return (
        <Image
            src={benefit.icon}
            alt=""
            aria-hidden
            width={28}
            height={28}
            className="size-7 shrink-0 rounded-lg object-contain"
        />
    )
}

/**
 * Two rows' worth of placeholder inside the real panel.
 *
 * Two, not the eventual count: the number of benefits is not knowable before the request lands, and
 * a skeleton that guesses eight rows collapses to five with a visible jump. Legacy shows two for the
 * same reason. Each row is reserved at its **real** height (an icon, two lines of text) rather than
 * at the height of a 12px bar — see `Skeleton`'s own doc for why that distinction is the difference
 * between a placeholder and a layout shift.
 */
export function PremiumBenefitsSkeleton() {
    return (
        <section className={cn(PREMIUM_INSET, 'flex flex-col gap-3')} aria-busy>
            <div className="flex items-center justify-center">
                <Skeleton w={140} />
            </div>
            <div
                data-testid="premium-benefits-skeleton"
                className={cn(PREMIUM_PANEL, 'flex flex-col')}
            >
                {[0, 1].map(row => (
                    <div
                        key={row}
                        className="flex items-center gap-4 border-(--separator-default) py-3 not-last:border-b"
                    >
                        <Skeleton circle w={28} delay={row * 160} />
                        <div className="flex flex-1 flex-col gap-2">
                            <Skeleton w="45%" delay={row * 160} />
                            <Skeleton w="80%" delay={row * 160 + 80} />
                        </div>
                    </div>
                ))}
            </div>
        </section>
    )
}
