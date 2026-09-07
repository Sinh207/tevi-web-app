'use client'

import { DialogCloseButton } from '@shared/components/dialog-close-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

/**
 * One movement, in full — the sheet that opens when a ledger row is pressed.
 *
 * ## Props only, for the reason `LedgerPanel` is
 *
 * `/my-star` and `/my-wallet` are separate features with different vocabularies, so the *labels* and
 * the formatted figure arrive resolved and this file knows nothing about billy, transaction types or
 * currencies. It is the same trade the panel makes, and it is what keeps one copy of the layout
 * instead of legacy's two.
 *
 * ## What it shows, and the one part of legacy's dialog that is missing
 *
 * `web-app`'s `transactionItem/transactionDetails` draws, top to bottom: a tinted status strip with
 * the time, the description, the amount at 32, then Transaction ID / Transaction Type / Time as label
 * · value rows, the ID with a copy control and the Type as a chip. All of that is here.
 *
 * **The Tevi Coin bonus block is not.** Legacy pairs each row with a second request
 * (`DAppWalletModel.getTransactions(ids)`) and, when a matching dApp record exists, adds a bonus
 * figure plus a link into the Tevi Coin mini app. That is a different service this rewrite has not
 * ported — no `dappWallet` model exists — so the block is left out rather than faked. It is additive:
 * every row renders correctly without it, and nothing here has to move when it lands. Tracked as
 * **B83**.
 *
 * ## A centred dialog at every width — decided, not deferred
 *
 * Legacy opens this through `ResponsiveModal`: a MUI `Dialog` from `md` up and a bottom-anchored
 * `SwipeableDrawer` below it. **This one stays a centred dialog on a phone too**, which the product
 * confirmed when it was put to them as a gap. So do not read the missing drawer as a port still
 * owed — it is the same call `star-purchase-dialog.tsx` and `add-card-dialog.tsx` already record,
 * and the app has no bottom-sheet primitive to reach for anyway.
 *
 * What the phone case needs instead is a height cap, which is above: measured at 390×640 the sheet
 * is 358 wide, 483 tall and fully on screen, and `max-h` + `overflow-y-auto` is what keeps that true
 * on a short viewport rather than a different component.
 *
 * ## Status is stated, not computed
 *
 * Legacy's strip always reads *"Transaction completed successfully on …"* — it has no failure copy,
 * because a ledger only ever contains movements that happened. So `statusText` is a caller's string
 * rather than something derived, and a `payout_failure` row still reads as completed: the *failure*
 * is what the transaction records, and it did record it.
 */
export interface LedgerDetailRow {
    /**
     * A stable machine name for the line — `'id'`, `'type'`, `'time'`.
     *
     * `label` is a translated sentence, so it can be neither the React `key` (which it was) nor
     * the automation handle: nine locales means nine different keys for one row, and a copy edit
     * silently remounts the line. This is the identity; `label` is what it says.
     */
    field: string
    label: string
    /** Already formatted. */
    value: string
    /** Render as a DS chip instead of plain text — legacy's treatment for the type. */
    chip?: boolean
    /** Offer a copy control, and put this on the clipboard. Usually the same as `value`. */
    copyValue?: string
}

export function LedgerDetailDialog({
    open,
    onClose,
    title,
    statusText,
    time,
    description,
    amount,
    bonus,
    rows,
    closeLabel,
    className,
    testId,
}: {
    open: boolean
    onClose: () => void
    /** The sheet's own heading — "Transaction details". */
    title: string
    /** The tinted strip's sentence. See the note above on why it is not derived. */
    statusText: string
    /** When it happened, formatted. Shown in the strip. */
    time: string
    /** The backend's own words for the movement. Omitted when it has none. */
    description?: string
    /** The signed figure with its unit, already formatted. */
    amount: string
    /**
     * The Tevi Coin bonus this movement earned, and the note that explains it — **B83**.
     *
     * Fully formed by the caller, like `LedgerRowModel.bonus`: label, formatted figure, mark, the
     * sentence, and `link` as a **node**. The link is a node rather than an href because its
     * destination is a mini-app space and opening one is `features/mini-app`'s business — a component
     * in `shared/` may not import a feature, and hard-coding a slug here would put a product fact in
     * a layout file.
     */
    bonus?: {
        label: string
        amount: string
        mark: { src: string; size: number }
        /** Legacy's sentence about the reward. Omitted and the note block is not drawn at all. */
        note?: string
        /** The way into the Tevi Coin mini app — an anchor or a button the caller supplies. */
        link?: ReactNode
    }
    rows: LedgerDetailRow[]
    /** Accessible name for the dismiss control, and the footer button's words. */
    closeLabel: string
    className?: string
    /**
     * Base `data-testid`. Derives `-title`, `-close`, `-row` (+ `data-row-key={row.field}`),
     * `-row-copy`, and `-overlay` from `DialogContent`.
     */
    testId?: string
}) {
    return (
        <Dialog open={open} onOpenChange={next => !next && onClose()}>
            {/*
             * The height cap that makes this reachable on a short viewport now lives on
             * `DialogContent` itself — it was a gap in the primitive, not in this sheet, and
             * seventeen other dialogs had it too. Its note carries the measurements.
             *
             * The whole sheet scrolls rather than only its middle. Legacy's `scroll='paper'` keeps
             * its title and actions pinned, which is nicer and a taller change; this is the fix for
             * content that cannot be reached at all.
             */}
            <DialogContent className={cn('w-[512px] gap-0 p-0', className)} data-testid={testId}>
                {/*
                 * The heading is centred with the close control at the trailing edge, where legacy
                 * puts a text "Cancel" at the leading one. A glyph rather than a word: this sheet
                 * cancels nothing — there is no pending action in it — so "Cancel" would name an
                 * outcome that does not exist. The footer's Close is the primary way out, as in
                 * legacy; this is the one for a reader who is done reading.
                 */}
                <div className="relative flex items-center justify-center border-(--separator-default) border-b px-4 py-3">
                    <DialogTitle
                        data-testid={subTestId(testId, 'title')}
                        className="type-body-strong text-(--text-title)"
                    >
                        {title}
                    </DialogTitle>
                    {/*
                     * The shared control, so this glyph and the ones on the help dialogs are the same
                     * object — and 40px rather than the 32 this used to be, which reads fine under a
                     * pointer and is a miss under a thumb.
                     *
                     * **This dialog keeps its footer button too**, and that is not an inconsistency:
                     * legacy ships one here (`transactionDetails/actions/index.js`) and ships *nothing*
                     * on the fee-help dialogs. Where legacy has an opinion it is followed; where it has
                     * none — a dialog a touch reader cannot see how to leave — a glyph is the minimum.
                     */}
                    <DialogCloseButton
                        onClose={onClose}
                        data-testid={subTestId(testId, 'close')}
                        /*
                         * **The glyph aligns with the sheet's content column, not the target box.**
                         * Everything under this band — the strip's time, the detail values, the
                         * footer button — sits on `px-4`, so the 20px `xmark` has to end on that
                         * same 16px line. The target is 40 and the glyph is centred in it, which
                         * puts 10px of dead space beyond the mark: `end-1.5` (6px) is what lands
                         * the mark on 16. It was `end-1`, which hung it 2px outside the column and
                         * read as the one thing in the sheet not lined up with the rest.
                         *
                         * `inset-y-0 my-auto` centres it in the band explicitly. Left to `top:
                         * auto` it *was* centred, but only because an abspos child of a flex
                         * container inherits the container's `align-items` for its static
                         * position — a rule that silently stops applying the day this header stops
                         * being `items-center`.
                         */
                        className="absolute inset-y-0 end-1.5 my-auto"
                    />
                </div>

                {/*
                 * The status strip. Legacy paints it `#E6FBEE` with the sentence at 12/14 and the time
                 * bold on the right; `--accents-success-bg-active` is the DS's own success surface and
                 * is `#e6f9e6` in Light — a shade off legacy's, and a token instead of a literal.
                 *
                 * ## Dark takes the **next rung up**, and the numbers are the whole argument
                 *
                 * `DialogContent` is `bg-background-subtle`, so the ground is `#f4f4f5` in Light and
                 * `#18181b` in Dark. Measured against it, the DS token gives:
                 *
                 * | | strip ↔ dialog |
                 * |---|---|
                 * | Light — `#e6f9e6` on `#f4f4f5` | **1.00** |
                 * | Dark — `#082608` on `#18181b` | **1.09** |
                 *
                 * So Dark was not the outlier — it was *ahead*. This is not the `--background-brand`
                 * case, where the ratio had genuinely collapsed relative to Light.
                 *
                 * What fails is **hue**, not contrast. At 1.00 the Light strip is separated by hue
                 * alone, and that works: hue discrimination is good at high luminance, so a pale green
                 * on a pale grey reads instantly. At low luminance it falls off sharply, so the *same*
                 * ratio in Dark buys nothing — a near-black green reads as a dark band, not as a
                 * success surface. Reported from a screenshot, and the fix is more **luminance**, not
                 * more contrast.
                 *
                 * `--accents-success-bg-focus` (`#104c10`) takes Dark to **1.74**. Deliberately far
                 * above Light's 1.00: matching the ratio is exactly what reproduces the problem, since
                 * the point is that an identical ratio does not mean an identical reading at both ends.
                 *
                 * ## The label is `--text-subtitle`, and that one is a **fix in both themes**
                 *
                 * It was `--text-body`, which is legacy's `#666666`. Measured on the strip, that is
                 * **4.39** in Light — under the 4.5 a 14px sentence needs, so it never met AA on either
                 * side, and Dark's brighter ground would have taken it to 3.97. `--text-subtitle` reads
                 * **9.48** in Light and **6.89** in Dark.
                 *
                 * A deliberate divergence from `web-app`, on the grounds
                 * `docs/DEFINITION_OF_DONE.md` §10 gives: the sentence is the only thing on the strip
                 * that says the transaction *succeeded*, and it was the one element failing the
                 * threshold. Reproducing 4.39 to match legacy would be reproducing a defect.
                 *
                 * One token for both themes, so there is no `dark:` variant on the text — the ramp
                 * inverts and carries it. The time stays `--text-title`: 18.06 Light, 10.18 Dark.
                 *
                 * Overridden here rather than in `globals.css`: `--accents-success-bg-active` is a **DS
                 * token** ported 1:1 from `colors_and_type.css`, with six other consumers (badges, the
                 * toaster, the membership button, a password step). Those are small surfaces where the
                 * dark rung is right; a 100%-width strip is the one place it is not. Changing the token
                 * to fix one caller would move five it suits.
                 */}
                <div className="flex items-start justify-between gap-3 bg-(--accents-success-bg-active) px-4 py-3 dark:bg-(--accents-success-bg-focus)">
                    <span className="type-dense-default text-(--text-subtitle)">{statusText}</span>
                    <span className="type-dense-strong shrink-0 text-(--text-title)">{time}</span>
                </div>

                <div className="flex flex-col items-center gap-1 px-4 py-6">
                    {description && (
                        <p className="type-dense-default m-0 text-center text-(--text-body)">
                            {description}
                        </p>
                    )}
                    {/*
                     * 32/700, legacy's size for this figure — and **`--text-title` whichever way the
                     * money went**, which `web-app` does too (`amountTextStyles.color` is one
                     * constant). The row that opened this sheet is red or green; here the sign
                     * carries the direction on its own and one figure at 32 does not need colouring
                     * to be found. Colouring it would also make a debit sheet read as an error.
                     *
                     * `dir="ltr"` for the reason `LedgerRow` gives: a leading sign is bidi class ES
                     * and lands on the wrong end of the number in an RTL paragraph.
                     */}
                    <p
                        dir="ltr"
                        className="type-heading-h1-bold m-0 text-center text-(--text-title)"
                    >
                        {amount}
                    </p>
                    {bonus && (
                        /*
                         * `Bonus: ◎ +10`, centred under the figure — legacy's placement
                         * (`transactionDetails/content/index.js`, inside the same centred `Stack`).
                         *
                         * 14 rather than legacy's 16, for the reason `LedgerRow` states: this sheet's
                         * amount is `type-heading-h1-bold` (32), so the annotation reads as an
                         * annotation at either size, and keeping the two bonus lines the same size
                         * across the row and the sheet is worth more than matching one absolute
                         * number.
                         */
                        <div className="flex items-center justify-center gap-1">
                            <span className="type-dense-default text-(--text-body)">
                                {bonus.label}
                            </span>
                            <Image
                                src={bonus.mark.src}
                                alt=""
                                aria-hidden
                                width={bonus.mark.size}
                                height={bonus.mark.size}
                                className="block flex-none"
                            />
                            <span
                                dir="ltr"
                                className="type-dense-strong whitespace-nowrap text-(--text-success)"
                            >
                                {bonus.amount}
                            </span>
                        </div>
                    )}
                </div>

                {bonus?.note && (
                    /*
                     * The explanation block — legacy's `#FAFAFA` panel at radius 12, inset 12.
                     *
                     * `--background-subtle` for that grey, and this is the one place it is the right
                     * token: `docs/DESIGN_SYSTEM.md` names the dialog as the exception, because inside
                     * a surface-coloured sheet a subtle panel *does* read as recessed. On a page it
                     * would be invisible in Light.
                     */
                    <div className="px-3 pb-1">
                        <div className="flex flex-col gap-1 rounded-lg bg-(--background-subtle) p-3">
                            <p className="type-dense-default m-0 text-(--text-body)">
                                {bonus.note}
                            </p>
                            {bonus.link}
                        </div>
                    </div>
                )}

                <div className="flex flex-col gap-3 border-(--separator-default) border-t px-4 py-4">
                    {rows.map(row => (
                        <DetailRow key={row.field} row={row} testId={testId} />
                    ))}
                </div>

                <div className="px-4 pt-2 pb-6">
                    <Button
                        data-testid={subTestId(testId, 'close')}
                        variant="primary"
                        size="large"
                        fullWidth
                        onClick={onClose}
                    >
                        {closeLabel}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

const COPY_TOAST_ID = 'ledger-detail-copy'

/**
 * `label` on the left, value on the right — and a copy control when the value is one somebody would
 * quote to support.
 *
 * The copy affordance is this repo's established pair, from `app/privacy-settings`: a toast states
 * the fact for the reader, and the glyph becomes a tick for two seconds for the eye already on the
 * pointer. The failure branch is real — `navigator.clipboard` is absent on an insecure origin and can
 * be refused by permissions policy — and the toast then carries the value so it can be selected by
 * hand.
 *
 * ⚠ `pages` is this repo's copy glyph; the DS sprite has no `copy`.
 */
function DetailRow({ row, testId }: { row: LedgerDetailRow; testId?: string }) {
    const { t } = useTranslation()
    const [copied, setCopied] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

    useEffect(() => () => clearTimeout(timer.current), [])

    async function copy() {
        if (!row.copyValue) return
        try {
            await navigator.clipboard.writeText(row.copyValue)
            toast.success(t('balance_txn_detail_copied'), { id: COPY_TOAST_ID })
            setCopied(true)
            clearTimeout(timer.current)
            timer.current = setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.error(t('balance_txn_detail_copy_failed', { value: row.copyValue }), {
                id: COPY_TOAST_ID,
            })
        }
    }

    return (
        <div
            className="flex items-center justify-between gap-3"
            data-testid={subTestId(testId, 'row')}
            data-row-key={row.field}
        >
            <span className="type-dense-default shrink-0 text-(--text-body)">{row.label}</span>
            <span className="flex min-w-0 items-center justify-end gap-2">
                {row.chip ? (
                    <Badge status="default" size="medium">
                        {row.value}
                    </Badge>
                ) : (
                    <span
                        // `break-all`, not `truncate`: a transaction id is the thing a reader came
                        // here to read, and half of one is no use to support either.
                        className="type-dense-emphasis break-all text-end text-(--text-title)"
                    >
                        {row.value}
                    </span>
                )}
                {row.copyValue && (
                    <Button
                        variant="ghost"
                        size="small"
                        iconOnly
                        aria-label={t('balance_txn_detail_copy_id')}
                        data-testid={subTestId(testId, 'copy')}
                        data-row-key={row.field}
                        onClick={copy}
                        className="size-8 shrink-0 text-(--text-brand)"
                    >
                        <Icon name={copied ? 'check' : 'pages'} size={20} />
                    </Button>
                )}
            </span>
        </div>
    )
}
