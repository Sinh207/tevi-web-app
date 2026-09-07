'use client'

import { CardCarousel, type CardCarouselHandle } from '@shared/components/card-carousel'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Dialog, DialogContent } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import { useRef, useState } from 'react'
import type { BenefitDetail, PremiumBenefit } from '../api/types'
import { useBenefitCopy } from '../hooks/use-benefit-copy'
import { usePremiumPlans } from '../hooks/use-premium-plans'
import { usePremiumPrice } from '../hooks/use-premium-price'
import type { SubscribePremiumFlow } from '../hooks/use-subscribe-premium'
import { PREMIUM_SURFACE_RADIUS } from '../lib/container'
import { PLAN_COPY } from '../lib/plans'

/**
 * One benefit, full size — with the rest of them a swipe away, and the offer under them.
 *
 * Opened by pressing a row, and it opens **on that row's benefit** (`initialIndex`). Landing on the
 * first perk instead of the one pressed is a different screen from the one the reader asked for,
 * which is why that prop was added to `CardCarousel` rather than worked around by reordering slides.
 *
 * ## Legacy's four parts, in legacy's order
 *
 * A 390-tall banner, the name and description under it, then a **footer**: a lifted white bar
 * carrying the dots and a Subscribe button, with two navigation discs hanging outside the dialog.
 * The footer is the part this dialog shipped without, and it is why it did not read as the same
 * screen — a reader convinced by a perk had to close the dialog and scroll back to the cards to act
 * on it.
 *
 * The button routes through the **same** `useSubscribePremium` the plan cards use, so it gets the
 * same account gate, the same confirmation and the same price formatter. That is what makes a second
 * entry point safe rather than a second implementation of buying: the flow is created once in
 * `PremiumView` and handed down, so there is one `pending` state and one confirmation in the tree.
 *
 * ## A dialog at every width, and no bottom sheet
 *
 * Legacy renders a `Dialog` from `sm` up and a bottom `Drawer` below it. This app is **not porting
 * `ResponsiveModal`** — a decision that predates this screen — so the dialog is capped in height
 * instead and scrolls its own body. One surface, one set of focus and dismiss behaviours.
 *
 * ## Swiper is not used, and that is the point of `CardCarousel`
 *
 * Legacy pulls in `swiper` with three modules to page between a handful of pictures. `CardCarousel`
 * runs on **Embla** — 11 KB gzipped against Swiper's ~40, headless, so the geometry here is still
 * this repo's — and the autoplay it defaults to is switched **off**: a dialog the reader opened to
 * read one perk must not slide away from under them.
 *
 * The arrows are this file's, driven through that component's `ref`, because they sit *outside* the
 * dialog where nothing rendered inside it could reach.
 */
export function PremiumBenefitDialog({
    benefits,
    initialIndex,
    subscribe,
    onClose,
}: {
    benefits: PremiumBenefit[]
    initialIndex: number
    /**
     * The screen's subscribe flow, or `null` when there is nothing to offer — a member. `null`
     * renders no footer button, and the dots then sit in the bar on their own, which is what legacy
     * shows a member too (its `BtnSubscribe` returns `null` on `isPremium`).
     */
    subscribe: SubscribePremiumFlow | null
    onClose: () => void
}) {
    const { t } = useTranslation()
    const carousel = useRef<CardCarouselHandle>(null)
    /**
     * Mirrored from the carousel so the arrows can hide themselves at the ends. The scroll position
     * owns this — see that component's own note — so this is a readout, never a second source.
     */
    const [at, setAt] = useState({ index: initialIndex, count: benefits.length })

    return (
        <Dialog
            open
            onOpenChange={open => {
                if (!open) onClose()
            }}
        >
            <DialogContent
                data-testid="premium-benefit-dialog"
                /*
                 * `overflow-visible` on the popup, with the scroll on the **box inside** it — which
                 * is what lets the arrows sit 44px clear of the dialog's edges the way legacy draws
                 * them. `DialogContent`'s own `overflow-y-auto` would clip anything outside.
                 *
                 * The height cap stays on the popup (the pattern that component documents) and the
                 * inner box is `min-h-0 flex-1`, so it is the thing that scrolls on a short viewport
                 * and the footer is always reachable.
                 */
                className="flex w-[390px] max-h-[min(88vh,720px)] flex-col gap-0 overflow-visible p-0"
            >
                {/*
                 * The clipping box. It carries the dialog's radius so the banner's top corners are
                 * cut by it — the picture is full-bleed, so without this it squares them off.
                 */}
                {/*
                 * `--background-surface`, not the popup's own `--background-subtle`: legacy's dialog
                 * paper is one white from the picture to the button, and leaving the caption on the
                 * subtle grey put two slightly different whites either side of the footer's shadow.
                 */}
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-(--background-surface)">
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {/*
                         * ## No `DialogTitle`, and that is a considered omission
                         *
                         * The dialog's subject **changes as it is swiped**, so a fixed title would
                         * be a heading that stops describing what is under it. Each slide carries its
                         * own name as an `<h3>` instead, and the dialog is labelled by the carousel's
                         * own `aria-roledescription`/`aria-label` pair. `base-ui` requires no title.
                         */}
                        <CardCarousel
                            ref={carousel}
                            testId="premium-benefit"
                            label={t('premium_benefits_label')}
                            slideLabel={(index, count) =>
                                t('premium_benefits_slide', { index, count })
                            }
                            initialIndex={initialIndex}
                            onIndexChange={(index, count) => setAt({ index, count })}
                            /*
                             * Off. A carousel opened deliberately, to read one thing, must not
                             * advance on a timer — WCAG 2.2.2 aside, it would move the reader off the
                             * perk they pressed.
                             */
                            autoplayMs={0}
                            /*
                             * **Off**, because the dots belong in the lifted footer beside the
                             * Subscribe button — which is where legacy puts them, and somewhere this
                             * component cannot reach. The footer draws them and drives the carousel
                             * through the same handle the arrows use. Hiding them with a selector
                             * instead left two sets in the DOM carrying one `data-testid`.
                             */
                            dots={false}
                            className="gap-0"
                        >
                            {benefits.map((benefit, index) => (
                                /* Positional, and `initialIndex` addresses the slides by position
                                   too — see the list's own note in `premium-benefits.tsx`. */
                                // biome-ignore lint/suspicious/noArrayIndexKey: positional by nature
                                <BenefitSlide key={index} benefit={benefit} />
                            ))}
                        </CardCarousel>
                    </div>

                    <BenefitFooter
                        benefits={benefits}
                        index={at.index}
                        subscribe={subscribe}
                        onGo={i => carousel.current?.goTo(i)}
                    />
                </div>

                {/*
                 * The two arrows, **outside** the dialog — legacy's `-45px`, 40px black discs with a
                 * white chevron. `md:` only: a touch reader swipes, and two discs hanging off a
                 * 390-wide dialog on a 390-wide screen would be off the viewport.
                 *
                 * Hidden rather than disabled at the ends, which is what legacy's Swiper does
                 * (`display: none !important` on `.swiper-button-disabled`): a dimmed arrow on the
                 * first of twelve slides is a control that has to be pressed to be understood.
                 */}
                {at.index > 0 && (
                    <NavArrow
                        side="start"
                        label={t('premium_benefits_prev')}
                        onClick={() => carousel.current?.prev()}
                    />
                )}
                {at.index < at.count - 1 && (
                    <NavArrow
                        side="end"
                        label={t('premium_benefits_next')}
                        onClick={() => carousel.current?.next()}
                    />
                )}

                {/*
                 * Over the picture, so it is a **translucent disc with a white glyph** rather than
                 * the app's `DialogCloseButton` — that one is a ghost button with `--text-title`
                 * ink, i.e. a near-black cross on whatever the photograph happens to put behind it.
                 *
                 * Legacy's values: a 26px disc washed `#e1e1e13d` (light grey at 24%) with a white
                 * icon, 8 from each edge. Kept, including the wash, because it is what the product
                 * draws — with the caveat that the *glyph*'s contrast then depends on the art behind
                 * it, and Brand's banners are mid-tone. `backdrop-blur` is ours, and it is what
                 * keeps the disc readable over a busy one. 32 rather than 26: 26 is under the 24px
                 * minimum once the glyph is inside it.
                 *
                 * Last in the DOM, which is the rule `DialogCloseButton` carries and the reason for
                 * it holds here too: base-ui's initial focus must not land on the way out, and on a
                 * dialog whose content is a picture this is the only focusable thing there is.
                 */}
                <button
                    type="button"
                    data-testid="premium-benefit-dialog-close"
                    aria-label={t('common_close')}
                    onClick={onClose}
                    className="absolute end-2 top-2 flex size-8 cursor-pointer items-center justify-center rounded-full bg-white/25 text-white backdrop-blur-sm transition-colors hover:bg-white/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                >
                    <Icon name="xmark" size={18} />
                </button>
            </DialogContent>
        </Dialog>
    )
}

/** One of legacy's two 40px navigation discs, 44px clear of the dialog's edge. */
function NavArrow({
    side,
    label,
    onClick,
}: {
    side: 'start' | 'end'
    label: string
    onClick: () => void
}) {
    return (
        <button
            type="button"
            data-testid={side === 'start' ? 'premium-benefit-prev' : 'premium-benefit-next'}
            aria-label={label}
            onClick={onClick}
            className={cn(
                'absolute top-1/2 hidden size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 md:flex',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                side === 'start' ? '-start-11' : '-end-11',
            )}
        >
            {/*
             * `rtl:-scale-x-100` on both: the glyphs mean "toward the start" and "toward the end",
             * and the carousel's own travel is direction-agnostic (see `CardCarousel`).
             */}
            <Icon
                name={side === 'start' ? 'angle-left' : 'angle-right'}
                size={20}
                className="rtl:-scale-x-100"
            />
        </button>
    )
}

/**
 * The lifted bar under the picture — the dots, and the offer.
 *
 * `shadow-[0_2px_10px_0_rgba(0,0,0,0.10)]` is legacy's own value, written out because the DS's
 * elevation ramp has no upward-cast shadow: every `--elevation-*` is drawn for a surface sitting
 * *on* the page, and this one has to read as a bar lifted above content that scrolls under it.
 */
function BenefitFooter({
    benefits,
    index,
    subscribe,
    onGo,
}: {
    benefits: PremiumBenefit[]
    index: number
    subscribe: SubscribePremiumFlow | null
    onGo: (index: number) => void
}) {
    const { t } = useTranslation()
    const { plans } = usePremiumPlans()
    const price = usePremiumPrice()
    const annual = plans.annual

    return (
        <footer className="flex flex-none flex-col gap-3 bg-(--background-surface) p-3 shadow-[0_2px_10px_0_rgba(0,0,0,0.10)]">
            {/*
             * A row of twelve dots between a photograph and a purchase button is what tells the
             * reader the perk they are looking at is one of twelve — so they are here, in the bar,
             * where legacy has them, rather than under the track where `CardCarousel` draws its own.
             *
             * A press parks that slide (`goTo` on the same handle the arrows drive), which is what
             * legacy's `pagination: { clickable: true }` does. The 8px mark sits in a 24px button
             * for the reason the mark's own note gives.
             */}
            {benefits.length > 1 && (
                <div className="flex items-center justify-center gap-2">
                    {benefits.map((_benefit, i) => (
                        <button
                            // biome-ignore lint/suspicious/noArrayIndexKey: positional by nature
                            key={i}
                            type="button"
                            data-testid="premium-benefit-dot"
                            data-index={i}
                            aria-label={t('premium_benefits_slide', {
                                index: i + 1,
                                count: benefits.length,
                            })}
                            aria-current={i === index}
                            onClick={() => onGo(i)}
                            className="flex size-6 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                        >
                            {/*
                             * The dot is 8px, far under the 24px a pointer target needs (WCAG
                             * 2.5.8), so the *button* is 24 with the mark drawn inside it — the same
                             * construction `CardCarousel` uses, and legacy's 8px mark with its
                             * active scale of 1.2.
                             */}
                            <span
                                className={cn(
                                    'size-2 rounded-full transition-[background-color,scale]',
                                    i === index
                                        ? 'scale-[1.2] bg-(--primary-500)'
                                        : 'bg-(--separator-default)',
                                )}
                            />
                        </button>
                    ))}
                </div>
            )}

            {/*
             * The offer. Absent for a member and absent when the catalogue has no annual package —
             * a Subscribe button with no price on it is the one thing this bar must not draw.
             *
             * The annual plan specifically, as legacy's `BtnSubscribe` does: this is a nudge from
             * inside a perk rather than a price comparison, and the recommended plan is the one the
             * cards crown too.
             */}
            {subscribe && annual && (
                <Button
                    data-testid="premium-benefit-subscribe"
                    variant="accent"
                    size="large"
                    fullWidth
                    disabled={subscribe.isBusy}
                    onClick={() => subscribe.request(annual)}
                >
                    {t('premium_subscribe_for')}{' '}
                    {t(PLAN_COPY.annual.price, { price: price(annual.price, annual.currency) })}
                </Button>
            )}
        </footer>
    )
}

/**
 * One benefit: its picture, its words, and — if it carries any — its **Free against Premium** table.
 *
 * ## The table is not an alternative to the picture, and not a slug
 *
 * Legacy branches this slide on `slug === 'star-purchase-bonus'`, which was true when that was the
 * only benefit with `details`. The real payload has **two**: `enhanced-storage-upload` carries three
 * rows (video length, file size, quality) that legacy has therefore never displayed — it reads them
 * elsewhere, in the post composer's upload limits, and drops them here.
 *
 * So the rule is the data's: **rows are drawn when there are rows**, under whatever picture and copy
 * the benefit also has. `star-purchase-bonus` comes out identical to legacy's version by
 * coincidence rather than by a special case — its `banner` is `""` on the wire, so it has no picture
 * to draw and the table is the whole slide.
 */
function BenefitSlide({ benefit }: { benefit: PremiumBenefit }) {
    const copy = useBenefitCopy()
    const { t } = useTranslation()
    /*
     * A row needs both halves to be a comparison. One-sided rows are dropped rather than printed
     * with a gap: "Free: — / Premium: 10%" reads as a missing value rather than as an absent
     * feature, and the payload does not distinguish the two.
     */
    const rows = benefit.details.filter(row => row.free_value && row.prem_value)
    /*
     * `min-h-full justify-center` because **every slide is as tall as the tallest** — a track is one
     * row, and the picture slides are 390 of banner plus a caption. Legacy has the same constraint
     * (its Swiper is not in `autoHeight` mode) and lets a short slide sit at the top with the
     * surplus below it; centring costs nothing and stops the void reading as a broken slide. A
     * dialog that resized as it was swiped would be the alternative, and it is worse.
     */
    const centred = !benefit.banner && 'min-h-full justify-center'

    return (
        <article className={cn('flex flex-col', centred)}>
            {benefit.banner && (
                /*
                 * **Optimised.** The host is `tevi-cdn.tevi.dev` (one benefit's banner is on
                 * `.tevi.app`), and both are already in `images.remotePatterns` — confirmed against
                 * a captured payload, which is what closed that half of **B93**. It was
                 * `unoptimized` while the host was a guess, because an unlisted one does not cost a
                 * picture: `next/image` *throws* in development and answers 400 from the optimizer.
                 * Now it earns AVIF and a width per device on the largest image the screen draws.
                 *
                 * The 390 square is legacy's own box (`width: 390, height: 390`, `objectFit:
                 * cover`), so art of any ratio is cropped rather than letterboxed.
                 */
                <Image
                    src={benefit.banner}
                    alt=""
                    aria-hidden
                    width={390}
                    height={390}
                    /*
                     * 390 square is legacy's box — but **240 when the slide also carries a table**.
                     *
                     * That combination is one legacy never draws (it branches the whole slide on a
                     * slug, so `enhanced-storage-upload`'s three rows are invisible there), so there
                     * is no legacy value to copy and this is a decision rather than a port. The
                     * arithmetic is the reason: 390 of picture plus a caption plus three rows plus
                     * the footer is ~750, past the dialog's `min(88vh,720px)` cap, so the third row
                     * lands below the fold of a scrollport whose footer is pinned — the reader sees
                     * a comparison cut off mid-list with nothing saying there is more. At 240 the
                     * whole table fits, and the picture is still the first thing on the slide.
                     */
                    className={cn(
                        'w-full object-cover',
                        rows.length > 0 ? 'h-[240px]' : 'h-[390px]',
                    )}
                />
            )}
            <div className="flex flex-col items-center gap-2 p-5 text-center">
                <h3 className="type-body-strong text-(--text-title)">
                    {copy(benefit.name)}
                    {benefit.tag && (
                        <span className="type-caption-label ms-1 whitespace-nowrap rounded-[4px] bg-(--accents-indigo-active) px-1.5 py-0.5 text-white">
                            {copy(benefit.tag)}
                        </span>
                    )}
                </h3>
                {benefit.description && (
                    /*
                     * Three lines, as legacy clamps it (`WebkitLineClamp: 3`). It is the backoffice
                     * writing this: without a clamp one long perk makes its slide taller than the
                     * twelve beside it, and since every slide is as tall as the tallest, the footer
                     * moves for all of them.
                     */
                    <p className="type-dense-default line-clamp-3 text-(--text-subtitle)">
                        {copy(benefit.description)}
                    </p>
                )}

                {rows.length > 0 && (
                    /*
                     * `text-start` resets the caption block's centring: a comparison is a table, and
                     * its labels have to line up down the leading edge to read as columns.
                     */
                    <dl className="flex w-full flex-col gap-3 pt-1 text-start">
                        {rows.map((row, index) => (
                            <ComparisonRow
                                key={row.slug ?? `row-${index}`}
                                row={row}
                                freeLabel={t('premium_compare_free')}
                                premiumLabel={t('premium_compare_premium')}
                            />
                        ))}
                    </dl>
                )}
            </div>
        </article>
    )
}

function ComparisonRow({
    row,
    freeLabel,
    premiumLabel,
}: {
    row: BenefitDetail
    freeLabel: string
    premiumLabel: string
}) {
    const copy = useBenefitCopy()

    return (
        <div className="flex flex-col gap-1">
            {row.title && (
                <dt className="type-caption-label text-(--text-subtitle)">{copy(row.title)}</dt>
            )}
            {/*
             * Two halves of one bar, as legacy draws it: the free tier neutral, the Premium tier
             * marked in gold.
             *
             * ## ⚠ Legacy's orange, with legacy's ink **inverted**
             *
             * The ground is `--accents-warning-active` (`#ca8a04`, the DS rung legacy's `#F97316`
             * lands on) and the ink is a fixed near-black, which measures **7.3:1**. Legacy paints
             * white on that orange: **2.9:1**, well under AA's 4.5 for 14px text, on the one line of
             * this dialog somebody actually has to read to compare two numbers.
             *
             * The first attempt kept white ink and dropped the ground to the warning *tint*
             * (`#fefce8`) to make it pass. It passed and it looked broken: a near-white half beside
             * a grey half marks nothing, and the bar read as a rendering fault rather than as a
             * comparison. Dark-on-gold keeps the mark and clears AA — so the divergence from legacy
             * is one colour, and it is the text's.
             *
             * Both values are **fixed**, not tokens: `--accents-warning-active` is the same
             * `#ca8a04` in Dark (only its `-focus`/`-bg-*` tiers flip), so a `--text-title` ink
             * would go near-white there and take the contrast back down to 3.2. A tinted ground
             * needs its own ink.
             *
             * ## The free half is **unpainted**, and legacy's grey is the reason
             *
             * Legacy fills it `#E1E1E1` on a white dialog. There is no semantic token for a neutral
             * *fill* in this system — `--background-subtle` is what `DialogContent` already paints
             * itself with, so the half would be invisible (the same trap `PREMIUM_PANEL` warns
             * about, walked into from the other side), and reaching for `--zinc-200` is exactly the
             * raw-ramp use CLAUDE.md forbids. So the bar carries one hairline and only the marked
             * half is filled: still two-tone, still one bar, no invented value.
             *
             * ## Equal halves, at the caption tier — the two sizes are one decision
             *
             * `w-1/2 min-w-0` is what makes a *comparison* read as one: two bars whose split lands
             * in a different place are a visual wobble down the list, which is what `flex-auto`
             * (sizing each half from its own content) produced. Equal halves then dictate the type
             * — at `type-dense-emphasis` (14px) "Premium · 10% bonus" does not fit 170px and
             * truncated mid-word, so this is the 12px caption tier, the same one the `dt` label
             * above it uses. Legacy has 16px in the same space and no overflow handling at all.
             *
             * `truncate` stays as the floor for a value the backoffice writes an essay into.
             */}
            <dd
                className={cn(
                    'flex overflow-hidden border border-(--separator-default)',
                    PREMIUM_SURFACE_RADIUS,
                )}
            >
                <span className="flex w-1/2 min-w-0 items-center justify-between gap-2 px-2 py-1.5">
                    <span className="type-caption-label flex-none text-(--text-subtitle)">
                        {freeLabel}
                    </span>
                    <span className="type-caption-label truncate text-(--text-title)">
                        {copy(row.free_value)}
                    </span>
                </span>
                <span
                    className={cn(
                        'flex w-1/2 min-w-0 items-center justify-between gap-2 bg-(--accents-warning-active) px-2 py-1.5',
                        PREMIUM_SURFACE_RADIUS,
                    )}
                >
                    <span className="type-caption-label flex-none text-(--black)">
                        {premiumLabel}
                    </span>
                    <span className="type-caption-label truncate text-(--black)">
                        {copy(row.prem_value)}
                    </span>
                </span>
            </dd>
        </div>
    )
}
