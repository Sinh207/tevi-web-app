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
     * Channels whose sensitive content the viewer has agreed to see — a JSON map of
     * `accountId -> slug[]`, so one account's choice is not another's.
     *
     * Declared here rather than built at the call site: legacy composes its key by concatenation
     * (`${currentUser?.id}_nsfw_confirmed_list`), which means it is not in any registry, cannot be
     * migrated, and produces a literal `undefined_…` key for an anonymous visitor.
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
