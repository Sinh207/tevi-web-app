'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { DialogClose, DialogTitle } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'

/**
 * The title band on a dialog that is really a **screen** — 56px, a centred heading, and one control at
 * the leading edge.
 *
 * `docs/DESIGN_SYSTEM.md` §7's second case. The DS dialog draws no header at all, so this is
 * app-authored, and the rule it encodes is the one that decides which edge the dismiss control sits on:
 *
 * - A **card** (the DS shell, `p-6`) puts a `DialogCloseButton` disc at the **trailing** edge.
 * - A **screen** — `p-0` plus this band, i.e. a legacy full-screen ported into a popup — puts it at the
 *   **leading** edge, because the band *is* the mobile app bar and its start slot is where back/close
 *   lives. And that slot has two jobs: `xmark` at the root, `angle-left` wherever there is a step
 *   behind. Moving the close to the far edge would split one control into two.
 *
 * ## Why a component and not a copied class string
 *
 * There are three of these bands in the app — `StarPurchaseDialog`, `TwoStepVerificationDialog` and
 * `PayoutConfirmDialog` — and `DialogCloseButton`'s own history is the argument: four dialogs
 * hand-rolled the same 32px disc from the same copied classes before it existed, and a corner
 * affordance nobody owns is one that drifts. Two of the three use this; **`StarPurchaseDialog` is still
 * its own copy** and is the next one to fold in, deliberately not touched here.
 *
 * ## What it does not do
 *
 * It renders no body and takes no children. A band that also laid out content would have to know about
 * five different step shapes, which is how a shell becomes a framework.
 *
 * The title is `DialogTitle`, so it is also what labels the popup for assistive tech — base-ui needs a
 * node it owns, and this is that node. Which means a screen-shaped dialog must not declare a second
 * one.
 */
export function DialogScreenHeader({
    title,
    onBack,
    onClose,
    disabled,
    testId,
    className,
}: {
    title: string
    /**
     * Present ⇒ the slot is a **back arrow** instead of a close cross.
     *
     * Not a `canGoBack` boolean plus a handler: two props that have to agree is a state a caller can
     * get wrong, and the wrong half is a dialog with no way out.
     */
    onBack?: () => void
    /** Omit and the cross runs through base-ui's `DialogClose`, which dismisses the dialog itself. */
    onClose?: () => void
    /** Greys the control out — for a dialog whose work must not be interrupted mid-flight. */
    disabled?: boolean
    /**
     * The header's scope; the control's `data-testid` is derived from it (`-prev` / `-close`).
     *
     * A base of its own — `auth-two-fa-header`, `payout-request-confirm-header` — and **not** the
     * dialog's id: `scripts/check-testids.mjs` reads a `testId=` prop as a declaration too, so reusing
     * the dialog's own string is a duplicate name in one file, which it rejects for the right reason
     * (a first-match lookup would return whichever came first).
     *
     * `shared/` never authors a testid scope (`scripts/check-testids.mjs` rejects a literal here), and
     * the control is unreachable to a caller otherwise — the same forwarding `DialogContent` does for
     * its overlay and `ConfirmDialog` for its two buttons.
     *
     * ⚠ **Derived, not two props, and not a ternary at the call site.** The first version had the caller
     * pass the finished id — `testId={canGoBack ? 'x-back' : 'x-close'}` — and
     * `scripts/build-testid-catalog.mjs` only reads *literals*, so both ids silently dropped out of the
     * committed catalog. `testid-catalog.test.ts` caught it: five e2e locators pointing at attributes
     * the catalog no longer knew about. Two `*TestId` props would have worked and are the thing
     * `docs/TEST_IDS.md` argues against — four of them are four things a caller forgets.
     */
    testId?: string
    className?: string
}) {
    const { t } = useTranslation()

    return (
        <div
            className={cn(
                'relative flex h-14 flex-none items-center justify-center px-2',
                'border-(--separator-default) border-b',
                className,
            )}
        >
            {onBack ? (
                <button
                    data-testid={subTestId(testId, 'prev')}
                    type="button"
                    aria-label={t('common_back')}
                    disabled={disabled}
                    onClick={onBack}
                    className={BAND_BUTTON}
                >
                    <Icon name="angle-left" size={20} />
                </button>
            ) : (
                <DialogClose
                    data-testid={subTestId(testId, 'close')}
                    aria-label={t('common_close')}
                    disabled={disabled}
                    onClick={onClose}
                    className={BAND_BUTTON}
                >
                    <Icon name="xmark" size={20} />
                </DialogClose>
            )}
            {/*
             * **The width cap is what makes `truncate` do anything.** It never fires on a flex child
             * free to grow, so the title just got wider — and at 390px the Filipino string (277.5px)
             * started 8.7px *inside* the button's box, i.e. printed under the cross. `6rem` clears a
             * 40px target plus its 8px inset on **both** sides: only one control renders at a time, but
             * reserving both keeps the text optically centred rather than centred in what is left over.
             */}
            <DialogTitle className="max-w-[calc(100%-6rem)] truncate">{title}</DialogTitle>
        </div>
    )
}

/**
 * The band's 40px target — `BarIconButton`'s box, written here because the band is not a bar.
 *
 * 40 and not 32, for `DialogCloseButton`'s reason: 32px reads fine under a desktop pointer and is a
 * miss under a thumb. The glyph is 20 either way.
 */
const BAND_BUTTON = cn(
    'absolute start-2 flex size-10 cursor-pointer items-center justify-center rounded-full',
    'border-0 bg-transparent text-(--text-title) outline-none hover:bg-(--background-segment)',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
    'disabled:cursor-not-allowed disabled:opacity-40',
)
