'use client'

import { useBalance } from '@features/balance'
import { usePremiumInfo } from '@features/premium'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatStarAmount } from '@shared/lib/money'
import { Button } from '@shared/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { RedeemOutcome } from '../api/types'
import type { RedeemFlow } from '../hooks/use-redeem-code'
import { formatGrantDate, premiumDuration } from '../lib/gift-code'
import { GIFT_CODE_ART } from '../lib/illustrations'

/**
 * What the code contained — one DS `Dialog` (Figma 50:15797) with three bodies.
 *
 * | outcome | title | receipt |
 * |---|---|---|
 * | `star` | Tevi Star redeemed | amount redeemed, current balance |
 * | `premium` | Tevi Premium activated | duration, active from, valid until |
 * | `other` | your code has been redeemed | — |
 *
 * ## `other` is a state, not a bug
 *
 * The gifting service is a rail: the mobile apps already redeem codes for products this client has no
 * panel for. "Your code has been redeemed" is true, useful, and does not require this repo to ship a
 * screen for every product the backoffice invents. Legacy lands on the same fallback, and this keeps
 * it rather than treating an unrecognised grant as a failure — the code *was* spent.
 *
 * ## Every figure is the app's own, none of it comes from the redemption
 *
 * The Star line reads `useBalance()`, which the flow has just invalidated, and the Premium lines read
 * `premium/v1/user/info/`. Neither is computed here from the redemption response, and that is the
 * point: a receipt assembled out of what the client *hoped* happened is how a screen ends up saying
 * 500 Star while the top bar says 400. `isKnown` and the skeletons are what a not-yet-known figure
 * looks like; nothing prints a placeholder number.
 *
 * ## One dialog at every width
 *
 * Legacy renders a MUI `Drawer` on phones and a `Dialog` above `md`, doubling every child. This app
 * has no sheet primitive yet and every other confirm in it is a `Dialog` at all widths —
 * `DialogContent` is already `max-w-[calc(100vw-2rem)]`, so it fits. The reasoning is
 * `DonateDialogs`'s, at more length.
 */
export function RedeemResultDialog({ flow }: { flow: RedeemFlow }) {
    const { t } = useTranslation()
    const result = flow.result

    return (
        <Dialog open={result !== null} onOpenChange={open => !open && flow.closeResult()}>
            <DialogContent>
                {/* The dialog is unmounted when closed, so `result` is present here — but the type
                    does not know that, and a guard reads better than a non-null assertion. */}
                {result ? <ResultBody outcome={result} /> : null}

                {/*
                 * **Stacked, at every width** — and legacy's own row is why.
                 *
                 * Legacy stacks below `md` and goes to a row above it (`direction={{ xs: 'column',
                 * md: 'row' }}`), which works there because its result panel is `maxWidth: 512px`:
                 * two halves of 226px, and *Redeem another code* measures 218. The DS dialog card is
                 * **370px** wide at every breakpoint, so the same row gives each button 150px — and
                 * `Button` is `whitespace-nowrap`, so `flex-1`'s shrink stops at the label's
                 * min-content and the children overflow instead of fitting. Measured: a 380px row in
                 * a 320px track, with the accent button's trailing edge **47px outside the popup**.
                 *
                 * So the breakpoint legacy is really branching on is "do the labels fit", not the
                 * viewport, and at this width the answer is no in English before any of the other
                 * eight locales gets a say. Order follows legacy's stacked branch — *Back to home*
                 * above the accent action — rather than being flipped on the way.
                 */}
                <DialogFooter layout="stacked">
                    {/*
                     * Home is a **link**, not a `router.push` — it is a navigation, so it should
                     * middle-click, long-press and prefetch like one. Legacy pushes imperatively.
                     * The dialog closes on unmount, so nothing has to close it first.
                     */}
                    <Button
                        data-testid="gift-code-result-home"
                        variant="secondary"
                        size="large"
                        render={<Link href="/" />}
                    >
                        {t('common_back_home')}
                    </Button>
                    <Button
                        data-testid="gift-code-result-close"
                        variant="accent"
                        size="large"
                        onClick={flow.closeResult}
                    >
                        {t('giftcode_action_another')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function ResultBody({ outcome }: { outcome: RedeemOutcome }) {
    const { t } = useTranslation()

    if (outcome.kind === 'star') {
        return (
            <>
                <DialogHeader>
                    <ResultArt art={GIFT_CODE_ART.resultStar} />
                    <DialogTitle className="type-title-t2-semibold">
                        {t('giftcode_result_star_title')}
                    </DialogTitle>
                    <DialogDescription>{t('giftcode_redeemed')}</DialogDescription>
                </DialogHeader>
                <StarReceipt stars={outcome.stars} />
            </>
        )
    }

    if (outcome.kind === 'premium') {
        return (
            <>
                <DialogHeader>
                    <ResultArt art={GIFT_CODE_ART.resultPremium} />
                    <DialogTitle className="type-title-t2-semibold">
                        {t('giftcode_result_premium_title')}
                    </DialogTitle>
                    <DialogDescription>{t('giftcode_redeemed')}</DialogDescription>
                </DialogHeader>
                <PremiumReceipt />
            </>
        )
    }

    return (
        <DialogHeader>
            <ResultTile />
            {/*
             * The sentence that is the *title* here is the description in the other two. Nothing
             * more specific is known, and repeating it twice in a 370px dialog would read as a
             * template nobody looked at.
             */}
            <DialogTitle className="type-title-t2-semibold">{t('giftcode_redeemed')}</DialogTitle>
        </DialogHeader>
    )
}

/**
 * Brand's own result art — Theo with a Star, Theo with a crown — re-encoded from a 1.6 MB /
 * 600 KB SVG-wrapped PNG to 12 KB of WebP each (`lib/illustrations.ts`).
 *
 * Decorative: the title beneath says what happened, and these two illustrations differ from each
 * other by a prop in the mascot's hand — a description would either repeat the title or invent a
 * reading of the picture. No `priority`: the dialog only exists after a press, so preloading it on
 * arrival would spend the page's budget on art most sessions never see.
 */
function ResultArt({ art }: { art: { src: string; width: number; height: number } }) {
    return (
        <Image
            src={art.src}
            alt=""
            aria-hidden
            width={art.width}
            height={art.height}
            className="h-auto w-full"
            // The art's own intrinsic width, from the same constant as `width` — the dialog is
            // wider than the picture, and upscaling it would soften what it is there to show.
            style={{ maxWidth: art.width }}
        />
    )
}

/**
 * The generic panel's mark, in the DS `Dialog`'s 60×60 illustration box.
 *
 * The same `ticket-perforated` glyph on the same `--accents-success-active` tile as the account
 * drawer's row that leads here, so an outcome this client cannot itemise still looks like it belongs
 * to this screen. Decorative — the title carries the meaning.
 *
 * The two panels that *can* name what arrived use Brand's art instead (`ResultArt`), which is why
 * this takes no children: there is one tile, and it says one thing.
 */
function ResultTile() {
    return (
        <span
            aria-hidden
            className="flex size-[60px] flex-none items-center justify-center rounded-2xl bg-(--accents-success-active) text-white"
        >
            <Icon name="ticket-perforated" weight="filled" size={32} />
        </span>
    )
}

/**
 * Amount redeemed, then what the balance now is.
 *
 * Both lines, not just the first: "500 Star" answers what the code was worth and the balance answers
 * the question the reader actually has next. The two keys are legacy's own
 * (`redeem_gift_code_w2_amount_redeemed` / `_current_balance`), which its web result panel declares
 * and never renders.
 */
function StarReceipt({ stars }: { stars: number }) {
    const { t, currentLanguage } = useTranslation()
    const { star, isKnown, isRefreshing } = useBalance()

    return (
        <Receipt>
            <ReceiptRow
                label={t('giftcode_amount_redeemed')}
                value={t('giftcode_star_amount', {
                    amount: formatStarAmount(stars, currentLanguage),
                })}
                strong
            />
            <ReceiptRow
                label={t('giftcode_current_balance')}
                value={
                    isKnown && !isRefreshing ? (
                        t('giftcode_star_amount', {
                            amount: formatStarAmount(star, currentLanguage),
                        })
                    ) : (
                        /*
                         * `isRefreshing` as well as `isKnown`, and the comment used to describe
                         * behaviour this did not have: `isKnown` stays **true** through a refetch (a
                         * cached figure is not `isLoading`), so this printed the *pre-redemption*
                         * balance — "Amount redeemed 500 Star" over "Current balance 400 Star" — until
                         * the refetch landed, which on a phone is longer than the dialog is looked at.
                         */
                        <Skeleton w={64} />
                    )
                }
            />
        </Receipt>
    )
}

/**
 * Duration, active from, valid until — read from `premium/v1/user/info/`, because the redemption
 * response does not carry them (see `usePremiumInfo`).
 *
 * Three ways this can have nothing to say, and none of them is an error worth a retry prompt: the
 * request is still running (skeletons), it failed, or it answered a body without a usable expiry.
 * The last two render **nothing** — the title above already said Premium is active, which is the
 * part that came from the server that accepted the code. Legacy shows a full-width "0 months" row
 * in the same situation.
 */
function PremiumReceipt() {
    const { t, currentLanguage } = useTranslation()
    const { info, isLoading, isFetching } = usePremiumInfo()

    /*
     * `isFetching` too: a *second* Premium code redeemed in the same session finds this query already
     * cached, so `isLoading` is false and the panel rendered the **first** grant's duration and expiry
     * as though they were the new ones.
     */
    if (isLoading || isFetching) {
        return (
            <Receipt busy>
                {[0, 1, 2].map(i => (
                    <div key={i} className="flex h-5 items-center justify-between gap-4">
                        <Skeleton w={80} delay={i * 160} />
                        <Skeleton w={96} delay={i * 160} />
                    </div>
                ))}
            </Receipt>
        )
    }

    /*
     * `Date.now()` at render, and only ever in the browser: this component mounts in response to a
     * press. "Active from" is today rather than a start date the service does not publish — for a
     * code redeemed a second ago that is the truth, and it is what legacy prints.
     */
    const now = Date.now()
    const duration = premiumDuration(info?.expiresAt, now)
    const validUntil = formatGrantDate(info?.expiresAt, currentLanguage)
    if (!duration && !validUntil) return null

    return (
        <Receipt>
            {duration ? (
                <ReceiptRow
                    label={t('giftcode_duration')}
                    /*
                     * Both keys literal, for the reason the field's error is: `keys.test.ts` only
                     * sees `t('…')` with a literal key, and these two are plural keys — the bare
                     * name is never a real entry, so a typo would render `giftcode_duration_months`
                     * in the panel and no test would know.
                     */
                    value={
                        duration.unit === 'month'
                            ? t('giftcode_duration_months', { count: duration.count })
                            : t('giftcode_duration_days', { count: duration.count })
                    }
                    strong
                />
            ) : null}
            <ReceiptRow
                label={t('giftcode_active_from')}
                value={formatGrantDate(now, currentLanguage)}
            />
            {validUntil ? (
                <ReceiptRow label={t('giftcode_valid_until')} value={validUntil} />
            ) : null}
        </Receipt>
    )
}

/**
 * The same figure strip the donation dialogs use — `--background-segment`, one row per line.
 *
 * `busy` puts `aria-busy` on the strip rather than on each bar: the `Skeleton`s are `aria-hidden`
 * by design, so the container is the only thing left that can say a figure is on its way.
 */
function Receipt({ children, busy }: { children: ReactNode; busy?: boolean }) {
    return (
        <div
            aria-busy={busy || undefined}
            className="flex flex-col gap-2 rounded-lg bg-(--background-segment) px-4 py-3"
        >
            {children}
        </div>
    )
}

function ReceiptRow({
    label,
    value,
    strong,
}: {
    label: string
    value: ReactNode
    strong?: boolean
}) {
    return (
        <div className="flex items-center justify-between gap-4">
            <span className="type-dense-default text-(--text-subtitle)">{label}</span>
            <span
                className={
                    strong
                        ? 'type-dense-strong text-(--text-title)'
                        : 'type-dense-default text-(--text-body)'
                }
            >
                {value}
            </span>
        </div>
    )
}
