import type { ActionRow } from '@shared/components/action-rows'
import type { LedgerGroupModel } from '@shared/components/ledger'

/**
 * Fixtures for `/dev/my-wallet`. See `app/dev/my-star/fixtures.ts` for why these are chosen by payload
 * shape rather than for tidiness, and why the rows arrive already formatted.
 *
 * The amounts here are shown in **VND at 25,400** — the case worth looking at, because it is the one where
 * a decimal count of 0 and a leading `₫` both matter, and where a converted figure is long enough to test
 * the row's truncation against a real number.
 */

export const WALLET_ROWS: ActionRow[] = [
    {
        key: 'withdraw_request',
        label: 'Payout request',
        icon: 'sack-dollar',
        tile: 'var(--accents-success-active)',
    },
    {
        key: 'withdraw_method',
        label: 'Payout method',
        icon: 'bank',
        tile: 'var(--accents-indigo-active)',
    },
    {
        key: 'withdraw_tracking',
        label: 'Payout tracking',
        icon: 'clock',
        tile: 'var(--accents-warning-active)',
    },
]

export const WALLET_LEDGER_FIXTURE: LedgerGroupModel[] = [
    {
        key: '2025-02',
        label: 'February 2025',
        rows: [
            /*
             * `platform_earning` — the one type whose **net** figure is shown, because the row carries both
             * a gross `amount` and a post-fee `net_amount` and a wallet has to match what actually landed.
             * The title here is long enough to prove it truncates without pushing the amount off the row.
             */
            {
                id: 'w1',
                title: 'Revenue from membership renewals, direct donations and three interactive live sessions',
                subtitle: '19 Feb 2025, 14:32',
                amount: '+₫21,391,626',
                isCredit: true,
                icon: 'sack-dollar',
            },
            // A payout leaving — the row a reader most wants to be able to find.
            {
                id: 'w2',
                title: 'Payout to Bank Transfer ••4417',
                subtitle: '18 Feb 2025, 09:05',
                amount: '-₫25,400,000',
                isCredit: false,
                icon: 'bank',
            },
            // And one that came back.
            {
                id: 'w3',
                title: 'Payout returned by the bank',
                subtitle: '18 Feb 2025, 06:30',
                amount: '+₫25,400,000',
                isCredit: true,
                icon: 'exclamation-diamond',
            },
            /*
             * A **Star** row on the currency ledger — a `conversion` has a leg in each, which is why the
             * unit comes from the row rather than from the screen. Showing this with a `₫` would misreport
             * it by a factor of tens of thousands.
             */
            {
                id: 'w4',
                title: 'Exchanged from Star',
                subtitle: '17 Feb 2025, 22:40',
                amount: '-500',
                isCredit: false,
                icon: 'arrows-repeat',
                amountMark: { src: '/tevi-star.png', size: 20 },
            },
            // Zero keeps its `+`.
            {
                id: 'w5',
                title: 'Balance adjustment',
                subtitle: '17 Feb 2025, 11:00',
                amount: '+₫0',
                isCredit: true,
                icon: 'sliders-simple',
            },
        ],
    },
    {
        key: '2025-01',
        label: 'January 2025',
        rows: [
            {
                id: 'w6',
                title: 'Commission',
                subtitle: '28 Jan 2025, 16:20',
                amount: '+₫952,500',
                isCredit: true,
                icon: 'badge-dollar',
            },
            // An unknown type (B36): kept, with the backend's sentence and the neutral glyph.
            {
                id: 'w7',
                title: 'Space tier settlement',
                subtitle: '27 Jan 2025, 08:15',
                amount: '+₫95,250',
                isCredit: true,
                icon: 'document-list',
            },
        ],
    },
]
