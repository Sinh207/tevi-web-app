'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Alert, AlertContent, AlertIcon, AlertSubtitle, AlertTitle } from '@shared/ui/alert'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import { useMemo } from 'react'
import { MAX_SAVED_CARDS } from '../api/payment-methods-api'
import type { SavedCard } from '../api/types'
import { useCardName } from '../hooks/use-card-name'
import { isCardPayable, pickPayableCard } from '../lib/card-brand'
import { CARD_MANAGEMENT_ART } from '../lib/illustrations'
import { SavedCardRow } from './saved-card-row'

/**
 * The populated screen: a sticky section header, the cards, and the compliance strip.
 *
 * ```
 *  Payment methods                    [＋ Add new card]   ← sticky, page fill
 *  ┌ card ─────────────────────────────────────────────┐
 *  ┌ card ─────────────────────────────────────────────┐
 *          [ VISA  MC  AMEX  JCB … ]                      ← 324×58 scheme strip
 *   We are fully compliant with Payment Card Industry…    ← 12/400, centred
 * ```
 *
 * ## Not a list panel — separate boxes on the page
 *
 * This is legacy's arrangement (`cardList`), and it is the reason this screen has no `Panel` wrapper
 * around the rows: each card is its own bordered box on the page background, with 12px between them.
 * A DS list panel would put them in one surface separated by hairlines, which is a different
 * component saying a different thing — a set of settings rows rather than a set of *cards*.
 *
 * It also makes the header genuinely sticky. A `position: sticky` child inside a clipping ancestor
 * sticks to the bottom of that ancestor instead of to the viewport (the trap `/my-membership`'s panel
 * documents), so `md:overflow-hidden` and a sticky header are mutually exclusive. No panel, no clip,
 * no problem.
 *
 * ## The cap is a count, not a disabled button
 *
 * At ten cards legacy replaces the button with `10/10`. That is better than a greyed-out control: it
 * says *why* nothing can be added, in the place the reader is looking, without a tooltip. The
 * `payment_card_limit_reached` line under it is this client's addition — the count alone assumes the
 * reader knows ten is the maximum.
 */
export function SavedCardList({
    cards,
    pendingId,
    isMutating,
    isFull,
    onAdd,
    onSetDefault,
    onDelete,
}: {
    cards: SavedCard[]
    /** The card whose write is in flight, if any. */
    pendingId: string | null
    isMutating: boolean
    isFull: boolean
    onAdd: () => void
    onSetDefault: (card: SavedCard) => void
    /** Asks for the delete flow; the parent decides confirm vs "this is your only card". */
    onDelete: (card: SavedCard) => void
}) {
    const { t } = useTranslation()
    const cardName = useCardName()

    /*
     * One `now` for the whole list, taken per render rather than per row: twelve rows must not each
     * read the clock and disagree about which month it is. It is a prop on the row for the same reason
     * `isCardExpired` takes one — a test that depends on the host clock fails one day in the future.
     */
    const now = useMemo(() => new Date(), [])

    /**
     * The gap between what this screen says and what checkout will actually do.
     *
     * `/card-management` highlights the card the backend marked default (`pickDefaultCard`), because
     * that is the account's own record and this screen exists to manage it. Checkout asks
     * `pickPayableCard`, which **skips an expired default** — a guaranteed decline is not a card to
     * open a payment on. Both are right, and together they leave a row wearing a **Default** badge
     * while the next charge lands somewhere else entirely, with nothing on the screen admitting it.
     *
     * So the screen says it. `fallback` is the row checkout would really use, resolved by the same
     * function checkout calls rather than by a second guess at the rule; `null` means every saved
     * card is dead and there is nothing to fall back to, which is a different sentence.
     */
    const staleDefault = useMemo(() => {
        const current = cards.find(card => card.default)
        if (!current || isCardPayable(current, now)) return null
        return { fallback: pickPayableCard(cards, now) }
    }, [cards, now])

    return (
        <div className="flex flex-col">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-(--background) px-4 py-3">
                <h2 className="type-body-strong m-0 text-(--text-title)">
                    {t('payment_payment_methods')}
                </h2>

                {isFull ? (
                    /*
                     * `10/10` and nothing else, as legacy draws it — the reason lives in `title`, so it
                     * is available on hover and to assistive tech without turning a one-line header
                     * into two. A second visible line here was this client's own addition and it made
                     * the header the busiest thing on a screen about not being able to do anything.
                     */
                    <span
                        title={t('payment_card_limit_reached', { max: MAX_SAVED_CARDS })}
                        className="type-body-default flex-none text-(--text-subtitle)"
                    >
                        {t('payment_card_count', { used: cards.length, max: MAX_SAVED_CARDS })}
                    </span>
                ) : (
                    /*
                     * `secondary` is the DS's outlined button, which is what legacy draws here — the
                     * accent one belongs to the empty state, where adding a card is the only thing to
                     * do. Two accent buttons on one screen and neither is the primary action.
                     *
                     * `card-plus`, the DS's card-with-a-plus — legacy inlines its own drawing of the
                     * same thing. It was a bare `plus` until the 2026-10-08 library import.
                     */
                    <Button
                        data-testid="payment-card-list-add"
                        variant="secondary"
                        size="small"
                        className="flex-none"
                        disabled={isMutating}
                        onClick={onAdd}
                    >
                        <Icon name="card-plus" size={16} />
                        {t('payment_add_card')}
                    </Button>
                )}
            </div>

            {staleDefault && (
                /*
                 * `warning`, not `error`: nothing has failed and nothing is lost — a working card is
                 * being used instead. `error` here would say the account is broken, and the reader
                 * would go looking for the thing that went wrong.
                 *
                 * No `AlertActions`. The two remedies are already on the screen and named — `Replace`
                 * on the dead row, `Set as default` on the live one — and a third button here would
                 * be a second way to do a thing the reader is being pointed at.
                 */
                <div className="px-4 pb-3">
                    <Alert data-testid="payment-default-expired" status="warning">
                        <AlertIcon status="warning" />
                        <AlertContent>
                            <AlertTitle>{t('payment_default_expired_title')}</AlertTitle>
                            <AlertSubtitle>
                                {staleDefault.fallback
                                    ? t('payment_default_expired_fallback', {
                                          card: cardName(staleDefault.fallback),
                                      })
                                    : t('payment_default_expired_none')}
                            </AlertSubtitle>
                        </AlertContent>
                    </Alert>
                </div>
            )}

            <ul className="m-0 flex list-none flex-col gap-3 px-4 pb-4">
                {cards.map(card => (
                    <SavedCardRow
                        key={card.id}
                        card={card}
                        pending={pendingId === card.id}
                        busy={isMutating}
                        now={now}
                        onSetDefault={() => onSetDefault(card)}
                        onReplace={onAdd}
                        onDelete={() => onDelete(card)}
                    />
                ))}
            </ul>

            <SchemeStrip />
        </div>
    )
}

/**
 * The accepted-scheme marks and the PCI line.
 *
 * Rendered in **both** the empty and the populated state, as legacy does, because it is not
 * decoration: it is the answer to "am I about to type my card number into something trustworthy",
 * and that question is asked hardest by somebody who has not added a card yet.
 *
 * `unoptimized` is not set and does not need to be. The strip is a committed vector
 * (`public/illustrations/payment/card-schemes.svg`), and `next.config.ts`'s `dangerouslyAllowSVG` —
 * with the `script-src 'none'; sandbox` CSP under it — is what lets the optimizer serve *any* SVG,
 * ours included. It passes the file through rather than shrinking it, which is exactly why the file
 * is ours to begin with: see `lib/illustrations.ts`.
 */
export function SchemeStrip() {
    const { t } = useTranslation()

    return (
        <div className="flex flex-col items-center gap-3 px-4 pt-2 pb-6">
            <Image
                src={CARD_MANAGEMENT_ART.schemes.src}
                alt=""
                width={CARD_MANAGEMENT_ART.schemes.width}
                height={CARD_MANAGEMENT_ART.schemes.height}
                /*
                 * Eager, because on this screen the strip *is* the LCP element — the panel is short
                 * enough that both states fit a viewport, and there is nothing else large in it (the
                 * empty state's illustration, the only other candidate, is already `priority`). Left
                 * lazy it was the paint the metric waited on. Not `priority`, though: that would add
                 * a preload for art that sits under a list of unknown length, and a preload for
                 * something below the fold competes with the fetch that is not.
                 */
                loading="eager"
                /*
                 * `alt=""`: the marks repeat what the line below them says, and a screen reader
                 * announcing nine scheme names before that sentence is noise. The sentence is the
                 * content.
                 */
                className="h-auto w-full max-w-[324px]"
            />
            <p className="type-caption-meta m-0 text-center text-(--text-subtitle)">
                {t('payment_pci_note')}
            </p>
        </div>
    )
}
