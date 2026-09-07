import { hasRemoteMatch } from 'next/dist/shared/lib/match-remote-pattern'
import { describe, expect, it } from 'vitest'
import nextConfig from '../../../next.config'

/**
 * Which URLs `next/image` will optimise, pinned against **Next's own matcher**.
 *
 * ## Why this needs a test at all
 *
 * `images.remotePatterns` is the one piece of configuration in this repo whose failure is
 * **invisible until real data arrives**. An unconfigured host does not degrade: in development
 * `next/image` throws, so one unexpected avatar takes the whole screen down, and in production the
 * optimizer answers 400 and the picture is simply missing. Nothing in a unit test, a typecheck or a
 * build notices, because the URL comes from the backend at runtime.
 *
 * It has already happened twice: a staging avatar on `static.stg.tevicdn.com` (the list carried
 * three other `tevicdn` subdomains but not that one) and every user avatar on
 * `p16.topbuzzcdn.com`, which was missing outright and surfaced the day `/following` became the
 * first screen to render a real profile picture. Legacy is no help as a reference — it sets
 * `images.unoptimized: true`, so Next never validates a URL there and its own list was never
 * enforced.
 *
 * So the URLs below are **observed values from real payloads**, not a wishlist. Adding one here
 * without adding its host to the config is a red test; the reverse is the bug this file exists to
 * stop.
 *
 * ## `hasRemoteMatch`, not a re-implementation
 *
 * This is the function the optimizer itself calls, so what is asserted is the real decision —
 * protocol, hostname glob, port and pathname together — rather than a hand-rolled approximation of
 * it that could be wrong in the same direction as the config.
 *
 * ## The negative half is the security half
 *
 * Two entries are wildcards (`**.tevicdn.com`, `**.topbuzzcdn.com`) and both carry a comment
 * claiming `**` cannot reach sideways out of the domain. That claim is what makes them acceptable
 * next to `dangerouslyAllowSVG`, so it is asserted rather than trusted.
 */

const patterns = nextConfig.images?.remotePatterns ?? []

/** Next's own answer. `domains` is the deprecated flat list, which this app does not use. */
const allows = (url: string) => hasRemoteMatch([], patterns, new URL(url))

/**
 * **The catch-all, and what it does to this file.** `next.config.ts` currently carries
 * `{ hostname: '**' }` — every https host — because the named list kept losing the race against
 * the backend and each miss was a broken screen. While it is there, no host can be *refused*, so
 * the negative half below is asserted against the named patterns with the catch-all removed: the
 * claim it pins is about `**.tevicdn.com` and `**.topbuzzcdn.com` reaching sideways out of their
 * domain, and that claim has to survive the catch-all being deleted. Delete the catch-all and
 * `named` is simply `patterns` again — nothing here needs editing.
 */
const isCatchAll = (pattern: (typeof patterns)[number]) =>
    !(pattern instanceof URL) && pattern.hostname === '**'
const named = patterns.filter(pattern => !isCatchAll(pattern))
const namedAllows = (url: string) => hasRemoteMatch([], named, new URL(url))

/**
 * URLs seen in real payloads, with what serves them. Each is a screen that breaks without it.
 *
 * The avatar path is the one from the error that started this: a `~1200x0.image` suffix and all.
 */
const OBSERVED: [string, string][] = [
    [
        'https://p16.topbuzzcdn.com/img/user-avatar-alisg/82fdb9e54f95078f335d204dee4eb1dc~1200x0.image',
        'user avatars — `channel.images.thumb`',
    ],
    [
        'https://p9.topbuzzcdn.com/img/user-avatar-alisg/x~1200x0.image',
        'the same CDN, another shard',
    ],
    ['https://p16-sign-sg.topbuzzcdn.com/img/x~720x0.image', 'the same CDN, a signed variant'],
    ['https://static.tevicdn.com/web/web-app/images/theo-search.svg', 'static art'],
    ['https://static.stg.tevicdn.com/avatar.png', 'staging avatars — the first time this bit'],
    ['https://feed-stg.tevicdn.com/post/1.jpg', 'staging feed media'],
    ['https://imge.tevicdn.com/img/1.webp', 'image service'],
    ['https://storage.googleapis.com/tevi/uploads/1.png', 'uploads'],
    ['https://lh3.googleusercontent.com/a/abc', 'Google sign-in avatars'],
    ['https://platform-lookaside.fbsbx.com/platform/profilepic/', 'Facebook sign-in avatars'],
    ['https://static.tevi.com/brand/logo.svg', 'production static'],
    /*
     * Premium's benefit art, from a captured `premium/v1/benefits/`. Both hosts appear in the *same*
     * payload — one benefit's banner is on `.tevi.app` while its icon is on `.tevi.dev` — so the
     * pair is the observation, not a choice between them. Thirteen rows of a list break without it,
     * and this is why the feature stopped drawing them `unoptimized`.
     */
    ['https://tevi-cdn.tevi.dev/premium/Spin.png', 'premium benefit icons'],
    ['https://tevi-cdn.tevi.app/premium/reply_follow_banner.png', 'premium benefit banners'],
]

describe('next/image remote patterns', () => {
    it.each(OBSERVED)('optimises %s (%s)', url => {
        expect(allows(url)).toBe(true)
    })

    /**
     * The claim both wildcard entries make. `**` matches labels *below* the domain and nothing
     * beside it — a lookalike registered as `evil-tevicdn.com`, a prefix glued on with no dot, and
     * the domain used as a *prefix* of somebody else's must all miss.
     *
     * `topbuzzcdn.com.evil.io` is the one worth stating out loud: it contains an allowed domain as a
     * substring, so any check written with `includes()`, or with `endsWith` against the wrong end,
     * would pass it and hand an attacker our optimizer.
     */
    it.each([
        'https://evil-tevicdn.com/a.png',
        'https://eviltevicdn.com/a.png',
        'https://tevicdn.com.evil.io/a.png',
        'https://evil-topbuzzcdn.com/a.png',
        'https://eviltopbuzzcdn.com/a.png',
        'https://topbuzzcdn.com.evil.io/a.png',
        'https://topbuzzcdn.com.evil.io.uk/a.png',
        'https://tevi.com.evil.io/a.png',
        'https://notstorage.googleapis.com/a.png',
    ])('refuses %s on the named patterns', url => {
        expect(namedAllows(url)).toBe(false)
    })

    /**
     * The catch-all is deliberate and temporary, so it is stated rather than left to be discovered
     * from a passing suite that no longer refuses anything. If it is gone, the named patterns are
     * the whole policy and the block above is the live one.
     */
    it('either refuses an unlisted host or carries the deliberate catch-all', () => {
        const unlisted = 'https://graph.facebook.com/1/picture'
        expect(allows(unlisted)).toBe(patterns.some(isCatchAll))
    })

    /**
     * Plain `http` is refused even for a host that is otherwise allowed. Letting the optimizer fetch
     * a profile picture in clear text and re-serve it from our origin is the one place a downgrade
     * is invisible, because what the browser sees is our own HTTPS response.
     */
    it('fetches nothing over plain http', () => {
        expect(allows('http://p16.topbuzzcdn.com/img/a.image')).toBe(false)
        expect(allows('http://static.tevi.com/a.png')).toBe(false)
        for (const pattern of patterns) {
            const protocol = pattern instanceof URL ? pattern.protocol : `${pattern.protocol}:`
            expect(protocol).toBe('https:')
        }
    })

    /**
     * `dangerouslyAllowSVG` is on, so a passed-through SVG is a document from a third-party host.
     * The three guards under it in the config are what keep it from executing as us, and they are
     * one line each — exactly the sort of line a merge drops.
     */
    it('keeps the guards that make dangerouslyAllowSVG survivable', () => {
        expect(nextConfig.images?.dangerouslyAllowSVG).toBe(true)
        expect(nextConfig.images?.contentSecurityPolicy).toContain("script-src 'none'")
        expect(nextConfig.images?.contentSecurityPolicy).toContain('sandbox')
        expect(nextConfig.images?.contentDispositionType).toBe('attachment')
    })

    /**
     * `qualities` has to carry **10** as well as Next's default 75. `ChannelCover` asks for 10 on a
     * sensitive space's blurred cover, and an undeclared quality is silently served at the default —
     * which would put the full-resolution withheld image one devtools toggle from being visible.
     */
    it('declares the low quality the sensitive-cover blur depends on', () => {
        expect(nextConfig.images?.qualities).toContain(10)
        expect(nextConfig.images?.qualities).toContain(75)
    })
})
