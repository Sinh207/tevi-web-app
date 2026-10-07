'use client'

import { useBandPassed } from '@shared/hooks/use-band-passed'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { giftRecipientName } from '../api/gift-types'
import { useGiftPackages } from '../hooks/use-gift-packages'
import { useGiftPremium } from '../hooks/use-gift-premium'
import { usePremiumPrice } from '../hooks/use-premium-price'
import { PREMIUM_COLUMN, PREMIUM_INSET } from '../lib/container'
import { giftMonthlyEquivalent } from '../lib/gift-plans'
import { GIFT_PREMIUM_TAIL_FADE } from '../lib/premium-surface'
import { GiftConfirmDialog, GiftErrorDialog } from './gift-confirm-dialog'
import { GiftPlanGrid } from './gift-plan-grid'
import { GiftPremiumHero } from './gift-premium-hero'
import { type GiftBarGround, GiftPremiumTopBar } from './gift-premium-top-bar'
import { GiftRecipientPicker } from './gift-recipient-picker'
import { PremiumAbout } from './premium-about'
import { PremiumBenefitsPreviewDialog } from './premium-benefits-preview-dialog'

/**
 * `/gift-premium` — the whole screen, in one 612 column.
 *
 * ```
 * recipient ── the bar, a search field, the people you follow, everybody else
 * offer     ── the bar on the band, their face in a gold ring, three packages, About
 * sent      ── the same band with confetti, "Premium Delivered", and two ways onward
 * ```
 *
 * ## One screen at a time, where legacy renders both and hides one
 *
 * Legacy mounts the picker **and** the offer simultaneously and toggles `hidden` on the boxes — so
 * both lists keep their scroll position, both keep their observers, and the search field stays
 * focusable behind the offer for anybody using a keyboard. It also means its "back" has to reset
 * five pieces of state by hand, because the other screen is still mounted holding them.
 *
 * Here the step is derived (`useGiftPremium`) and only one branch renders. The cost is that
 * returning to the picker loses the term — which is the right trade twice over: the reader has just
 * chosen somebody, so the term has done its job, and the query cache means retyping it is a cache
 * hit rather than a request.
 *
 * ## The band, the bar and the sentinel are the same three parts `/premium` uses
 *
 * The bar is a child of the **column**, not of the band, so `sticky` is bounded by the column and it
 * holds the top of the screen for the whole page; the band is pulled up underneath it. `useBandPassed`
 * watches the band's last pixel and the bar renders the answer as its ink. On the picker step there
 * is no band at all, so the bar is opaque from the first frame — `onBrand` is `false` rather than
 * "not stuck yet", which is what makes one bar work for three steps.
 *
 * ## The About panel is `/premium`'s, unchanged
 *
 * Same three paragraphs, same legal line, same monthly figure — because it answers the same question
 * ("what is Tevi Premium?") for the same product. Legacy has a second copy of the block on this
 * screen with the same strings and a slightly different price derivation, which is how the two came
 * to disagree about the monthly figure by a few cents.
 *
 * It is **not** shown on the picker step: nothing there has been chosen yet, and a panel explaining
 * a subscription under a list of people is an answer to a question nobody has asked.
 */
export function GiftPremiumView() {
    const { t } = useTranslation()
    const router = useRouter()
    const flow = useGiftPremium()
    /*
     * The bar's two states, owned here because the band and the bar are siblings — the same
     * arrangement, and the same hook, `/premium` uses.
     */
    const band = useBandPassed()
    /** The benefits carousel, raised by "See features". Local: nothing else can open it. */
    const [showBenefits, setShowBenefits] = useState(false)

    /**
     * **Focus follows the step**, because a step change here is not a navigation.
     *
     * The three steps replace the whole body while the URL and the document stay put, so the browser
     * has nothing to move focus to: it was left on the row or the card that had just been unmounted
     * and fell to `<body>`. Measured — a keyboard or screen-reader reader who chose a recipient
     * landed nowhere, with nothing announced, on a screen that had entirely changed.
     *
     * The band's heading is the anchor: focusing it names the step. The **first** render is skipped
     * on purpose — arriving on `/gift-premium`, or returning from Stripe onto the success screen, is
     * a real page load, and the browser's own focus (the top of the document) is correct there. It is
     * only the in-page transitions that need help.
     *
     * Going *back* needs none: the picker's field is `autoFocus`, so it takes focus when that step
     * mounts.
     */
    const headingRef = useRef<HTMLHeadingElement>(null)
    const settled = useRef(false)
    /*
     * `flow.step` is in the deps and Biome cannot see why: the body does not *read* it, it reacts to
     * it — the step changing is the whole event. Exactly the shape `useStripScroll` suppresses this
     * rule for with its `count`, and `clamped-text.tsx` before that.
     */
    // biome-ignore lint/correctness/useExhaustiveDependencies: the step changing *is* the trigger
    useEffect(() => {
        if (!settled.current) {
            settled.current = true
            return
        }
        headingRef.current?.focus()
    }, [flow.step])

    /**
     * What is behind the bar right now — see `GiftBarGround`.
     *
     * The picker's plane is `--background-surface` below `md` (§6's single-panel rule, painted by
     * the picker's own column), so the bar has to carry the same paint or the rows slide past the
     * title on a phone. The other two steps are `/premium`'s arrangement exactly: brand while any
     * of the band is still behind the bar, the page's ground once it is not.
     */
    const ground: GiftBarGround =
        flow.step === 'recipient' ? 'surface' : band.passed ? 'page' : 'brand'

    return (
        <div className={PREMIUM_COLUMN}>
            <GiftPremiumTopBar
                ground={ground}
                backLabel={
                    /*
                     * The glyph is the same on all three steps and the destination is not, so the
                     * accessible name says which — "Change recipient" on the offer, plain "Back"
                     * where the control really does leave the page.
                     */
                    flow.step === 'offer' ? t('giftpremium_change_recipient') : t('common_back')
                }
                onBack={() => {
                    /*
                     * Back means *un-choose this person* while there is one, and *leave* otherwise.
                     * `history.length` is the only signal available for "is there anywhere to go
                     * back to", and it is read in the handler because it is meaningless during SSR
                     * — the same fallback `PageBackBar` and `PremiumTopBar` use, and this screen is
                     * reached from a drawer row as often as from a link.
                     */
                    if (flow.step === 'offer') {
                        flow.back()
                        return
                    }
                    if (window.history.length > 1) router.back()
                    else router.push('/')
                }}
            />

            {flow.step === 'recipient' && (
                /*
                 * `isResolvingRecipient` holds the picker back for the one moment it would be wrong:
                 * a **reload on the offer step**, where `?to=` names somebody the client has not
                 * read yet. Without it the invitation flashes under a reader who was mid-purchase.
                 * A slug that comes back unreadable falls through to the picker, which is the honest
                 * answer to a link naming a space that is not there.
                 */
                <GiftRecipientPicker onSelect={flow.select} suspended={flow.isResolvingRecipient} />
            )}

            {flow.step === 'offer' && flow.recipient && (
                <>
                    <GiftPremiumHero
                        state="offer"
                        handle={flow.recipient.slug}
                        name={giftRecipientName(flow.recipient) || null}
                        avatar={{
                            thumb: flow.recipient.images.thumb,
                            avatarVideo: flow.recipient.images.avatar_video,
                            isPremium: flow.recipient.is_premium,
                        }}
                        onSeeFeatures={() => setShowBenefits(true)}
                        sentinelRef={band.ref}
                        headingRef={headingRef}
                    >
                        <GiftPlanGrid onSend={flow.request} disabled={flow.isBusy} />
                    </GiftPremiumHero>
                    <GiftTail>
                        <GiftAbout />
                    </GiftTail>
                </>
            )}

            {flow.step === 'sent' && flow.sent && (
                <>
                    <GiftPremiumHero
                        state="sent"
                        handle={flow.sent.slug}
                        name={flow.sent.name}
                        /* No avatar sources — see the prop's own note, and `lib/gift-token.ts`. */
                        sentinelRef={band.ref}
                        headingRef={headingRef}
                    />
                    <GiftTail>
                        <GiftAbout />
                        <div className={cn(PREMIUM_INSET, 'flex flex-col gap-2')}>
                            {/*
                             * Two ways onward, in legacy's order and with legacy's weights: sending
                             * another is the offer, going home is the exit. A success screen with no
                             * way off it is the one state this flow could otherwise strand somebody
                             * in — the picker is gone, and the browser's Back leads to Stripe.
                             */}
                            <Button
                                data-testid="premium-gift-again"
                                variant="accent"
                                size="large"
                                fullWidth
                                onClick={flow.again}
                            >
                                {t('giftpremium_send_another')}
                            </Button>
                            <Button
                                data-testid="premium-gift-home"
                                variant="ghost"
                                size="large"
                                fullWidth
                                onClick={() => router.push('/')}
                            >
                                {t('giftpremium_return_home')}
                            </Button>
                        </div>
                    </GiftTail>
                </>
            )}

            {/*
             * Both dialogs are siblings of the column's content rather than children of the grid:
             * the press that raises the confirmation can come from a card that is itself inside the
             * band, and the error can arrive while the confirmation is up.
             */}
            <GiftConfirmDialog flow={flow} />
            <GiftErrorDialog flow={flow} />
            {showBenefits && (
                <PremiumBenefitsPreviewDialog onClose={() => setShowBenefits(false)} />
            )}
        </div>
    )
}

/**
 * Everything below the band — after **a 64px strip that finishes it**.
 *
 * The fade is an element of its own rather than a background behind this content, and
 * {@link GIFT_PREMIUM_TAIL_FADE} carries the reasoning: the first thing under the band here is
 * `PremiumAbout`, whose heading is near-black `--text-subtitle`, and on `/premium`'s 320px
 * background ramp that heading was drawn on solid violet — unreadable, in both themes, and invisible
 * to every check in the repo. Nothing readable sits on a gradient now.
 *
 * `shrink-0` because it is a spacer in a flex column and a spacer that can be squeezed is a seam
 * that reappears at some content height.
 *
 * The bottom 24 is the page's air under the last block. Below `md` the tab bar reserves its own
 * space, so nothing has to be subtracted here.
 */
function GiftTail({ children }: { children: React.ReactNode }) {
    return (
        <>
            <div aria-hidden className={cn('h-16 shrink-0', GIFT_PREMIUM_TAIL_FADE)} />
            <div className="flex flex-col gap-6 pb-6">{children}</div>
        </>
    )
}

/**
 * "About Tevi Premium" on this screen — the same panel `/premium` draws, with **this** catalogue's
 * monthly figure.
 *
 * ## Why it is a component and not two lines in the view
 *
 * So that the *panel* owns the query rather than the whole screen. It needs `useGiftPackages` for
 * the price (the yearly gift over twelve — legacy's own `packageOneYear.price / 12`), and a hook
 * called in `GiftPremiumView` would run for every step including ones that draw no panel.
 *
 * It is the same cached query the picker and the grid already read (`getGiftPackages` is shared and
 * cached for the day), so wherever this renders the answer is already in hand.
 *
 * ## Why the figure is not `/premium`'s
 *
 * That screen prints the monthly *subscription's* own price, straight off `v1/packages/`. The gift
 * table has no monthly package — it is 90/180/365 — so there is nothing to print, and legacy divides
 * the year. `PremiumAbout` used to call `usePremiumPlans()` itself, which made this screen fetch a
 * catalogue it does not sell from purely to fill one clause; the price is a prop now.
 */
function GiftAbout() {
    const { plans } = useGiftPackages()
    const price = usePremiumPrice()

    return (
        <PremiumAbout
            monthlyPrice={
                plans.year ? price(giftMonthlyEquivalent(plans.year), plans.year.currency) : null
            }
        />
    )
}
