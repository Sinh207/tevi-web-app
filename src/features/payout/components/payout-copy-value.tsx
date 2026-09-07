'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

const COPY_TOAST_ID = 'payout-copy-value'

/**
 * A value with a copy control beside it — the account number, a wallet address, a network.
 *
 * Legacy marks exactly these with `copy: true` (`wallet_address`, `network`, `account_number`), and the
 * reason is the same for all three: they are strings a creator checks against a bank app or a block
 * explorer, character by character. A name or a country is read, not transcribed.
 *
 * The affordance is this repo's established pair — a toast states the fact, the glyph becomes a tick
 * for two seconds for the eye already on the pointer — and the failure branch is real:
 * `navigator.clipboard` is absent on an insecure origin and can be refused by permissions policy, so
 * the toast carries the value for selecting by hand.
 *
 * ⚠ `pages` is this repo's copy glyph; the DS sprite has no `copy`.
 */
export function PayoutCopyValue({ value, label }: { value: string; label: string }) {
    const { t } = useTranslation()
    const [copied, setCopied] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

    useEffect(() => () => clearTimeout(timer.current), [])

    async function copy() {
        try {
            await navigator.clipboard.writeText(value)
            toast.success(t('payout_copied', { label }), { id: COPY_TOAST_ID })
            setCopied(true)
            clearTimeout(timer.current)
            timer.current = setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.error(t('payout_copy_failed', { value }), { id: COPY_TOAST_ID })
        }
    }

    return (
        <span className="flex min-w-0 items-center justify-end gap-1">
            <span className="break-all">{value}</span>
            <Button
                data-testid="payout-copy"
                variant="ghost"
                size="small"
                iconOnly
                aria-label={t('payout_copy_label', { label })}
                onClick={copy}
                className="size-6 shrink-0 p-0 text-(--text-brand) hover:not-disabled:bg-transparent"
            >
                <Icon name={copied ? 'check' : 'pages'} size={16} />
            </Button>
        </span>
    )
}
