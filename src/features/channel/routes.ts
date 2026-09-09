/**
 * The channel namespace's **paths and its deep-link vocabulary**, and nothing else.
 *
 * Import-free for the reason CLAUDE.md gives at length: `features/donation` and
 * `features/membership` both need to recognise a deep link into a space, and reaching them through
 * `index.ts` would close a cycle — `channel/index` → `channel-view` → `channel-viewer-actions` →
 * `@features/donation` → `donate-button` → `channel/index`. ESM resolves that by handing one side a
 * half-initialised module, which is not a build error but an `undefined is not a function` at render
 * time. So: `@features/channel/routes`, never `@features/channel`.
 *
 * `lib/routes.ts` re-exports this file, so nothing inside the feature has to know which of the two
 * it is reading.
 *
 * ## The three actions are legacy's words, not ours
 *
 * `direct_donation`, `become_a_member` and `custom_profile` are the exact strings legacy's own
 * `middleware.js` and account drawer emit. They are a contract with URLs already in the wild —
 * shared links, bookmarks, and the mobile apps — so they are transcribed here rather than renamed.
 * A union rather than loose strings: a typo in a gate that decides whether a dialog opens is
 * otherwise a silent no-op, which is exactly how it failed before.
 */

/** What a visitor arrived intending to do on a space page. */
export type ChannelAction = 'direct_donation' | 'become_a_member' | 'custom_profile'

/**
 * The two actions that have a URL of their own, and the sub-path each one is.
 *
 * `custom_profile` is deliberately absent: it has no channel sub-path — legacy only ever emitted it
 * as `?action=`, and its destination in this app is a settings route (`CUSTOM_PROFILE_PATH`), not
 * something under `/@{slug}`.
 *
 * `membership` and not `membership/{id}`: `useJoinFlow` resolves **one** offer per space, so an id
 * selects nothing. Legacy's links carry one and `parseChannelIntent` accepts them — see there.
 *
 * **Read-only, for now.** There is deliberately no builder beside this table: nothing in the app
 * links *at* these URLs yet, and the one surface that might — the donate card's share button —
 * copies the space's URL under a label that says so in nine locales, which is a product decision
 * rather than a missing helper. Add the builder here, next to the spelling it inverts, on the day
 * something links at them.
 */
const ACTION_SUBPATHS = {
    direct_donation: 'direct-donation',
    become_a_member: 'membership',
} as const satisfies Partial<Record<ChannelAction, string>>

/**
 * The channel-root segment of a pathname, or `null`.
 *
 * Both spellings, because both are URLs a person can hold: Next hands the segment over
 * percent-encoded, so `%40ada` is the *normal* case and `@ada` is what a hand-written link contains
 * (`parseChannelSlug` carries the measurement). The segment is returned **verbatim** rather than
 * decoded — callers here rebuild URLs with it, and re-encoding someone's spelling would be a
 * gratuitous redirect.
 *
 * The pattern is duplicated from `channel-slug.ts` rather than imported, because this file may
 * import nothing; `proxy.ts` duplicates it too, for the same reason and deliberately.
 */
const CHANNEL_SEGMENT = /^\/((?:@|%40)[^/]+)(\/.*)?$/

/**
 * The space's own URL, from any URL inside it — `/@ada/direct-donation` → `/@ada`.
 *
 * What a deep link is cleaned back to once it has been acted on, so the address bar shows the page
 * the reader is actually on. Returns `null` for a pathname that is not a channel URL at all, which
 * is the caller's signal to leave the URL alone.
 */
export function channelBasePath(pathname: string): string | null {
    const match = pathname.match(CHANNEL_SEGMENT)
    return match ? `/${match[1]}` : null
}

/** `?action=` carried one of the three words. */
function actionParam(search: URLSearchParams): ChannelAction | null {
    const value = search.get('action')
    return value === 'direct_donation' || value === 'become_a_member' || value === 'custom_profile'
        ? value
        : null
}

/**
 * What this URL asks the space page to open, from **either** spelling of the deep link.
 *
 * Two spellings exist because one replaced the other. The path — `/@ada/direct-donation`,
 * `/@ada/membership`, `/@ada/membership/{id}` — is this app's, and it is what gets shared, indexed
 * and linked from now on. The query — `?action=…` — is legacy's, kept working forever: those URLs
 * were minted by legacy's own middleware and its account drawer, so they sit in histories and
 * bookmarks and cannot be retired by us.
 *
 * **The path wins** when both are present. A path is the address the visitor is standing on and the
 * one a share carries; a leftover `?action=` beside it is at best a duplicate and at worst somebody
 * else's parameter riding along.
 *
 * A **trailing id after `membership` is accepted and ignored.** Legacy's URL named a tier
 * (`/@ada/membership/{id}`) and those links still exist, some pointing at tiers that have since been
 * deleted. Refusing them would turn an old link into a 404 for no gain — there is one offer per
 * space to open either way.
 */
export function parseChannelIntent(
    pathname: string,
    search: URLSearchParams,
): ChannelAction | null {
    const match = pathname.match(CHANNEL_SEGMENT)
    if (!match) return null

    // `/direct-donation` → ['direct-donation']; `/membership/12` → ['membership', '12'].
    const rest = (match[2] ?? '').split('/').filter(Boolean)
    if (rest.length > 0) {
        if (rest.length === 1 && rest[0] === ACTION_SUBPATHS.direct_donation) {
            return 'direct_donation'
        }
        if (rest.length <= 2 && rest[0] === ACTION_SUBPATHS.become_a_member) {
            return 'become_a_member'
        }
        // Some other sub-page of a space (`earnings-report`, `event/…`). Its own route owns it, and
        // a stray `?action=` there is not this page's business.
        return null
    }

    return actionParam(search)
}
