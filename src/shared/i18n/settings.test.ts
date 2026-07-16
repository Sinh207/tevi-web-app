import { describe, expect, it } from 'vitest'
import { htmlDir, isRtl, resolveInitialLocale, toLocale } from './settings'

describe('toLocale', () => {
    it('defaults to en for empty/unknown', () => {
        expect(toLocale(undefined)).toBe('en')
        expect(toLocale('')).toBe('en')
        expect(toLocale('xx')).toBe('en')
    })

    it('keeps Chinese script/region', () => {
        expect(toLocale('zh-Hant')).toBe('zh-TW')
        expect(toLocale('zh-TW')).toBe('zh-TW')
        expect(toLocale('zh-HK')).toBe('zh-TW')
        expect(toLocale('zh')).toBe('zh-CN')
        expect(toLocale('zh-CN')).toBe('zh-CN')
    })

    it('matches exact regioned + base codes and aliases tl→fil', () => {
        expect(toLocale('vi-VN')).toBe('vi')
        expect(toLocale('en-US')).toBe('en')
        expect(toLocale('tl')).toBe('fil')
        expect(toLocale('ID')).toBe('id')
        expect(toLocale('ar')).toBe('ar')
    })
})

describe('rtl helpers', () => {
    it('flags Arabic as rtl', () => {
        expect(isRtl('ar')).toBe(true)
        expect(isRtl('en')).toBe(false)
        expect(htmlDir('ar')).toBe('rtl')
        expect(htmlDir('vi')).toBe('ltr')
    })
})

describe('resolveInitialLocale', () => {
    it('prefers an explicit cookie', () => {
        expect(resolveInitialLocale({ cookieValue: 'vi', acceptLanguage: 'en-US' })).toBe('vi')
    })

    it('falls back to Accept-Language by quality', () => {
        expect(resolveInitialLocale({ acceptLanguage: 'ko,en;q=0.8' })).toBe('ko')
        expect(resolveInitialLocale({ acceptLanguage: 'fr;q=0.2,vi;q=0.9' })).toBe('vi')
    })

    it('defaults to en when nothing matches', () => {
        expect(resolveInitialLocale({ acceptLanguage: 'fr,de' })).toBe('en')
        expect(resolveInitialLocale({})).toBe('en')
    })
})
