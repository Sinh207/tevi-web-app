import type { PayoutConfigRow, PayoutRequest, PayoutRequestDetail } from '@features/payout'
import type { PayoutOption, PayoutQuote } from '@features/payout/dev'

/**
 * One row per status legacy enumerates, plus one it does not know.
 *
 * The last is the point of the fixture: an unrecognised slug has to render with billy's own word and
 * neutral ink rather than vanish, and that path is unreachable from a real account.
 */
export const PAYOUT_FIXTURE: PayoutRequest[] = [
    {
        id: '1',
        requestNumber: '10428',
        status: 'pending',
        createdAt: Date.UTC(2025, 1, 19, 14, 32),
        netAmount: 1240.5,
        netAmountCurrency: 'USD',
    },
    {
        id: '2',
        requestNumber: '10391',
        status: 'completed',
        createdAt: Date.UTC(2025, 1, 12, 9, 5),
        netAmount: 4400.03,
        netAmountCurrency: 'USD',
    },
    {
        id: '3',
        requestNumber: '10377',
        status: 'waiting',
        createdAt: Date.UTC(2025, 1, 8, 22, 40),
        netAmount: 96,
        netAmountCurrency: 'USD',
    },
    {
        id: '4',
        requestNumber: '10344',
        status: 'on_hold',
        createdAt: Date.UTC(2025, 0, 28, 16, 20),
        netAmount: 250,
        netAmountCurrency: 'USD',
    },
    {
        id: '5',
        requestNumber: '10298',
        status: 'failed',
        createdAt: Date.UTC(2025, 0, 15, 8, 15),
        netAmount: 75.25,
        netAmountCurrency: 'USD',
    },
    {
        id: '6',
        requestNumber: '10250',
        status: 'awaiting_compliance_review',
        createdAt: Date.UTC(2025, 0, 4, 11, 0),
        netAmount: 1800,
        netAmountCurrency: 'USD',
    },
]

/**
 * One request in full, for the detail screen — the live list payload's own numbers plus the fields
 * only `/payout-request/{id}/` sends.
 *
 * The fee lines are the real ones: `payout_fee` 5% of 1000 = 50 TEVI, `payout_transaction_fee`
 * 1 + 5% = 51 TEVI, and `(1000 − 101) × 25622.3426 = 23,034,486 VND`. Keeping the arithmetic honest
 * here is the point — the screen exists to account for that gap.
 */
export const PAYOUT_DETAIL_FIXTURE: PayoutRequestDetail = {
    id: 'pr_279g32LVXwNak',
    requestNumber: '72485111495',
    status: 'pending',
    createdAt: Date.UTC(2025, 1, 12, 9, 5),
    netAmount: 23034486,
    netAmountCurrency: 'VND',
    amount: 1000,
    // `TEVI` on the wire, `USD` on screen — the parser maps it, so a fixture states what a reader sees.
    amountCurrency: 'USD',
    fee: 101,
    fees: [
        {
            type: 'payout_fee',
            charged: 50,
            flatAmount: 0,
            percentRate: 5,
            isWaived: false,
        },
        {
            type: 'payout_transaction_fee',
            charged: 51,
            flatAmount: 1,
            percentRate: 5,
            isWaived: false,
        },
    ],
    option: 'saving',
    optionDuration: 15,
    exchangeRate: 25622.3426,
    /*
     * The live payload's own config, verbatim — including `bank` **and** `bank_name` carrying the same
     * value. Legacy renders only the keys in its own list, so `bank` never appears; keeping both here
     * is what proves that.
     */
    config: {
        methodName: 'Bank Transfer 24/7',
        // The slug the detail rows key their method-specific copy off — lower-cased by the parser.
        methodSlug: 'bank_transfer',
        methodLogo: 'https://static.tevi.com/payments/payout_methods/bank_transfer.png',
        methodCurrency: 'VND',
        // The **method's** rate, which is what the fees and the sub-receive figure use — and it is a
        // different number from the request's root `exchangeRate` below.
        methodExchangeRate: 25457.68,
        countryName: 'Viet Nam',
        processingTimeNote: '1 business day',
        detail: {
            bank: 'TPB - NH TMCP Tiên Phong',
            bank_name: 'TPB - NH TMCP Tiên Phong',
            holder_name: 'Sinh',
            account_number: '123456789',
        },
    },
    pendingAt: Date.UTC(2025, 1, 12, 10, 30),
    onHoldAt: null,
    completedAt: null,
    failedAt: null,
    failReason: '',
}

/** The same request, rejected, with a waived fee — the two branches the happy path never reaches. */
export const PAYOUT_DETAIL_REJECTED: PayoutRequestDetail = {
    ...PAYOUT_DETAIL_FIXTURE,
    id: 'pr_rejected',
    requestNumber: '39233436726',
    status: 'failed',
    fees: [
        // Waived: the rate stands, the charge does not.
        { type: 'payout_fee', charged: 0, flatAmount: 1, percentRate: 5, isWaived: true },
        {
            type: 'payout_transaction_fee',
            charged: 51,
            flatAmount: 1,
            percentRate: 5,
            isWaived: false,
        },
    ],
    onHoldAt: Date.UTC(2025, 1, 13, 8, 0),
    failedAt: Date.UTC(2025, 1, 14, 16, 45),
    failReason: 'The receiving bank rejected the transfer: account name does not match.',
}

/**
 * Four saved payout methods — one per shape the row and the detail dialog have to handle.
 *
 * A bank transfer (the four-line row at its fullest), a USDT wallet whose backend status is `error`
 * and whose daily limit is unknown, a Zelle contact, and a Stripe account. Between them they cover
 * every branch of `payoutMethodSummary` and every label in `payout-config-labels.ts` except the two US
 * bank fields.
 *
 * `detail` carries **`bank` and `bank_name` with the same value** on the first row, which is what the
 * live payload does — the allowlist is what stops the bank being printed twice, and a fixture without
 * the duplicate would not exercise it.
 */
export const PAYOUT_METHOD_FIXTURE: PayoutConfigRow[] = [
    {
        id: 'pc_1',
        status: 'active',
        createdAt: Date.UTC(2025, 1, 19, 14, 32),
        contactName: 'Ada Lovelace',
        contactEmail: 'ada@tevi.com',
        dailyLimitRemainder: 4200.5,
        methodName: 'Bank Transfer 24/7',
        methodSlug: 'bank_transfer',
        methodLogo: '',
        methodCurrency: 'VND',
        methodMinimumAmount: null,
        methodExchangeRate: null,
        countryName: 'Viet Nam',
        detail: {
            bank: 'Vietcombank',
            bank_name: 'Vietcombank',
            account_number: '0071000123456',
            holder_name: 'ADA LOVELACE',
        },
    },
    {
        id: 'pc_2',
        // Only the backend sets this, and legacy hides the row entirely — see `usePayoutConfigs`.
        status: 'error',
        createdAt: Date.UTC(2025, 0, 8, 9, 5),
        contactName: 'Ada Lovelace',
        contactEmail: 'ada@tevi.com',
        // `—` rather than `0`: an unknown remainder must not read as "nothing left today".
        dailyLimitRemainder: null,
        methodName: 'USDT',
        methodSlug: 'usdt',
        methodLogo: '',
        methodCurrency: 'USDT',
        methodMinimumAmount: null,
        methodExchangeRate: null,
        countryName: 'Viet Nam',
        detail: {
            wallet_address: '0x8ba1f109551bd432803012645ac136ddd64dba72',
            network: 'ERC20',
        },
    },
    {
        id: 'pc_3',
        status: 'active',
        createdAt: Date.UTC(2024, 10, 2, 18, 12),
        contactName: 'Ada Lovelace',
        contactEmail: 'ada@tevi.com',
        dailyLimitRemainder: 1500,
        methodName: 'Zelle',
        methodSlug: 'zelle',
        methodLogo: '',
        methodCurrency: 'USD',
        methodMinimumAmount: null,
        methodExchangeRate: null,
        countryName: 'United States',
        detail: { holder_name: 'Ada Lovelace', email_phone_number: '+1 555 0142' },
    },
    {
        id: 'pc_4',
        status: 'active',
        createdAt: Date.UTC(2024, 8, 30, 7, 45),
        // A Stripe config has no contact of ours — the details live on Stripe.
        contactName: '',
        contactEmail: '',
        dailyLimitRemainder: null,
        methodName: 'Stripe',
        methodSlug: 'stripe',
        methodLogo: '',
        methodCurrency: 'USD',
        methodMinimumAmount: null,
        methodExchangeRate: null,
        countryName: 'United States',
        detail: { holder_name: 'Ada Lovelace' },
    },
]

/**
 * The two speed options, as `v1/payout-options/` sends them — Fast with `is_active: true` and the lock
 * therefore coming from the reader's own Premium state, which on this harness is *absent*. So the Fast
 * card renders locked, which is the state its two dialogs exist for.
 */
export const DEV_PAYOUT_OPTIONS: PayoutOption[] = [
    {
        id: 'saving',
        kind: 'saving',
        percentFeeRate: 0,
        flatFeeAmount: 0,
        durationDays: 15,
        isActive: true,
    },
    {
        id: 'fast',
        kind: 'fast',
        percentFeeRate: 5,
        flatFeeAmount: 0,
        durationDays: 1,
        isActive: true,
    },
]

/**
 * A priced quote carrying **all three** fee types — which is the whole point of it.
 *
 * `payout_fee` and `payout_transaction_fee` each get a help dialog; `payout_option_fee` deliberately
 * gets none, because legacy hangs nothing off that row and no copy explaining it exists in either app.
 * A fixture with two fees could not show that the third row is different on purpose.
 *
 * Figures are the captured VND payload's: 1,000 TEVI at 25,457.6849, so the fee subtotals are in
 * `TEVI` and the block converts them — see the note in `PayoutRequestSummary` about that being the
 * defect this fixture would have caught.
 */
export const DEV_PAYOUT_QUOTE: PayoutQuote = {
    id: 'quote_dev',
    amount: 1000,
    amountCurrency: 'TEVI',
    netAmount: 23_034_486,
    netAmountCurrency: 'VND',
    fee: 150,
    feeCurrency: 'TEVI',
    exchangeRate: 25_457.6849,
    expiresAt: null,
    fees: {
        payout_fee: {
            type: 'payout_fee',
            subtotal: 50,
            subtotalCurrency: 'TEVI',
            flatFeeAmount: 0,
            percentFeeRate: 5,
            isWaived: false,
        },
        /** Waived — the one row that prints its charge struck through beside *Free*. */
        payout_transaction_fee: {
            type: 'payout_transaction_fee',
            subtotal: 51,
            subtotalCurrency: 'TEVI',
            flatFeeAmount: 1,
            percentFeeRate: 5,
            isWaived: true,
        },
        payout_option_fee: {
            type: 'payout_option_fee',
            subtotal: 50,
            subtotalCurrency: 'TEVI',
            flatFeeAmount: 0,
            percentFeeRate: 5,
            isWaived: false,
        },
    },
}
