import type {
    DatadogRule,
    EventConfig,
    SustainedFeeRule,
    ThirdPartyConfig,
    WebConfig,
} from './types'

/**
 * The two places remote config needs *resolving* rather than just reading: which Datadog rule
 * applies to this visitor, and which sustained-fee rule applies in their country.
 *
 * Pure functions taking everything they need as arguments — no hooks, no context. Two reasons,
 * and the second is the one that shaped the signatures:
 *
 * 1. Precedence is where the bugs are (all three of legacy's are below), and a pure function is
 *    the only form in which "the device whitelist beats the country rule" can be *stated* in a
 *    test rather than described in a comment.
 * 2. **The country is a parameter, not a lookup.** There *is* a source now —
 *    `useCountry()` (`shared/lib/geo-provider.tsx`) reports the edge's country header, read during
 *    the document render — and these stay pure functions over it rather than reaching for it: a rule
 *    that decides whether Datadog initialises has to be testable against a country the test names.
 *    A caller that wants geo behaviour passes `useCountry().country` in.
 *    ⚠ It is a spoofable **hint** (`shared/lib/geo.ts`), so it may steer sampling and must never
 *    decide an entitlement.
 */

/* ============================== datadog ============================== */

export interface DatadogAudience {
    /** The active account id, or `null` for a guest. */
    userId?: string | null
    /** This device's fingerprint (`shared/lib/api/request-context.ts`), or `null`. */
    deviceId?: string | null
    /** Whether this account has paid — Premium, or any purchase. */
    isPaidUser?: boolean
    /** ISO country code, any case. */
    countryCode?: string | null
}

export interface DatadogDecision {
    /** The master switch from `WEB_CONFIG`. Nothing initialises Datadog when this is false. */
    enabled: boolean
    /** Which rule won, or `null` when none matched. Exposed for logging, not for branching. */
    matched: 'user' | 'device' | 'paidUser' | 'country' | 'default' | null
    /** `sessionSampleRate` / `sessionReplaySampleRate`. `0` samples nothing. */
    rumSampleRate: number
    /** `traceSampleRate`. `0` samples nothing. */
    traceSampleRate: number
    trackResources: boolean
    trackLongTasks: boolean
    trackUserInteractions: boolean
}

/**
 * Which Datadog rule applies to this visitor, narrowest audience first.
 *
 * `user → device → paid user → country → default`. A rule only wins if it has the relevant
 * feature switched on, so a whitelist entry with `rum_enabled: false` does not shadow the
 * country rule below it — it declines and the search continues. RUM and traces are resolved
 * **independently** for the same reason: an entry can enable one and not the other.
 *
 * ## The three bugs this fixes
 *
 * `providers/tracking/useDataDog.js`, all three in the same twenty lines:
 *
 * 1. **The device whitelist never applies.** Its second branch reads
 *    `if (userConfig?.features?.rum_enabled) return deviceConfig?.sampling_rates?.rum` —
 *    `userConfig` where it meant `deviceConfig`, in both the RUM chain and the trace chain. So
 *    the branch is unreachable unless the *user* is whitelisted, in which case the first branch
 *    already returned. Whitelisting a device to debug somebody's session silently does nothing.
 * 2. **The paid-user rule applies to everybody.** `paidUserConfig` is read straight off the
 *    config and its branch never checks whether this visitor *is* a paid user. So a `paid_users`
 *    entry sets the sampling rate for every anonymous visitor too — which, for a rule that
 *    exists to sample paying customers *more* heavily, is the expensive direction to be wrong
 *    in. Hence `isPaidUser` being required to reach it here.
 * 3. **The tracking options cannot be switched off.** `x || true` is `true` for every `x`. A
 *    console entry of `track_long_tasks: false` is ignored. `flagOn` in `types.ts` is the
 *    fix; this function just passes the parsed value through.
 *
 * A fourth, smaller one: legacy's `deviceConfig` memo omits the device id from its dependency
 * array, so it keeps the first value it computed — usually the one from before the fingerprint
 * resolved. Purity removes the whole class.
 */
export function resolveDatadogDecision(
    web: WebConfig,
    thirdParty: ThirdPartyConfig,
    audience: DatadogAudience = {},
): DatadogDecision {
    const { userId, deviceId, isPaidUser, countryCode } = audience
    const { whitelist, paidUsers, countries } = thirdParty.dataDog

    /**
     * The candidates in precedence order. `undefined` where the audience does not match at all —
     * a guest has no user rule, a visitor with no country has no country rule — which keeps
     * "does not apply" and "applies and says no" separate.
     */
    const candidates: Array<[DatadogDecision['matched'], DatadogRule | undefined]> = [
        ['user', userId ? whitelist.users[userId] : undefined],
        ['device', deviceId ? whitelist.devices[deviceId] : undefined],
        ['paidUser', isPaidUser ? (paidUsers ?? undefined) : undefined],
        ['country', countryCode ? countries[countryCode.toUpperCase()] : undefined],
        ['default', web.dataDog.default],
    ]

    const pick = (feature: 'rumEnabled' | 'tracesEnabled', rate: 'rum' | 'trace') => {
        for (const [name, rule] of candidates) {
            if (rule?.features[feature]) return { name, value: rule.samplingRates[rate] }
        }
        return { name: null, value: 0 }
    }

    const rum = pick('rumEnabled', 'rum')
    const trace = pick('tracesEnabled', 'trace')

    /*
     * The tracking options come from the rule that won RUM — they are RUM options — falling back
     * to the default rule, which is where the console actually sets them. Legacy reads them from
     * the default rule unconditionally; taking the winner's first means a whitelisted device can
     * be given long-task tracking without switching it on for everybody, which is the reason
     * anybody whitelists a device.
     */
    const winner = candidates.find(([name]) => name === rum.name)?.[1] ?? web.dataDog.default

    return {
        enabled: web.dataDog.enabled,
        matched: rum.name,
        rumSampleRate: rum.value,
        traceSampleRate: trace.value,
        trackResources: winner.rumOptions.trackResources,
        trackLongTasks: winner.rumOptions.trackLongTasks,
        trackUserInteractions: winner.rumOptions.trackUserInteractions,
    }
}

/* ============================== sustained fee ============================== */

/**
 * The sustained-fee rule for a country: the country's own if the console has one, otherwise the
 * default, otherwise `null`.
 *
 * `null` means **no rule**, which is not the same as a rule that is off: a live screen with no
 * rule should say nothing at all, rather than telling a viewer they will be charged the
 * fallback 1 Star every 5 minutes. Legacy gets this right (`if (!defaultConfig) return null`)
 * and it is the reason `EventConfig.defaultCountry` is nullable rather than defaulted.
 *
 * The country lookup is case-insensitive here *and* the keys were upper-cased at parse time, so
 * a console entry typed `vn` is found. Legacy upper-cases only the lookup, at two call sites,
 * with two different methods.
 */
export function resolveSustainedFeeRule(
    event: EventConfig,
    countryCode?: string | null,
): SustainedFeeRule | null {
    const { specificCountry, defaultCountry } = event.chargeStarInLive.viewer
    if (countryCode) {
        const specific = specificCountry[countryCode.toUpperCase()]
        if (specific) return specific
    }
    return defaultCountry
}

/* ============================== download ============================== */

/**
 * Whether the direct-APK download is offered here.
 *
 * Both conditions, which legacy checks in neither place it could: `useQrDownload` reads
 * `white_list` into a memo, lists it as an effect dependency, and then never tests a country
 * against it — so the APK button appears wherever `is_active` is set, whitelist or no whitelist.
 * An empty whitelist means **nowhere**, since a whitelist that matched everything would not need
 * to exist.
 *
 * ## It returns `false` for every caller in this app today, on purpose
 *
 * There is no geo-detection here yet (see the file note), so no caller can pass a country, and
 * without one this is `false`. That is stated rather than worked around because the alternative —
 * treating "country unknown" as "offer it" — would publish a sideloadable APK worldwide, which is
 * the opposite of what a whitelist is for, and in some stores a compliance problem rather than a
 * bug. There is also nothing to break: the APK download screen is not built.
 *
 * So this is a **gate waiting for its input**, not dead code. Whoever adds a country source wires
 * it in here and the behaviour starts being correct; anyone building the screen sooner will find
 * the button hidden and this paragraph explaining why.
 */
export function isApkDownloadOffered(web: WebConfig, countryCode?: string | null): boolean {
    const { isActive, link, whiteList } = web.download.apk
    if (!isActive || link === '') return false
    if (!countryCode) return false
    return whiteList.includes(countryCode.toUpperCase())
}
