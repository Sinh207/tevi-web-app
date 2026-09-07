'use client'

import { useMyChannel } from '@features/channel'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Skeleton } from '@shared/ui/skeleton'
import type { ReactNode } from 'react'
import { Trans } from 'react-i18next'
import { usePremiumInfo } from '../hooks/use-premium-info'
import { PREMIUM_INSET } from '../lib/container'
import { formatExpiryDate } from '../lib/expiry-date'
import { PREMIUM_ART } from '../lib/illustrations'
import {
    PREMIUM_GOLD_INK,
    PREMIUM_HERO_RAMP,
    PREMIUM_ON_HERO,
    PREMIUM_ON_HERO_MUTED,
} from '../lib/premium-surface'
import { PremiumMark } from './premium-mark'
import { PremiumSparkField } from './premium-spark-field'

/**
 * The brand band: the bar, the mark, one of **two** messages, and the plan cards under them.
 *
 * A visitor is being sold something ("go beyond the limit…"); a member is being thanked and told
 * what they now have. Legacy branches the same way on `isMyPremium` and even layers a second
 * texture over the gradient for the member — kept, because that texture is the only thing on the
 * page that marks the state as *earned* rather than merely different copy.
 *
 * ## The band is as wide as the column, not as wide as the window
 *
 * It is a child of `PREMIUM_COLUMN`, so at desktop width it is a 612-wide violet column with the
 * page's grey either side — which is what legacy draws, because its gradient is on the
 * `<Container maxWidth='sm'>` rather than on the page. See that constant.
 *
 * ## The bar sits *on* the band without being *in* it
 *
 * Legacy's bar is the gradient container's first child, so the ramp is behind it. Here the bar is
 * this section's sibling — `sticky` is bounded by its containing block, and nested in here the bar
 * left the top of the screen the moment the band did — and the band is pulled up under it instead.
 * See the `-mt` on the section.
 *
 * ## The brand colour outlives the band
 *
 * The violet **runs on past the plan cards**, behind "What's included" and the top of the benefits
 * panel, showing as the two strips either side of that card — legacy gets that from percentage stops
 * on the whole page, this gets it from a solid ramp plus `PREMIUM_TAIL_RAMP` on the section below.
 */
export function PremiumHero({
    sentinelRef,
    children,
}: {
    /**
     * Marks the band's last pixel for `useBandPassed`. It lives here because the band is here, and
     * the answer is read by the bar — which is this section's *sibling*, so that the bar can stick
     * for the whole column (see `PremiumView`).
     */
    sentinelRef: (node: HTMLDivElement | null) => void
    children?: ReactNode
}) {
    const { isPremium } = useMyChannel()

    return (
        <section
            data-testid="premium-hero"
            /*
             * The band ends **solid violet**, and the fade is the next section's background
             * (`PREMIUM_TAIL_RAMP`, applied in `PremiumView`) — because legacy's violet carries on
             * past the offer: its gradient reaches the page colour at 55% of the whole page, which
             * is well below the plan cards, behind "What's included" and the top of the benefits
             * panel. A band that faded inside its own box put that heading on the page's grey
             * instead, which is the difference the comparison screenshots showed.
             */
            /*
             * **`-mt-[60px] pt-[60px]`: the band starts under the bar, not after it.**
             *
             * The bar is a sibling above this section (so that `sticky` is bounded by the *column*
             * and it keeps its place for the whole page — nested inside here it left the top of the
             * screen the moment the band did, which is the defect the scrolled screenshots showed).
             * A sibling, though, would put the page's own grey behind it at rest, where legacy has
             * the gradient: legacy paints the ramp on the container and the bar is its first child.
             *
             * Pulling the band up by the bar's height and padding its content back down puts the
             * ramp behind the bar and nothing under it. The bar is positioned, so it paints above.
             */
            className={cn(
                'relative isolate flex flex-col gap-3 pb-6',
                '-mt-[60px] pt-[60px]',
                PREMIUM_HERO_RAMP,
            )}
        >
            {/*
             * **The burst is for both states; the confetti is only the member's.**
             *
             * The mark turns for everybody — it is the same badge and the same object — so the
             * sparkles that come off it belong to both screens too. They were the visitor's alone for
             * one revision, on the grounds that the reference screenshot is a visitor's screen and
             * that confetti plus a hundred and fifty sparkles is two celebrations arguing. That was
             * the wrong thing to weigh: an account that has *paid* is the last one that should get
             * the flatter version of the animation.
             *
             * So the confetti stays the member's marker — legacy's own layer, and what makes the
             * state read as *earned* rather than merely differently worded (the asset's name says
             * "backdrop" and its doc used to call it a sparkle texture; it is neither, it is paper and
             * streamers) — and the field runs underneath it in both.
             *
             * A `background-image` rather than an `<Image>` for the confetti: it is a decorative wash
             * with no box of its own (legacy sizes it `contain`, top-anchored), and describing it to
             * a screen reader would announce a party. `-z-10` with the section's `isolate` keeps both
             * behind the copy without escaping into the page's own stacking context — and the field is
             * **first**, so on a member's screen the paper sits over the sparks rather than under.
             */}
            <PremiumSparkField />
            {isPremium && (
                <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 -z-10 bg-contain bg-top bg-no-repeat"
                    style={{ backgroundImage: `url(${PREMIUM_ART.backdrop.src})` }}
                />
            )}

            <div className={cn(PREMIUM_INSET, 'flex flex-col items-center gap-2')}>
                {/*
                 * The badge — turning, with stars leaving it. `alt=""` plus `aria-hidden` live
                 * inside `PremiumMark`: the bar above it and the heading under it both say "Tevi
                 * Premium" in the reader's own language, so describing the mark would announce the
                 * title a third time — and the six stars would announce it six more.
                 */}
                <PremiumMark />
                {isPremium ? <MemberMessage /> : <VisitorMessage />}
            </div>

            {children}

            {/*
             * The band's last pixel, for the bar. Zero-height would be the one shape
             * `IntersectionObserver` disagrees with itself about across engines, so it is one.
             */}
            <div ref={sentinelRef} aria-hidden className="h-px" />
        </section>
    )
}

/** "Go beyond the limit…" — the pitch. */
function VisitorMessage() {
    const { t } = useTranslation()

    return (
        <>
            {/*
             * `<h2>`, because the bar above already carries the page's `<h1>` — and it says the
             * same two words. Legacy prints them twice too (a 18/700 bar title and a 26/700
             * heading); what it does not do is give either of them a heading level.
             */}
            <h2 className={cn('type-title-t1-bold text-center', PREMIUM_ON_HERO)}>
                {t('premium_title')}
            </h2>
            {/*
             * Three emphasised phrases inside one sentence, so `Trans` fills the tags rather than
             * this file splitting a translated string on a phrase. Each locale wraps **its own**
             * wording — the same reason `channel-state-screens.tsx` gives, and the same numbered-tag
             * convention. A locale that emphasises fewer phrases simply leaves later tags unused.
             */}
            <p
                className={cn(
                    'type-body-default max-w-[500px] text-center',
                    PREMIUM_ON_HERO,
                    '[&_b]:font-semibold',
                )}
            >
                <Trans
                    i18nKey="premium_hero_body"
                    components={[<b key="0" />, <b key="1" />, <b key="2" />]}
                />
            </p>
        </>
    )
}

/** "You're all set" — and, if the service said so, when it runs out. */
function MemberMessage() {
    const { t, currentLanguage } = useTranslation()
    const { info, isLoading } = usePremiumInfo()
    const expiry = formatExpiryDate(info?.expiresAt, currentLanguage)

    return (
        <>
            {/*
             * The gold, clipped to the glyphs — legacy's treatment for this one heading, and the
             * reason `PREMIUM_GOLD_INK` is its own constant. A flat `--text-title` here would be
             * near-white on violet in Light and unreadable.
             */}
            <h2 className={cn('type-title-t1-bold text-center', PREMIUM_GOLD_INK)}>
                {t('premium_active_title')}
            </h2>
            <p className={cn('type-body-default max-w-[500px] text-center', PREMIUM_ON_HERO)}>
                {t('premium_active_body')}
            </p>
            {/*
             * The receipt line, and the **only** thing `user/info/` is fetched for.
             *
             * ## "Valid until", not "Next billing starts"
             *
             * The second is what this said first, taken from a Crowdin string
             * (`tevi_premium_w2_next_billing_starts_s`) that **legacy's web app never renders** —
             * `next_billing` has zero hits in its source; the string belongs to the mobile app. And
             * it is a claim about *billing* made against a field called `expires_at`: for a
             * subscription that has been cancelled the date is an end, not a renewal, and the
             * sentence becomes a promise the backend will not keep.
             *
             * Legacy's own web vocabulary for this exact field is **Valid until** — its redeem
             * receipt is the one place it prints `expires_at`, as Duration / Active from / Valid
             * until — and that is true whichever state the subscription is in. Which also retires
             * the question of a `status` or `cancel_at_period_end` flag: the screen no longer needs
             * one to be correct.
             *
             * Three states, and each one is a deliberate answer rather than a fallback: a skeleton
             * while the date is in flight (it is one line, and reserving it stops the panels below
             * jumping), the date once known, and **nothing at all** when the service did not say —
             * an invented or guessed date on somebody's subscription is the one thing this line must
             * not print. A failed request lands in that third case, silently, because the page is
             * still correct without it.
             */}
            {isLoading ? (
                <span className="flex h-[24px] items-center">
                    <Skeleton w={180} />
                </span>
            ) : expiry ? (
                <p className={cn('type-caption-label', PREMIUM_ON_HERO_MUTED)}>
                    {t('premium_valid_until', { date: expiry })}
                </p>
            ) : null}
        </>
    )
}
