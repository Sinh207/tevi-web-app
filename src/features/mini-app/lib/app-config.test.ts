import { describe, expect, it } from 'vitest'
import {
    hasMiniApp,
    miniAppDedupKey,
    miniAppFromChannel,
    normalizeMiniAppConfig,
    spaceSlugFromUrl,
} from './app-config'

describe('normalizeMiniAppConfig', () => {
    it('vets the URL and fills the name', () => {
        expect(
            normalizeMiniAppConfig({ url: 'https://game.example/play', id: 42 }, 'Mini app'),
        ).toEqual({
            id: '42',
            name: 'Mini app',
            url: 'https://game.example/play',
            iconUrl: null,
            shareableUrl: null,
        })
    })

    it.each([
        ['javascript:', 'javascript:fetch("/api/me")'],
        ['data:', 'data:text/html,<script>1</script>'],
        ['a bare scheme with no host', 'https:?x=1'],
        ['nothing', ''],
    ])('refuses %s', (_label, url) => {
        // This value becomes an `iframe src`, where `javascript:` executes in *this* document with
        // the visitor's session and no click to intercept.
        expect(normalizeMiniAppConfig({ url }, 'Mini app')).toBeNull()
    })

    it('upgrades a bare host, because creators type links without a scheme', () => {
        expect(normalizeMiniAppConfig({ url: 'game.example/play' }, 'Mini app')?.url).toBe(
            'https://game.example/play',
        )
    })

    it.each([
        ['an empty string', ''],
        ['a zero', 0],
        ['null', null],
    ])('normalises %s app id to null', (_label, id) => {
        // All three mean "no app id" on the wire, and a falsy string reaching `getAppToken` is a
        // request for a token for nothing.
        expect(normalizeMiniAppConfig({ url: 'https://a.example', id }, 'Mini app')?.id).toBeNull()
    })

    it('drops an unusable icon rather than rendering a broken image', () => {
        expect(
            normalizeMiniAppConfig(
                { url: 'https://a.example', iconUrl: 'javascript:1' },
                'Mini app',
            )?.iconUrl,
        ).toBeNull()
    })

    it('falls back to the given name for a blank one', () => {
        expect(
            normalizeMiniAppConfig({ url: 'https://a.example', name: '   ' }, 'Mini app')?.name,
        ).toBe('Mini app')
    })
})

describe('miniAppDedupKey', () => {
    it('treats hash routes inside one app as the same app', () => {
        // `#/lobby` and `#/match/12` are the same running game; opening the second while the first
        // is on screen must switch tabs, not boot a second copy.
        expect(miniAppDedupKey('https://a.example/p#/lobby')).toBe(
            miniAppDedupKey('https://a.example/p#/match/12'),
        )
    })

    it('treats different query parameters as different content', () => {
        expect(miniAppDedupKey('https://a.example/p?table=1')).not.toBe(
            miniAppDedupKey('https://a.example/p?table=2'),
        )
    })

    it('is null for an unparseable URL', () => {
        expect(miniAppDedupKey('not a url')).toBeNull()
    })
})

describe('miniAppFromChannel', () => {
    const channel = {
        has_mini_app: true,
        mini_app_url: 'https://game.example',
        mini_app_id: 'app-1',
        name: 'Ada',
        shareable_url: 'https://tevi.com/@ada',
        images: { thumb: 'https://cdn.example/a.png' },
    }

    it('presents the app as the space: its name and its avatar', () => {
        expect(miniAppFromChannel(channel, 'Mini app')).toEqual({
            id: 'app-1',
            name: 'Ada',
            url: 'https://game.example/',
            iconUrl: 'https://cdn.example/a.png',
            shareableUrl: 'https://tevi.com/@ada',
        })
    })

    it('needs both the flag and a usable URL', () => {
        // `has_mini_app` has been seen true with an empty URL, which would render an Open button
        // that opens a blank frame.
        expect(miniAppFromChannel({ ...channel, mini_app_url: '' }, 'Mini app')).toBeNull()
        expect(miniAppFromChannel({ ...channel, has_mini_app: false }, 'Mini app')).toBeNull()
        expect(miniAppFromChannel(null, 'Mini app')).toBeNull()
    })

    it('runs without an app id — the app just cannot mint a token', () => {
        expect(miniAppFromChannel({ ...channel, mini_app_id: null }, 'Mini app')?.id).toBeNull()
    })

    it('agrees with `hasMiniApp`, which the action row reads', () => {
        // One rule: a row must not hide its membership button for an app the player would refuse.
        expect(hasMiniApp(channel)).toBe(true)
        expect(hasMiniApp({ ...channel, mini_app_url: 'javascript:1' })).toBe(false)
    })
})

describe('spaceSlugFromUrl', () => {
    it('reads the handle off a space URL', () => {
        expect(spaceSlugFromUrl('https://tevi.com/@arcade')).toBe('arcade')
        expect(spaceSlugFromUrl('https://tevi.com/@arcade/post/1?x=1')).toBe('arcade')
    })

    it('is null for a URL that names no space', () => {
        expect(spaceSlugFromUrl('https://tevi.com/messages')).toBeNull()
        expect(spaceSlugFromUrl('not a url')).toBeNull()
        expect(spaceSlugFromUrl(null)).toBeNull()
    })
})
