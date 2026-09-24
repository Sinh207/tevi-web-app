import { describe, expect, it } from 'vitest'
import { eventDetailSchema } from '../api/types'
import { canUnlockWithStars, isLockedOut, watchState } from './watch-state'

const event = (fields: Record<string, unknown> = {}) =>
    eventDetailSchema.parse({
        code: 'abc',
        title: 'A stream',
        status: 'LIVE',
        channel: { id: '1', slug: 'ada' },
        ...fields,
    })

describe('isLockedOut', () => {
    it('lets a purchased reader in whatever else is true', () => {
        expect(isLockedOut(event({ price: '250', purchased: true }))).toBe(false)
        expect(
            isLockedOut(
                event({ required_packages: ['pkg'], need_unlock_package: true, purchased: true }),
            ),
        ).toBe(false)
    })

    /** For a membership the backend is the only party that knows which tiers the account holds. */
    it('defers to need_unlock_package when a membership is required', () => {
        expect(isLockedOut(event({ required_packages: ['pkg'], need_unlock_package: true }))).toBe(
            true,
        )
        expect(isLockedOut(event({ required_packages: ['pkg'], need_unlock_package: false }))).toBe(
            false,
        )
    })

    /**
     * ⚠ The fail-**open** direction, and the reason `need_unlock_package` is ignored for a price:
     * the field is named after packages, so reading `false` as "in" would let anybody whose payload
     * omits the flag into a paid stream. Gates fail closed.
     */
    it('keeps a priced, unpurchased reader out even when need_unlock_package is false', () => {
        expect(isLockedOut(event({ price: '250', need_unlock_package: false }))).toBe(true)
    })

    it('lets everybody into an unpriced, unrestricted stream', () => {
        expect(isLockedOut(event())).toBe(false)
        expect(isLockedOut(event({ price: '0' }))).toBe(false)
        expect(isLockedOut(event({ price: 'free' }))).toBe(false)
    })
})

describe('canUnlockWithStars', () => {
    it('needs both a product and a price above zero', () => {
        expect(canUnlockWithStars(event({ price: '250', product_id: 'p1' }))).toBe(true)
    })

    /** Legacy renders the button anyway and posts `{ product_id: undefined }`. */
    it('is false without a product id', () => {
        expect(canUnlockWithStars(event({ price: '250' }))).toBe(false)
    })

    /** A button reading "Purchase access only 0" is what a missing price produces. */
    it('is false at a price of zero, or an unparseable one', () => {
        expect(canUnlockWithStars(event({ price: '0', product_id: 'p1' }))).toBe(false)
        expect(canUnlockWithStars(event({ product_id: 'p1' }))).toBe(false)
        expect(canUnlockWithStars(event({ price: 'free', product_id: 'p1' }))).toBe(false)
    })
})

describe('watchState — the order is the behaviour', () => {
    /** First, because every refusal below is about *playing* something. */
    it('answers off-air before anything else, restriction included', () => {
        for (const status of ['ENDED', 'CANCELLED', 'PAUSED'] as const) {
            expect(
                watchState(
                    event({
                        status,
                        restricted_platforms: ['Website'],
                        price: '250',
                        product_id: 'p1',
                    }),
                ),
            ).toEqual({ kind: 'off-air', status })
        }
    })

    /** An absolute refusal outranks the paywall: selling access we cannot deliver is worse. */
    it('answers platform-restricted before the paywall', () => {
        expect(
            watchState(
                event({ restricted_platforms: ['website'], price: '250', product_id: 'p1' }),
            ),
        ).toEqual({ kind: 'platform-restricted' })
    })

    /**
     * Above the paywall, because legacy's own confirm handler refetches and only charges while the
     * status is `LIVE` — unlocking is already an on-air-only action there. It just fails silently.
     */
    it('answers upcoming before the paywall', () => {
        for (const status of ['PUBLISHED', 'PREPARING'] as const) {
            expect(watchState(event({ status, price: '250', product_id: 'p1' }))).toEqual({
                kind: 'upcoming',
            })
        }
    })

    it('offers both routes for a live stream that is priced and members-only', () => {
        expect(
            watchState(
                event({
                    price: '250',
                    product_id: 'p1',
                    required_packages: ['pkg'],
                    need_unlock_package: true,
                }),
            ),
        ).toEqual({
            kind: 'locked',
            access: { key: 'channel_live_members_or', price: 250 },
            requiresMembership: true,
            canUnlock: true,
        })
    })

    it('reports a members-only stream with no purchasable price', () => {
        expect(
            watchState(event({ required_packages: ['pkg'], need_unlock_package: true })),
        ).toEqual({
            kind: 'locked',
            access: { key: 'channel_live_members_only', price: null },
            requiresMembership: true,
            canUnlock: false,
        })
    })

    /** Gated, and this client cannot take the payment — the panel falls back to the app. */
    it('reports a priced stream with no product id as locked but not unlockable', () => {
        expect(watchState(event({ price: '250' }))).toEqual({
            kind: 'locked',
            access: { key: 'channel_live_unlock_for', price: 250 },
            requiresMembership: false,
            canUnlock: false,
        })
    })

    it('is watchable for a live stream this reader is inside', () => {
        expect(watchState(event())).toEqual({ kind: 'watchable' })
        expect(watchState(event({ price: '250', purchased: true }))).toEqual({ kind: 'watchable' })
        expect(
            watchState(event({ required_packages: ['pkg'], need_unlock_package: false })),
        ).toEqual({ kind: 'watchable' })
    })

    /**
     * A status this client has never seen is the backend adding one. No claim about time — not
     * "coming soon", which would be a guess.
     */
    it('answers unknown for an absent or unrecognised status', () => {
        expect(watchState(event({ status: null }))).toEqual({ kind: 'unknown' })
        expect(watchState(event({ status: 'ARCHIVED' }))).toEqual({ kind: 'unknown' })
    })

    /** Platform restriction still outranks an unrecognised status: it is a refusal, not a schedule. */
    it('still refuses a restricted stream whose status is unknown', () => {
        expect(
            watchState(event({ status: 'ARCHIVED', restricted_platforms: ['Website'] })),
        ).toEqual({ kind: 'platform-restricted' })
    })
})
