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
