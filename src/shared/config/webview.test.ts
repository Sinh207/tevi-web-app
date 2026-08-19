import { describe, expect, it } from 'vitest'
import {
    isWebviewPath,
    parseWebviewParams,
    parseWebviewTheme,
    readWebviewHeaders,
    WEBVIEW_HEADERS,
} from './webview'

const parse = (query: string) => parseWebviewParams(new URLSearchParams(query))

describe('isWebviewPath', () => {
    it('matches the /app namespace and nothing that merely starts like it', () => {
        expect(isWebviewPath('/app')).toBe(true)
        expect(isWebviewPath('/app/privacy')).toBe(true)
        expect(isWebviewPath('/app/privacy/nested')).toBe(true)
        expect(isWebviewPath('/apple-icon.png')).toBe(false)
        expect(isWebviewPath('/privacy')).toBe(false)
        expect(isWebviewPath('/')).toBe(false)
    })
})

describe('parseWebviewParams — language', () => {
    it('accepts lang and the aliases the app already sends', () => {
        expect(parse('lang=vi').locale).toBe('vi')
        expect(parse('lan=vi').locale).toBe('vi')
        expect(parse('hl=vi').locale).toBe('vi')
    })

    it('normalizes region and script tags the way the rest of i18n does', () => {
        expect(parse('lang=vi-VN').locale).toBe('vi')
        expect(parse('lang=en_US').locale).toBe('en')
        expect(parse('lang=zh-Hant').locale).toBe('zh-TW')
        expect(parse('lang=zh').locale).toBe('zh-CN')
        expect(parse('lang=tl').locale).toBe('fil')
        expect(parse('lang=AR').locale).toBe('ar')
    })

    it('drops an unsupported code instead of clamping it to English', () => {
        // The point: a `de` app build must still fall through to cookie /
        // Accept-Language, not get pinned to en by `toLocale`'s fallback.
        expect(parse('lang=de').locale).toBeUndefined()
        expect(parse('lang=xx-YY').locale).toBeUndefined()
        expect(parse('lang=').locale).toBeUndefined()
        expect(parse('lang=%20').locale).toBeUndefined()
        expect(parse('').locale).toBeUndefined()
    })

    it('takes the first alias that carries a value', () => {
        expect(parse('lang=&lan=ko').locale).toBe('ko')
    })
})

describe('parseWebviewParams — theme, platform, version', () => {
    it('accepts only the three themes, case-insensitively', () => {
        expect(parse('theme=dark').theme).toBe('dark')
        expect(parse('theme=LIGHT').theme).toBe('light')
        expect(parse('theme=system').theme).toBe('system')
        expect(parse('theme=amoled').theme).toBeUndefined()
        expect(parse('').theme).toBeUndefined()
    })

    it('folds the device names iOS sends onto one platform', () => {
        expect(parse('platform=ios').platform).toBe('ios')
        expect(parse('platform=iPad').platform).toBe('ios')
        expect(parse('os=android').platform).toBe('android')
        expect(parse('platform=windows').platform).toBeUndefined()
    })

    it('passes the app version through untouched', () => {
        expect(parse('v=3.14.0-beta.2').version).toBe('3.14.0-beta.2')
        expect(parse('app_version=1.0').version).toBe('1.0')
        expect(parse('').version).toBeUndefined()
    })

    it('leaves everything unset for a bare webview URL — old builds send no params', () => {
        expect(parse('')).toEqual({
            locale: undefined,
            theme: undefined,
            platform: undefined,
            version: undefined,
        })
    })
})

describe('readWebviewHeaders', () => {
    const from = (headers: Record<string, string>) =>
        readWebviewHeaders(name => headers[name] ?? null)

    it('reports no webview when the flag is absent', () => {
        expect(from({})).toEqual({ isWebview: false })
        // and ignores the rest, so a stray header cannot force a theme on a web page
        expect(from({ [WEBVIEW_HEADERS.theme]: 'dark' })).toEqual({ isWebview: false })
    })

    it('round-trips what the proxy sets', () => {
        expect(
            from({
                [WEBVIEW_HEADERS.flag]: '1',
                [WEBVIEW_HEADERS.locale]: 'vi',
                [WEBVIEW_HEADERS.theme]: 'dark',
                [WEBVIEW_HEADERS.platform]: 'ios',
                [WEBVIEW_HEADERS.version]: '3.14.0',
            }),
        ).toEqual({
            isWebview: true,
            locale: 'vi',
            theme: 'dark',
            platform: 'ios',
            version: '3.14.0',
        })
    })

    it('re-validates, so a bad value degrades instead of reaching i18n', () => {
        const ctx = from({
            [WEBVIEW_HEADERS.flag]: '1',
            [WEBVIEW_HEADERS.locale]: 'de',
            [WEBVIEW_HEADERS.theme]: 'amoled',
        })
        expect(ctx).toEqual({
            isWebview: true,
            locale: undefined,
            theme: undefined,
            platform: undefined,
            version: undefined,
        })
    })
})

describe('parseWebviewTheme', () => {
    it('is null-safe — callers hand it raw cookie and header values', () => {
        expect(parseWebviewTheme(null)).toBeUndefined()
        expect(parseWebviewTheme(undefined)).toBeUndefined()
        expect(parseWebviewTheme(' dark ')).toBe('dark')
    })
})
