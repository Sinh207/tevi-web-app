import { describe, expect, it } from 'vitest'
import { RESIZE_HANDLES } from './resize-handles'

/**
 * A silent-failure guard, in the spirit of `shared/i18n/resources.test.ts`'s three.
 *
 * `resizeRect` is pure and tested, and the geometry it computes is **physical**: `w` means "the left
 * edge moved". If a handle is anchored with a *logical* property instead — `insetInlineStart`, or the
 * `-start-*` utility it used to use — then in an RTL locale it renders on the right and still moves
 * the left edge. The window resizes the wrong way and walks sideways, and nothing catches it: the
 * types are fine, `pnpm lint:rtl` is fine (logical is what it wants everywhere else), and every
 * screenshot in a left-to-right locale looks perfect.
 *
 * So the invariant is stated here instead: each handle is anchored on the edges its own direction
 * names, physically.
 */
describe('resize handle anchoring', () => {
    it('covers all eight directions exactly once', () => {
        expect(RESIZE_HANDLES.map(handle => handle.direction).sort()).toEqual([
            'e',
            'n',
            'ne',
            'nw',
            's',
            'se',
            'sw',
            'w',
        ])
    })

    it.each(RESIZE_HANDLES)('anchors $direction on the physical edges it moves', handle => {
        const anchored = Object.entries(handle.style)
            .filter(([, value]) => value !== undefined)
            .map(([key]) => key)

        // `w` must set `left` and never `right`, and so on round the box.
        if (handle.direction.includes('w')) {
            expect(anchored).toContain('left')
            expect(anchored).not.toContain('right')
        }
        if (handle.direction.includes('e')) {
            expect(anchored).toContain('right')
            expect(anchored).not.toContain('left')
        }
        if (handle.direction.includes('n')) {
            expect(anchored).toContain('top')
            expect(anchored).not.toContain('bottom')
        }
        if (handle.direction.includes('s')) {
            expect(anchored).toContain('bottom')
            expect(anchored).not.toContain('top')
        }
    })

    it('uses no logical inset property anywhere', () => {
        // The failure this file exists for, stated directly: a direction-aware property here is
        // wrong even when it happens to be spelled correctly for one locale.
        const keys = RESIZE_HANDLES.flatMap(handle => Object.keys(handle.style))
        expect(keys.filter(key => /inline|Inline|block|Block|start|end/i.test(key))).toEqual([])
    })

    it('reaches outside the box, which is the half a pointer can hit', () => {
        // The window clips its own surface, so an inset-only handle is a 4px target. Every handle
        // has a negative offset on the edge it sits on — see the note in the component.
        for (const handle of RESIZE_HANDLES) {
            const offsets = Object.values(handle.style).filter(
                (value): value is number => typeof value === 'number',
            )
            expect(offsets.some(value => value < 0)).toBe(true)
        }
    })
})
