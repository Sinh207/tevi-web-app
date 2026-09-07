'use client'

import { DialogCloseButton } from '@shared/components/dialog-close-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import { useState } from 'react'

/**
 * The `?` beside the balance — legacy's `tabCurrency/balance/iconBtnHelp`.
 *
 * ## Why a screen this small gets a paragraph of prose
 *
 * The figure above it is money somebody is owed, and it answers a question they arrive with: *is this
 * what I can withdraw, or what I have earned?* Legacy's copy answers it — the balance is realtime USD
 * earned across the ecosystem, spendable or withdrawable, and **a transaction fee applies**. That last
 * clause is the reason this is not decoration: a creator who does not know a fee is coming reads their
 * payout as short.
 *
 * ## A dialog, not a tooltip
 *
 * The copy is a hundred and thirty words. A tooltip that long is unreadable on a phone, cannot be
 * dismissed by touch without also dismissing what is under it, and is gone the moment a screen reader
 * moves. Legacy uses a `Dialog` for exactly this and it is the right call — so this is a dialog with a
 * title, a body and a way out.
 *
 * ## `stopPropagation`, because the card may become pressable
 *
 * Legacy guards both the open and the close handler this way. The card is not a button today, but the
 * guard costs nothing and the alternative is a press that opens this **and** navigates the moment
 * somebody makes the hero card a link.
 *
 * The glyph is `question-circle` at 16 — legacy draws its `HelpOutlineRoundedIcon` at 14 inside a 14px
 * box, which is under the 24px minimum this repo's own a11y note asks for on a real control, so the
 * *button* is 24 and the glyph inside it is 16.
 *
 * ## `--text-subtitle`, and **never** `--text-on-primary` — the bug this note exists for
 *
 * This button lives inside `Card type="balance"`, which is a **pinned dark surface in both themes**:
 * `BALANCE_TOKENS` overrides six tokens locally because Figma binds the card's gradient to the Zinc
 * ramp and that ramp inverts, so an unpinned card would be a pale slab in Light. See `card.tsx`.
 *
 * `--text-on-primary` is *not* one of the six. It is `--white` in Light and **`--black` in Dark**, so
 * this glyph measured `oklab(0 0 0 / 0.6)` — black at 60% on a `#09090b` card, which is what somebody
 * saw and reported. It only looked right in Light, and by coincidence.
 *
 * The rule for anything inside this card: use a token `BALANCE_TOKENS` pins, because those are the
 * only ones that mean the same thing at both ends. `--text-subtitle` is `#a1a1aa` there — the closest
 * pinned token to legacy's own `color: '#BFBFBF'` (`iconBtnHelp/index.js`), a hard-coded grey that
 * likewise does not follow the theme. ~7.7:1 on the card, and hover goes to `--text-title` (`#ffffff`).
 *
 * The `/60` alpha is gone with it: it existed to dim pure white, and dimming a token that is already
 * the subdued one would land under legacy's grey.
 */
export function BalanceHelpButton() {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)

    return (
        <>
            <Button
                data-testid="my-wallet-balance-help"
                variant="ghost"
                size="small"
                iconOnly
                aria-label={t('balance_help_title')}
                onClick={event => {
                    event.stopPropagation()
                    setOpen(true)
                }}
                className="size-6 flex-none self-center p-0 text-(--text-subtitle) transition-colors hover:not-disabled:bg-transparent hover:not-disabled:text-(--text-title)"
            >
                <Icon name="question-circle" size={16} />
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="w-[420px] gap-2">
                    {/* Title and dismiss on one row, no footer button — this dialog explains, it does
                        not ask. See `DialogCloseButton`. */}
                    <div className="flex items-start justify-between gap-3">
                        <DialogTitle className="type-body-strong pt-2 text-(--text-title)">
                            {t('balance_help_title')}
                        </DialogTitle>
                        <DialogCloseButton onClose={() => setOpen(false)} className="-me-2 -mt-2" />
                    </div>
                    {/*
                     * `whitespace-pre-line` so the locale file can break the paragraph where the
                     * sentence turns — legacy ships one wall of text and it reads like one.
                     */}
                    <p className="type-dense-default m-0 whitespace-pre-line text-(--text-body)">
                        {t('balance_help_body')}
                    </p>
                </DialogContent>
            </Dialog>
        </>
    )
}
