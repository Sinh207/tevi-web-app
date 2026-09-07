'use client'

import type { AnimatedAvatarProps } from '@shared/components/animated-avatar'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import type { ReactNode, Ref } from 'react'
import { Trans } from 'react-i18next'
import { PREMIUM_INSET } from '../lib/container'
import { PREMIUM_ART } from '../lib/illustrations'
import { PREMIUM_GOLD_INK, PREMIUM_HERO_RAMP, PREMIUM_ON_HERO } from '../lib/premium-surface'
import { GiftPremiumMark } from './gift-premium-mark'
import { PremiumSparkField } from './premium-spark-field'

/**
 * The brand band on `/gift-premium` — **the recipient's face in a gold ring, and one of two
 * messages under it.**
 *
 * The offer step is being asked for something ("give @ada access to exclusive features"); the
 * success step is being thanked ("Premium Delivered"). Legacy branches the same way on
 * `sendGiftSuccess` and layers its confetti texture over the gradient for the second — kept, because
 * that texture is the only thing on the page that marks the state as *done* rather than merely
 * differently worded.
 *
 * ## The band is as wide as the column, not as wide as the window
 *
 * It is a child of `PREMIUM_COLUMN`, so at desktop width it is a 612-wide violet column with the
 * page's grey either side — which is what legacy draws, because its gradient is on the
 * `<Container maxWidth='sm'>` rather than on the page. Painting it full-width turns the hero into a
 * 1700px slab and stops looking like the product.
 *
 * ## The bar sits *on* the band without being *in* it
 *
 * `sticky` is bounded by its containing block, so a bar nested in here would leave the top of the
 * screen the moment the band did. It is a sibling above this section instead, and the band is pulled
 * up underneath it — the `-mt-[60px] pt-[60px]` below, which is the same construction `PremiumHero`
 * documents at length.
 *
 * ## The avatar is 80px, where legacy draws 120
 *
 * `AvatarSize` stops at `2xl` (80) — the DS has no larger box, and `CLAUDE.md` makes the DS the
 * source of truth for anything it covers. A bespoke 120 would be this screen inventing a rung on a
 * scale eleven other surfaces share, so the ring is built at the largest size the system offers.
 * The gold is a wrapper whose padding *is* the ring, exactly as the featured plan card's is: a
 * gradient cannot be a `border-color`.
 */
export function GiftPremiumHero({
    state,
    handle,
    name,
    avatar,
    onSeeFeatures,
    sentinelRef,
    headingRef,
    children,
}: {
    /** Which of the two messages. See the note above. */
    state: 'offer' | 'sent'
    /** The recipient's handle, without the `@`. Always known — it is the identity on both steps. */
    handle: string
    /** Their display name, for the avatar's initials. `null` falls back to the handle. */
    name: string | null
    /**
     * The avatar's sources, when there are any.
     *
     * **Absent on the success step, by design.** That screen is rebuilt from `?gift_token=`, and no
     * image URL travels in that token — `next/image` validates hosts and *throws* on one it does not
     * know, so a crafted token would take the page down. `lib/gift-token.ts` carries the full
     * reasoning; here it means the ring holds initials, which is a face nobody can forge.
     */
    avatar?: Pick<AnimatedAvatarProps, 'thumb' | 'avatarVideo' | 'isPremium'>
    /** Opens the benefits carousel. Offer step only — see `GiftPremiumView`. */
    onSeeFeatures?: () => void
    /** Marks the band's last pixel for `useBandPassed`, which is what the bar's ink reads. */
    sentinelRef: (node: HTMLDivElement | null) => void
    /**
     * The step's own heading, so the view can move focus here when the step changes.
     *
     * A step change on this screen replaces the whole page body without a navigation, and focus was
     * left on the button that no longer exists — which the browser resolves to `<body>`. Measured: a
     * keyboard reader who chose a recipient landed nowhere, with nothing announced. Focusing the
     * heading re-anchors them and names the step they are on.
     */
    headingRef?: Ref<HTMLHeadingElement>
    /** The plan grid, on the offer step. Inside the band, because the cards *are* the offer. */
    children?: ReactNode
}) {
    const { t } = useTranslation()
    const label = name || handle

    return (
        <section
            data-testid="premium-gift-hero"
            /*
             * The band ends **solid violet** and the fade is the next section's background
             * (`PREMIUM_TAIL_RAMP`, applied by the view) — because the brand colour carries on past
             * the offer, behind the About panel's top. A band that faded inside its own box put that
             * panel on the page's grey instead. The `120px` stop is the bar's own height plus a
             * little, so the near-black always sits behind the bar and never creeps into the copy on
             * a short band.
             */
            className={cn(
                /*
                 * ⚠ **No `items-center` here**, and that is the whole reason the plan grid was the
                 * wrong width.
                 *
                 * `items-center` on a flex column makes every child shrink to its own content, so
                 * `{children}` — the three plan cards — laid out at **414px inside a 612 column**
                 * while `/premium`'s identical grid measured the full 612. Narrow, portrait cards
                 * beside `/premium`'s wide ones, from one word.
                 *
                 * The section stretches (the flex default) and the **copy block below carries its
                 * own `items-center`**, which is exactly how `PremiumHero` is built. Centring belongs
                 * to the block that is centred text, not to the column that holds a grid.
                 */
                'relative isolate flex flex-col gap-4 pb-6',
                '-mt-[60px] pt-[60px]',
                PREMIUM_HERO_RAMP,
            )}
        >
            {/*
             * Legacy's confetti layer, for the finished state only. A `background-image` rather than
             * an `<Image>`: it is a decorative wash with no box of its own (sized `contain`,
             * top-anchored), and describing it to a screen reader would announce a party. `-z-10`
             * with the section's `isolate` keeps it behind the copy without escaping into the page's
             * own stacking context.
             */}
            {/*
             * **The burst, thrown out of the coin** — the same field `/premium` puts behind its
             * mark, unchanged.
             *
             * It lines up without a parameter, which is worth stating because it looks like luck and
             * is not: `PremiumSparkField` launches every particle from 34% of its own 320px height,
             * i.e. 109px down, and this band puts the coin's centre at 60 (the bar) + 44 (half the
             * 88px face) = **104px**. Five pixels, on particles that start behind an opaque disc and
             * are invisible until they clear its edge.
             *
             * It is **first**, so on the success screen the confetti below sits over the sparks
             * rather than under them — the same order `PremiumHero` uses for the same two layers.
             */}
            <PremiumSparkField />

            {state === 'sent' && (
                <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 -z-10 bg-contain bg-top bg-no-repeat"
                    style={{ backgroundImage: `url(${PREMIUM_ART.backdrop.src})` }}
                />
            )}

            <div className={cn(PREMIUM_INSET, 'flex flex-col items-center gap-3')}>
                {/*
                 * The coin: this person's face in the gold ring, turning, with the burst above
                 * coming off it — `/premium`'s own object with the recipient on the front. See
                 * `GiftPremiumMark`, including why the back is the Premium badge and not a mirrored
                 * photograph.
                 */}
                <GiftPremiumMark
                    avatar={avatar}
                    initials={label.replace('@', '').slice(0, 2).toUpperCase()}
                />

                {state === 'sent' ? (
                    /*
                     * `tabIndex={-1}`: focusable **programmatically** and not a tab stop, which is
                     * what a step heading wants — the view focuses it on a step change and nobody
                     * has to Tab past a title to reach the controls.
                     */
                    <h2
                        ref={headingRef}
                        tabIndex={-1}
                        className="flex items-center gap-2 outline-none"
                    >
                        {/*
                         * The gold, clipped to the glyphs — legacy's treatment for this one heading,
                         * and why `PREMIUM_GOLD_INK` is its own constant. A flat `--text-title` here
                         * would be near-white on violet in Light and unreadable.
                         */}
                        <span className={cn('type-title-t1-bold text-center', PREMIUM_GOLD_INK)}>
                            {t('giftpremium_sent_title')}
                        </span>
                        {/* Legacy's 🎁, kept — and `aria-hidden`, because a screen reader reading
                            "wrapped gift" after "Premium Delivered" is the emoji's name, not news. */}
                        <span aria-hidden className="type-title-t1-bold">
                            🎁
                        </span>
                    </h2>
                ) : (
                    /*
                     * `<h2>`, because the bar above already carries this page's `<h1>` and it says
                     * the same two words. Legacy prints them twice too; what it does not do is give
                     * either of them a heading level.
                     */
                    <h2
                        ref={headingRef}
                        tabIndex={-1}
                        className={cn(
                            'type-title-t1-bold text-center outline-none',
                            PREMIUM_ON_HERO,
                        )}
                    >
                        {t('giftpremium_title')}
                    </h2>
                )}

                {/*
                 * The handle is emphasised **inside** a translated sentence, so `Trans` fills the
                 * tag rather than this file splitting a string on a phrase — each locale wraps its
                 * own wording, and the handle lands where that language puts it. The same mechanism,
                 * and the same numbered-tag convention, as `premium-about.tsx`.
                 *
                 * Legacy does this with `String.replace('[%s]', …)` into `dangerouslySetInnerHTML`,
                 * which puts a user-chosen handle into an HTML sink on a page that renders no HTML.
                 */}
                <p
                    className={cn(
                        'type-body-default max-w-[500px] text-center',
                        PREMIUM_ON_HERO,
                        '[&_b]:font-semibold',
                    )}
                >
                    <Trans
                        i18nKey={
                            state === 'sent' ? 'giftpremium_sent_body' : 'giftpremium_offer_body'
                        }
                        values={{ handle }}
                        components={[<b key="0" />]}
                    />
                </p>

                {onSeeFeatures && (
                    <Button
                        data-testid="premium-gift-see-features"
                        size="small"
                        onClick={onSeeFeatures}
                        /*
                         * Legacy's own pill: a translucent black capsule on the band, which reads on
                         * the violet in both themes where any DS variant would take a token that
                         * flips. `variant` is left at its default and the paint applied on top, for
                         * the reason the featured card's gold button gives.
                         */
                        className="h-7 rounded-full bg-black/50 px-3 text-white hover:not-disabled:bg-black/60"
                    >
                        {t('giftpremium_see_features')}
                        <Icon
                            name="angle-right"
                            weight="filled"
                            size={16}
                            className="rtl:-scale-x-100"
                        />
                    </Button>
                )}
            </div>

            {children}

            {/*
             * The band's last pixel, for the bar. Zero-height is the one shape
             * `IntersectionObserver` disagrees with itself about across engines, so it is one.
             */}
            <div ref={sentinelRef} aria-hidden className="h-px w-full" />
        </section>
    )
}
