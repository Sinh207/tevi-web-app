'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

/**
 * The copy glyph beside an ID — a receiver's Tevi ID in a history row, a transfer ID in the row's panel
 * and on the receipt.
 *
 * Legacy has this in both places and it earns its place: an ID is not something anybody *reads*, it is
 * something they **quote** — to support, to the person who says the Star never arrived, into a
 * spreadsheet.
 *
 * A 16px glyph in the link colour, as legacy draws it, with two seconds of tick after a press for the eye
 * already on the pointer, and a toast for the fact. `navigator.clipboard` does not exist on an insecure
 * origin and can be refused by permissions policy, so the failure path is real rather than defensive
 * padding — and the value stays on screen beside it to be selected by hand, which is why this needs no
 * "here is the value instead" message of its own.
 *
 * The whole *value* is not the button (which is what `features/brand-assets`'s `CopyHexButton` does with
 * a hex): inside a history row the value sits on top of the row's own toggle, and the smaller the thing
 * that steals pointer events from it, the better.
 */
export function CopyIdButton({ value, className }: { value: string; className?: string }) {
    const { t } = useTranslation()
    const [copied, setCopied] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

    useEffect(() => () => clearTimeout(timer.current), [])

    async function copy() {
        try {
            await navigator.clipboard.writeText(value)
            // One id, so pressing two rows in a row replaces the toast rather than stacking two of them
            // over the list being read.
            toast.success(t('star_transfer_id_copied'), { id: 'star-transfer-copy' })
            setCopied(true)
            clearTimeout(timer.current)
            timer.current = setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.error(t('star_transfer_error'), { id: 'star-transfer-copy' })
        }
    }

    return (
        <button
            data-testid="star-transfer-copy-id"
            type="button"
            onClick={copy}
            aria-label={t('star_transfer_copy_id')}
            className={cn(
                'inline-flex flex-none cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                className,
            )}
        >
            <Icon
                name={copied ? 'check' : 'pages'}
                weight="filled"
                size={16}
                className={copied ? 'text-(--text-success)' : 'text-(--text-link)'}
                aria-hidden
            />
        </button>
    )
}
