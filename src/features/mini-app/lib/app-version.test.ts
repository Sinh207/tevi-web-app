// @vitest-environment jsdom
import { STORAGE_KEYS } from '@shared/lib/storage'
import { beforeEach, describe, expect, it } from 'vitest'
import {
    APP_VERSION_TTL_MS,
    frameVersionFor,
    MAX_REMEMBERED_APPS,
    pruneAppVersions,
    readAppVersions,
    recordReportedVersion,
} from './app-version'

const NOW = 1_800_000_000_000

beforeEach(() => {
    window.localStorage.clear()
})

describe('recordReportedVersion', () => {
    it('remembers a first sighting and does not reload', () => {
        // The frame in front of the reader already *is* this version. Reloading would be a visible
        // flash on the first launch of every app — exactly when it looks like a bug.
        const result = recordReportedVersion({
            appId: 'a1',
            reported: '1.0.0',
            frameVersion: null,
            now: NOW,
        })
        expect(result).toEqual({ version: '1.0.0', shouldReload: false })
        expect(readAppVersions().a1).toEqual({ version: '1.0.0', at: NOW })
    })

    it('reloads when a remembered app reports a different version', () => {
        recordReportedVersion({ appId: 'a1', reported: '1.0.0', frameVersion: null, now: NOW })
        expect(
            recordReportedVersion({
                appId: 'a1',
                reported: '1.1.0',
                frameVersion: '1.0.0',
                now: NOW,
            }),
        ).toEqual({ version: '1.1.0', shouldReload: true })
    })

    it('does not reload twice for the same version', () => {
        // The reloaded frame's URL already carries it, so this is what stops the loop an app
        // reporting a rolling version would otherwise cause.
        expect(
            recordReportedVersion({
                appId: 'a1',
                reported: '1.1.0',
                frameVersion: '1.1.0',
                now: NOW,
            }).shouldReload,
        ).toBe(false)
    })

    it.each([
        ['nothing', undefined],
        ['a blank string', '   '],
        ['a number', 3],
    ])('ignores %s and keeps the current version', (_label, reported) => {
        expect(
            recordReportedVersion({ appId: 'a1', reported, frameVersion: '1.0.0', now: NOW }),
        ).toEqual({ version: '1.0.0', shouldReload: false })
    })

    it('remembers nothing for an app with no id', () => {
        // `v` is keyed on the app; two id-less apps would otherwise trade cache busts.
        expect(
            recordReportedVersion({ appId: null, reported: '1.0.0', frameVersion: null, now: NOW }),
        ).toEqual({ version: null, shouldReload: false })
        expect(readAppVersions()).toEqual({})
    })
})

describe('frameVersionFor', () => {
    it('answers null for an app never seen, which is what makes a first run distinguishable', () => {
        expect(frameVersionFor('a1', NOW)).toBeNull()
    })

    it('answers the remembered version', () => {
        recordReportedVersion({ appId: 'a1', reported: '2.0', frameVersion: null, now: NOW })
        expect(frameVersionFor('a1', NOW + 1000)).toBe('2.0')
    })

    it('forgets a record past its TTL rather than pinning a `v` forever', () => {
        recordReportedVersion({ appId: 'a1', reported: '2.0', frameVersion: null, now: NOW })
        expect(frameVersionFor('a1', NOW + APP_VERSION_TTL_MS)).toBeNull()
    })

    it('is null without an app id', () => {
        expect(frameVersionFor(null, NOW)).toBeNull()
    })
})

describe('readAppVersions', () => {
    it('drops malformed records instead of letting them reach the URL', () => {
        window.localStorage.setItem(
            STORAGE_KEYS.miniAppVersions,
            JSON.stringify({
                good: { version: '1.0', at: NOW },
                noVersion: { at: NOW },
                badAt: { version: '1.0', at: 'yesterday' },
                notAnObject: 7,
            }),
        )
        expect(readAppVersions()).toEqual({ good: { version: '1.0', at: NOW } })
    })

    it('survives a value that is not JSON at all', () => {
        window.localStorage.setItem(STORAGE_KEYS.miniAppVersions, '{{{')
        expect(readAppVersions()).toEqual({})
    })
})

describe('pruneAppVersions', () => {
    it('caps the map, keeping the most recent', () => {
        const many = Object.fromEntries(
            Array.from({ length: MAX_REMEMBERED_APPS + 10 }, (_, i) => [
                `a${i}`,
                { version: '1', at: NOW + i },
            ]),
        )
        const pruned = pruneAppVersions(many, NOW + 100)
        expect(Object.keys(pruned)).toHaveLength(MAX_REMEMBERED_APPS)
        expect(pruned.a0).toBeUndefined()
    })
})
