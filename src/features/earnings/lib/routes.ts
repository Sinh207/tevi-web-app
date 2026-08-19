/**
 * Re-export of the feature's addresses, so files inside the feature reach them where every other
 * `lib/` helper lives instead of having to know about the split.
 *
 * The definitions are in `features/earnings/routes.ts` — one level up, deliberately, because
 * `features/channel` imports them and that file must stay free of any dependency on this
 * feature's components. See its own doc for the cycle that forces it.
 *
 * ## The slug in the path is decoration, and the path keeps it anyway
 *
 * The report is derived from the bearer (see `api/earnings-api.ts`), so `/@ada/earnings-report`
 * does not *mean* "Ada's report" to the server — it means "the caller's report, at an address
 * that mentions Ada". Legacy's URL, kept verbatim, because links to it exist outside this repo:
 * the mobile apps deep-link into it, including into a specific day.
 *
 * The screen makes the address true by refusing to render anyone else's figures under it — see
 * `EarningsReportView`.
 */

export { earningsReportDayPath, earningsReportPath } from '../routes'
