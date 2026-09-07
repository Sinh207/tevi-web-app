'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import type { Transfer } from '../api/types'
import { saveTransferPdf } from '../lib/transfer-pdf'
import { useSelfParty } from './use-self-party'

/**
 * **Save as PDF** — the one action shared by the receipt screen and every history row.
 *
 * A hook rather than a call, for two reasons neither surface should have to reinvent:
 *
 * - the **sender** is the same account on both, and it comes from `/me` (`useSelfParty`);
 * - `jspdf` is dynamically imported, so there is a real gap between the press and the download. `saving`
 *   is what lets the button say so instead of looking dead for half a second on a cold cache.
 *
 * A failure is a toast, not a field message: nothing on screen is wrong, the file simply did not arrive.
 * Legacy says the same thing (`'Save as PDF failed. Please try again.'`) in English only; this uses the
 * app's own translated sentence.
 */
export function useSaveReceipt() {
    const { t, currentLanguage } = useTranslation()
    const sender = useSelfParty()
    const [saving, setSaving] = useState(false)

    const save = useCallback(
        async (transfers: Transfer[]) => {
            if (saving || transfers.length === 0) return
            setSaving(true)
            try {
                await saveTransferPdf({ sender, transfers, locale: currentLanguage })
            } catch {
                toast.error(t('star_transfer_error'), { id: 'star-transfer-pdf' })
            } finally {
                setSaving(false)
            }
        },
        [saving, sender, currentLanguage, t],
    )

    return { save, saving }
}
