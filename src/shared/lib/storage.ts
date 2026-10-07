/**
 * Centralized, SSR-safe localStorage access.
 *
 * All persisted keys are declared here with the convention `tevi.<domain>.<name>`
 * so there is one source of truth and no stray string literals. A one-time
 * migration upgrades keys written by the legacy app (and earlier builds of this
 * app) to the new namespaced keys — call sites read the new keys only.
 */

/**
 * The prefix every key this app writes carries. Exported because one other place
 * needs it as a *filter* rather than to build a key: `storage-usage.ts` walks
 * localStorage to report how much of it is ours, and it can only tell ours apart
 * from whatever else shares the origin by this prefix.
 */
export const STORAGE_NAMESPACE = 'tevi'

const NS = STORAGE_NAMESPACE
const isBrowser = () => typeof window !== 'undefined'

export const STORAGE_KEYS = {
    /** auth token store — map of accounts { [id]: Account } */
    accounts: `${NS}.auth.accounts`,
    /** auth — active account id */
    activeAccount: `${NS}.auth.active`,
    /** device fingerprint id */
    deviceId: `${NS}.device.id`,
    /** i18n — persisted UI locale */
    locale: `${NS}.i18n.locale`,
    /** theme (next-themes storageKey) */
    theme: `${NS}.theme`,
    /**
     * Spaces whose sensitive content a viewer has agreed to see — a JSON map of
     * `accountId -> { slug: confirmedAtMs }`. Written by `shared/lib/nsfw-consent.ts`,
     * which owns the pruning and is what `AuthProvider.forgetAccount` calls to drop an
     * account's answers with the rest of its traces.
     *
     * One registered key for everybody, rather than legacy's one key per account
     * (`${currentUser?.id}_nsfw_confirmed_list`), which is not in any registry, cannot
     * be migrated, and produces a literal `undefined_…` key an anonymous visitor
     * shares with every other guest on the device.
     */
    nsfwConfirmed: `${NS}.channel.nsfw_confirmed`,
    /**
     * The currency the wallet's figures are shown in — a JSON map of
     * `accountId -> currencyCode`, for the reason `nsfwConfirmed` above is one: it is a
     * per-person choice and this app holds up to ten people at once. A creator paid in dong
     * and one paid in dollars can be signed in side by side, and one currency shared between
     * them would relabel the other's money.
     *
     * Legacy persists the whole currency object, per account, in IndexedDB. Only the **code**
     * is stored here: the rest of the record (symbol, decimal digits) comes from the exchange
     * service and would otherwise be a cached copy that goes stale silently — a currency whose
     * `decimal_digits` changed upstream would keep formatting with the old one forever.
     */
    walletCurrency: `${NS}.wallet.currency`,
    /**
     * What each account has searched for — a JSON map of `accountId -> { term, at }[]`, one
     * registered key for everybody, for exactly the reason `nsfwConfirmed` above is one.
     *
     * Legacy writes `` `${currentUser.id}_recent_searches` ``: unregistered, unmigratable, and a
     * silent no-op for anyone without a real account, so an anonymous visitor's recents never
     * save at all. `shared/lib/search-recents.ts` owns the shape, the cap and the de-duplication,
     * and `AuthProvider.forgetAccount` drops an account's history with the rest of its traces —
     * which is the whole reason it is `shared/` and not `features/search`.
     */
    searchRecents: `${NS}.search.recents`,
    /**
     * The spaces each account opened from `/search` — a JSON map of
     * `accountId -> RecentCreator[]`, capped at five. Owned by
     * `shared/lib/search-recent-creators.ts`; dropped by `forgetAccount` beside `searchRecents`.
     */
    searchRecentCreators: `${NS}.search.recentCreators`,
    /**
     * The version each mini app last reported — a JSON map of `appId -> { version, at }`.
     *
     * Not per account, and deliberately: this is the **device's** cache state, the same thing the
     * native hosts keep in UserDefaults / SharedPreferences under `miniapp_{appId}_version`
     * (`docs/MINI_APP.md` §9). Which of the ten signed-in accounts is looking at the app has no
     * bearing on whether the browser is holding a stale copy of its document.
     *
     * `at` is what expires a record: an app nobody has opened in a month should not pin a `v` in
     * its URL forever. `features/mini-app/lib/app-version.ts` owns the shape, the TTL and the cap.
     */
    miniAppVersions: `${NS}.miniapp.versions`,
    /**
     * Which age-restricted live events an account has confirmed it is over 18 for — a JSON map of
     * `accountId -> { eventCode: confirmedAtMs }`. Written by `shared/lib/age-consent.ts`.
     *
     * Per **event**, not per space, and that is the difference from `nsfwConfirmed` above:
     * `age_restriction` is a flag the creator sets on one broadcast, so agreeing to one 18+ stream
     * is not agreeing to the next. One registered key for everybody, for the same three reasons
     * `nsfwConfirmed` gives — legacy writes `` `${currentUser?.id}_age_restricted_confirmed_list` ``,
     * which is unregistered, unmigratable, and literally `undefined_…` for a guest, i.e. a bucket
     * every visitor on the device inherits.
     *
     * `AuthProvider.forgetAccount` drops an account's answers with the rest of its traces, which is
     * the whole reason this lives in `shared/` rather than in `features/event`.
     */
    ageConfirmed: `${NS}.event.age_confirmed`,
    /**
     * How many free Live previews this **device** has spent on each event — a JSON map of
     * `eventCode -> { spent, at }`. Written by `shared/lib/preview-quota.ts`.
     *
     * ⚠ **Not keyed by account, and deliberately absent from `forgetAccount`.** Every other
     * per-person record in this registry is dropped when an account is removed; this one must
     * survive, because the thing it limits is a *device's* access to free content. Scoping it to
     * an account — or clearing it on sign-out — makes the quota a formality: sign out, get three
     * more, repeat. Legacy reaches the same shape from the other direction, keying its counter on
     * `AuthModel.deviceInfo.device_id` rather than on the user.
     *
     * That device-id layer is not reproduced. `localStorage` **is** the device, so the extra key
     * buys nothing and costs a reset vector: a rotated fingerprint would hand the browser a fresh
     * set of previews.
     *
     * The backend counts too, so this is a guard against *spending* previews, not the enforcement
     * — see `liveApi.getPreview`, where a refetch or a strict-mode double-mount each cost one.
     */
    previewQuota: `${NS}.event.preview_quota`,
} as const

export const storage = {
    get(key: string): string | null {
        if (!isBrowser()) return null
        try {
            return window.localStorage.getItem(key)
        } catch {
            return null
        }
    },
    set(key: string, value: string) {
        if (!isBrowser()) return
        try {
            window.localStorage.setItem(key, value)
        } catch {
            // ignore quota / disabled storage
        }
    },
    remove(key: string) {
        if (!isBrowser()) return
        try {
            window.localStorage.removeItem(key)
        } catch {
            // ignore
        }
    },
    getJSON<T>(key: string): T | null {
        const raw = this.get(key)
        if (!raw) return null
        try {
            return JSON.parse(raw) as T
        } catch {
            return null
        }
    },
    setJSON(key: string, value: unknown) {
        this.set(key, JSON.stringify(value))
    },
}

// ── One-time legacy migration ───────────────────────────────────────────────
const MIGRATION_FLAG = `${NS}.storage_version`
const CURRENT_VERSION = '1'

interface LegacyAccountEntry {
    user?: unknown
    access_token?: string
    refresh_token?: string | null
    expires_in?: number | null
}

/** Idempotent. Copies legacy keys → namespaced keys, upgrades the account shape,
 *  then removes the old keys. Safe to call multiple times (guarded by a flag). */
export function migrateLegacyStorage() {
    if (!isBrowser()) return
    try {
        if (window.localStorage.getItem(MIGRATION_FLAG) === CURRENT_VERSION) return

        // Accounts: legacy `user_logged_list` { [userId]: {user, access_token,...} }
        // → `tevi.auth.accounts` { [id]: Account } (adds id + absolute expires_at).
        const rawList = window.localStorage.getItem('user_logged_list')
        if (rawList && !window.localStorage.getItem(STORAGE_KEYS.accounts)) {
            const legacy = JSON.parse(rawList) as Record<string, LegacyAccountEntry>
            const migrated: Record<string, unknown> = {}
            for (const [id, e] of Object.entries(legacy)) {
                if (!e?.access_token) continue
                migrated[id] = {
                    id,
                    access_token: e.access_token,
                    refresh_token: e.refresh_token ?? null,
                    expires_in: e.expires_in ?? null,
                    expires_at: e.expires_in ? Date.now() + Number(e.expires_in) * 1000 : null,
                    user: e.user ?? null,
                }
            }
            window.localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(migrated))
        }

        // Straight renames (only if the new key isn't already set).
        const renames: [string, string][] = [
            ['user_id', STORAGE_KEYS.activeAccount],
            ['device_id', STORAGE_KEYS.deviceId],
            ['lang_code', STORAGE_KEYS.locale],
        ]
        for (const [oldKey, newKey] of renames) {
            const v = window.localStorage.getItem(oldKey)
            if (v != null && window.localStorage.getItem(newKey) == null) {
                window.localStorage.setItem(newKey, v)
            }
        }

        for (const k of ['user_logged_list', 'user_id', 'device_id', 'lang_code']) {
            window.localStorage.removeItem(k)
        }
        window.localStorage.setItem(MIGRATION_FLAG, CURRENT_VERSION)
    } catch {
        // never let migration break boot
    }
}

// Run once at client import — before any store hydrates from the new keys.
migrateLegacyStorage()
