/**
 * What a top-up row's `status` means, and what it is allowed to say on screen.
 *
 * ## Three states, not the backend's string
 *
 * Legacy prints the wire value with its first letter capitalised (`capitalizeFirstLetter(status)`),
 * which is how `PROCESSING_3DS` ends up on somebody's screen as "Processing 3ds" — and it is
 * untranslatable by construction, since the words are English tokens from another service.
 *
 * So the vocabulary is mapped once, here, into the three states a reader can act on:
 *
 * | | means | what the reader does |
 * |---|---|---|
 * | `settled` | the Star arrived | nothing |
 * | `pending` | taken, not finished | wait; it will appear in My Star |
 * | `failed` | refused | try again, and expect no charge |
 *
 * ## Unknown fails to `pending`, deliberately
 *
 * The vocabulary is **not confirmed** (**B87**) — legacy never enumerates it, and this client sees
 * whatever paymee sends. The other two candidates are both worse than "pending" when the guess is
 * wrong: calling an unknown status `settled` tells somebody their money arrived when it may not
 * have, and calling it `failed` tells them a charge was refused when it may have gone through. Only
 * "pending" is honest about a state this client does not recognise, and it is the one that asks the
 * reader to look again rather than to act.
 *
 * This is the same shape as the checkout machine's own `PENDING_SETTLEMENT_CODE` rule, and the
 * mapping deliberately accepts that one's vocabulary too — a settle and a listed transaction are the
 * same event seen from two endpoints.
 */
export type TransactionStatus = 'settled' | 'pending' | 'failed'

/**
 * Wire value → state. Keys are **lower-case**; `slugText` in `api/types.ts` has already
 * lower-cased and trimmed whatever arrived.
 *
 * Written out rather than pattern-matched (`startsWith('fail')`) so adding a value is a line here
 * with a name beside it, and so a token nobody has seen cannot be swept into a state by accident.
 */
const STATUSES: Record<string, TransactionStatus> = {
    // Arrived.
    succeeded: 'settled',
    success: 'settled',
    completed: 'settled',
    complete: 'settled',
    settled: 'settled',
    paid: 'settled',
    charged: 'settled',
    // Taken, not finished.
    pending: 'pending',
    processing: 'pending',
    created: 'pending',
    initiated: 'pending',
    requires_action: 'pending',
    // Refused.
    failed: 'failed',
    failure: 'failed',
    canceled: 'failed',
    cancelled: 'failed',
    expired: 'failed',
    rejected: 'failed',
    refunded: 'failed',
}

export function transactionStatus(wire: string | null | undefined): TransactionStatus {
    if (!wire) return 'pending'
    return STATUSES[wire.trim().toLowerCase()] ?? 'pending'
}

/** The translation key for a state's badge. Literal keys, so `keys.test.ts` can see them. */
export function transactionStatusKey(status: TransactionStatus): string {
    if (status === 'settled') return 'payment_txn_status_settled'
    if (status === 'failed') return 'payment_txn_status_failed'
    return 'payment_txn_status_pending'
}
