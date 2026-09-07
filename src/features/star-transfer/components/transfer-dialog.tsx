'use client'

import { useBalanceDisplay } from '@features/balance'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { AppBarStarBalance, AppBarStarCount, AppBarStarIcon } from '@shared/ui/app-bar'
import { Dialog, DialogContent, DialogTitle } from '@shared/ui/dialog'
import type { ReactNode } from 'react'

/**
 * The shell both transfer flows are drawn in — **legacy's dialog, ported**.
 *
 * ## What legacy does, and what this had wrong
 *
 * `web-app` renders a MUI `Dialog` capped at **512** from `md` up, and a **`SwipeableDrawer` from the
 * bottom** below it. Its header is one row — *Cancel* on the left, the title absolutely centred, the Star
 * balance pill on the right — with a hairline under it; its actions row is a hairline and small pill
 * buttons pushed to the trailing edge.
 *
 * This flow was a centred 370px `Dialog` at every width, with the buttons full-width in a stacked footer.
 * 370 is the DS `Dialog`'s number, drawn for a confirm with two buttons — not for a form with a receiver
 * card, or for a review listing ten receivers, which is what these screens are. So: 512 from `sm`, and a
 * bottom sheet below it.
 *
 * ## The bottom sheet is this component, not a new primitive
 *
 * `shared/ui/sheet.tsx` does not exist yet (`.tevi-bottom-sheet` is in the half of `components.css` the
 * 256 KiB read cap loses), so rather than port a component from unreadable CSS this overrides the DS
 * dialog's *placement* below `sm`: pinned to the bottom edge, full width, only the top corners rounded,
 * entering by translating up instead of scaling. Everything else — the scrim, the focus trap, the scroll
 * lock, `Esc`, restoring focus — is base-ui's, unchanged.
 *
 * When the real sheet lands this file collapses into it; the geometry that matters is already isolated in
 * one place, which is the point of it being here.
 */
export function TransferDialog({
    open,
    onClose,
    children,
}: {
    open: boolean
    onClose: () => void
    children: ReactNode
}) {
    return (
        <Dialog open={open} onOpenChange={next => !next && onClose()}>
            <DialogContent
                className={cn(
                    // ── the sheet, below `sm` ─────────────────────────────────────────────
                    // `top-auto` is load-bearing: `DialogContent` pins `top-1/2` and translates back by
                    // half its height, and a sheet that keeps either of those sits in the middle of the
                    // screen at half opacity while it animates.
                    // `start-0` is as load-bearing as `top-auto`: `DialogContent` pins `start-1/2` and
                    // translates back by half its width, so a sheet that keeps it — as this did, once —
                    // hangs off the trailing edge by half the viewport.
                    'top-auto bottom-0 start-0 w-full max-w-none translate-x-0 translate-y-0 rtl:translate-x-0',
                    'rounded-t-2xl rounded-b-none p-0',
                    'data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full',
                    'data-[starting-style]:scale-100 data-[ending-style]:scale-100',
                    'transition-[opacity,translate] duration-200',
                    // ── the dialog, from `sm` ─────────────────────────────────────────────
                    'sm:top-1/2 sm:bottom-auto sm:start-1/2 sm:w-[512px] sm:max-w-[calc(100vw-2rem)]',
                    'sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rtl:translate-x-1/2',
                    'sm:rounded-2xl',
                    'sm:data-[starting-style]:translate-y-[-50%] sm:data-[ending-style]:translate-y-[-50%]',
                    'sm:data-[starting-style]:scale-95 sm:data-[ending-style]:scale-95',
                    'sm:transition-[opacity,scale]',
                    // The body scrolls, not the page; the header and the footer stay put.
                    'max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden',
                )}
            >
                {/*
                 * The grabber, phone only. A bottom sheet with a square top edge and no handle reads as a
                 * dialog that has slipped off the screen; this is the one mark that says "this came up from
                 * the bottom and goes back down". Decorative — the drag it advertises is the platform's on
                 * a real sheet and is not implemented here, so it stays out of the accessibility tree and
                 * `Cancel` remains the labelled way out.
                 */}
                <span
                    aria-hidden
                    className="mx-auto mt-2 h-1 w-9 flex-none rounded-full bg-(--separator-default) sm:hidden"
                />
                {children}
            </DialogContent>
        </Dialog>
    )
}

/**
 * The header: **Cancel · title · Star balance**, with a hairline under it — legacy's row, at legacy's
 * padding (8/12 on a phone, 12/16 from `sm`).
 *
 * The title is absolutely centred rather than laid out between the two controls, which is what keeps it
 * centred *on the dialog* however wide the word "Cancel" gets in nine languages. The DS app bar does the
 * same thing for the same reason.
 *
 * The Star pill is the DS's own (`AppBarStarBalance`), not a hand-drawn copy of legacy's `BtnStar`, and it
 * is **not** a link. `/get-star` exists now, so that is a product decision rather than a missing route:
 * this pill sits inside a **half-filled form**, and a link out of it discards the recipient and the amount
 * already typed. Legacy navigates and loses them. What belongs here the day it is asked for is the
 * purchase *sheet* over the dialog, which keeps the form mounted — not this link. It carries the balance,
 * which is exactly what a reader filling in an amount needs to see. Shown on the first step only, as
 * legacy shows it.
 */
export function TransferDialogHeader({
    title,
    onCancel,
    showBalance,
}: {
    title: string
    onCancel: () => void
    showBalance?: boolean
}) {
    const { t } = useTranslation()
    const { star } = useBalanceDisplay()

    return (
        <div className="relative flex flex-none items-center justify-between gap-4 border-(--separator-default) border-b px-4 py-3">
            <button
                data-testid="star-transfer-cancel"
                type="button"
                onClick={onCancel}
                className="type-dense-strong cursor-pointer border-0 bg-transparent p-0 text-(--text-title) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
            >
                {t('common_cancel')}
            </button>
            <DialogTitle className="type-body-emphasis absolute inset-x-0 mx-auto w-fit max-w-[calc(100%-160px)] truncate text-center text-(--text-title)">
                {title}
            </DialogTitle>
            {showBalance ? (
                /*
                 * The pill **without** the DS's `+` disc. `/get-star` exists now, so this is the product
                 * call the header's own note states rather than a missing route: the plus would navigate
                 * out of a half-filled form and take the recipient and the amount with it, and a filled
                 * black disc is the most pressable-looking thing on a screen where every other affordance
                 * does something. `AppBarStarBalance` composes its children, so a pill of icon + count is
                 * a DS composition, not a DS deviation; `pe-2` replaces the end padding the disc used to
                 * provide.
                 */
                <AppBarStarBalance className="flex-none pe-2">
                    <AppBarStarIcon />
                    <AppBarStarCount>{star}</AppBarStarCount>
                </AppBarStarBalance>
            ) : (
                // Keeps the title's absolute centring honest by leaving the row two children either way.
                <span aria-hidden className="w-[52px] flex-none" />
            )}
        </div>
    )
}

/**
 * The scrolling body — **16px on every edge, and one left edge for everything in it**.
 *
 * It was legacy's 12, with each section then insetting its own contents by a further `px-3` because
 * legacy does. Three left edges in a 512px dialog (heading 12, fields 24, figures 24 + a mark) is what
 * makes a form look assembled rather than designed, and the inset buys nothing a heading weight does not
 * already say. So: one 16px gutter, `gap-4` between sections, and nothing inside sets its own.
 */
export function TransferDialogBody({ children }: { children: ReactNode }) {
    return <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">{children}</div>
}

/**
 * The actions row: a hairline, then **small pill buttons pushed to the trailing edge** — legacy's shape,
 * not the DS dialog's stacked full-width footer.
 *
 * `Button size="small"` is 28px tall, which is legacy's 29 to the pixel; `rounded-full` is its 40 radius.
 * The *colour* stays this app's: `accent` for the press that commits, per the project's own rule that the
 * CTA is accent and `primary` is the neutral press beside it. Legacy's near-black pill predates the design
 * system, and that is the one place here where following it would mean copying a colour the DS has
 * replaced.
 */
export function TransferDialogFooter({ children }: { children: ReactNode }) {
    return (
        <div
            className={cn(
                'flex flex-none items-center justify-end gap-2 border-(--separator-default) border-t px-4 py-3',
                /*
                 * **On a phone the buttons fill the row; from `sm` they sit at the trailing edge.** A 28px
                 * pill in the corner of a sheet is legacy's shape and it is the wrong one for a thumb —
                 * the last press of a money flow should not be the smallest target on the screen. The
                 * child selector rather than a class per call site: there are three footers and six
                 * buttons, and this is one rule about the row, not six decisions about buttons.
                 */
                '[&>*]:flex-1 sm:[&>*]:flex-none',
                // The home bar on an iPhone sits over the last 34px of the viewport, and this row is
                // pinned to the bottom edge on a phone. `max()` keeps the 12px where there is no inset.
                'pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3',
            )}
        >
            {children}
        </div>
    )
}
