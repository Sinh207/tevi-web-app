'use client'

import { useMyChannel } from '@features/channel'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Badge } from '@shared/ui/badge'
import { Icon } from '@shared/ui/icon'
import { useEffect, useRef, useState } from 'react'
import type { PayoutOption } from '../api/payout-request-api'
import { PAYOUT_BLOCK } from '../lib/container'
import { formatPayoutEtaRange } from '../lib/payout-eta'
import { PayoutFastPremiumDialog } from './payout-fast-premium-dialog'
import { PayoutPremiumHelp } from './payout-premium-help'

/**
 * *Withdraw option* — the two speed cards, ported from legacy's `withdrawOption/`.
 *
 * ## Each card is four lines, and I had three of them wrong
 *
 * | line | legacy | what I had |
 * |---|---|---|
 * | icon + name | glyph, then 14/**700** | no icon, and the wrong weight |
 * | *Get by* | 12/400 `#666666` | missing entirely |
 * | the date range / hours | 14/500 `#141414` | present, but with no label above it |
 * | fee | `Fee: 0.5%` **or `Free`** | hidden when the rate was zero |
 *
 * The *Get by* label is what makes the date read as an arrival rather than a deadline, and **`Free`** is
 * the whole selling point of the Saving option — hiding the line when the rate is zero turns the cheaper
 * choice into the one with less information on it.
 *
 * ## No radio dot: the border **is** the selection
 *
 * Legacy marks the chosen card with `border: 1px solid #501BC0` and a shadow, and nothing else. I had
 * added a radio dot, which is a second affordance saying the same thing — and on a two-card row the
 * border already says it unambiguously.
 *
 * The real `<input type="radio">` stays, `sr-only`: the semantics are what a screen reader and the
 * keyboard need, and legacy has neither (its cards are `Stack` with `onClick`, so arrow keys do nothing
 * and nothing announces which is active).
 *
 * ## Fast is gated on Premium, and the gate is a **sell**, not a disabled control
 *
 * Legacy marks it `(Only for Premium users)`, and pressing it while not Premium opens *"Unlock Fast
 * Payout with Tevi Premium"* with a **Subscribe now** button to `/premium`. So the card stays pressable
 * and the press explains itself — a `disabled` card would be a dead end where legacy has an offer.
 *
 * It also **auto-selects Fast for a Premium member** (`useEffect` on `isPremium`), which is legacy's
 * behaviour and reads as the perk being applied rather than offered.
 */
const DAY_MS = 86_400_000

export function PayoutOptionCards({
    options,
    selectedId,
    onSelect,
    canOffer = true,
}: {
    options: PayoutOption[]
    selectedId: string | null
    onSelect: (id: string) => void
    /**
     * **Whether the Premium offer may open at all.**
     *
     * `false` when the account has no withdraw method: the screen is on its way to `setup-payouts`
     * (`hasNoMethod` → `router.replace`), and an upsell that flashes up over a redirect is a dialog
     * nobody asked for on a screen nobody is staying on. Worse, it is `z-50` — so for the frame it is
     * up it covers the thing the reader is being sent to.
     *
     * The cards themselves still render; only the *automatic* offer is withheld. A deliberate press on
     * a locked Fast card still sells Premium, because that is the reader asking.
     */
    canOffer?: boolean
}) {
    const { t, currentLanguage } = useTranslation()
    const { isPremium, isLoading: isChannelLoading } = useMyChannel()
    const [premiumOpen, setPremiumOpen] = useState(false)

    const fast = options.find(option => option.kind === 'fast')

    /*
     * A Premium member gets Fast selected for them — legacy's effect. Guarded on the option existing and
     * on it not already being chosen, so it does not fight a reader who picked Saving deliberately.
     */
    useEffect(() => {
        if (isPremium && fast?.isActive && selectedId === null) onSelect(fast.id)
    }, [fast, isPremium, onSelect, selectedId])

    /**
     * **The offer opens on arrival for an account without Premium.**
     *
     * Not legacy's behaviour — there the sheet only appears on a press. Asked for deliberately: this is
     * the screen where the speed of a withdrawal is decided, so it is the moment the upsell is relevant,
     * and a reader who never presses Fast never sees it otherwise.
     *
     * Three guards, and each one is a way this would otherwise misfire:
     *
     * - **Once per mount** (`hasOffered`). Without the latch every re-render that changes `options` —
     *   a refetch, a filter, the balance arriving — reopens a dialog the reader has already dismissed.
     * - **Only once the options have arrived**, so it does not open in front of a loading screen and
     *   then find there is no Fast option to sell.
     * - **Only when there is a withdraw method** (`canOffer`). Without one the screen is redirecting to
     *   `setup-payouts`, and the options list resolves first — so the sheet flashed up over a redirect,
     *   `z-50`, covering the screen the reader was being sent to.
     * - **Only when Fast is actually locked.** A Premium member, or a build where the option is open to
     *   everyone, gets nothing — an upsell for something you already have is worse than silence.
     *
     * The dialog's *Continue with Standard Withdrawal* still selects Saving, which is already the
     * default here, so dismissing it costs the reader nothing.
     */
    const hasOffered = useRef(false)
    useEffect(() => {
        if (hasOffered.current) return
        if (!fast) return
        /*
         * **Wait for the channel.** `isPremium` is `false` until `my-channel` resolves, and the options
         * list often wins that race — so without this the sheet opened for a Premium member, then the
         * channel arrived and it was already on screen with the latch set.
         *
         * Measured: `is_premium: true` in the payload and the offer up anyway. An upsell shown to
         * somebody who already pays is the one version of this that is actively wrong, and it is
         * invisible in any test that stubs the channel synchronously.
         */
        if (isChannelLoading) return
        // No withdraw method ⇒ the screen is redirecting to `setup-payouts`. See `canOffer`.
        if (!canOffer) return
        const isLocked = !isPremium || !fast.isActive
        if (!isLocked) return
        hasOffered.current = true
        setPremiumOpen(true)
    }, [canOffer, fast, isChannelLoading, isPremium])

    if (options.length === 0) return null

    return (
        <>
            <section className="flex flex-col gap-2">
                <span className="type-dense-strong text-(--text-body)">
                    {t('payout_request_option_label')}
                </span>

                <div
                    role="radiogroup"
                    aria-label={t('payout_request_option_label')}
                    className="grid gap-2 md:grid-cols-2"
                >
                    {options.map(option => {
                        const isFast = option.kind === 'fast'
                        const isSelected = option.id === selectedId
                        /*
                         * Locked when the reader has no Premium **or** the payload says the option is
                         * not open to them (`is_active: false`, which is what the live payload sends on
                         * `fast`). Either way the card is drawn and the press sells rather than selects
                         * — see the hook's note on why `is_active` is not filtered out.
                         */
                        const isLocked = isFast && (!isPremium || !option.isActive)
                        const days = option.durationDays ?? (isFast ? 1 : 15)
                        const getBy = isFast
                            ? t('payout_request_option_hours', { hours: days * 24 })
                            : formatPayoutEtaRange(
                                  Date.now() + days * DAY_MS,
                                  Date.now() + (days + 1) * DAY_MS,
                                  currentLanguage,
                              )

                        return (
                            <label
                                key={option.id}
                                data-testid="payout-request-option"
                                data-option-value={option.id}
                                className={cn(
                                    PAYOUT_BLOCK,
                                    'flex cursor-pointer flex-col gap-1 p-3',
                                    'focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-(--focus-ring)',
                                    /*
                                     * Legacy: a 1px brand border **and** a shadow on the chosen card,
                                     * hover shadow on both. The unselected card has no border at all, so
                                     * a transparent one keeps the two the same size.
                                     */
                                    // A chosen card overrides the block's hairline with the brand edge,
                                    // at both breakpoints — the selection has to read from `md` up too.
                                    isSelected
                                        ? 'border-(--text-brand) shadow-sm md:border-(--text-brand)'
                                        : 'hover:shadow-sm',
                                    /*
                                     * **A locked card is drawn disabled.** It stays pressable — the press
                                     * is the upsell, which is the whole reason the card is shown at all —
                                     * but it must not look like an equal choice beside one that can be
                                     * taken. `--background-segment` is the DS's recessed plane, so the
                                     * card reads as sunk rather than as raised.
                                     *
                                     * `cursor-pointer` is kept and `opacity` is not used: dimming would
                                     * take the Premium badge and the bolt down with it, and those two are
                                     * the offer.
                                     */
                                    isLocked
                                        ? 'bg-(--background-segment)'
                                        : 'bg-(--background-surface)',
                                )}
                            >
                                <span className="flex items-center justify-between gap-2">
                                    <span className="flex min-w-0 items-center gap-1">
                                        {/*
                                         * `sack-dollar` for Saving and **`bolt-lightning`** for Fast —
                                         * legacy's `IconSaving` / `IconFast`, drawn in its green.
                                         *
                                         * ⚠ **Not `bolt`.** That name is in `icon-names.ts` (the union
                                         * comes from the *upstream* sprite) but the **committed subset**
                                         * only carries `bolt-lightning`, so `name="bolt"` type-checks
                                         * and renders **nothing** — no error, no fallback, an empty
                                         * 20px box. Which is exactly how the Fast card shipped without
                                         * its icon. Check `public/tevi-icons.*.svg` for the id, not just
                                         * the union, or run `pnpm icons` to pull a new glyph into the
                                         * subset.
                                         */}
                                        {isFast ? (
                                            /*
                                             * **`weight="filled"`.** The regular bolt is an outline, and
                                             * legacy's `IconFast` is a solid mark — an outline glyph at
                                             * 20px beside a filled `sack-dollar` reads as the lighter of
                                             * the two options, which is backwards.
                                             *
                                             * `name` is typed *per weight* (`TeviIconNameFilled`), so a
                                             * glyph with no filled cut is a type error rather than an
                                             * empty box. `bolt-lightning` has one, and it is in the
                                             * committed subset — both had to be checked, for the reason
                                             * the note below gives.
                                             */
                                            <Icon
                                                weight="filled"
                                                name="bolt-lightning"
                                                size={20}
                                                aria-hidden
                                                className="flex-none text-(--accents-success-active)"
                                            />
                                        ) : (
                                            <Icon
                                                weight="filled"
                                                name="sack-dollar"
                                                size={20}
                                                aria-hidden
                                                className="flex-none text-(--text-title)"
                                            />
                                        )}
                                        <span className="type-dense-strong truncate text-(--text-title)">
                                            {t(
                                                isFast
                                                    ? 'payout_request_option_fast'
                                                    : 'payout_request_option_saving',
                                            )}
                                        </span>
                                        {isFast && (
                                            <Badge
                                                size="small"
                                                status="primary"
                                                /*
                                                 * **Brand purple, not the DS's `primary`.** That status
                                                 * resolves to `--accents-indigo-active` (#007aff), which
                                                 * is blue — and Premium is Tevi's purple everywhere it
                                                 * appears. `--primary-500` with `--text-on-primary`
                                                 * over it, which is the pair the DS uses for a filled
                                                 * brand surface.
                                                 *
                                                 * Overridden here rather than by adding a `premium`
                                                 * status to `badge.tsx`: that file is a 1:1 DS port and
                                                 * the DS ships no such status.
                                                 */
                                                className="flex-none bg-(--primary-500) text-(--white)"
                                            >
                                                {t('payout_request_premium')}
                                            </Badge>
                                        )}
                                    </span>
                                    <input
                                        type="radio"
                                        name="payout-option"
                                        value={option.id}
                                        checked={isSelected}
                                        onChange={() => {
                                            if (isLocked) {
                                                setPremiumOpen(true)
                                                return
                                            }
                                            onSelect(option.id)
                                        }}
                                        className="sr-only"
                                    />
                                    {/*
                                     * Legacy's `IconBtnHelp` in the card's top-right, and it **opens
                                     * something** — *What is Premium?*, which is not the sell the
                                     * locked press raises. It shipped as an inert `span` on the
                                     * reasoning that a nested control inside the `<label>` would
                                     * swallow the click that picks the option; it does not, because
                                     * `PayoutHelpButton` calls `preventDefault`, which is what stops a
                                     * label forwarding the press to its control. See both files —
                                     * without that half, one press would open this dialog *and* the
                                     * Premium offer.
                                     */}
                                    {isFast && <PayoutPremiumHelp />}
                                </span>

                                <span className="type-caption-meta text-(--text-body)">
                                    {t('payout_request_get_by')}
                                </span>
                                <span className="type-dense-strong text-(--text-title)">
                                    {getBy}
                                </span>
                                {/*
                                 * `Free` when there is no rate — legacy's own fallback, and the line is
                                 * never hidden: on the cheaper option the absence of a fee *is* the
                                 * information.
                                 */}
                                <span className="type-caption-meta text-(--text-body)">
                                    {option.percentFeeRate > 0
                                        ? t('payout_request_option_fee', {
                                              rate: `${option.percentFeeRate}%`,
                                          })
                                        : t('payout_request_free')}
                                </span>
                                {isFast && (
                                    <span className="type-caption-meta text-(--text-placeholder)">
                                        {t('payout_request_premium_only')}
                                    </span>
                                )}
                            </label>
                        )
                    })}
                </div>
            </section>

            {/*
             * The note under the cards — legacy's dashed divider, a green bolt, and *"Only available for
             * Premium users **Fast option**"* with the last two words in green. Shown to everyone,
             * because it is the offer rather than a warning.
             */}
            {fast && (!isPremium || !fast.isActive) && (
                <div className="flex flex-col gap-3">
                    <hr className="m-0 border-(--separator-default) border-t border-dashed" />
                    <p className="type-dense-default m-0 flex items-center gap-1 text-(--text-body)">
                        {/* `weight="filled"`, same as the card's — the two bolts are one mark. */}
                        <Icon
                            weight="filled"
                            name="bolt-lightning"
                            size={20}
                            aria-hidden
                            className="flex-none text-(--accents-success-active)"
                        />
                        {t('payout_request_premium_note')}{' '}
                        <button
                            type="button"
                            data-testid="payout-request-premium-note"
                            onClick={() => setPremiumOpen(true)}
                            className="type-dense-default cursor-pointer border-0 bg-transparent p-0 text-(--accents-success-active) hover:underline"
                        >
                            {t('payout_request_fast_option')}
                        </button>
                    </p>
                </div>
            )}

            <PayoutFastPremiumDialog
                open={premiumOpen}
                onClose={() => setPremiumOpen(false)}
                /*
                 * The Fast option's own duration, in hours — the same `× 24` the card does. From the
                 * payload rather than the copy, so the promise cannot go stale when the backoffice
                 * changes the option.
                 */
                hours={fast ? (fast.durationDays ?? 1) * 24 : null}
                /*
                 * *Continue with Standard Withdrawal* picks Saving. The first non-fast option rather
                 * than the literal id `'saving'`: the ids are the payload's, and this screen has already
                 * been bitten once by assuming one.
                 */
                onContinueStandard={() => {
                    const standard = options.find(option => option.kind !== 'fast')
                    if (standard) onSelect(standard.id)
                }}
            />
        </>
    )
}
