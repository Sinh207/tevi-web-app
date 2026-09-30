import { describe, expect, it } from 'vitest'
import { fitWithin, PHOTO_MAX, pickPhotos } from './photo-files'

const file = (type: string, name = 'a') => new File(['x'], name, { type })

describe('pickPhotos', () => {
    it('takes photos up to the cap and says so when it stops', () => {
        const picked = pickPhotos(PHOTO_MAX - 2, [
            file('image/jpeg'),
            file('image/png'),
            file('image/webp'),
        ])
        expect(picked.accepted).toHaveLength(2)
        expect(picked.error).toBe('count')
    })

    it('leaves out anything that is not a photo it can show, and names that first', () => {
        const picked = pickPhotos(PHOTO_MAX - 1, [
            file('application/pdf'),
            file('image/heic'),
            file('image/jpeg'),
            file('image/jpeg'),
        ])
        expect(picked.accepted.map(item => item.type)).toEqual(['image/jpeg'])
        expect(picked.error).toBe('type')
    })

    it('takes nothing once the message is full', () => {
        expect(pickPhotos(PHOTO_MAX, [file('image/jpeg')])).toEqual({
            accepted: [],
            error: 'count',
        })
    })
})

describe('fitWithin', () => {
    it('brings the long edge down to the limit and keeps the proportions', () => {
        expect(fitWithin(4000, 3000)).toEqual({ width: 1920, height: 1440 })
        expect(fitWithin(1000, 3840)).toEqual({ width: 500, height: 1920 })
    })

    it('never scales a small photo up', () => {
        expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
    })
})
