import { describe, expect, it } from 'vitest'
import { photoLayout } from './photo-layout'

describe('photoLayout', () => {
    it('draws one photo as the single portrait, and anything past ten the same way', () => {
        expect(photoLayout(1)).toEqual({ kind: 'single' })
        expect(photoLayout(11)).toEqual({ kind: 'single' })
    })

    /* Every photo appears exactly once, in order — a table typo would drop or repeat one. */
    it.each([2, 3, 4, 5, 6, 7, 8, 9, 10])('places each of %i photos once, in order', count => {
        const layout = photoLayout(count)
        if (layout.kind !== 'rows') throw new Error('expected rows')
        expect(layout.rows.flatMap(row => row.indices)).toEqual(
            Array.from({ length: count }, (_, i) => i),
        )
    })

    it('keeps rows of two large and never puts three large tiles in a row', () => {
        for (let count = 2; count <= 10; count++) {
            const layout = photoLayout(count)
            if (layout.kind !== 'rows') continue
            for (const row of layout.rows) {
                if (row.indices.length === 2) expect(row.tile).toBe('large')
                if (row.indices.length === 3) expect(row.tile).not.toBe('large')
            }
        }
    })

    it('matches legacy for five: two large over three small', () => {
        expect(photoLayout(5)).toEqual({
            kind: 'rows',
            rows: [
                { indices: [0, 1], tile: 'large' },
                { indices: [2, 3, 4], tile: 'small' },
            ],
        })
    })
})
