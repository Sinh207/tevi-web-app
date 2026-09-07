/**
 * `/my-wallet`'s address, and nothing else.
 *
 * Import-free for the same reason `features/my-star/routes.ts` is: `features/navigation`'s
 * `menu-rows.ts` links here and must not pull a barrel — see that file's doc for the barrel cycle.
 *
 * ## Legacy's address, narrowed
 *
 * Legacy's `/my-wallet` is one screen with two tabs, Star and Currency. The design splits them and its
 * handoff note is explicit about which half keeps the address: *"bên My wallet bỏ phần Star đi"*. So
 * this URL survives the cutover unchanged — the mobile apps link to it — and now means the Currency
 * half only. The Star half is `/my-star`.
 */

/** `/my-wallet` — withdrawable earnings and their ledger. */
export const MY_WALLET_PATH = '/my-wallet'

/**
 * `/my-wallet/transaction-history` — the full currency ledger, with the type filter.
 *
 * Legacy's address, kept. The split is legacy's too: `/my-wallet` shows the history under a **View
 * all** link and no filter, and this page is where the filter lives. So the wallet screen stays a
 * summary — balance, the payout rows, recent movements — and the one control that only makes sense
 * against the *whole* ledger is on the page that shows the whole ledger.
 */
export const MY_WALLET_TRANSACTION_HISTORY_PATH = '/my-wallet/transaction-history'
