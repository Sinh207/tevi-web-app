import type { ActionRow } from '@shared/components/action-rows'
import type { LedgerGroupModel } from '@shared/components/ledger'

/**
 * Fixtures for `/dev/my-star`, chosen for the **payload shapes a row has to survive** rather than for
 * eight tidy rows. Each of these produced a wrong or broken render at some point while the parser and the
 * row were being written, which is why they are the fixtures.
 *
 * A plain `.ts` module beside the page, so both the page (a server component) and any future interactive
 * half can read them without either owning the data. `app/dev/splash/preview.tsx` is the same shape.
 *
 * The rows are **already formatted** — that is what `LedgerPanel` takes, and it is the point of the shared
 * panel: `shared/components/ledger` knows nothing about billy, Star or transaction types, which is what
 * lets `/my-star` and `/my-wallet` share one copy of the layout without depending on each other.
 */

export const STAR_ROWS: ActionRow[] = [
    {
        key: 'get_star',
        label: 'Get more Star',
        icon: 'plus-circle',
        tile: 'var(--accents-warning-active)',
    },
    {
        key: 'gift_star',
        label: 'Gift Star',
        icon: 'gift-simple',
        tile: 'var(--accents-indigo-active)',
    },
]

const STAR_MARK = { src: '/tevi-star.png', size: 20 }

export const STAR_LEDGER_FIXTURE: LedgerGroupModel[] = [
    {
        key: '2025-02',
        label: 'February 2025',
        rows: [
            // The ordinary case, with the backend's own sentence as its title.
            {
                id: 't1',
                title: 'Star purchase — 500 Star',
                subtitle: '19 Feb 2025, 14:32',
                amount: '+500',
                isCredit: true,
                icon: 'plus-circle',
                amountMark: STAR_MARK,
            },
            // No description on the wire: the title fell back to the type's translated label.
            {
                id: 't2',
                title: 'Donate',
                subtitle: '19 Feb 2025, 09:05',
                amount: '-120',
                isCredit: false,
                icon: 'heart',
                amountMark: STAR_MARK,
            },
            /*
             * A **fiat** row on the Star ledger — a `conversion` has a leg in each currency, which is why
             * the row's own currency decides its unit rather than the screen's. No Star mark on this one.
             */
            {
                id: 't3',
                title: 'Exchanged to USD',
                subtitle: '18 Feb 2025, 22:40',
                amount: '+$12.50',
                isCredit: true,
                icon: 'arrows-repeat',
            },
            // Zero still gets a `+`, following legacy: an adjustment that netted out is not money leaving.
            {
                id: 't4',
                title: 'Balance adjustment',
                subtitle: '18 Feb 2025, 11:00',
                amount: '+0',
                isCredit: true,
                icon: 'sliders-simple',
                amountMark: STAR_MARK,
            },
            /*
             * A type this app does not know (B36): the row is **kept**, the backend's sentence is the
             * title, and the glyph falls back to the neutral document mark. Legacy drops these, which
             * makes money vanish from a ledger.
             */
            {
                id: 't5',
                title: 'Space tier bonus',
                subtitle: '17 Feb 2025, 16:20',
                amount: '+3,750',
                isCredit: true,
                icon: 'document-list',
                amountMark: STAR_MARK,
            },
            // A title long enough to prove it truncates instead of pushing the amount off the row.
            {
                id: 't6',
                title: 'Reward for completing the February daily-gift streak, all twenty-eight days',
                subtitle: '17 Feb 2025, 08:15',
                amount: '+1,200',
                isCredit: true,
                icon: 'trophy-simple',
                amountMark: STAR_MARK,
            },
        ],
    },
    {
        // A second month, so the sticky group header and the `2025-01` bucket key are both exercised.
        key: '2025-01',
        label: 'January 2025',
        rows: [
            // No currency on the wire at all: the bare grouped number, because inventing a unit is worse
            // than omitting one.
            {
                id: 't7',
                title: 'Reward',
                subtitle: '31 Jan 2025, 19:45',
                amount: '+4.2',
                isCredit: true,
                icon: 'trophy-simple',
            },
            // A row with no readable timestamp is dropped by the parser, so it can never reach here — the
            // closest thing a preview can show is a row whose subtitle is absent.
            {
                id: 't8',
                title: 'System deduction',
                amount: '-50',
                isCredit: false,
                icon: 'minus-circle',
                amountMark: STAR_MARK,
            },
        ],
    },
]
