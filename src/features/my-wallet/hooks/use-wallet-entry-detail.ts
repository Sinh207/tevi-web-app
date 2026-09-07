'use client'

import type { LedgerEntry } from '@features/balance'
import { formatLedgerAmount } from '@features/balance'
import type { LedgerDetailRow } from '@shared/components/ledger-detail-dialog'
import { TEVI_COIN_SRC } from '@shared/components/tevi-coin-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatLedgerDateTime } from '@shared/lib/ledger-time'
import { type Currency, formatPlainAmount } from '@shared/lib/money'
import { type ReactNode, useCallback, useMemo, useState } from 'react'
import type { TeviCoinBonus } from '../api/tevi-coin-api'
import { walletTransactionLabelKey } from '../lib/wallet-transaction-types'

/**
 * The state and the strings behind `/my-wallet`'s transaction-detail sheet.
 *
 * ## A hook, because two screens open the same sheet
 *
 * `/my-wallet` shows recent movements and `/my-wallet/transaction-history` shows all of them, and a
 * row is pressable on both. Everything the sheet needs — which row is open, and the six strings that
 * describe it — is derived the same way in both places, so it is derived once here rather than copied
 * into two views that would then drift. `features/my-star` has its own copy of this for its own
 * vocabulary, which is the same call the two transaction-type tables make.
 *
 * ## Selection is an **id**, not the entry
 *
 * Holding the entry would freeze a copy of it: the ledger refetches (a spend invalidates
 * `balanceKeys.all`), and a sheet open across that would keep showing the figure from before. Holding
 * the id and looking it up each render means the sheet either shows current data or closes itself
 * because the row is gone — see `entry`.
 */
export function useWalletEntryDetail({
    entries,
    displayCurrency,
    rate,
    bonuses,
    bonusLink,
}: {
    entries: LedgerEntry[]
    displayCurrency: Currency
    rate: number
    /**
     * `billyTxId → bonus`, from `useLedgerBonuses` — **B83**. Passed in rather than fetched here
     * because the ledger hook already asks for the ids on screen, and a second query for the same
     * answer would be a second request per page.
     */
    bonuses?: Map<string, TeviCoinBonus>
    /**
     * The way into the Tevi Coin mini app, as a node.
     *
     * A node and not a slug: opening a mini app is `features/mini-app`'s business and the sheet lives
     * in `shared/`, so the view supplies the control. It is also what keeps this hook renderable in a
     * `/dev` harness with no router.
     */
    bonusLink?: ReactNode
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
        const labelKey = walletTransactionLabelKey(entry.type)
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
                  /*
                   * Absent unless this movement actually earned one, and absent too when the figure
                   * could not be read. `useLedgerBonuses` decides that once, for both surfaces —
                   * see `isDisplayableBonus`.
                   */
                  bonus: bonusFor(entry, bonuses, currentLanguage, t, bonusLink),
                  rows,
              }
            : null,
    }
}

/**
 * The sheet's `bonus` prop for one entry, or `undefined`.
 *
 * A function rather than an inline block so the return object stays readable, and so the "no bonus"
 * and "unreadable amount" cases are one decision in one place — the row builds the same pair in
 * `use-wallet-ledger.ts` and the two must not disagree about when a bonus exists.
 */
function bonusFor(
    entry: LedgerEntry,
    bonuses: Map<string, TeviCoinBonus> | undefined,
    locale: string,
    t: (key: string) => string,
    link: ReactNode,
) {
    /*
     * `bonuses` arrives already filtered by `isDisplayableBonus` (`use-ledger-bonuses.ts`), which is
     * the single place that decides *when a bonus exists* — status `success` and a positive amount,
     * the product's rule from B83. Re-stating those conditions here would be a second opinion that
     * can drift from the row's; the only check left is the one that narrows `amount` to a number.
     */
    const bonus = entry.txId ? bonuses?.get(entry.txId) : undefined
    if (!bonus || bonus.amount === null) return undefined
    return {
        label: t('balance_txn_bonus_label'),
        // `+`, because a bonus is only ever a credit — every row the endpoint returns is a `deposit`.
        amount: `+${formatPlainAmount(bonus.amount, locale)}`,
        mark: { src: TEVI_COIN_SRC, size: 16 },
        note: t('balance_txn_bonus_note'),
        link,
    }
}
