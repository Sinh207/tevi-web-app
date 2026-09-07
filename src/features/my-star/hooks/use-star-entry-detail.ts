'use client'

import type { LedgerEntry } from '@features/balance'
import { formatLedgerAmount } from '@features/balance'
import type { LedgerDetailRow } from '@shared/components/ledger-detail-dialog'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatLedgerDateTime } from '@shared/lib/ledger-time'
import type { Currency } from '@shared/lib/money'
import { useCallback, useMemo, useState } from 'react'
import { starTransactionLabelKey } from '../lib/star-transaction-types'

/**
 * The state and the strings behind `/my-star`'s transaction-detail sheet.
 *
 * ## Its own copy of `features/my-wallet`'s hook, deliberately
 *
 * The two differ in one line — which table resolves the type label — and that line is the whole
 * reason these are two features: a Star ledger's vocabulary is not a currency ledger's, and a shared
 * hook would have to be handed the table, which is the same as handing it the feature. The same call
 * the two transaction-type tables already make. What *is* shared is the sheet itself
 * (`shared/components/ledger-detail-dialog`), which is where the layout lives.
 *
 * ## Selection is an **id**, not the entry
 *
 * Holding the entry would freeze a copy of it: the ledger refetches (a spend invalidates
 * `balanceKeys.all`), and a sheet open across that would keep showing the figure from before. Holding
 * the id and looking it up each render means the sheet either shows current data or closes itself
 * because the row is gone — see `entry`.
 */
export function useStarEntryDetail({
    entries,
    displayCurrency,
    rate,
}: {
    entries: LedgerEntry[]
    displayCurrency: Currency
    rate: number
}) {
    const { t, currentLanguage } = useTranslation()
    const [selectedId, setSelectedId] = useState<string | null>(null)

    const entry = useMemo(
        () => (selectedId ? entries.find(candidate => candidate.id === selectedId) : undefined),
        [entries, selectedId],
    )

    const close = useCallback(() => setSelectedId(null), [])

    const rows = useMemo<LedgerDetailRow[]>(() => {
        if (!entry) return []
        const labelKey = starTransactionLabelKey(entry.type)
        return [
            {
                field: 'id',
                label: t('balance_txn_detail_id'),
                value: entry.id,
                // The one field somebody quotes to support, so it is the one with a copy control.
                copyValue: entry.id,
            },
            {
                field: 'type',
                label: t('balance_txn_detail_type'),
                /*
                 * The product word, then the raw slug — the same fallback chain the row's title
                 * uses, and for the same reason: a reader who can see `space_tier_bonus` can ask
                 * about it, and a reader looking at a blank cannot.
                 */
                value: labelKey ? t(labelKey) : entry.type,
                chip: true,
            },
            {
                field: 'time',
                label: t('balance_txn_detail_time'),
                value: formatLedgerDateTime(entry.createdAt, currentLanguage),
            },
        ]
    }, [entry, t, currentLanguage])

    return {
        /** `undefined` when nothing is open, or when the open row has left the cache. */
        entry,
        /** Hand this to `LedgerPanel`'s `onRowPress`. */
        select: setSelectedId,
        close,
        /** Props for `LedgerDetailDialog`, ready to spread. `null` when there is nothing to show. */
        detail: entry
            ? {
                  open: true,
                  onClose: close,
                  title: t('balance_txn_detail_title'),
                  statusText: t('balance_txn_detail_completed'),
                  closeLabel: t('common_close'),
                  time: formatLedgerDateTime(entry.createdAt, currentLanguage),
                  description: entry.description || undefined,
                  /*
                   * The row's own unit, not the screen's — a `conversion` has a leg in each, and
                   * showing a Star figure with a dollar sign misreports it by a factor of a hundred.
                   * Same call `useWalletLedger` makes for the row.
                   */
                  amount: formatLedgerAmount({
                      amount: entry.amount,
                      currency: entry.currency,
                      displayCurrency,
                      rate,
                      locale: currentLanguage,
                  }),
                  rows,
              }
            : null,
    }
}
