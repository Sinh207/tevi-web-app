/**
 * `/identification`'s address, and nothing else.
 *
 * ## An import-free module, for the reason `features/premium/routes.ts` gives
 *
 * Two surfaces outside this feature link here — the account drawer's **Identification** row
 * (`features/navigation/lib/menu-rows.ts`, a data module with no JSX and no hooks) and the verified
 * badge's dialog, which is opened from `features/channel`. Routed through this feature's `index.ts`,
 * either would drag `IdentificationView` — and the Sumsub SDK behind it — into a module that only
 * wanted a string.
 *
 * ## The address is legacy's, unchanged
 *
 * Legacy serves the KYC flow at `/identification`, and that URL is already in support replies and in
 * the mobile app's own links, so keeping it means `proxy.ts` needs no redirect at cutover.
 */

/** `/identification` — submit identity documents, and the only page that explains getting verified. */
export const IDENTIFICATION_PATH = '/identification'
