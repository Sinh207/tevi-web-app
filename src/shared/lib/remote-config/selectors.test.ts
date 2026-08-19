import { describe, expect, it } from 'vitest'
import { isApkDownloadOffered, resolveDatadogDecision, resolveSustainedFeeRule } from './selectors'
import {
    normalizeEventConfig,
    normalizeThirdPartyConfig,
    normalizeWebConfig,
    THIRD_PARTY_CONFIG_DEFAULTS,
    WEB_CONFIG_DEFAULTS,
} from './types'

/**
 * Precedence is where legacy's Datadog bugs live, and the point of these tests is that each one
 * is now a *statement* rather than a comment: the device whitelist beating the country rule, the
 * paid-user rule needing a paid user, an explicit `false` winning.
 */

const rule = (rum: number, extra: Record<string, unknown> = {}) => ({
    features: { rum_enabled: true, traces_enabled: true },
    sampling_rates: { rum, trace: rum },
    ...extra,
})

describe('resolveDatadogDecision', () => {
    it('samples nothing when no rule matches', () => {
        const decision = resolveDatadogDecision(WEB_CONFIG_DEFAULTS, THIRD_PARTY_CONFIG_DEFAULTS)
        expect(decision).toMatchObject({
            enabled: false,
            matched: null,
            rumSampleRate: 0,
            traceSampleRate: 0,
        })
    })

    it('carries the master switch through untouched', () => {
        const web = normalizeWebConfig({ data_dog: { enabled: true } })
        expect(resolveDatadogDecision(web, THIRD_PARTY_CONFIG_DEFAULTS).enabled).toBe(true)
    })

    it('prefers the narrowest matching audience', () => {
        const thirdParty = normalizeThirdPartyConfig({
            data_dog: {
                whitelist: { users: { u1: rule(100) }, devices: { d1: rule(80) } },
                paid_users: rule(60),
                countries: { VN: rule(40) },
            },
        })
        const web = normalizeWebConfig({ data_dog: { enabled: true, default: rule(5) } })
        const audience = { userId: 'u1', deviceId: 'd1', isPaidUser: true, countryCode: 'vn' }

        expect(resolveDatadogDecision(web, thirdParty, audience)).toMatchObject({
            matched: 'user',
            rumSampleRate: 100,
        })
        expect(
            resolveDatadogDecision(web, thirdParty, { ...audience, userId: null }),
        ).toMatchObject({ matched: 'device', rumSampleRate: 80 })
        expect(
            resolveDatadogDecision(web, thirdParty, { ...audience, userId: null, deviceId: null }),
        ).toMatchObject({ matched: 'paidUser', rumSampleRate: 60 })
        expect(resolveDatadogDecision(web, thirdParty, { countryCode: 'VN' })).toMatchObject({
            matched: 'country',
            rumSampleRate: 40,
        })
        expect(resolveDatadogDecision(web, thirdParty, {})).toMatchObject({
            matched: 'default',
            rumSampleRate: 5,
        })
    })

    /**
     * Legacy bug 1. `useDataDog` reads `if (userConfig?.features?.rum_enabled) return
     * deviceConfig?.sampling_rates?.rum` — the wrong config in the condition — so the device
     * branch is unreachable and whitelisting a device to debug a session does nothing at all.
     */
    it('applies a device whitelist entry when the user is not whitelisted', () => {
        const thirdParty = normalizeThirdPartyConfig({
            data_dog: { whitelist: { devices: { d1: rule(80) } }, countries: { VN: rule(40) } },
        })
        const decision = resolveDatadogDecision(WEB_CONFIG_DEFAULTS, thirdParty, {
            userId: 'somebody-not-listed',
            deviceId: 'd1',
            countryCode: 'VN',
        })
        expect(decision).toMatchObject({ matched: 'device', rumSampleRate: 80 })
    })

    /**
     * Legacy bug 2. `paidUserConfig` is read straight off the config and its branch never checks
     * whether the visitor is a paid user, so a `paid_users` entry sets the sampling rate for every
     * anonymous visitor — expensive, for a rule meant to sample *more*.
     */
    it('ignores the paid-user rule for a visitor who has not paid', () => {
        const thirdParty = normalizeThirdPartyConfig({
            data_dog: { paid_users: rule(60), countries: { VN: rule(40) } },
        })
        expect(
            resolveDatadogDecision(WEB_CONFIG_DEFAULTS, thirdParty, { countryCode: 'VN' }),
        ).toMatchObject({ matched: 'country', rumSampleRate: 40 })
        expect(
            resolveDatadogDecision(WEB_CONFIG_DEFAULTS, thirdParty, {
                countryCode: 'VN',
                isPaidUser: true,
            }),
        ).toMatchObject({ matched: 'paidUser', rumSampleRate: 60 })
    })

    /**
     * A rule that matches the audience but has the feature switched off **declines** — it does not
     * shadow the rules below it. Otherwise a leftover whitelist entry with `rum_enabled: false`
     * would silently exempt that one reader from the country's sampling.
     */
    it('falls through a matching rule that has the feature disabled', () => {
        const thirdParty = normalizeThirdPartyConfig({
            data_dog: {
                whitelist: {
                    users: {
                        u1: { features: { rum_enabled: false }, sampling_rates: { rum: 99 } },
                    },
                },
                countries: { VN: rule(40) },
            },
        })
        expect(
            resolveDatadogDecision(WEB_CONFIG_DEFAULTS, thirdParty, {
                userId: 'u1',
                countryCode: 'VN',
            }),
        ).toMatchObject({ matched: 'country', rumSampleRate: 40 })
    })

    /** RUM and traces are resolved independently: one entry can enable one and not the other. */
    it('resolves rum and traces from different rules', () => {
        const thirdParty = normalizeThirdPartyConfig({
            data_dog: {
                whitelist: {
                    users: {
                        u1: {
                            features: { rum_enabled: true, traces_enabled: false },
                            sampling_rates: { rum: 100, trace: 100 },
                        },
                    },
                },
                countries: { VN: rule(40) },
            },
        })
        const decision = resolveDatadogDecision(WEB_CONFIG_DEFAULTS, thirdParty, {
            userId: 'u1',
            countryCode: 'VN',
        })
        expect(decision.rumSampleRate).toBe(100)
        expect(decision.traceSampleRate).toBe(40)
    })

    it('takes the tracking options from the rule that won RUM', () => {
        const thirdParty = normalizeThirdPartyConfig({
            data_dog: {
                whitelist: {
                    users: { u1: rule(100, { rum_options: { track_long_tasks: false } }) },
                },
            },
        })
        expect(
            resolveDatadogDecision(WEB_CONFIG_DEFAULTS, thirdParty, { userId: 'u1' }),
        ).toMatchObject({ trackLongTasks: false, trackResources: true })
    })

    it('finds a country rule regardless of the case it was typed in', () => {
        const thirdParty = normalizeThirdPartyConfig({ data_dog: { countries: { vn: rule(40) } } })
        for (const code of ['vn', 'VN', 'Vn']) {
            expect(
                resolveDatadogDecision(WEB_CONFIG_DEFAULTS, thirdParty, { countryCode: code })
                    .rumSampleRate,
            ).toBe(40)
        }
    })
})

describe('resolveSustainedFeeRule', () => {
    const event = normalizeEventConfig({
        charge_star_in_live: {
            viewer: {
                specific_country: { vn: { enable: true, fee: 3 } },
                default_country: { enable: true, fee: 1 },
            },
        },
    })

    it('prefers the country rule, case-insensitively', () => {
        expect(resolveSustainedFeeRule(event, 'vn')?.fee).toBe(3)
        expect(resolveSustainedFeeRule(event, 'VN')?.fee).toBe(3)
    })

    it('falls back to the default rule for another country or none', () => {
        expect(resolveSustainedFeeRule(event, 'ID')?.fee).toBe(1)
        expect(resolveSustainedFeeRule(event, null)?.fee).toBe(1)
    })

    /**
     * `null` means **no rule**, not a rule that is off — a live screen with no rule must say
     * nothing rather than announce the fallback 1 Star every 5 minutes to a viewer nobody is
     * charging.
     */
    it('is null when the config has no rule at all', () => {
        expect(resolveSustainedFeeRule(normalizeEventConfig({}), 'VN')).toBeNull()
    })
})

describe('isApkDownloadOffered', () => {
    const web = normalizeWebConfig({
        download: {
            apk: { is_active: true, link: 'https://cdn.test/tevi.apk', white_list: ['vn'] },
        },
    })

    /**
     * Both conditions. Legacy reads the whitelist into a memo, lists it as an effect dependency,
     * and then never tests a country against it — so the button appears wherever `is_active` is
     * set. An empty whitelist means nowhere: one that matched everything would not need to exist.
     */
    it('needs the flag, a link and the country on the whitelist', () => {
        expect(isApkDownloadOffered(web, 'VN')).toBe(true)
        expect(isApkDownloadOffered(web, 'vn')).toBe(true)
        expect(isApkDownloadOffered(web, 'ID')).toBe(false)
        expect(isApkDownloadOffered(web, null)).toBe(false)
        expect(isApkDownloadOffered(WEB_CONFIG_DEFAULTS, 'VN')).toBe(false)
        expect(
            isApkDownloadOffered(
                normalizeWebConfig({ download: { apk: { is_active: true, white_list: ['VN'] } } }),
                'VN',
            ),
        ).toBe(false)
    })
})
