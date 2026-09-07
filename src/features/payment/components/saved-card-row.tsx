'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { buttonVariants } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import type { SavedCard } from '../api/types'
import { useCardName } from '../hooks/use-card-name'
import { cardExpiry, isCardExpired } from '../lib/card-brand'
import { CardBrandMark } from './card-brand-mark'

/**
 * One saved card, as the web app draws it: **its own bordered box**, not a row in a list panel.
 *
 * ```
 * ┌────────────────────────────────────────────────────────┐
 * │ [VISA]  •••• •••• •••• 4242            Default    ⋮    │
 * │         Expires 5/2027                                 │
 * └────────────────────────────────────────────────────────┘
 * ```
 *
 * Legacy's `cardItem`: white fill, 1px `#E0E0E0` border, the scheme mark at 42px, the masked number
 * in grey rather than in the title colour, and the expiry beneath it. The trailing side is either the
 * word **Default** or a text button that offers to make it one — never both, because they are the
 * same slot.
 *
 * **The corner is 16px (`--radius-xl`), not legacy's 8px.** That is the radius every other box this
 * app draws on the page background uses — the DS `Card`, `channel-about-card`, `earnings-day-row`
 * (the same recipe as this one: a bordered surface per item, on `--background`) and the `md:` panels
 * on `/notifications`, `/search` and the transaction list. A screen that rounds its items tighter
 * than the one beside it reads as a different app, and 8px was legacy's literal rather than a
 * decision. `card-management-skeleton.tsx` carries the same value and has to keep carrying it,
 * otherwise the corners visibly snap when the data lands.
 *
 * ## An expired card is not offered as a default
 *
 * That slot has a third state, and it is empty. A card past its expiry is a guaranteed decline
 * (`isCardPayable`), so making it the default cannot do the one thing a default is for — and it does
 * something worse than nothing, because promoting it *demotes* the card that still works. Checkout
 * already refuses to pre-select it (`pickPayableCard`), so the press would silently buy the reader a
 * downgrade they cannot see the effect of until the next charge.
 *
 * The button is **removed rather than disabled**, for the reason the `10/10` cap in
 * `saved-card-list.tsx` states: a greyed-out control needs a tooltip to say why, and the reason is
 * already on the row, one line to the left, in `--text-error`. A card that still says **Default**
 * keeps saying it after it expires — that is a fact about the account, not an offer, and hiding it
 * would only make the state harder to understand.
 *
 * A **divergence from legacy**, which has no expiry concept at all: it prints `Expires 5/2024` in the
 * same grey as a live card and offers the button regardless.
 *
 * ## There is no kebab — both actions are on the row
 *
 * Legacy puts Delete behind `iconBtnMore`, and this row followed it until the menu had exactly one
 * entry in it: a 200px panel, an animation and a second tap, to reach the only thing inside. A menu
 * is a way of not showing several things at once, and there are not several things.
 *
 * So the trailing slot is `[Set as default | Default | —] [🗑]`. It costs one tap instead of two for
 * either action, and it removes the last surface on this screen that had to be opened before it
 * could be read.
 *
 * **The objection this replaces was real, and the confirm is what answers it.** An inline delete
 * beside a benign one-tap button is a delete somebody presses by accident — which was the whole
 * reason the menu existed. It survives the change because pressing this does not delete anything:
 * `card-management-view.tsx` opens `payment-card-delete-confirm` (or, for a last card, the notice
 * explaining why it cannot go), so a misfire costs a dismissal. Were the press terminal, the menu
 * would have to stay.
 *
 * **Grey at rest, `--text-error` on hover and focus.** A red glyph on all ten rows is a screen
 * shouting, and it would fight the blue "Set as default" beside it for the same attention; the trash
 * shape already says what the control does. The colour is reinforcement at the moment of aiming, and
 * on touch — where there is no hover — the confirm is doing that job anyway.
 *
 * `size={20}` in the DS ghost icon button, the same shell the kebab used, so the target stays 40px
 * and nothing in the row's rhythm moves.
 *
 * ## The title names the card, in the title colour
 *
 * `Visa ···· 4242`, at `type-body-emphasis` (16/500 — legacy's own weight) in **`--text-title`**.
 *
 * Two things were wrong before. The row printed the digits *alone*, while `savedCardTitle` computed
 * the brand and nothing ever rendered it — it was reachable only as a fallback for a payload with no
 * `last4`, so the one row in ten that lacked digits was the only row that said "Visa". And the
 * digits, the row's whole identity, were `--text-placeholder`: **fainter than the expiry line
 * beneath them**, which is `--text-subtitle`. That inverts the hierarchy — the reader scans for the
 * last four and the screen greys them out.
 *
 * `--text-placeholder` is where legacy's `#A3A3A3` maps, so this is a **deliberate divergence**: the
 * literal was a colour choice made against a white-only screen, and it does not survive being read
 * as a hierarchy. The weight moves *toward* legacy — its `fontWeight: 500` was being drawn at 400.
 *
 * `useCardName` composes the string, so the row, the delete confirmation and the expired-default
 * warning cannot drift into naming the same card three ways.
 *
 * ## An expired row offers `Replace`
 *
 * In the slot "Set as default" vacates. A reader who has understood the red line still has to work
 * out the remedy — delete this, scroll to the header, press Add — and the row is where that thought
 * happens.
 *
 * It opens the add-card dialog and **does not delete the old card**. Saving a card can fail, and a
 * flow that removed the only record of a payment method before its replacement existed would be a
 * worse bug than the one it fixes. So the two halves stay separate: the replacement is one tap, and
 * the trash beside it is the other, taken deliberately once the new card is on screen.
 *
 * ## Tokens, not legacy's hex
 *
 * `#666` on the expiry is `--text-subtitle`, `#C2C2C2` on the Default label is `--text-disabled`,
 * and the border is `--separator-default`. All three invert with the theme, which legacy's literals
 * cannot — its card management screen is white in dark mode.
 */
/**
 * The trailing text button — "Set as default" and "Replace" are the same control in the same slot,
 * one per row and never both, so they share one class string rather than two that can drift apart.
 */
const TRAILING_LINK =
    'type-dense-strong cursor-pointer border-0 bg-transparent px-1 text-(--text-link) outline-none hover:underline focus-visible:rounded-(--radius-sm) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) disabled:cursor-not-allowed disabled:opacity-60'

export function SavedCardRow({
    card,
    pending,
    busy,
    now,
    onSetDefault,
    onReplace,
    onDelete,
}: {
    card: SavedCard
    /** This row's own write is in flight. */
    pending: boolean
    /** Some row's write is in flight — every row's controls go quiet, not just the pressed one. */
    busy: boolean
    /** Injected so a test is not at the mercy of the host clock. */
    now: Date
    onSetDefault: () => void
    /** Opens the add-card dialog. Only an expired row offers it — see the note above. */
    onReplace: () => void
    onDelete: () => void
}) {
    const { t } = useTranslation()
    const cardName = useCardName()

    const name = cardName(card)
    const expiry = cardExpiry(card.card?.exp_month, card.card?.exp_year)
    const expired = isCardExpired(card.card?.exp_month, card.card?.exp_year, now)

    return (
        <li
            data-testid="payment-card-row"
            data-card-id={card.id}
            className={cn(
                'flex items-center gap-3 rounded-(--radius-xl) border border-(--separator-default) bg-(--background-surface) px-3 py-4',
                pending && 'opacity-60',
            )}
        >
            <CardBrandMark brand={card.card?.brand} className="flex-none" />

            <div className="flex min-w-0 flex-1 flex-col">
                {/*
                 * `dir="ltr"`, and it is not decoration: a brand followed by a masked number is a
                 * left-to-right sequence, and in Arabic the groups reorder without it — the same fix
                 * `membership-row.tsx` documents for `@handle`.
                 */}
                <span dir="ltr" className="type-body-emphasis truncate text-(--text-title)">
                    {name}
                </span>
                {expiry && (
                    <span
                        className={cn(
                            'type-caption-meta truncate',
                            expired ? 'text-(--text-error)' : 'text-(--text-subtitle)',
                        )}
                    >
                        {t(expired ? 'payment_card_expired_on' : 'payment_card_expires', {
                            date: expiry,
                        })}
                    </span>
                )}
            </div>

            <div className="flex flex-none items-center gap-1">
                {card.default ? (
                    <span className="type-body-strong text-(--text-disabled)">
                        {t('payment_card_default_badge')}
                    </span>
                ) : expired ? (
                    <button
                        data-testid="payment-card-replace"
                        data-card-id={card.id}
                        type="button"
                        disabled={busy}
                        onClick={onReplace}
                        className={TRAILING_LINK}
                    >
                        {t('payment_card_replace')}
                    </button>
                ) : (
                    <button
                        data-testid="payment-card-set-default"
                        data-card-id={card.id}
                        type="button"
                        disabled={busy}
                        onClick={onSetDefault}
                        className={TRAILING_LINK}
                    >
                        {t('payment_card_set_default')}
                    </button>
                )}

                {/*
                 * It does not delete on press — it asks the parent, which opens either the confirm or,
                 * for a last card, the notice explaining why it cannot be deleted. The row does not
                 * know which: one place decides that, and it is the place that owns both dialogs.
                 *
                 * Named after the card, not "Delete": ten rows means ten of these buttons, and a
                 * screen reader listing ten identical controls has told the reader nothing about
                 * which one destroys which card.
                 */}
                <button
                    data-testid="payment-card-delete"
                    data-card-id={card.id}
                    type="button"
                    aria-label={t('payment_card_delete_named', { card: name })}
                    disabled={busy}
                    onClick={onDelete}
                    className={cn(
                        buttonVariants({ variant: 'ghost', size: 'medium', iconOnly: true }),
                        'text-(--icon-secondary) hover:text-(--text-error)',
                        'focus-visible:text-(--text-error)',
                        'disabled:pointer-events-none disabled:opacity-50',
                    )}
                >
                    {/* `size-5` as well as `size={20}` — `Button`'s size variant carries a CSS rule
                        that beats the presentation attribute and would pull this back to 18. */}
                    <Icon name="trash" size={20} className="size-5" />
                </button>
            </div>
        </li>
    )
}
