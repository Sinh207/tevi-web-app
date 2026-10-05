import { safeExternalUrl } from '@shared/lib/safe-url'

/**
 * What the player needs to run one mini app, and where it comes from.
 *
 * Four surfaces open a mini app and **not one of them holds this shape**: a space carries
 * `has_mini_app` / `mini_app_url` / `mini_app_id` on its channel DTO, the Mini App Center is a
 * constant, a `executeLink` payload from inside another app carries `app_url` / `app_key` /
 * `app_icon`, and an affiliate program carries `url` / `icon_url`. So the normaliser is the
 * feature's front door: every entry point hands over a loose object and gets back either a
 * config the player can run or `null`.
 *
 * `null` is not an error path to be logged — it is the honest answer for a space whose creator
 * has not set a mini-app URL, which is most of them.
 */
export interface MiniAppConfig {
    /**
     * The app's id in the developer platform — what `getInfo` mints a token for.
     *
     * Nullable, and that is load-bearing rather than defensive: the Mini App Center has no
     * `app_id` (legacy passes `''`), and an app opened by URL from `executeLink` may not carry
     * one either. A token cannot be minted without it, so `getInfo` answers with the account
     * and no `user_app_token` rather than failing the whole call.
     */
    id: string | null
    /** Shown on the tab. Never empty — callers pass a translated fallback. */
    name: string
    /** Vetted `http(s)` absolute URL. The one field that decides whether this exists at all. */
    url: string
    iconUrl: string | null
    /**
     * The Tevi page for the app — a space URL, usually. What the ⋯ menu shares and links to,
     * because the app's own URL is a player surface and not something to send anybody.
     */
    shareableUrl: string | null
}

/** Whatever an entry point happens to have. Every field optional; the URL decides. */
export interface MiniAppConfigInput {
    id?: string | number | null
    name?: string | null
    url?: string | null
    iconUrl?: string | null
    shareableUrl?: string | null
}

/**
 * Vet and normalise, or `null`.
 *
 * The URL goes through `shared/lib/safe-url`, which is the same allow-list every
 * creator-supplied link in the app uses: `http(s)` only. That matters more here than on an
 * `href` — this value becomes an `iframe` `src`, and a `javascript:` src executes **in this
 * document**, with the visitor's session, as soon as the frame mounts. There is no click to
 * intercept.
 *
 * An id of `0` or `''` normalises to `null`: both mean "no app id" on the wire, and a falsy
 * string reaching `getAppToken` is a request for a token for nothing.
 */
export function normalizeMiniAppConfig(
    input: MiniAppConfigInput | null | undefined,
    fallbackName: string,
): MiniAppConfig | null {
    if (!input) return null
    const url = safeExternalUrl(input.url)
    if (!url) return null

    const id = input.id == null || input.id === '' || input.id === 0 ? null : String(input.id)
    const name =
        typeof input.name === 'string' && input.name.trim() !== ''
            ? input.name.trim()
            : fallbackName

    return {
        id,
        name,
        url,
        iconUrl: safeExternalUrl(input.iconUrl),
        shareableUrl: safeExternalUrl(input.shareableUrl),
    }
}

/**
 * The identity a tab is deduplicated on: origin + path + query, and **not** the hash.
 *
 * A fragment is client-side routing inside the app — `#/lobby` and `#/match/12` are the same
 * running app, and opening the second while the first is on screen must switch to that tab
 * rather than boot a second copy of a game. Query *is* included, because that is where the
 * app's own parameters live (`?table=4`), and those do identify different content.
 *
 * The frame URL's own added parameters (`user`, `slug`, `lan`, `v`) are **not** in the key,
 * because this runs on the config's URL before they are added — see `frame-url.ts`. If it ran
 * after, switching locale would fail to dedupe against the tab already open.
 */
export function miniAppDedupKey(url: string | null | undefined): string | null {
    if (!url) return null
    try {
        const parsed = new URL(url)
        return `${parsed.origin}${parsed.pathname}${parsed.search}`
    } catch {
        return null
    }
}

/** The channel fields this feature reads. A structural type, so it needs no import from `features/channel`. */
export interface MiniAppChannelLike {
    has_mini_app?: boolean | null
    mini_app_url?: string | null
    mini_app_id?: string | null
    name?: string | null
    slug?: string | null
    shareable_url?: string | null
    images?: { thumb?: string | null } | null
}

/**
 * A space's mini app, or `null` when it has none.
 *
 * **Both fields are required**, which is legacy's rule and the reason it is stated once here:
 * `has_mini_app` has been seen true with an empty `mini_app_url`, and a flag with nothing
 * behind it would render an "Open" button that opens a blank frame.
 *
 * The **space** supplies the name and icon, not the app: a creator's mini app is presented as
 * theirs, and legacy does the same (`channel?.name`, `channel?.images?.thumb`).
 */
export function miniAppFromChannel(
    channel: MiniAppChannelLike | null | undefined,
    fallbackName: string,
): MiniAppConfig | null {
    if (!channel?.has_mini_app) return null
    return normalizeMiniAppConfig(
        {
            id: channel.mini_app_id ?? null,
            name: channel.name ?? null,
            url: channel.mini_app_url ?? null,
            iconUrl: channel.images?.thumb ?? null,
            shareableUrl: channel.shareable_url ?? null,
        },
        fallbackName,
    )
}

/**
 * Whether a space has a mini app the player could actually open.
 *
 * The **same** rule as `miniAppFromChannel` (it *is* that call), exported separately because
 * `features/channel`'s action row needs the boolean without a name to fall back to: it uses it to
 * decide the rest of the row, not to render the app. One rule, so a row cannot hide its membership
 * button for an app the button would then refuse to open.
 */
export function hasMiniApp(channel: MiniAppChannelLike | null | undefined): boolean {
    return miniAppFromChannel(channel, 'mini app') !== null
}

/**
 * The space a mini app belongs to, as a handle — read off its `shareableUrl` (`…/@arcade`). `null`
 * when that URL names no space, which is when the ⋯ menu offers no "Send message".
 */
export function spaceSlugFromUrl(url: string | null): string | null {
    if (!url) return null
    try {
        const first = new URL(url).pathname.split('/').filter(Boolean)[0] ?? ''
        const slug = first.startsWith('@') ? decodeURIComponent(first.slice(1)) : ''
        return /^[a-zA-Z0-9_.-]+$/.test(slug) ? slug : null
    } catch {
        return null
    }
}
