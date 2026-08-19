/**
 * **Platform configuration the team can change without a deploy** — Firebase Remote Config.
 *
 * ```
 * useWebConfig()        → WebConfig, always populated       the common case
 * useRemoteConfig()     → { web, thirdParty, event, isKnown, isLoading, isError, refresh }
 * resolveDatadogDecision(web, thirdParty, audience)         which sampling rule applies
 * resolveSustainedFeeRule(event, countryCode)               which live fee rule applies
 * isApkDownloadOffered(web, countryCode)
 * ```
 *
 * Three parameters (`WEB_CONFIG`, `THIRD_PARTY_CONFIG`, `DEFAULT_EVENT_CONFIG`), one request,
 * one query key, no provider. Prices, limits, store links and kill switches — **the same values
 * for everybody**, which is what separates this from `features/permission`: that answers what
 * *one account* is allowed to do, this answers how the platform is configured. The two are
 * different services and must not be merged; the note at the top of
 * `features/permission/api/permission-api.ts` explains what goes wrong when they are.
 *
 * ## Why it lives in `shared/lib/` and not in `features/`
 *
 * It is feature-shaped — a transport, a parser, hooks, resolvers — and legacy has it as a
 * provider beside its features, so `features/remote-config` is the obvious place. It is the wrong
 * one, for two reasons that both come from the boundary rules in CLAUDE.md:
 *
 * - **It depends on no feature, and every feature depends on it.** That is the definition of
 *   `shared/`. Nothing here imports from `features/*`, so none of the machinery that keeps that
 *   boundary (`api/request-context.ts` and its mutable hand-off) is needed.
 * - **`shared/` components read it.** `shared/components/get-app-dialog.tsx` needs the store
 *   links, and `shared/` must not import from `features/`. As a feature this would force either
 *   that violation or prop-drilling the same two values through every shared component that shows
 *   a configured value — for a module that holds no business logic to justify either.
 *
 * The honest way to see it: this is **`shared/config/env.ts` for values that change at runtime**.
 * Same job, different clock.
 *
 * ## There is a *second*, unrelated "remote config" on this platform
 *
 * `permission/v3/remote-config/ACTION_FEE/` on W_API — an HTTP endpoint, referenced from
 * `features/permission/api/permission-api.ts` (where it is dead code in legacy). It is **not**
 * this. Different service, different transport, different values. If action fees are ever needed
 * they come from that endpoint through an axios model; do not add them to a Firebase parameter,
 * and do not fold that endpoint in here.
 *
 * ## The three things worth knowing before you use it
 *
 * 1. **Nothing is ever `null` or `undefined`.** Every field has a fallback in code, chosen per
 *    field with the reason written next to it (`types.ts`). Flags fail *closed*, limits and
 *    prices fail to the number legacy hard-codes, links fail to the real store URLs. So a
 *    consumer reads `config.post.createPost.characterLimit` — no `?.`, no `?? 500`. Legacy's
 *    fifteen call sites each invent their own fallback, two forget, and three would crash on a
 *    half-filled console entry.
 * 2. **There is no provider.** One query key does what a provider would, and a page that reads
 *    no config pays nothing — no Firebase chunk, no request. `use-remote-config.ts` gives
 *    the full reasoning, including why `permission` and `balance` *are* providers.
 * 3. **Firebase being unreachable is a normal state, not an error.** Throttled, offline, blocked
 *    IndexedDB, malformed JSON — all resolve to the defaults, and the last successfully fetched
 *    template is preferred over them (`client.ts`). `isKnown` is how a screen
 *    that must not print a made-up price tells the difference.
 *
 * ## Adding a parameter or a field
 *
 * A field: one entry in the schema in `types.ts` with its fallback and the reason, one line
 * on the interface, one line in the normalizer. `WEB_CONFIG_DEFAULTS` follows for free — it is
 * derived from the schema, never written out.
 *
 * A whole parameter: add it to `PARAMETERS` in `client.ts` and to the snapshot. It costs **no
 * extra request** — the template arrives whole, which is the point.
 *
 * ## This module has a barrel; its neighbours in `shared/lib/` do not
 *
 * `shared/lib/api/` and `shared/lib/socket/` are imported file by file. This one is a barrel
 * because its public surface is three unrelated kinds of thing — hooks, pure resolvers, parsed
 * types — that a single consumer mixes, and because the overview above needs a home. Import from
 * `@shared/lib/remote-config`, not from the files inside it.
 *
 * ## Consumers, present and pending
 *
 * `shared/components/get-app-dialog.tsx` reads the two store links, and it is worth reading how:
 * the hook is called from a component **inside** `DialogContent`, not in the dialog's own body, so
 * the Firebase chunk and the request happen when somebody opens the dialog rather than on every
 * desktop page load. The dialog is mounted on every route that shows the end rail; that one line
 * of placement is what keeps point 2 above true for its only real consumer.
 *
 * Everything else these parameters configure — posts, DMs, live, paid interactions — is not built
 * yet, which is why this ships ahead of most of its consumers: the fallback direction and the
 * precedence rules are the parts that have to be right on the first commit, and they are testable
 * without a screen.
 *
 * Two things are parsed and deliberately **not** wired up:
 *
 * - `WEB_CONFIG.lucky_wheel.is_active`. `features/campaign`'s banner already gates on the campaign
 *   endpoint's own `is_active`, which is the flag legacy's *desktop* banner uses; legacy's *mobile*
 *   banner checks this one instead — a second kill switch for the same card. Anding them here would
 *   invent a behaviour neither client has.
 * - **Everything Datadog**: `WEB_CONFIG.data_dog`, the whole `THIRD_PARTY_CONFIG` parameter, and
 *   `resolveDatadogDecision`. There is no Datadog in this app — `@datadog/browser-rum` is not even
 *   a dependency — so this is the one part of the module with no possible consumer today. It is
 *   kept for two reasons and neither is "we might need it": the parameter arrives in the same
 *   template whether it is parsed or not, so it costs no request; and the value of the port is the
 *   three precedence bugs it fixes (`selectors.ts`), which are the kind of thing that gets
 *   re-introduced when somebody ports `providers/tracking/useDataDog.js` from legacy in a hurry.
 *   **If RUM is not in the rewrite's plan at all, delete it** — the three Datadog blocks in
 *   `types.ts`, the Datadog half of `selectors.ts`, and their tests. Nothing else depends on them.
 *
 * ## Not ported
 *
 * `GAME_CONFIG` and `GAMIFY_CONFIG`. Legacy declares a getter for each and calls neither from
 * anywhere.
 */

export type { RemoteConfigSnapshot } from './client'
export { fetchRemoteConfigSnapshot, remoteConfigKeys } from './client'
export type { DatadogAudience, DatadogDecision } from './selectors'
/**
 * The resolvers. Pure and hook-free, so precedence can be tested and so a caller outside React
 * (a Datadog init path, a route guard) can use them without a component.
 */
export {
    isApkDownloadOffered,
    resolveDatadogDecision,
    resolveSustainedFeeRule,
} from './selectors'
export type {
    DatadogRule,
    EventConfig,
    SustainedFeeRule,
    ThirdPartyConfig,
    WebConfig,
} from './types'
/**
 * The defaults, and the normalizers that produce them. Exported for tests and for a consumer
 * that has a raw payload in hand (a dev tool, a fixture) — not as a way to read the config,
 * which is what the hooks are for.
 */
export {
    EVENT_CONFIG_DEFAULTS,
    normalizeEventConfig,
    normalizeThirdPartyConfig,
    normalizeWebConfig,
    STORE_URLS,
    THIRD_PARTY_CONFIG_DEFAULTS,
    WEB_CONFIG_DEFAULTS,
} from './types'
export type { RemoteConfigValue } from './use-remote-config'
export { useRemoteConfig, useWebConfig } from './use-remote-config'
