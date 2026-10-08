import { committedArt } from '@shared/lib/committed-art'
import { describe, expect, it } from 'vitest'
import { DEFAULT_OG_IMAGE, siteAlternates, siteOpenGraph } from './seo'

describe('DEFAULT_OG_IMAGE', () => {
    it('is a committed JPEG, not a CDN URL', () => {
        // Generated but committed (`build-cdn-art.mjs`, row `og-default`): the one way it goes stale
        // silently is a path that no longer names the file, and every share card loses its image.
        const file = committedArt(DEFAULT_OG_IMAGE.url)
        expect(file.isLocal).toBe(true)
        expect(file.isDeclaredFormat).toBe(true)
        expect(file.bytes).toBeGreaterThan(1024)
    })
})

describe('siteOpenGraph', () => {
    it('fills the site name and the default card', () => {
        expect(siteOpenGraph()).toMatchObject({
            siteName: 'Tevi',
            type: 'website',
            images: [DEFAULT_OG_IMAGE],
        })
    })

    it("keeps a page's own image and type", () => {
        const og = siteOpenGraph({ type: 'article', images: [{ url: 'https://x/y.jpg' }] })
        expect(og).toMatchObject({ type: 'article', images: [{ url: 'https://x/y.jpg' }] })
    })
})

describe('siteAlternates', () => {
    it('is canonical to the bare path when the URL names no language', () => {
        expect(siteAlternates('/premium', null)?.canonical).toBe('/premium')
    })

    it('is canonical to itself on a language version — or hreflang is ignored', () => {
        expect(siteAlternates('/premium', 'vi')?.canonical).toBe('/premium?lang=vi')
    })

    it('folds ?lang=en onto the bare path, which is what a crawler gets in English', () => {
        expect(siteAlternates('/premium', 'en')?.canonical).toBe('/premium')
    })

    it('folds a language it does not advertise onto the bare path too', () => {
        // `ar` is supported but not in the switcher, so not in `hreflang` — a canonical of its own
        // would be a language version the set never mentions.
        expect(siteAlternates('/premium', 'ar')?.canonical).toBe('/premium')
    })

    it('lists every UI locale plus x-default, the same set from every version', () => {
        const fromBare = siteAlternates('/', null)?.languages
        expect(fromBare).toEqual(siteAlternates('/', 'ko')?.languages)
        expect(fromBare).toMatchObject({
            en: '/',
            vi: '/?lang=vi',
            tl: '/?lang=fil',
            'zh-TW': '/?lang=zh-TW',
            'x-default': '/',
        })
        // `ar` is supported but not offered in the switcher, so it is not advertised either.
        expect(Object.keys(fromBare ?? {})).toHaveLength(9)
    })
})
