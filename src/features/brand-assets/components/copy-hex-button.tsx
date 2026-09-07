'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Icon } from '@shared/ui/icon'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

/**
 * The hex, and the one interactive thing in the colour tables: press it and the value is
 * on the clipboard.
 *
 * The whole cell is the button rather than a glyph beside the text, because the text *is*
 * the payload — legacy put a 24px copy icon next to an inert string and left the string
 * itself unclickable. It keeps the value visible and selectable-looking, announces itself
 * with the full "Copy #501BC0" name, and confirms twice: a toast for the fact, and a two
 * second tick where the copy glyph was for the eye that was already on the pointer.
 *
 * `navigator.clipboard` is absent on insecure origins and can be refused by permissions
 * policy, so the failure path is real, not defensive padding: it tells the reader the value
 * so they can select it by hand instead of leaving them with a button that did nothing.
 */
const TOAST_ID = 'brand-assets-copy-hex'

export function CopyHexButton({ hex }: { hex: string }) {
    const { t } = useTranslation()
    const [copied, setCopied] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

    useEffect(() => () => clearTimeout(timer.current), [])

    async function copy() {
        try {
            await navigator.clipboard.writeText(hex)
            // One id for the whole page: pressing four swatches in a row replaces the toast
            // rather than stacking four of them over the table being read.
            toast.success(t('brand_assets_copied', { hex }), { id: TOAST_ID })
            setCopied(true)
            clearTimeout(timer.current)
            timer.current = setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.error(t('brand_assets_copy_failed', { hex }), { id: TOAST_ID })
        }
    }

    return (
        <button
            data-testid="brand-assets-copy-hex"
            type="button"
            onClick={copy}
            aria-label={t('brand_assets_copy_hex', { hex })}
            className="type-dense-default group flex flex-none cursor-pointer items-center gap-2 rounded-(--radius-md) border-0 bg-transparent px-2 py-1 text-(--text-title) transition-colors hover:bg-(--background-segment) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
        >
            <span aria-hidden>{hex}</span>
            {copied ? (
                <Icon name="check" size={16} className="text-(--text-success)" aria-hidden />
            ) : (
                <Icon
                    name="pages"
                    weight="filled"
                    size={16}
                    className="text-(--text-link)"
                    aria-hidden
                />
            )}
        </button>
    )
}
