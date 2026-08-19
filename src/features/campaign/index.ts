/**
 * The campaign feature — **the promo campaigns the app shell advertises, and nothing else.**
 *
 * One request answers all three (`dapp-campaign/v1/campaigns/`, one repeated `campaign_type`
 * parameter per kind), and each kind gets a card:
 *
 * | kind | card | destination |
 * |---|---|---|
 * | `MILESTONE` | `GrowYourFansBanner` | the campaign's own `shortlink` |
 * | `LUCKY_WHEEL` | `LuckyWheelBanner` | a QR to install the app, where the wheel lives |
 * | `AFFILIATE` | `AffiliateBanner` | **none yet** — see below |
 *
 * ## What this feature is not
 *
 * It is not the affiliate program. Legacy's affiliate *modal* is a separate application on the
 * `raffi` service — programs, estimates, join and leave — and it belongs in `features/affiliate`
 * when it lands. This feature answers "which campaigns is this account being offered", which is
 * one endpoint and three cards; that is the whole subject.
 *
 * ## Where it is rendered
 *
 * `features/navigation`'s `AppEndRail`, which composes these three with its own two
 * (`LoginBanner`, `PremiumBanner`). The rail is desktop-only chrome, so nothing here is on a
 * phone's critical path.
 *
 * ## Deliberately not exported: `campaignApi`
 *
 * The same reason `features/balance` and `features/earnings` give — a component calling the model
 * directly is what CLAUDE.md's "never call axios from components" forbids, and exporting it is the
 * invitation. `useCampaigns()` is what a consumer needs. `campaignKeys` **is** exported, because
 * the affiliate feature's join/leave mutations will have to invalidate this list.
 */

export { campaignKeys } from './api/campaign-api'
export { type Campaign, type CampaignsByType, type CampaignType, campaignReward } from './api/types'
export { AffiliateBanner } from './components/affiliate-banner'
export { GrowYourFansBanner } from './components/grow-your-fans-banner'
export { LuckyWheelBanner } from './components/lucky-wheel-banner'
export { useCampaigns } from './hooks/use-campaigns'
