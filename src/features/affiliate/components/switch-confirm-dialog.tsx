'use client'

import { useTranslation } from '@shared/i18n/use-translation'
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
import type { Program } from '../api/types'
import { formatCommissionRate } from '../lib/format'
import { ProgramAvatar } from './program-avatar'

/** A program's icon with its commission rate pinned under it. */
function RatedAvatar({ program }: { program: Program | null }) {
    const { t } = useTranslation()
    return (
        <div className="relative h-[72px] w-16">
            <ProgramAvatar program={program} size="xl" px={64} />
            <span className="type-caption-meta absolute bottom-0 start-1/2 inline-flex -translate-x-1/2 items-center gap-[2px] whitespace-nowrap rounded-(--radius-fill) bg-(--accents-indigo-active) px-[6px] py-[2px] text-white rtl:translate-x-1/2">
                <Icon name="link-simple" size={16} className="flex-none" />
                {t('affiliate_percent', {
                    rate: formatCommissionRate(program?.commission_rate ?? null),
                })}
            </span>
        </div>
    )
}

/**
 * "Switch the app you're promoting?" — the one confirm that `ConfirmDialog` cannot be.
 *
 * `ConfirmDialog` takes a `title` and a `description` string, and the substance of this question is
 * **visual**: which program is being dropped and which is replacing it, with each one's rate. A
 * sentence naming two apps is a much weaker answer than seeing them side by side, so this is built
 * from the Dialog primitives instead of bent out of the shared one.
 *
 * Everything else follows `ConfirmDialog`'s rules exactly, because they are about the shape of a
 * destructive confirmation rather than that component:
 *
 * - **Cancel is first in the DOM**, so it is what focus and Escape land on. The dialog exists to
 *   make the switch deliberate.
 * - **`pending` disables both buttons.** The write is running; offering Cancel would suggest it can
 *   still be called off.
 *
 * The confirm is `accent`, not `destructive`: switching is not deletion — the creator ends up
 * promoting something, and the red is spent on *leaving*, which is the action that ends with nothing.
 */
export function SwitchConfirmDialog({
    open,
    onOpenChange,
    from,
    to,
    onConfirm,
    pending,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** The program being dropped. */
    from: Program | null
    /** The program replacing it. */
    to: Program | null
    onConfirm: () => void
    pending: boolean
}) {
    const { t } = useTranslation()

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <div className="flex items-center justify-center gap-3">
                    <RatedAvatar program={from} />
                    <Icon
                        name="arrows-rotate"
                        size={24}
                        className="flex-none text-(--icon-secondary)"
                    />
                    <RatedAvatar program={to} />
                </div>

                <DialogHeader>
                    <DialogTitle>{t('affiliate_switch_title')}</DialogTitle>
                    <DialogDescription>
                        {t('affiliate_switch_body', {
                            to: to?.name ?? '',
                            from: from?.name ?? '',
                        })}
                    </DialogDescription>
                </DialogHeader>

                <p className="type-dense-default flex items-start gap-2 rounded-xl bg-(--background-surface) p-3 text-(--text-subtitle) shadow-[inset_0_0_0_1px_var(--separator-default)]">
                    <Icon name="info-circle" size={18} className="mt-[3px] flex-none" />
                    <span>{t('affiliate_switch_note', { from: from?.name ?? '' })}</span>
                </p>

                <DialogFooter layout="side-by-side">
                    <Button
                        data-testid="affiliate-switch-cancel"
                        variant="secondary"
                        size="large"
                        disabled={pending}
                        onClick={() => onOpenChange(false)}
                    >
                        {t('common_cancel')}
                    </Button>
                    <Button
                        data-testid="affiliate-switch-confirm"
                        variant="accent"
                        size="large"
                        disabled={pending}
                        onClick={onConfirm}
                    >
                        {t('affiliate_switch')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
