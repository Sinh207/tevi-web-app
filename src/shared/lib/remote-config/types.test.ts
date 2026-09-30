import { describe, expect, it } from 'vitest'
import {
    normalizeEventConfig,
    normalizeThirdPartyConfig,
    normalizeWebConfig,
    STORE_URLS,
    WEB_CONFIG_DEFAULTS,
} from './types'

/**
 * What these tests are actually protecting.
 *
 * The payloads here are single JSON text fields in the Firebase console, shared with the iOS and
 * Android apps and edited by hand. So the failure to design against is not a wrong type — it is
 * a **plausible** wrong type: a fee saved as `"1"`, a flag saved as `"false"`, a country typed
 * lower-case, a parent object present with its child missing. Each of those has a legacy bug
 * behind it, and each one below names it.
 */

describe('normalizeWebConfig', () => {
    it('returns a complete config for an empty payload', () => {
        const config = normalizeWebConfig({})
        // The fields legacy re-invents a fallback for at each of its call sites.
        expect(config.directMessage.limitCharacters).toBe(1000)
        expect(config.post.createPost.characterLimit).toBe(500)
        expect(config.event.charge.fee).toBe(1)
        expect(config.event.charge.timeUntilNextFee).toBe(5)
        expect(config.event.charge.followers).toBe(10_000)
        expect(config.event.charge.viewer.fee).toBe(1)
        expect(config.event.charge.viewer.timeUntilNextFee).toBe(5)
        // The two legacy forgets entirely, rendering `undefined` into an href.
        expect(config.download.ios.link).toBe(STORE_URLS.ios)
        expect(config.download.android.link).toBe(STORE_URLS.android)
    })

    it('is defaulted identically whether the payload is absent, null or the wrong type', () => {
        for (const input of [undefined, null, 'not json', 42, []]) {
            expect(normalizeWebConfig(input)).toEqual(WEB_CONFIG_DEFAULTS)
        }
    })

    /**
     * The crash legacy is one console entry away from. `remoteConfig?.download?.apk.is_active`
     * guards `download` and then reads `.is_active` off `apk` unguarded — a `download` object
     * with no `apk` key is a TypeError, not a fallback. Same shape at
     * `post?.create_post?.charge.is_active` and `.quote.is_active`.
     */
    it('fills in a child whose parent is present but incomplete', () => {
        const config = normalizeWebConfig({ download: { ios: { link: 'https://x.test' } } })
        expect(config.download.ios.link).toBe('https://x.test')
        expect(config.download.apk).toEqual({ link: '', isActive: false, whiteList: [] })
        expect(config.download.android.link).toBe(STORE_URLS.android)
    })

    it('accepts numbers as strings', () => {
        const config = normalizeWebConfig({
            event: { charge: { fee: '2.5', time_until_next_fee: ' 10 ' } },
            post: { create_post: { character_limit: '1000' } },
        })
        expect(config.event.charge.fee).toBe(2.5)
        expect(config.event.charge.timeUntilNextFee).toBe(10)
        expect(config.post.createPost.characterLimit).toBe(1000)
    })

    it('falls back for a number that is not one', () => {
        const config = normalizeWebConfig({
            direct_message: { limit_characters: 'lots' },
            event: { charge: { fee: '', followers: null } },
        })
        expect(config.directMessage.limitCharacters).toBe(1000)
        expect(config.event.charge.fee).toBe(1)
        expect(config.event.charge.followers).toBe(10_000)
    })

    /**
     * The whole reason flags are strict. `'false'`, `{}` and `[]` are all truthy, and legacy's
     * `x || false` would switch the feature **on** for every one of them.
     */
    it('only treats a real true (or 1) as a switched-on flag', () => {
        expect(
            normalizeWebConfig({ report: { post: { is_active: true } } }).report.post.isActive,
        ).toBe(true)
        expect(
            normalizeWebConfig({ report: { post: { is_active: 1 } } }).report.post.isActive,
        ).toBe(true)
        for (const value of ['false', 'true', {}, [], 'yes', 0, null]) {
            expect(
                normalizeWebConfig({ report: { post: { is_active: value } } }).report.post.isActive,
            ).toBe(false)
        }
    })

    /**
     * `followerMin` is `Infinity`, not `0`. The gate is `follower_count > followerMin`, so a `0`
     * default would start charging every creator with one follower the moment the console entry
     * went missing.
     */
    it('defaults the post charge threshold so that nobody is charged', () => {
        const { charge } = WEB_CONFIG_DEFAULTS.post.createPost
        expect(charge.isActive).toBe(false)
        expect(charge.followerMin).toBe(Number.POSITIVE_INFINITY)
        expect(1_000_000 > charge.followerMin).toBe(false)
    })

    /** `resolutionMax: null` is "no cap", which is what legacy's `undefined` means to its validator. */
    it('reports an absent or zero video resolution cap as null', () => {
        expect(WEB_CONFIG_DEFAULTS.post.createPost.video.resolutionMax).toBeNull()
        expect(
            normalizeWebConfig({ post: { create_post: { video: { resolution_max: 0 } } } }).post
                .createPost.video.resolutionMax,
        ).toBeNull()
        expect(
            normalizeWebConfig({ post: { create_post: { video: { resolution_max: 1080 } } } }).post
                .createPost.video.resolutionMax,
        ).toBe(1080)
    })

    it('upper-cases the APK whitelist and drops junk entries', () => {
        const config = normalizeWebConfig({
            download: { apk: { white_list: ['vn', ' ID ', '', 7, null, 'PH'] } },
        })
        expect(config.download.apk.whiteList).toEqual(['VN', 'ID', 'PH'])
    })

    /**
     * `baseUrl`, not `base_url`. The console really is camelCase for this one key, and the mobile
     * apps read the same field — so "fixing" the spelling here silently empties it.
     */
    it('reads the OneLink bases from the camelCase key the console uses', () => {
        const config = normalizeWebConfig({
            onelink: { baseUrl: { ios: 'https://a.test', android: 'https://b.test' } },
        })
        expect(config.onelink.baseUrl.ios).toBe('https://a.test')
        expect(config.onelink.baseUrl.android).toBe('https://b.test')
    })

    /** `x || true` in legacy, so a console `false` is ignored. Here it wins. */
    it('lets an explicit false switch a RUM tracking option off', () => {
        expect(WEB_CONFIG_DEFAULTS.dataDog.default.rumOptions.trackLongTasks).toBe(true)
        const config = normalizeWebConfig({
            data_dog: { default: { rum_options: { track_long_tasks: false } } },
        })
        expect(config.dataDog.default.rumOptions.trackLongTasks).toBe(false)
        expect(config.dataDog.default.rumOptions.trackResources).toBe(true)
    })
})

describe('normalizeThirdPartyConfig', () => {
    it('keeps id-keyed maps verbatim and upper-cases country keys', () => {
        const config = normalizeThirdPartyConfig({
            data_dog: {
                whitelist: {
                    users: { 'AbC-123': { features: { rum_enabled: true } } },
                    devices: { dEv_9: { features: { traces_enabled: true } } },
                },
                countries: { vn: { features: { rum_enabled: true } } },
            },
        })
        expect(Object.keys(config.dataDog.whitelist.users)).toEqual(['AbC-123'])
        expect(Object.keys(config.dataDog.whitelist.devices)).toEqual(['dEv_9'])
        expect(Object.keys(config.dataDog.countries)).toEqual(['VN'])
    })

    /**
     * `null` when the console has no paid-user rule, so `resolveDatadogDecision` can tell "no
     * rule" from "a rule that samples nothing" — see `selectors.test.ts`.
     */
    it('reports an absent paid-user rule as null', () => {
        expect(normalizeThirdPartyConfig({}).dataDog.paidUsers).toBeNull()
        expect(
            normalizeThirdPartyConfig({
                data_dog: { paid_users: { features: { rum_enabled: true } } },
            }).dataDog.paidUsers?.features.rumEnabled,
        ).toBe(true)
    })

    it('drops a map entry that is not an object', () => {
        const config = normalizeThirdPartyConfig({
            data_dog: {
                whitelist: { users: { a: 'nope', b: { features: { rum_enabled: true } } } },
            },
        })
        expect(Object.keys(config.dataDog.whitelist.users)).toEqual(['b'])
    })
})

describe('normalizeEventConfig', () => {
    it('reports an absent default rule as null rather than a disabled one', () => {
        expect(normalizeEventConfig({}).chargeStarInLive.viewer.defaultCountry).toBeNull()
    })

    /**
     * Absent means "no visibility restriction"; `[]` means "none pass". The live gate branches on
     * exactly that, so collapsing them would switch the fee off for everybody the first time
     * somebody saved an empty array.
     */
    it('keeps an absent visibility list distinct from an empty one', () => {
        const absent = normalizeEventConfig({
            charge_star_in_live: { viewer: { default_country: { enable: true } } },
        })
        expect(absent.chargeStarInLive.viewer.defaultCountry?.enableWithEventVisibility).toBeNull()

        const empty = normalizeEventConfig({
            charge_star_in_live: {
                viewer: { default_country: { enable: true, enable_with_event_visibility: [] } },
            },
        })
        expect(empty.chargeStarInLive.viewer.defaultCountry?.enableWithEventVisibility).toEqual([])
    })

    it('parses a country rule with string numbers', () => {
        const config = normalizeEventConfig({
            charge_star_in_live: {
                viewer: {
                    specific_country: {
                        vn: {
                            enable: true,
                            fee: '3',
                            charge_duration: '15',
                            enable_with_live_type: ['free', 'paid'],
                        },
                    },
                },
            },
        })
        expect(config.chargeStarInLive.viewer.specificCountry.VN).toEqual({
            enable: true,
            enableWithEventVisibility: null,
            enableWithLiveType: ['free', 'paid'],
            fee: 3,
            chargeDuration: 15,
        })
    })
})
