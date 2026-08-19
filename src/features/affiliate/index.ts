/**
 * The affiliate feature — **the programs a creator can promote, and the one they are promoting.**
 *
 * It owns one dialog with three screens (list → detail → joined) on the `raffi` service:
 *
 * ```
 * AffiliateDialog            opened by features/campaign's AffiliateBanner
 *   useAffiliateData()       programs · current campaign · stats, gated on the dialog being open
 *   useAffiliateActions()    join (or switch) · leave
 * ```
 *
 * ## Where the boundary with `features/campaign` runs
 *
 * `features/campaign` answers **whether** affiliate programs are offered to this account — one row
 * of `dapp-campaign/v1/campaigns/`, which is what draws the banner. This feature answers **which
 * programs, and what is running**. Two services, and the split is by subject: the banner is on every
 * desktop page, the programs are on one dialog nobody has opened yet.
 *
 * The coupling is one key. Joining or leaving invalidates `campaignKeys.list` as well as its own
 * root, because `user_joined` on that banner is a different service's copy of the same fact.
 * `features/campaign` exports `campaignKeys` for this, and its barrel says so.
 *
 * ## Deliberately not exported: `affiliateApi`
 *
 * A component calling the model directly is what CLAUDE.md's "never call axios from components"
 * forbids, and exporting it is the invitation — the reasoning `features/balance` and
 * `features/earnings` both spell out. `affiliateKeys` is exported for anything that later needs to
 * invalidate this data from outside.
 *
 * The three screens are not exported either: they are only ever reachable through the dialog, and
 * each one assumes state the dialog holds.
 */

export { affiliateKeys } from './api/affiliate-api'
export type { CampaignStats, CurrentCampaign, Program } from './api/types'
export { AffiliateDialog } from './components/affiliate-dialog'
/** What the end rail renders: the campaign's card plus the dialog it opens. */
export { AffiliateEntry } from './components/affiliate-entry'
