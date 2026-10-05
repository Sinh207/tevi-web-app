import { z } from 'zod'

/**
 * The wire shapes of the three Firebase Remote Config parameters this app reads, and the
 * parsing that turns them into something a screen can use without a fallback at every call.
 *
 * ## What remote config is here, and what it is not
 *
 * It is **platform** configuration: prices, limits, store links, kill switches. The same values
 * for everybody, edited in the Firebase console by the team rather than deployed. It is *not*
 * per-account entitlement — that is `features/permission`, a different service answering a
 * different question, and `api/permission-api.ts` says why the two must not be mixed.
 *
 * Each parameter is a **single console text field holding JSON**. So the contract is not a
 * schema anybody validates: it is whatever somebody typed, and the mobile apps read the same
 * fields. Two consequences shape this file:
 *
 * 1. **Every value must have a fallback in code, and the fallback is the interesting decision.**
 *    A parse failure, an offline load, a Firebase outage, a stray comma in the console — all
 *    land in the same place, and the app has to keep working. So each field below carries its
 *    fallback inline with the reason for it, and `normalizeWebConfig({})` returns a complete,
 *    usable config. Consumers never see `null` and never write `?? 500`.
 *
 * 2. **The fallback direction differs by what the value is.** A **flag** fails *closed* — an
 *    unreadable kill switch must not re-enable something the team switched off, the same
 *    reasoning `features/permission` gives for its grants. A **limit** or a **price** fails to
 *    the number legacy hard-codes at its call sites, because "no character limit" and "free"
 *    are worse answers than a slightly stale one. A **link** fails to the real store URL,
 *    which does not change.
 *
 * ## Why legacy needs none of this, and pays for it
 *
 * Legacy hands the parsed JSON straight to components, so all fifteen call sites re-invent
 * their own fallback and disagree: `remoteConfig?.event?.charge?.fee || 1` in one file,
 * `parseFloat(config?.fee || 1)` in another. Two of them (`useQrDownload`, `shareQr`) forget
 * one entirely and render an `undefined` href. And several mix a guarded parent with an
 * unguarded child — `remoteConfig?.download?.apk.is_active`,
 * `remoteConfig?.post?.create_post?.charge.is_active` — which is a **TypeError** the moment
 * the console holds a `download` object without an `apk` key. The optional chain stops at the
 * `?.`; the `.` after it does not.
 *
 * ## The coercions
 *
 * Numbers arrive as strings often enough to be the norm (`fee: "1"`), so every number accepts
 * both — same reasoning as `features/balance/api/types.ts`. Flags accept only a real `true`
 * (or a `1` from a `TINYINT`), because `"false"` is truthy and a truthy string must never
 * switch a feature on.
 */

/* ============================== coercion helpers ============================== */

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * A nested config object, with **every** field of `schema` filled in.
 *
 * The whole point: a missing, `null`, string or array value where an object was expected
 * yields `schema.parse({})` — the fully-defaulted object — instead of an error or an
 * `undefined` that the consumer then has to guard. Which is what makes the mixed-optional-chain
 * crash described above structurally impossible here: there is no such thing as a present
 * parent with an absent child.
 *
 * The guard is inside the transform rather than a `.catch()` on the outside, because a throw
 * from within a `transform` is not what `.catch()` covers.
 */
const nested = <T extends z.ZodType>(schema: T) =>
    z
        .unknown()
        .optional()
        .transform(value => schema.parse(isRecord(value) ? value : {}) as z.output<T>)

/**
 * A kill switch. `true` and `1` mean yes; **everything else means no**, including the string
 * `'false'`, `{}` and `[]`, all of which are truthy in JS.
 *
 * Fails closed by construction, so it takes no fallback argument — see the note above on why
 * that direction is right for a flag. `flagOn` is the one exception, and it says why.
 *
 * ## Do not delete the `.catch()` on this or on any other leaf below
 *
 * It looks like dead code: `z.unknown()` accepts anything, and the transform cannot throw, so
 * there is apparently nothing to catch. It is what handles a **missing key**. A bare
 * `z.unknown()` field is *non-optional* in zod 4 — `z.looseObject({ a: z.unknown().transform(f) })
 * .parse({})` throws `expected nonoptional` — and the `.catch()` is what turns that into the
 * fallback. Remove it and every absent field becomes a thrown error instead of its default,
 * which is the whole contract of this file. (`nested()` above uses `.optional()` for the same
 * job, because it needs the transform to still run.)
 */
const flag = z
    .unknown()
    .transform(value => value === true || value === 1)
    .catch(false)

/**
 * A flag that is **on** unless the console explicitly turns it off.
 *
 * Only for values where "unset" genuinely means "the normal behaviour" rather than "off" — the
 * Datadog RUM tracking options, which legacy writes as `x || true` and therefore can never
 * switch off at all: `false || true` is `true`. This is that intent, spelled so that an
 * explicit `false` actually wins.
 */
const flagOn = z
    .unknown()
    .transform(value => value !== false && value !== 0)
    .catch(true)

/** A number, from a number or a numeric string, falling back to `fallback` when unreadable. */
const num = (fallback: number) =>
    z
        .unknown()
        .transform(value => {
            if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
            if (typeof value === 'string') {
                const parsed = Number(value.trim())
                return value.trim() !== '' && Number.isFinite(parsed) ? parsed : fallback
            }
            return fallback
        })
        .catch(fallback)

/**
 * A number that is **`null` when the console has not configured it**, rather than falling back.
 *
 * For values where no honest default exists, because every number is a claim: a *price*. `0` would
 * read as "free" and any invented figure would be a lie, so the only correct answer to "what does
 * this cost" when nobody has said is *we do not know* — and `null` is the only value a screen
 * cannot accidentally render as a price.
 *
 * This is the same choice made for `resolution_max` (0 means no cap) and `default_country` (absent
 * means no rule): where the difference between "unset" and a legitimate value is load-bearing, the
 * type carries it. Reach for `num()` instead wherever a sane default exists — a limit, a duration,
 * a follower threshold.
 */
const nullableNum = z
    .unknown()
    .transform(value => {
        if (typeof value === 'number') return Number.isFinite(value) ? value : null
        if (typeof value === 'string') {
            const parsed = Number(value.trim())
            return value.trim() !== '' && Number.isFinite(parsed) ? parsed : null
        }
        return null
    })
    .catch(null)

/** A trimmed non-empty string, or `fallback`. */
const text = (fallback: string) =>
    z
        .unknown()
        .transform(value => {
            if (typeof value !== 'string') return fallback
            const trimmed = value.trim()
            return trimmed === '' ? fallback : trimmed
        })
        .catch(fallback)

/** A list of trimmed non-empty strings; `[]` when absent or unreadable. */
const textList = z
    .unknown()
    .transform(value =>
        Array.isArray(value)
            ? value
                  .filter((item): item is string => typeof item === 'string')
                  .map(item => item.trim())
                  .filter(item => item !== '')
            : [],
    )
    .catch([])

/**
 * A list of strings that keeps the difference between **absent** and **empty**.
 *
 * `null` means "no restriction", `[]` means "nothing passes". Legacy's sustained-fee gate
 * depends on exactly that distinction — `if (list && !list.includes(v)) return false` skips
 * the check when the key is missing — so collapsing the two would silently switch the feature
 * off for everybody the first time somebody saved an empty array.
 */
const optionalTextList = z
    .unknown()
    .transform(value => (Array.isArray(value) ? textList.parse(value) : null))
    .catch(null)

/**
 * A map of `key -> T`, with the keys upper-cased.
 *
 * Upper-cased because every one of these maps is keyed by **country code**, and legacy looks
 * them up with `countryCode?.toUpperCase()` at one call site and `toLocaleUpperCase()` at
 * another — so a console entry typed as `vn` is found by one of them and missed by the other.
 * Normalising the *keys* once means the lookup cannot be the thing that is wrong.
 *
 * `mapOf` (below) is the same for maps whose keys are ids and must be preserved verbatim.
 */
const upperKeyedMap = <T extends z.ZodType>(schema: T) =>
    z
        .unknown()
        .transform(value => {
            if (!isRecord(value)) return {} as Record<string, z.output<T>>
            const out: Record<string, z.output<T>> = {}
            for (const [key, item] of Object.entries(value)) {
                if (!isRecord(item)) continue
                out[key.toUpperCase()] = schema.parse(item) as z.output<T>
            }
            return out
        })
        .catch({} as Record<string, z.output<T>>)

/** A map of `key -> T` with keys left exactly as the console typed them (user / device ids). */
const mapOf = <T extends z.ZodType>(schema: T) =>
    z
        .unknown()
        .transform(value => {
            if (!isRecord(value)) return {} as Record<string, z.output<T>>
            const out: Record<string, z.output<T>> = {}
            for (const [key, item] of Object.entries(value)) {
                if (!isRecord(item)) continue
                out[key] = schema.parse(item) as z.output<T>
            }
            return out
        })
        .catch({} as Record<string, z.output<T>>)

/* ============================== datadog ============================== */

/**
 * One Datadog rule — the sampling to apply to whoever it matches.
 *
 * The same shape appears five times across two parameters: as `WEB_CONFIG.data_dog.default`
 * (everybody) and as `THIRD_PARTY_CONFIG.data_dog.{whitelist.users[id], whitelist.devices[id],
 * paid_users, countries[CC]}` (four progressively narrower audiences). `selectors.ts` picks
 * between them.
 */
const datadogRuleSchema = z.looseObject({
    features: nested(
        z.looseObject({
            rum_enabled: flag,
            traces_enabled: flag,
        }),
    ),
    sampling_rates: nested(
        z.looseObject({
            rum: num(0),
            trace: num(0),
        }),
    ),
    /** Only ever set on the `default` rule in practice; read from whichever rule wins. */
    rum_options: nested(
        z.looseObject({
            track_resources: flagOn,
            track_long_tasks: flagOn,
            track_user_interactions: flagOn,
        }),
    ),
})

export interface DatadogRule {
    features: { rumEnabled: boolean; tracesEnabled: boolean }
    /**
     * Fractions or percentages exactly as the console holds them — this layer does not
     * interpret them, it hands them to `datadogRum.init` the way legacy does.
     *
     * `0` when unset, which is Datadog's "sample nothing". Fail-closed for the same reason a
     * flag is: RUM is billed per session.
     */
    samplingRates: { rum: number; trace: number }
    rumOptions: {
        trackResources: boolean
        trackLongTasks: boolean
        trackUserInteractions: boolean
    }
}

function toDatadogRule(raw: z.output<typeof datadogRuleSchema>): DatadogRule {
    return {
        features: {
            rumEnabled: raw.features.rum_enabled,
            tracesEnabled: raw.features.traces_enabled,
        },
        samplingRates: { rum: raw.sampling_rates.rum, trace: raw.sampling_rates.trace },
        rumOptions: {
            trackResources: raw.rum_options.track_resources,
            trackLongTasks: raw.rum_options.track_long_tasks,
            trackUserInteractions: raw.rum_options.track_user_interactions,
        },
    }
}

/* ============================== WEB_CONFIG ============================== */

/**
 * The two store URLs, as fallbacks.
 *
 * They are also written down in `shared/components/get-app-dialog.tsx`'s history and in
 * legacy's `useAppsFlyer` config. Here because this is now the one place that answers "where
 * does the app come from": remote config first, these if it is unreachable. They are the
 * public listings and have not moved since launch, which is what makes them safe as a
 * hard-coded floor.
 */
export const STORE_URLS = {
    ios: 'https://apps.apple.com/us/app/tevi/id6444492809',
    android: 'https://play.google.com/store/apps/details?id=com.tevi.android',
} as const

const webConfigSchema = z.looseObject({
    data_dog: nested(
        z.looseObject({
            /** The master switch. Off unless the console says otherwise — RUM costs money. */
            enabled: flag,
            default: nested(datadogRuleSchema),
        }),
    ),
    direct_message: nested(
        z.looseObject({
            /**
             * **1000**, the mobile apps' number — both hard-code it (Android's `maxLength` on the
             * field, iOS's `maxTextViewCount`), so it is what a message can actually be. Legacy web
             * fell back to 500; the console key is what changes it, not this default.
             */
            limit_characters: num(1000),
        }),
    ),
    download: nested(
        z.looseObject({
            ios: nested(z.looseObject({ link: text(STORE_URLS.ios) })),
            android: nested(z.looseObject({ link: text(STORE_URLS.android) })),
            apk: nested(
                z.looseObject({
                    /**
                     * A direct APK download, offered outside the Play Store. `''` rather than a
                     * guessed URL: there is no stable one, and an APK link that 404s is worse
                     * than no button. `isActive` is what a consumer checks anyway.
                     */
                    link: text(''),
                    is_active: flag,
                    /** Country codes the APK button is offered in. Upper-cased on the way in. */
                    white_list: textList,
                }),
            ),
        }),
    ),
    event: nested(
        z.looseObject({
            charge: nested(
                z.looseObject({
                    /** Star per interval, charged to the **streamer**. Legacy's fallback: 1. */
                    fee: num(1),
                    /** Minutes between charges. Legacy's fallback: 5. */
                    time_until_next_fee: num(5),
                    /** Follower count above which the fee applies. Legacy's fallback: 10000. */
                    followers: num(10_000),
                    /** The same two figures for the **viewer** side (the sustained fee). */
                    viewer: nested(
                        z.looseObject({
                            fee: num(1),
                            time_until_next_fee: num(5),
                        }),
                    ),
                }),
            ),
        }),
    ),
    interaction: nested(
        z.looseObject({
            billing: nested(
                z.looseObject({
                    /**
                     * Paid 1:1 interaction pricing — **`null` when unconfigured**, not `0`.
                     *
                     * These are the only two fields here with no defensible default. Legacy
                     * renders them raw and shows a blank when they are missing, so there is no
                     * established fallback to inherit, and `0` would tell a viewer the call is
                     * free. An earlier version of this file defaulted them to `0` and told
                     * consumers to gate on `isKnown` instead — which does not work, and is worth
                     * recording so it is not reintroduced: `isKnown` means *Firebase answered*,
                     * which is true whenever any parameter is defined. It cannot distinguish a
                     * console with no `interaction` key from one that priced the feature at zero.
                     * The nullable type can, at every call site, with no flag to remember.
                     */
                    price_per_minute: nullableNum,
                    duration_minutes: nullableNum,
                }),
            ),
        }),
    ),
    lucky_wheel: nested(z.looseObject({ is_active: flag })),
    onelink: nested(
        z.looseObject({
            /**
             * AppsFlyer OneLink bases, per platform. `camelCase` on the wire — the console has
             * it as `baseUrl`, not `base_url`, and that is the contract the mobile apps read.
             *
             * `''` rather than legacy's environment-dependent defaults: those live with whoever
             * builds the deep link, because the right default depends on the build (staging vs
             * production) and on the platform, and this layer knows neither. Nothing in this
             * app reads these yet — `features/navigation`'s Get App button dropped AppsFlyer
             * entirely, and that file says why.
             */
            baseUrl: nested(
                z.looseObject({
                    ios: text(''),
                    android: text(''),
                }),
            ),
        }),
    ),
    post: nested(
        z.looseObject({
            create_post: nested(
                z.looseObject({
                    /** Legacy's `POST_TEXT_MAX_LENGTH`, its own fallback at the call site. */
                    character_limit: num(500),
                    charge: nested(
                        z.looseObject({
                            is_active: flag,
                            /**
                             * Followers above which posting costs Star. **`Infinity`**, not `0`:
                             * the check is `follower_count > follower_min`, so `0` would charge
                             * every creator with a single follower the moment the console entry
                             * went missing. `Infinity` charges nobody, which is the same
                             * outcome legacy stumbles into — `count > undefined` is `false` —
                             * but on purpose and without depending on a JS comparison quirk.
                             */
                            follower_min: num(Number.POSITIVE_INFINITY),
                            price: num(0),
                        }),
                    ),
                    quote: nested(z.looseObject({ is_active: flag })),
                    video: nested(
                        z.looseObject({
                            /**
                             * Max upload resolution, e.g. 1080. `0` means **no cap** — legacy
                             * passes `undefined` here and its validator treats that as
                             * unlimited, so failing to a real number would start rejecting
                             * uploads that used to pass. `resolutionMax` below is typed
                             * `number | null` to say this out loud.
                             */
                            resolution_max: num(0),
                        }),
                    ),
                }),
            ),
        }),
    ),
    report: nested(
        z.looseObject({
            post: nested(z.looseObject({ is_active: flag })),
            comment: nested(z.looseObject({ is_active: flag })),
        }),
    ),
})

/**
 * `WEB_CONFIG` — the parameter almost every consumer wants. Always fully populated.
 */
export interface WebConfig {
    dataDog: { enabled: boolean; default: DatadogRule }
    directMessage: { limitCharacters: number }
    download: {
        ios: { link: string }
        android: { link: string }
        apk: {
            /** `''` when the console has none — check `isActive`, not this. */
            link: string
            isActive: boolean
            /** Upper-cased country codes. Empty means "nowhere". */
            whiteList: string[]
        }
    }
    event: {
        charge: {
            fee: number
            timeUntilNextFee: number
            followers: number
            viewer: { fee: number; timeUntilNextFee: number }
        }
    }
    /**
     * Paid-interaction pricing. **`null` means the console has not configured it** — show nothing
     * rather than a figure. See the schema note; this is deliberately not defaulted.
     */
    interaction: { billing: { pricePerMinute: number | null; durationMinutes: number | null } }
    luckyWheel: { isActive: boolean }
    onelink: { baseUrl: { ios: string; android: string } }
    post: {
        createPost: {
            characterLimit: number
            charge: {
                isActive: boolean
                /** `Infinity` when unset — see the schema note. */
                followerMin: number
                price: number
            }
            quote: { isActive: boolean }
            /** `resolutionMax: null` means no cap. */
            video: { resolutionMax: number | null }
        }
    }
    report: { post: { isActive: boolean }; comment: { isActive: boolean } }
}

export function normalizeWebConfig(input: unknown): WebConfig {
    const raw = webConfigSchema.parse(isRecord(input) ? input : {})
    const createPost = raw.post.create_post
    return {
        dataDog: {
            enabled: raw.data_dog.enabled,
            default: toDatadogRule(raw.data_dog.default),
        },
        directMessage: { limitCharacters: raw.direct_message.limit_characters },
        download: {
            ios: { link: raw.download.ios.link },
            android: { link: raw.download.android.link },
            apk: {
                link: raw.download.apk.link,
                isActive: raw.download.apk.is_active,
                whiteList: raw.download.apk.white_list.map(code => code.toUpperCase()),
            },
        },
        event: {
            charge: {
                fee: raw.event.charge.fee,
                timeUntilNextFee: raw.event.charge.time_until_next_fee,
                followers: raw.event.charge.followers,
                viewer: {
                    fee: raw.event.charge.viewer.fee,
                    timeUntilNextFee: raw.event.charge.viewer.time_until_next_fee,
                },
            },
        },
        interaction: {
            billing: {
                pricePerMinute: raw.interaction.billing.price_per_minute,
                durationMinutes: raw.interaction.billing.duration_minutes,
            },
        },
        luckyWheel: { isActive: raw.lucky_wheel.is_active },
        onelink: {
            baseUrl: { ios: raw.onelink.baseUrl.ios, android: raw.onelink.baseUrl.android },
        },
        post: {
            createPost: {
                characterLimit: createPost.character_limit,
                charge: {
                    isActive: createPost.charge.is_active,
                    followerMin: createPost.charge.follower_min,
                    price: createPost.charge.price,
                },
                quote: { isActive: createPost.quote.is_active },
                video: {
                    resolutionMax:
                        createPost.video.resolution_max > 0
                            ? createPost.video.resolution_max
                            : null,
                },
            },
        },
        report: {
            post: { isActive: raw.report.post.is_active },
            comment: { isActive: raw.report.comment.is_active },
        },
    }
}

/* ============================== THIRD_PARTY_CONFIG ============================== */

const thirdPartyConfigSchema = z.looseObject({
    data_dog: nested(
        z.looseObject({
            whitelist: nested(
                z.looseObject({
                    /** Keyed by account id, verbatim. */
                    users: mapOf(datadogRuleSchema),
                    /** Keyed by device fingerprint, verbatim. */
                    devices: mapOf(datadogRuleSchema),
                }),
            ),
            /**
             * The rule for accounts that have paid — Premium, or any purchase. Kept as
             * `undefined` when absent (see `paidUsers` below) rather than defaulted, because
             * "there is no paid-user rule" and "there is one that samples nothing" have to stay
             * distinguishable for the precedence chain in `selectors.ts` to be readable.
             */
            paid_users: z.unknown().optional(),
            /** Keyed by country code, upper-cased. */
            countries: upperKeyedMap(datadogRuleSchema),
        }),
    ),
})

/**
 * `THIRD_PARTY_CONFIG` — audience-scoped overrides for third-party SDKs. Datadog only, today.
 *
 * Split from `WEB_CONFIG` because of who edits it and how often: this one holds individual
 * account ids and device fingerprints, added by an engineer chasing one reader's bug and
 * removed afterwards.
 */
export interface ThirdPartyConfig {
    dataDog: {
        whitelist: {
            /** `accountId -> rule`. */
            users: Record<string, DatadogRule>
            /** `deviceId -> rule`. */
            devices: Record<string, DatadogRule>
        }
        /** `null` when the console has no paid-user rule at all. */
        paidUsers: DatadogRule | null
        /** `COUNTRYCODE -> rule`, keys upper-cased. */
        countries: Record<string, DatadogRule>
    }
}

export function normalizeThirdPartyConfig(input: unknown): ThirdPartyConfig {
    const raw = thirdPartyConfigSchema.parse(isRecord(input) ? input : {})
    const mapRules = (rules: Record<string, z.output<typeof datadogRuleSchema>>) =>
        Object.fromEntries(Object.entries(rules).map(([key, rule]) => [key, toDatadogRule(rule)]))
    return {
        dataDog: {
            whitelist: {
                users: mapRules(raw.data_dog.whitelist.users),
                devices: mapRules(raw.data_dog.whitelist.devices),
            },
            paidUsers: isRecord(raw.data_dog.paid_users)
                ? toDatadogRule(datadogRuleSchema.parse(raw.data_dog.paid_users))
                : null,
            countries: mapRules(raw.data_dog.countries),
        },
    }
}

/* ============================== DEFAULT_EVENT_CONFIG ============================== */

const sustainedFeeRuleSchema = z.looseObject({
    enable: flag,
    /**
     * Which event visibilities the fee applies to. `null` (absent) means **all of them** — the
     * gate skips the check — while `[]` means none. `optionalTextList` keeps them apart.
     */
    enable_with_event_visibility: optionalTextList,
    /** Which live types: `'free'`, `'paid'`, `'member'`. Absent means none. */
    enable_with_live_type: textList,
    /** Star charged per interval. Legacy's fallback: 1, via `parseFloat(config?.fee || 1)`. */
    fee: num(1),
    /** Minutes between charges. Legacy's fallback: 5. */
    charge_duration: num(5),
})

/**
 * One sustained-fee rule: what a viewer is charged to keep watching, and when it applies.
 *
 * ## A note for whoever builds the live screen
 *
 * Resolving *which* rule applies is this feature's job (`resolveSustainedFeeRule`). Deciding
 * whether to charge is not — that needs the event (`paid_interactions`, `visibility`, whether
 * it is exclusive), which belongs to the live feature.
 *
 * When you write that gate, legacy's version is
 * `containers/event/.../hook/useChargeStar.js` and it has a bug worth not copying: after
 * checking that an exclusive live's type is in `enable_with_live_type`, it still ends with
 * `return enableWithLiveType.includes('free')`. So a rule listing `['paid', 'member']` — an
 * exclusive-only sustained fee, which is the case that check exists for — resolves to `false`
 * anyway.
 */
export interface SustainedFeeRule {
    enable: boolean
    /** `null` means no visibility restriction. `[]` means no visibility passes. */
    enableWithEventVisibility: string[] | null
    enableWithLiveType: string[]
    fee: number
    chargeDuration: number
}

const eventConfigSchema = z.looseObject({
    charge_star_in_live: nested(
        z.looseObject({
            viewer: nested(
                z.looseObject({
                    /**
                     * Per-country overrides, checked first. Kept as `unknown` at this level so
                     * `default_country`'s absence stays visible — `nested()` would manufacture a
                     * disabled rule and the selector could not tell "no rule" from "a rule that
                     * is off". The distinction is what lets a live screen stay silent rather
                     * than render a fee of 1 Star that nobody is charged.
                     */
                    specific_country: upperKeyedMap(sustainedFeeRuleSchema),
                    default_country: z.unknown().optional(),
                }),
            ),
        }),
    ),
})

/**
 * `DEFAULT_EVENT_CONFIG` — live-event configuration. Only the sustained (viewer) fee today.
 *
 * A parameter of its own in the console, and legacy fetches it **lazily**, only once a viewer
 * joins a live. That laziness buys nothing here and is dropped: Firebase Remote Config
 * downloads the **whole template** in one request, so this parameter is already in memory the
 * moment any other one is. `client.ts` has the full reasoning.
 */
export interface EventConfig {
    chargeStarInLive: {
        viewer: {
            /** `null` when the console has no default rule. */
            defaultCountry: SustainedFeeRule | null
            /** `COUNTRYCODE -> rule`, keys upper-cased. */
            specificCountry: Record<string, SustainedFeeRule>
        }
    }
}

function toSustainedFeeRule(raw: z.output<typeof sustainedFeeRuleSchema>): SustainedFeeRule {
    return {
        enable: raw.enable,
        enableWithEventVisibility: raw.enable_with_event_visibility,
        enableWithLiveType: raw.enable_with_live_type,
        fee: raw.fee,
        chargeDuration: raw.charge_duration,
    }
}

export function normalizeEventConfig(input: unknown): EventConfig {
    const raw = eventConfigSchema.parse(isRecord(input) ? input : {})
    const viewer = raw.charge_star_in_live.viewer
    return {
        chargeStarInLive: {
            viewer: {
                defaultCountry: isRecord(viewer.default_country)
                    ? toSustainedFeeRule(sustainedFeeRuleSchema.parse(viewer.default_country))
                    : null,
                specificCountry: Object.fromEntries(
                    Object.entries(viewer.specific_country).map(([code, rule]) => [
                        code,
                        toSustainedFeeRule(rule),
                    ]),
                ),
            },
        },
    }
}

/* ============================== the defaults, derived ============================== */

/**
 * What the app runs on when Firebase is unreachable, blocked, or holding unparseable JSON.
 *
 * **Derived, never written out.** `normalizeWebConfig({})` walks the same schema every real
 * payload walks, so a field can only have one fallback and the tests below check the two
 * together. Writing a second literal here is how the two drift.
 *
 * Named `<PARAMETER>_DEFAULTS` and not `DEFAULT_<PARAMETER>` for one specific reason:
 * **`DEFAULT_EVENT_CONFIG` is the real name of a Firebase parameter** (`PARAMETERS.event` in
 * `client.ts`), where "default" describes the *events* rather than the config. A constant by that
 * name sitting next to it would read as the parameter itself, and the two mean opposite things —
 * one is the console's live value, the other is what to use when the console cannot be reached.
 */
export const WEB_CONFIG_DEFAULTS: WebConfig = normalizeWebConfig({})
export const THIRD_PARTY_CONFIG_DEFAULTS: ThirdPartyConfig = normalizeThirdPartyConfig({})
export const EVENT_CONFIG_DEFAULTS: EventConfig = normalizeEventConfig({})
