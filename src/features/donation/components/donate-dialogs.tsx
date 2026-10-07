'use client'

import { useBalance } from '@features/balance'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { TextAreaField, TextField } from '@shared/components/field'
import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatFiatAmount, formatPlainAmount, formatStarAmount } from '@shared/lib/money'
import { cn } from '@shared/lib/utils'
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
import {
    SegmentedControl,
    SegmentedControlItem,
    SegmentedControlItemLabel,
} from '@shared/ui/segmented-control'
import Image from 'next/image'
import type { ReactNode } from 'react'
import type { DonationIcon, DonationTarget } from '../api/types'
import type { DonateFlow } from '../hooks/use-donate-flow'
import { useDonationFee } from '../hooks/use-donation-fee'
import {
    canDonate,
    chargedTotal,
    DONATION_USD,
    type DonationCurrency,
    donationFee,
    toNumber,
} from '../lib/donation-amount'
import { DONATION_SUCCESS_ART } from '../lib/illustrations'
import { DonationArt } from './donation-art'

/**
 * Details → Confirm → Success, as three `Dialog`s driven by one `step`.
 *
 * ## ⚠ Composed from DS primitives — this flow is **not** in the design system
 *
 * Reported rather than approximated, per `docs/DESIGN_SYSTEM.md`, and the check was not superficial:
 *
 * - `preview/sheet.html` ships `.tevi-bottom-sheet` with `data-type="form" | "confirm" | "success"`,
 *   which is **exactly** this flow's three steps — but `components.css` truncates at the 256 KiB read
 *   cap partway through `sheet`, so its geometry is unreadable. `shared/ui/dialog.tsx` already carries
 *   the `.tevi-dialog` half (Figma 50:15797) and that is what these use, including its 60×60
 *   illustration tile.
 * - `.tevi-stepper` (Figma 122:28924) is the ± control, and it sits **after** `sheet` in the concat
 *   order — in the five components the cap loses. `preview/stepper.html` gives the DOM and the press
 *   colour; it does not give the height. So the quantity control here is two DS `Button`s at
 *   `ghost` + `iconOnly` + `medium`, which invents no number: 36×36 is the DS's own icon-button box,
 *   and it is the same composition `channel-menu.tsx` already uses for its kebab trigger.
 * - `.tevi-amount-input` exists but belongs to `message-input` — it carries `__rate` and `__max`,
 *   i.e. it is the exchange screen's field, not a donation amount.
 *
 * Everything below is DS tokens, DS components and `FIELD_SURFACE`. **When `shared/ui/sheet.tsx` and
 * `shared/ui/stepper.tsx` are ported, this file collapses into call sites** — the same standing note
 * `channel-menu.tsx` and `channel-live-filter.tsx` carry, blocked on the same read cap.
 *
 * ## What the reader is told, and where
 *
 * A donation dialog is a **spend**, so the screen has to answer three questions before the press:
 * what am I buying, what will it cost, and can I afford it. The three are split across two screens
 * rather than crowded onto one:
 *
 * | question | where |
 * |---|---|
 * | what | Details — the 60×60 tile and the header: the unit's art, the creator's name, the price |
 * | how much | Details — the quantity row and the amount field, two views of one number |
 * | can I | Details warns in the amount field's own message row; **Confirm** carries the total |
 *
 * The summary strip used to sit on the form as well. It has been taken off it: a figure the reader
 * is still *changing* is not a fact worth a bordered strip, and the form was carrying two rows
 * saying what the amount field already said. What did **not** move is the affordability warning —
 * removing the strip took it along with it for one pass, so somebody could type five thousand Star
 * against a balance of one and hear nothing until the next screen. It now lives in the field's
 * reserved message row, which costs no height at all.
 *
 * The balance figure is presentational and reads `useBalance()` directly, which is what that
 * feature's barrel asks for: *"a caller that needs to render its own affordability state should read
 * `hasEnoughStars` from `useBalance()`; this hook is for the press."* The press stays with
 * `useRequireStars` in `use-donate-flow.ts`.
 *
 * ## Two ways to pay, one of which cannot complete yet
 *
 * The offer is priced in Star and in cash, and both are offered — the tab appears whenever the
 * creator set a cash price. ⚠ **Cash cannot be completed**: the checkout needs a payment integration
 * this repo does not contain (see `use-donate-flow.ts`). Rather than hide a price the creator really
 * set, the tab is shown, the figures are real, and the CTA is disabled under a sentence saying why.
 * That is the one place in this feature where a disabled control is the right answer: the reader is
 * choosing between two options and needs to be told which one works, not shown a single option and
 * left to wonder where the other went.
 *
 * ## ⚠ A shortfall **disables** the button — and this is the line to revisit when top-up lands
 *
 * It did not, for two passes. The argument was that `useRequireStars` is one edit away from
 * diverting to a Star purchase flow, so a disabled button would be closing the very door the press
 * is meant to open. That argument is about a flow that **does not exist yet**: today the hook's
 * shortfall branch raises a toast (`features/balance/hooks/use-require-stars.ts` says so in as many
 * words), so an enabled button's entire behaviour is to say "you cannot do this" a second time,
 * after the reader has already been told it under the field.
 *
 * So it is disabled, on both screens, and the warning in the amount field's message row is what
 * keeps that legible. **When `docs/PAYMENT.md` §8 pass 4 wires `useRequireStars` to the purchase
 * sheet, this is the decision to reverse** — the button becomes the way to buy Star, and disabling
 * it would then be the dead end the original argument described. Two `disabled` props and this
 * paragraph; nothing else in the feature depends on it.
 *
 * ## One dialog, not a drawer below `md`
 *
 * Legacy renders a MUI `Drawer` on phones and a `Dialog` above `md`, doubling every child. This app
 * has no sheet primitive yet and every other confirm in it (`ConfirmDialog`, space visibility,
 * event cancel) is a `Dialog` at all widths — `DialogContent` is already `max-w-[calc(100vw-2rem)]`,
 * so it fits. Adding a second responsive surface for one flow would make this the only screen in the
 * app that behaves differently, which is a worse inconsistency than the one it fixes.
 */
export function DonateDialogs({ flow, target }: { flow: DonateFlow; target: DonationTarget }) {
    const { t, currentLanguage } = useTranslation()
    // The figure itself is no longer printed anywhere — only whether it covers the spend, and by
    // how much it falls short.
    const { isKnown, hasEnoughStars, starShortfall } = useBalance()
    // Star carries no fee, so the second service is only asked once the cash tab is showing.
    const { fee: feeCoefficients } = useDonationFee({ enabled: flow.currency === 'cash' })
    const offer = flow.offer

    // Nothing to draw a dialog about. The buttons that open it are gated on the same value.
    if (!offer) return null

    const unitName = offer.name ?? t('donation_unit_fallback')
    const creator = target.name ?? t('donation_creator_fallback')
    const label = offer.button_text ?? t('donation_action_donate')
    const amount = toNumber(flow.amount)
    const fee = flow.currency === 'cash' ? donationFee(amount, feeCoefficients) : null
    /** What is actually charged. Star has no fee, so the two are the same figure there. */
    const total = flow.currency === 'cash' ? chargedTotal(amount, fee) : amount
    const quantity = Math.max(1, toNumber(flow.quantity))
    // Star only: weighing a dollar figure against a Star balance is the unit mix-up that reads as a
    // permissions bug. `use-donate-flow.ts` keeps the same rule on the press.
    const short = flow.currency === 'star' && isKnown && total > 0 && !hasEnoughStars(total)

    return (
        <>
            {/* ── Details ────────────────────────────────────────────────────────────── */}
            <Dialog open={flow.step === 'details'} onOpenChange={open => !open && flow.close()}>
                {/*
                 * ## Only the footer is pinned, and the header scrolls with the form
                 *
                 * Two children: a **scrolling** body that carries the header *and* the controls, and
                 * a pinned block of summary + notice + button. Everything that changes height sits in
                 * the first one — the amount's error message appearing, the cash notice, a long unit
                 * name wrapping — so the press target stays exactly where the reader last saw it. It
                 * used to be one scrolling column, which meant the primary action of the screen slid
                 * up and down while the form was being filled in and left the viewport entirely on a
                 * short window.
                 *
                 * The header was pinned too for one pass, and that was wrong: a 60px tile and two
                 * lines of title are the part a reader has already finished with by the time they are
                 * typing an amount, so holding them on screen spends about 150px of a 680px dialog
                 * on something nobody is looking at. The button is the only thing that has to stay
                 * put, because it is the only thing that gets *pressed*.
                 *
                 * `flex-auto`, not `flex-1`. `flex: 1 1 0%` collapses a child to nothing in a
                 * content-sized column — the same mistake that squashed `DialogFooter` to 26px —
                 * whereas `flex: 1 1 auto` keeps its content height and only shrinks when `max-h`
                 * actually bites. `min-h-0` is what permits that shrink at all.
                 *
                 * ## Capped, not fixed — and it was fixed for two passes before the reason went away
                 *
                 * The height was pinned (680, then 600) because the button had to stay put while the
                 * form changed under it. Two things since have taken that job away from the height:
                 * the summary strip left this screen, and the shortfall moved **into the amount
                 * field's reserved message row** — `FieldShell` keeps that row at `min-h-4` whether
                 * or not it says anything, so a warning appearing no longer changes the form's
                 * height at all. Nothing that happens while *typing* moves the button any more.
                 *
                 * What a fixed height was still doing was **forcing a scroll that is not needed**:
                 * measured, the body wanted 495px and a 600px dialog gave it 469, so the header
                 * scrolled out of a dialog that had room for it on any ordinary window.
                 *
                 * So: `max-h`, and the dialog sizes to its content. The scroll region below stays and
                 * earns its place on a short window, where it clamps and the footer stays pinned.
                 * `dvh` rather than `vh` because a phone's chrome collapses and `vh` keeps measuring
                 * the taller viewport — which would put the button under the address bar exactly
                 * when it is being reached for.
                 *
                 * The one thing that still resizes the dialog is **switching payment tab**, which
                 * adds or removes the cash notice. That is a deliberate press that redraws the
                 * screen, not jitter under the reader's thumb, and paying ~80px of dead space on
                 * every other view to hold it still was the wrong trade.
                 *
                 * `gap-4` overrides the DS dialog's `gap-5` (24). That value is drawn for a title, a
                 * sentence and a button; at six stacked sections it reads as a form with holes in it.
                 * Overriding the spacing of a DS component is not something to do casually, so it is
                 * one class in one place with this note attached, and the other two dialogs — which
                 * are the shape the DS drew — keep 24.
                 */}
                <DialogContent className="max-h-[calc(100dvh-2rem)] gap-4">
                    {/*
                     * `[&>*]:shrink-0` — **a scroll container must scroll, not squash.**
                     *
                     * Flex items shrink by default, and every block in here is one. On a short
                     * window the column runs out of room and flex takes it out of the children
                     * instead of overflowing: measured on a 390×780 phone, the tier card went
                     * from 75px to **26px** with 49px of text inside it, and `overflow-hidden`
                     * cropped the name and the price. It read as a broken card and was a
                     * missing class.
                     *
                     * On the wrapper rather than on each block, because the rule is about being
                     * *in* a scroll container, not about any one child.
                     */}
                    <div className="flex min-h-0 flex-auto flex-col gap-4 overflow-y-auto [&>*]:shrink-0">
                        <DialogHeader>
                            <ArtTile
                                icon={offer.icon}
                                avatarUrl={target.avatarUrl}
                                name={creator}
                            />
                            <DialogTitle>
                                {t('donation_dialog_title', { name: creator, item: unitName })}
                            </DialogTitle>
                            <DialogDescription>
                                {t('donation_unit_each', {
                                    amount: priceLabel(flow.unit, flow.currency, currentLanguage),
                                })}
                            </DialogDescription>
                        </DialogHeader>

                        {/*
                         * `SegmentedControl` and not two `Button`s: this is a **value**, not a pair of
                         * actions, and the DS component is what carries `role="tablist"`, the roving
                         * arrow keys and one tab stop for the group. Rendered only when the creator
                         * priced both — a single-option picker is a control that cannot be used.
                         */}
                        {flow.offersCash && (
                            <SegmentedControl aria-label={t('donation_currency_label')}>
                                {CURRENCIES.map(option => (
                                    <SegmentedControlItem
                                        data-testid="donation-currency"
                                        data-currency-code={option}
                                        key={option}
                                        selected={flow.currency === option}
                                        onClick={() => flow.changeCurrency(option)}
                                    >
                                        <SegmentedControlItemLabel>
                                            {t(`donation_currency_${option}`)}
                                        </SegmentedControlItemLabel>
                                    </SegmentedControlItem>
                                ))}
                            </SegmentedControl>
                        )}

                        {/*
                         * The quantity sits on the field surface rather than floating on the dialog,
                         * so the controls read as one form. It is not a `TextField` — the value is
                         * not typed here, it is pressed — so borrowing `FieldShell` would announce an
                         * input that does not exist.
                         *
                         * No visible label above this row. The header two lines up already says
                         * "…a Coffee" and the row itself says "Coffee", so a third "Quantity"
                         * heading made the form read like a spreadsheet — three stacked labels for
                         * what is really one decision. The label survives where it is needed:
                         * `role="group"` + `aria-label` announces the same word to a screen reader
                         * without printing it.
                         */}
                        {/* `fieldset`, not `div role="group"` — the native element is the group, and
                            `min-w-0` is not optional on one: its default `min-width: min-content`
                            ignores the flex container and stops the unit name truncating. */}
                        {/*
                         * ⚠ A `<div role="group">`, **not** a `<fieldset>` — and that is a layout
                         * decision, not a shortcut.
                         *
                         * Biome's `useSemanticElements` asks for a fieldset here and it was one for
                         * a pass. A fieldset renders its children inside an **anonymous content
                         * box**, and that box does not give a percentage height anything to resolve
                         * against: the inner flex row asked for `h-full` and computed to **36px**
                         * (the height of its tallest child) inside a 48px box, so it sat against the
                         * top edge and the whole row read **5px above** its own centre. Measured,
                         * not reasoned about — `items-center` was working perfectly on a box that
                         * was the wrong height. Putting `display: flex` on the fieldset directly has
                         * the same result, for the same reason.
                         *
                         * `role="group"` with a name is what a fieldset means to an assistive
                         * technology, so nothing is given up but the element name.
                         */}
                        {/* biome-ignore lint/a11y/useSemanticElements: see above — a fieldset's
                            anonymous content box breaks the height of this row. */}
                        <div
                            role="group"
                            aria-label={t('donation_quantity_label')}
                            className="flex h-12 min-w-0 items-center justify-between rounded-lg border border-(--input-border) bg-(--input-bg) ps-4 pe-1.5"
                        >
                            <span className="flex min-w-0 items-center gap-2">
                                <DonationArt icon={offer.icon} size={20} className="flex-none" />
                                <span className="type-body-default truncate text-(--input-text)">
                                    {unitName}
                                </span>
                            </span>
                            <span className="flex flex-none items-center gap-0.5">
                                <Button
                                    data-testid="donation-quantity-down"
                                    variant="ghost"
                                    size="medium"
                                    iconOnly
                                    aria-label={t('donation_quantity_decrease')}
                                    // One is the floor, so the control disables rather than
                                    // silently refusing — a button that does nothing when pressed
                                    // reads as broken.
                                    disabled={quantity <= 1}
                                    onClick={() => flow.stepBy(-1)}
                                >
                                    <Icon name="minus" size={20} />
                                </Button>
                                {/*
                                 * `min-w`, not `w`. A fixed 32px box was fine at "3" and **broke the
                                 * row** the moment an amount produced a five-figure count: the
                                 * number overflowed its box and pushed the `+` button out of the
                                 * field. It grows to a ceiling and truncates past it, and
                                 * `inline-block` is what makes `truncate` apply at all to an
                                 * `<output>`, which is inline by default.
                                 */}
                                <output
                                    className="type-body-strong inline-block min-w-8 max-w-20 truncate text-center text-(--text-title) tabular-nums"
                                    aria-live="polite"
                                >
                                    {formatPlainAmount(quantity, currentLanguage)}
                                </output>
                                <Button
                                    data-testid="donation-quantity-up"
                                    variant="ghost"
                                    size="medium"
                                    iconOnly
                                    aria-label={t('donation_quantity_increase')}
                                    onClick={() => flow.stepBy(1)}
                                >
                                    <Icon name="plus" size={20} />
                                </Button>
                            </span>
                        </div>

                        {/*
                         * `type="text"` with an `inputMode`, **not** `type="number"`.
                         *
                         * A number input is not a numeric input: every engine accepts `e`, `E`, `+` and
                         * `-` in it (they are legal in a float literal), accepts a pasted `abc`, and
                         * reports `value === ''` for anything it considers invalid — so the field looked
                         * like it held text and the state behind it silently held nothing. `inputMode`
                         * still raises the numeric keypad on a phone, which is the only part of
                         * `type="number"` that was earning its place. Sanitising on the way in is what
                         * actually enforces it, and it is per currency: Star is a whole number, cash has
                         * two decimals.
                         */}
                        <TextField
                            data-testid="donation-quantity"
                            label={t('donation_amount_label')}
                            type="text"
                            inputMode={flow.currency === 'star' ? 'numeric' : 'decimal'}
                            autoComplete="off"
                            value={flow.amount}
                            onChange={e =>
                                flow.changeAmount(sanitizeAmount(e.target.value, flow.currency))
                            }
                            /*
                             * The Star mark is a raster asset, not a glyph — `shared/lib/money.ts` says
                             * so and `formatStarAmount` deliberately leaves it out of the string. This is
                             * the same mark the balance surfaces draw. Cash gets its symbol instead.
                             */
                            prefix={
                                flow.currency === 'star' ? (
                                    <StarMark />
                                ) : (
                                    <span className="type-body-default">{USD.symbol}</span>
                                )
                            }
                            error={
                                canDonateAmount(flow.amount, flow.unit)
                                    ? null
                                    : t('donation_amount_min', {
                                          amount: priceLabel(
                                              flow.unit,
                                              flow.currency,
                                              currentLanguage,
                                          ),
                                      })
                            }
                            /*
                             * The affordability warning goes in the field's **own** message row.
                             *
                             * `FieldShell` reserves that row at `min-h-4` whether or not it has
                             * anything to say, so a message appearing never shifts the form.
                             * Rendering the warning as a *sibling* underneath therefore paid for
                             * the row twice: an empty 16px slot, the dialog's gap, and then the
                             * line — **50px of dead space** under the field, measured. In the slot
                             * it costs nothing.
                             *
                             * `hint`, not `error`, and the distinction is real: `error` sets
                             * `aria-invalid` and a red border, i.e. "this value is not acceptable"
                             * — but the amount is perfectly valid and the press still runs
                             * (`useRequireStars` diverts to a top-up rather than refusing). This is
                             * a warning about the **balance**, not a verdict on the input. It is
                             * painted with the error token anyway, because a number the reader
                             * cannot currently afford is worth the colour even when it is not an
                             * error.
                             *
                             * `FieldShell` gives `error` precedence over `hint`, which is the right
                             * way round: "enter at least 100" replaces "you need 3,760 more" while
                             * the field is empty, and neither ever prints under the other.
                             */
                            hint={<Shortfall amount={short ? starShortfall(amount) : 0} />}
                        />

                        <TextAreaField
                            data-testid="donation-message"
                            label={t('donation_message_label')}
                            labelData={
                                <span className="type-caption-meta text-(--text-subtitle)">
                                    {t('donation_optional')}
                                </span>
                            }
                            placeholder={t('donation_message_placeholder')}
                            rows={3}
                            value={flow.message}
                            onChange={e => flow.setMessage(e.target.value)}
                        />
                    </div>

                    {/*
                     * The pinned block, and the hairline is what makes it read as one.
                     *
                     * Without it the button looked like the last row of a form that happened to stop
                     * there, and the content scrolling *behind* nothing gave the dialog no bottom
                     * edge. `-mx-(--dialog-pad)` bleeds the rule through the dialog's own inset, so it spans the
                     * full width the way a footer rule should rather than floating inside the
                     * padding — the same treatment the DS gives a card's full-bleed divider.
                     */}
                    <div className="-mx-(--dialog-pad) flex flex-col gap-3 border-(--separator-default) border-t px-(--dialog-pad) pt-4">
                        {/*
                         * Said once, next to the control it disables. A disabled button with no
                         * explanation is the version of this that generates support tickets.
                         */}
                        {flow.currency === 'cash' && !flow.isCashAvailable && (
                            <p className="type-caption-meta text-(--text-subtitle)">
                                {t('donation_cash_unavailable')}
                            </p>
                        )}

                        <DialogFooter>
                            {/*
                             * `accent`, not `primary`: this is the call to action on the screen, and the
                             * app reserves `primary` for the neutral press beside it.
                             */}
                            {/*
                             * Disabled when the reader cannot afford it — see the note on the
                             * shortfall at the top of this file for when to reverse that.
                             * The warning under the amount field is what makes it legible; a
                             * disabled control with nothing explaining it is the version of this
                             * that generates support tickets.
                             */}
                            <Button
                                data-testid="donation-review"
                                variant="accent"
                                size="large"
                                disabled={!flow.canSubmit || short}
                                onClick={flow.review}
                            >
                                <DonationArt icon={offer.icon} size={20} className="flex-none" />
                                {/*
                                 * The creator's own wording when they wrote one, untranslated by
                                 * nature — see `button_text` in `api/types.ts`.
                                 */}
                                {label}
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>
            {/* ── Confirm ────────────────────────────────────────────────────────────── */}
            {/*
             * Built here rather than reusing `ConfirmDialog`, and the reason is the summary: this is
             * the last screen before money moves, so it has to restate **what** and **how much** —
             * and that component takes a title and one sentence, which forced the whole thing into a
             * run-on title ("Buy Ada 3 × Coffee for 300 Star?").
             *
             * Its two behaviours are kept deliberately, not by accident: Cancel comes **first in the
             * DOM**, so focus and Escape land on the answer that changes nothing, and `isDonating`
             * disables **both** buttons — the write is already running, and an enabled Cancel would
             * suggest it can still be called off.
             *
             * Cancel goes **back to Details**, it does not end the flow. Legacy closes both and
             * discards everything typed; this returns the reader to the form they assembled, the same
             * reasoning behind the shortfall leaving the dialog open.
             */}
            <Dialog open={flow.step === 'confirm'} onOpenChange={open => !open && flow.back()}>
                <DialogContent>
                    <DialogHeader>
                        <ArtTile icon={offer.icon} avatarUrl={target.avatarUrl} name={creator} />
                        <DialogTitle>
                            {t('donation_confirm_title', {
                                name: creator,
                                quantity,
                                item: unitName,
                            })}
                        </DialogTitle>
                        {/*
                         * Two different transactions, so two different sentences. The Star one names
                         * the balance it comes out of and that it cannot be undone; the cash one
                         * names the card and points at the fee, which is the thing a reader is most
                         * likely to be surprised by. One shared sentence said "spends Star from your
                         * balance" on a screen that was about to charge a card.
                         */}
                        <DialogDescription>
                            {flow.currency === 'cash'
                                ? t('donation_confirm_body_cash')
                                : t('donation_confirm_body_star')}
                        </DialogDescription>
                    </DialogHeader>

                    <Summary
                        amount={amount}
                        fee={fee}
                        total={total}
                        currency={flow.currency}
                        shortfall={short ? starShortfall(amount) : 0}
                    />

                    <DialogFooter layout="side-by-side">
                        <Button
                            data-testid="donation-back"
                            variant="secondary"
                            size="large"
                            disabled={flow.isDonating}
                            onClick={flow.back}
                        >
                            {t('common_cancel')}
                        </Button>
                        <Button
                            data-testid="donation-confirm"
                            variant="accent"
                            size="large"
                            // Unreachable in practice — the form's CTA is disabled on the same
                            // condition, so a short reader never gets here. Stated anyway: the
                            // amount cannot change on this screen, but the *balance* can (another
                            // tab spending Star, a socket refresh), and a button that cannot
                            // succeed should not be pressable.
                            disabled={flow.isDonating || short}
                            onClick={flow.confirm}
                        >
                            {t('donation_confirm_yes')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* ── Success ────────────────────────────────────────────────────────────── */}

            <Dialog open={flow.step === 'success'} onOpenChange={open => !open && flow.close()}>
                <DialogContent>
                    <DialogHeader>
                        <Image
                            src={DONATION_SUCCESS_ART.src}
                            alt=""
                            aria-hidden
                            width={DONATION_SUCCESS_ART.width}
                            height={DONATION_SUCCESS_ART.height}
                            className="h-auto max-w-full"
                            priority
                        />
                        <DialogTitle className="type-title-t2-semibold">
                            {t('donation_success_title')}
                        </DialogTitle>
                        {/*
                         * The creator's own thank-you line when they wrote one, **as text**.
                         * Legacy pushes it through `dangerouslySetInnerHTML`, which makes every
                         * creator's profile field a script injection into every visitor's page.
                         * The cost of not doing that is that a creator who typed `<b>` sees the
                         * tag; that is the correct trade and it is not close.
                         */}
                        <DialogDescription>
                            {offer.thank_you_msg ?? t('donation_success_body', { name: creator })}
                        </DialogDescription>
                    </DialogHeader>

                    {/*
                     * The receipt. A thank-you with no figure on it leaves the reader checking their
                     * balance to find out what just happened.
                     *
                     * It carries no name: the line above it already says who was donated to, and a
                     * screen that prints the creator's name twice in three lines reads as a template
                     * that was not looked at. Same `Row` as the summary strip, so the figure is in
                     * the same place it was on the two screens before this one.
                     */}
                    <div className="rounded-lg bg-(--background-segment) px-4 py-3">
                        <Row
                            label={t('donation_success_sent')}
                            value={formatStarAmount(amount, currentLanguage)}
                            currency="star"
                            strong
                        />
                    </div>

                    <DialogFooter>
                        <Button
                            data-testid="donation-close"
                            variant="accent"
                            size="large"
                            onClick={flow.close}
                        >
                            {t('donation_done')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}

/**
 * The DS `Dialog`'s illustration slot (`.tevi-dialog__illustration`), 60×60 — the unit's art with
 * the creator badged onto it.
 *
 * ## Two pictures, because the sentence has two nouns
 *
 * "Buy **Ada** a **coffee**." The tile showed only the coffee, which made the illustration the least
 * specific thing on a screen whose entire subject is one particular person. Overlapping the avatar on
 * the trailing-bottom corner is the badge pattern the app already uses for Premium and for verified
 * marks, so it reads as "this thing, for them" rather than as two unrelated images.
 *
 * The ring is the **dialog's** surface, not a border colour: it is a knockout, so the avatar reads as
 * sitting in front of the tile rather than being drawn on it. `-end-1 -bottom-1` keeps it a logical
 * offset, so it mirrors in Arabic with everything else.
 *
 * The tile itself is local rather than an export from `shared/ui/dialog.tsx` because the class is in
 * the half of `components.css` the 256 KiB read cap loses, so its fill and radius are **derived** —
 * from the dialog's own stated variant heights — rather than read. A derived number belongs to the
 * one feature that derived it until somebody can check it, not to the shared port where it would look
 * authoritative.
 */
function ArtTile({
    icon,
    avatarUrl,
    name,
}: {
    icon: DonationIcon | null
    avatarUrl?: string | null
    name: string
}) {
    return (
        <span className="relative inline-flex size-[60px] items-center justify-center rounded-lg bg-(--background-segment)">
            <DonationArt icon={icon} size={32} />
            {/*
             * Only when there is a **picture**.
             *
             * `AnimatedAvatar` falls back to initials, and that was tried first — but `Avatar`'s
             * `type="initials"` carries no fill of its own in this port (`shared/ui/avatar.tsx`:
             * neither `AVATAR_BASE` nor `AvatarInitials` sets a background), so two bare letters
             * floated on the tile with no circle behind them. That is a gap in the shared component
             * rather than in this one, and papering over it here with a local background would put a
             * second, divergent answer next to the one every other avatar in the app uses. So the
             * badge is dropped for a photo-less creator, which is exactly the tile as it was before —
             * nothing regresses, and the initials version can come back the day `Avatar` draws one.
             */}
            {avatarUrl && (
                <span className="absolute -end-1 -bottom-1 rounded-[var(--radius-fill)] bg-(--background-subtle) p-0.5">
                    {/* Decorative: the title beside it already names the creator, so a second
                    announcement of the same name is noise to a screen reader. */}
                    {/*
                     * Two characters, not the name. `initials` is what the avatar *prints* — it does
                     * not derive anything — so passing "Ada Lovelace" rendered the whole string
                     * overflowing a 20px circle. Same `.slice(0, 2).toUpperCase()` every other avatar
                     * in the app uses (`channel-header.tsx`, `blocked-account-row.tsx`).
                     */}
                    <AnimatedAvatar
                        thumb={avatarUrl}
                        alt=""
                        size="2xs"
                        initials={name.replace('@', '').slice(0, 2).toUpperCase()}
                    />
                </span>
            )}
        </span>
    )
}

/**
 * The total, with the working behind it folded away.
 *
 * ## A disclosure, and the DS has none
 *
 * Reported rather than approximated, per `docs/DESIGN_SYSTEM.md`: `components.md` lists 34
 * components and **no accordion**. The nearest thing is `.tevi-list-info`, which has an
 * `__accessory` and a `__right-icon` but no open/closed state — it is a row that *looks* like a
 * disclosure without being one. So this is a native `<details>` / `<summary>` wearing DS tokens.
 *
 * Native rather than a hand-rolled `useState` + `aria-expanded` pair, and that is not laziness:
 * `<details>` is a disclosure to every screen reader and to find-in-page (which expands it to reach
 * a match) without a line of JavaScript, and it keeps working if hydration never happens.
 *
 * ## ⚠ Only **cash** gets one, and Star having one was the mistake
 *
 * A disclosure exists to fold away *working*. Cash has working: the card is charged the donation
 * **plus a transaction fee**, so the figure that leaves the account is not the figure typed into the
 * form, and `Total → Amount + Fee` is a derivation worth showing on request.
 *
 * Star has none. The amount *is* the charge — there is nothing to add, nothing to derive and no
 * second currency — so hanging a chevron off it promised an explanation and then revealed one
 * unrelated row. It is a single line, and the balance that shared it for a pass is gone too: a
 * reader on this screen is deciding about one number, and printing what they happen to hold beside
 * it asks them to do arithmetic nobody wanted.
 *
 * So the two shapes are genuinely different, because the two transactions are:
 *
 * | | Star | Cash |
 * |---|---|---|
 * | shape | one row | disclosure |
 * | shows | **Total** | **Total**, folding to Amount + Transaction fee |
 *
 * **The shortfall never folds**: it sits outside, always visible, and only Star can have one. A
 * warning that appears only if you happen to expand a row is a warning that will be missed.
 */
function Summary({
    amount,
    fee,
    total,
    currency,
    shortfall,
}: {
    /** What the reader typed — the donation itself, before any fee. */
    amount: number
    /** The card fee, or `null` when the fee service has not answered. Always `null` for Star. */
    fee: number | null
    /** What is actually charged: `amount` for Star, `amount + fee` for cash. */
    total: number
    currency: DonationCurrency
    shortfall: number
}) {
    const { t, currentLanguage } = useTranslation()

    return (
        <div className="flex flex-col gap-2">
            <div className="rounded-lg bg-(--background-segment) px-4 py-3">
                {currency === 'cash' ? (
                    <details
                        data-testid="donation-breakdown"
                        className="group/summary"
                        /*
                         * The block can sit at the bottom of a scrolling body, so what it reveals
                         * may open **below the fold** — the chevron flips and, as far as the reader
                         * can tell, nothing happened. `block: 'nearest'` scrolls the minimum needed
                         * and does nothing when the rows are already in view. No
                         * `behavior: 'smooth'`: the JS option is not covered by
                         * `prefers-reduced-motion` the way the CSS property is, and an instant
                         * scroll of two rows needs no easing.
                         */
                        onToggle={event => {
                            if (event.currentTarget.open) {
                                event.currentTarget.scrollIntoView({ block: 'nearest' })
                            }
                        }}
                    >
                        {/*
                         * `list-none` plus the WebKit pseudo-element: Safari draws its own triangle
                         * marker and ignores the standard property, so both are needed or the row
                         * gets a second, unstyled chevron on one engine only.
                         */}
                        <summary className="flex cursor-pointer list-none items-center gap-2 outline-none [&::-webkit-details-marker]:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)">
                            <Row
                                label={t('donation_total')}
                                value={amountLabel(total, currency, currentLanguage)}
                                currency={currency}
                                strong
                                className="flex-auto"
                            />
                            <Icon
                                name="angle-down"
                                size={16}
                                aria-hidden
                                className="flex-none text-(--icon-secondary) transition-transform duration-[120ms] group-open/summary:rotate-180"
                            />
                        </summary>
                        <div className="flex flex-col gap-2 pt-2">
                            <Row
                                label={t('donation_amount_label')}
                                value={amountLabel(amount, currency, currentLanguage)}
                                currency={currency}
                            />
                            {/*
                             * An em dash, not `$0.00`. "We have not been told the fee" and "there is
                             * no fee" are different sentences, and only one of them is safe to print
                             * beside a card total — legacy prints the second for both and
                             * understates the charge. `donationFee` answers `null` for this reason.
                             */}
                            <Row
                                label={t('donation_fee')}
                                value={
                                    fee === null ? '—' : amountLabel(fee, currency, currentLanguage)
                                }
                                currency={currency}
                            />
                        </div>
                    </details>
                ) : (
                    /*
                     * One row, no disclosure and no balance. The amount **is** the charge on the
                     * Star path — nothing is added to it and nothing derives it — so there is
                     * neither a breakdown to fold away nor a second figure that earns its line. The
                     * balance sat here for a pass and was noise: a reader on the confirm screen is
                     * deciding about one number, and printing what they happen to hold beside it
                     * asks them to do arithmetic nobody wanted.
                     */
                    <Row
                        label={t('donation_total')}
                        value={amountLabel(total, currency, currentLanguage)}
                        currency={currency}
                        strong
                    />
                )}
            </div>
            <Shortfall amount={shortfall} />
        </div>
    )
}

function Row({
    label,
    value,
    currency,
    strong,
    className,
}: {
    label: ReactNode
    value: string
    currency: DonationCurrency
    strong?: boolean
    className?: string
}) {
    return (
        <span className={cn('flex items-center justify-between gap-3', className)}>
            <span
                className={cn(
                    'min-w-0 truncate',
                    strong
                        ? 'type-dense-emphasis text-(--text-title)'
                        : 'type-dense-default text-(--text-subtitle)',
                )}
            >
                {label}
            </span>
            <span className="flex flex-none items-center gap-1">
                {/* Cash carries its symbol inside `value`; Star's mark is a picture beside it. */}
                {currency === 'star' && <StarMark size={14} />}
                <span
                    className={cn(
                        'tabular-nums',
                        strong
                            ? 'type-body-strong text-(--text-title)'
                            : 'type-dense-default text-(--text-subtitle)',
                    )}
                >
                    {value}
                </span>
            </span>
        </span>
    )
}

/** The two options, in the order the picker shows them. Star first: it is the one that completes. */
const CURRENCIES: readonly DonationCurrency[] = ['star', 'cash']

/**
 * The one cash currency this flow deals in.
 *
 * A literal rather than a lookup because the offer's cash line is `USD` by contract (`api/types.ts`)
 * — there is no second fiat option to choose between, and inventing a currency picker for a field
 * with one value would be a control that cannot be used.
 */
const USD = DONATION_USD

/** A bare figure, with its own unit: `300` beside the Star mark, `$3.00` on its own. */
function amountLabel(value: number, currency: DonationCurrency, locale: string): string {
    return currency === 'star'
        ? formatStarAmount(value, locale)
        : formatFiatAmount(value, USD, locale)
}

/** A figure that has to name its unit in prose — `100 Star`, `$1.00`. */
function priceLabel(value: number, currency: DonationCurrency, locale: string): string {
    return currency === 'star'
        ? `${formatStarAmount(value, locale)} Star`
        : formatFiatAmount(value, USD, locale)
}

/**
 * What a keystroke is allowed to leave in the amount field.
 *
 * Whole numbers for Star — there is no such thing as half a Star to spend, which is why
 * `formatStarAmount` rounds rather than truncates. Up to two decimals for cash, one decimal point,
 * and nine integer digits either way so a pasted number cannot produce a quantity the row cannot
 * lay out.
 *
 * Applied here rather than in `useDonateFlow` on purpose: the hook holds the **raw field value** by
 * design (see its note on why controlled numeric inputs cannot be typed into), and what a field
 * accepts is a property of the field.
 */
function sanitizeAmount(raw: string, currency: DonationCurrency): string {
    if (currency === 'star') return raw.replace(/\D/g, '').slice(0, 9)
    const cleaned = raw.replace(/[^\d.]/g, '')
    const [whole = '', ...rest] = cleaned.split('.')
    const decimals = rest.length > 0 ? `.${rest.join('').slice(0, 2)}` : ''
    return `${whole.slice(0, 9)}${decimals}`
}

/**
 * Whether the field holds a spendable figure.
 *
 * The same rule `canDonate` applies in the hook — **including the minimum**, which is the point: the
 * message under this field names the unit price, so the guard behind it has to be the one that
 * enforces it. It is restated rather than read off `flow.canSubmit` because that also goes false when
 * the *cash tab* is what blocks submission, which would print "enter at least 100 Star" under a
 * perfectly good amount.
 */
function canDonateAmount(amount: string, unit: number): boolean {
    return canDonate(amount, unit)
}

/**
 * "You need N more Star."
 *
 * Rendered on both screens — inside the amount field's message row on the form (see the note at that
 * call site), and under the total on the confirm, where the figure it qualifies is right above it.
 * Nothing when there is no shortfall, and nothing on the cash tab either: the caller passes `0`
 * there, because weighing a dollar figure against a Star balance is the unit mix-up the rest of this
 * file keeps guarding.
 *
 * Returning `null` matters for the form: `hint` renders nothing when its node is `null`, so the
 * reserved row simply stays empty rather than collapsing or growing.
 */
function Shortfall({ amount }: { amount: number }) {
    const { t, currentLanguage } = useTranslation()

    if (amount <= 0) return null

    return (
        <p className="type-caption-meta text-(--text-error)">
            {t('donation_short', { amount: formatStarAmount(amount, currentLanguage) })}
        </p>
    )
}
