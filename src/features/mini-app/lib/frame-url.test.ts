import { describe, expect, it } from 'vitest'
import type { MiniAppConfig } from './app-config'
import { buildMiniAppFrameUrl, campaignFromUrl, miniAppFrameSandbox } from './frame-url'

const config: MiniAppConfig = {
    id: 'app-1',
    name: 'Ada',
    url: 'https://game.example/play?table=4',
    iconUrl: null,
    shareableUrl: null,
}

describe('buildMiniAppFrameUrl', () => {
    it('adds the contract parameters and keeps the app’s own', () => {
        const url = new URL(
            buildMiniAppFrameUrl(config, {
                userId: '12345',
                channelSlug: 'ada',
                locale: 'vi',
                version: '1.0.2',
                campaign: 'spring2026',
            })!,
        )
        expect(url.searchParams.get('user')).toBe('12345')
        expect(url.searchParams.get('slug')).toBe('ada')
        expect(url.searchParams.get('lan')).toBe('vi')
        expect(url.searchParams.get('v')).toBe('1.0.2')
        expect(url.searchParams.get('campaign')).toBe('spring2026')
        expect(url.searchParams.get('app_id')).toBe('app-1')
        // The app's own parameter survives — it is the app's, not ours.
        expect(url.searchParams.get('table')).toBe('4')
    })

    it('omits what the host does not know instead of sending it blank', () => {
        const url = new URL(buildMiniAppFrameUrl(config, { userId: '1' })!)
        expect(url.searchParams.has('slug')).toBe(false)
        expect(url.searchParams.has('v')).toBe(false)
        expect(url.searchParams.has('campaign')).toBe(false)
    })

    it('refuses a URL that is not http(s), at the sink as well as at the source', () => {
        expect(buildMiniAppFrameUrl({ ...config, url: 'javascript:1' })).toBeNull()
        expect(buildMiniAppFrameUrl({ ...config, url: 'nonsense' })).toBeNull()
    })

    it('changes with the version, which is the whole cache bust', () => {
        // A cross-origin frame's cache cannot be cleared from here; a different URL is the only
        // thing the browser cannot serve the old document for.
        const first = buildMiniAppFrameUrl(config, { version: '1.0.0' })
        const second = buildMiniAppFrameUrl(config, { version: '1.0.1' })
        expect(first).not.toBe(second)
    })
})

describe('campaignFromUrl', () => {
    it('reads utm_campaign off the page that opened the app', () => {
        expect(campaignFromUrl('https://tevi.com/@ada?utm_campaign=spring')).toBe('spring')
    })

    it.each([
        ['no parameter', 'https://tevi.com/@ada'],
        ['an empty one', 'https://tevi.com/@ada?utm_campaign='],
        ['a malformed URL', 'not a url'],
        ['nothing', null],
    ])('is null for %s', (_label, href) => {
        expect(campaignFromUrl(href)).toBeNull()
    })
})

describe('miniAppFrameSandbox', () => {
    it('keeps allow-same-origin for a third-party app, which needs its own storage', () => {
        expect(miniAppFrameSandbox('https://game.example/', 'https://tevi.com')).toContain(
            'allow-same-origin',
        )
    })

    it('drops allow-same-origin for an app served from this origin', () => {
        // With `allow-scripts`, the pair would let the frame script the parent and read
        // localStorage — where every account's refresh token lives.
        expect(miniAppFrameSandbox('https://tevi.com/apps/x', 'https://tevi.com')).not.toContain(
            'allow-same-origin',
        )
    })

    it('never grants top navigation or downloads', () => {
        const sandbox = miniAppFrameSandbox('https://game.example/', 'https://tevi.com')
        // A frame that could navigate the tab is a phishing primitive; downloads go through the
        // host's own vetted `downloadMedia` action.
        expect(sandbox).not.toContain('allow-top-navigation')
        expect(sandbox).not.toContain('allow-downloads')
    })

    it('keeps the full set when the host origin is unknown', () => {
        expect(miniAppFrameSandbox('https://game.example/', null)).toContain('allow-same-origin')
    })
})
