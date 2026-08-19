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

/**
 * "Are you sure?" — the DS `Dialog` in its `confirm` shape (Figma 50:15797): title,
 * one line of consequence, and two buttons side by side.
 *
 * Cancel comes **first** in the DOM, so it is what focus and the Escape key land on. The
 * dialog exists to make the destructive answer deliberate; putting the confirm button
 * under the returning focus would undo that.
 *
 * `pending` disables both buttons rather than only the confirm one — the action is already
 * running, and letting Cancel be pressed would suggest it can still be called off.
 */
export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel,
    cancelLabel,
    onConfirm,
    pending,
    destructive,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description?: string
    confirmLabel: string
    cancelLabel?: string
    onConfirm: () => void
    pending?: boolean
    destructive?: boolean
}) {
    const { t } = useTranslation()

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    {description && <DialogDescription>{description}</DialogDescription>}
                </DialogHeader>
                <DialogFooter layout="side-by-side">
                    <Button
                        variant="secondary"
                        size="large"
                        disabled={pending}
                        onClick={() => onOpenChange(false)}
                    >
                        {cancelLabel ?? t('common_cancel')}
                    </Button>
                    <Button
                        variant={destructive ? 'destructive' : 'accent'}
                        size="large"
                        disabled={pending}
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
