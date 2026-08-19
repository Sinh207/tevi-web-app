// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { migrateLegacyStorage, STORAGE_KEYS, storage } from './storage'

beforeEach(() => {
    localStorage.clear()
})

describe('migrateLegacyStorage', () => {
    it('upgrades legacy user_logged_list → tevi.auth.accounts with id + expires_at', () => {
        localStorage.setItem(
            'user_logged_list',
            JSON.stringify({
                '42': {
                    user: { id: 42, name: 'A' },
                    access_token: 'at',
                    refresh_token: 'rt',
                    expires_in: 3600,
                },
            }),
        )
        localStorage.setItem('user_id', '42')

        migrateLegacyStorage()

        const accounts = storage.getJSON<Record<string, Record<string, unknown>>>(
            STORAGE_KEYS.accounts,
        )
        expect(accounts?.['42']).toMatchObject({
            id: '42',
            access_token: 'at',
            refresh_token: 'rt',
            expires_in: 3600,
        })
        expect(typeof accounts?.['42'].expires_at).toBe('number')
        expect(storage.get(STORAGE_KEYS.activeAccount)).toBe('42')
        // legacy keys removed
        expect(localStorage.getItem('user_logged_list')).toBeNull()
        expect(localStorage.getItem('user_id')).toBeNull()
    })

    it('renames device_id and lang_code', () => {
        localStorage.setItem('device_id', 'dev-1')
        localStorage.setItem('lang_code', 'vi')
        migrateLegacyStorage()
        expect(storage.get(STORAGE_KEYS.deviceId)).toBe('dev-1')
        expect(storage.get(STORAGE_KEYS.locale)).toBe('vi')
        expect(localStorage.getItem('device_id')).toBeNull()
    })

    it('is idempotent (guarded by a version flag)', () => {
        localStorage.setItem('device_id', 'dev-1')
        migrateLegacyStorage()
        // A second legacy write after migration must NOT be re-copied.
        localStorage.setItem('device_id', 'dev-2')
        migrateLegacyStorage()
        expect(storage.get(STORAGE_KEYS.deviceId)).toBe('dev-1')
    })

    it('does not clobber an existing new-key value', () => {
        storage.set(STORAGE_KEYS.locale, 'ko')
        localStorage.setItem('lang_code', 'vi')
        migrateLegacyStorage()
        expect(storage.get(STORAGE_KEYS.locale)).toBe('ko')
    })
})
