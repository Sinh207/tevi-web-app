import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as motion from './motion'

/**
 * The two things about this file that fail **silently**, and nothing else.
 *
 * Every constant here is a Tailwind arbitrary animation — `animate-[<name>_<duration>_…]`. Tailwind
 * emits that utility whether or not the keyframe exists, so a `@keyframes` renamed or dropped in
 * `globals.css` leaves `getComputedStyle(el).animationName` reading back the name you wrote and the
 * element simply never moving. It looks like a wrong keyframe rather than a missing one, and no test
 * that renders a component would catch it either — jsdom has no animations at all.
 *
 * So the test reads the real stylesheet. It is the one assertion that can only be made across the
 * two files.
 *
 * The second is the reduced-motion pairing. `docs/DEFINITION_OF_DONE.md` requires it, and forgetting
 * it is invisible to anyone not running the setting — which is everyone, most of the time.
 */
const CSS = readFileSync(join(import.meta.dirname, '../../app/globals.css'), 'utf8')

/**
 * Every exported animation class, by the constant's own name.
 *
 * A `flatMap` and not a `filter` with a type predicate: `Object.entries` of a module gives a union
 * of every literal it exports, and a predicate narrowing that to `[string, string]` is not
 * assignable to its own parameter — `tsc` rejects it where `vitest` would not have noticed.
 */
const ANIMATIONS: [string, string][] = Object.entries(motion).flatMap(([name, value]) =>
    typeof value === 'string' && value.includes('animate-[')
        ? [[name, value] as [string, string]]
        : [],
)

/** `animate-[tevi-rise_240ms_…]` → `tevi-rise`, including the `motion-reduce:` variants. */
function keyframeNames(value: string): string[] {
    return [...value.matchAll(/animate-\[([a-z-]+)_/g)].map(m => m[1])
}

describe('motion constants', () => {
    /**
     * **Every `animate-[…]` in `src/`, not only the ones routed through this file.**
     *
     * `motion.ts` is where a *shared* animation belongs, and six keyframes are still applied
     * straight from the component that owns them (the splash, the loader, the message skeleton, the
     * collapsing row). Asserting they all had a constant here would be asserting a refactor nobody
     * asked for; asserting they all name a **real keyframe** is the claim that matters, and it is
     * the same silent failure whichever file the utility is written in.
     */
    it('every animate-[…] in src names a keyframe that exists', () => {
        const files = execSync('grep -rlo "animate-\\[tevi-" src --include=*.ts --include=*.tsx', {
            encoding: 'utf8',
        })
            .trim()
            .split('\n')
        const used = new Set(
            files.flatMap(file => keyframeNames(readFileSync(join(process.cwd(), file), 'utf8'))),
        )
        expect(used.size).toBeGreaterThan(6)
        expect([...used].filter(name => !CSS.includes(`@keyframes ${name} {`))).toEqual([])
    })

    it.each(ANIMATIONS)('%s names a keyframe that exists in globals.css', (_name, value) => {
        for (const keyframe of keyframeNames(value)) {
            expect(CSS).toContain(`@keyframes ${keyframe} {`)
        }
    })

    it.each(ANIMATIONS)('%s says what reduced motion does', (_name, value) => {
        expect(value).toMatch(/motion-reduce:animate-/)
    })

    /**
     * `STAR_FLOAT` is the deliberate exception and the reason this is asserted rather than left to
     * the doc comment: it is an **exit** whose element unmounts on `animationend`, so
     * `animate-none` would leave the flash on screen forever. It collapses the duration instead.
     * Every other animation is an entrance or a loop, where removing it is correct.
     */
    it('only STAR_FLOAT keeps an animation under reduced motion', () => {
        const collapsing = ANIMATIONS.filter(
            ([, value]) => !value.includes('motion-reduce:animate-none'),
        ).map(([name]) => name)
        expect(collapsing).toEqual(['STAR_FLOAT'])
    })
})

describe('premium animations', () => {
    /**
     * The mark's stars carry their own direction, so the keyframe must end at the two custom
     * properties `PremiumMark` sets — not at a fixed offset. Written down here because the failure
     * is a ring of stars that all fly the same way, which reads as a design choice.
     */
    it('tevi-premium-spark travels to the caller own vars', () => {
        expect(CSS).toMatch(
            /@keyframes tevi-premium-spark \{[\s\S]*?var\(--spark-x\) var\(--spark-y\)/,
        )
    })

    /**
     * **The axis has to be stated at both ends**, and this is the assertion that would have caught
     * a bug that shipped looking correct.
     *
     * `to { rotate: y 360deg }` alone interpolates from the element's `rotate: none`, which carries
     * no axis — so Chrome resolves the pair as a **2D** rotation and the badge spins flat, which is
     * the exact effect this was changed away from. Measured at the time: `getComputedStyle` read
     * `rotate: 45deg` with the axis gone, and the painted box was 141px on a 100px badge (100·√2,
     * the bounding box of a flat 45° turn) where a real `rotateY(45°)` measures 71.
     *
     * Nothing throws, no CSS is invalid, and a screenshot at the wrong phase looks plausible. So the
     * `from` frame is pinned here.
     */
    it('tevi-premium-spin turns about the vertical axis at both ends', () => {
        const block = CSS.match(/@keyframes tevi-premium-spin \{[\s\S]*?\n\}/)?.[0] ?? ''
        expect(block).toContain('rotate: y 0deg')
        expect(block).toContain('rotate: y 360deg')
    })

    /**
     * Most of the sheen's cycle is the pause, and it is written into the keyframe rather than into a
     * delay — a delay only postpones the first pass. If the hold frames go, the glare runs
     * continuously over three prices somebody is trying to compare.
     */
    it('tevi-premium-sheen rests for most of its cycle', () => {
        const block = CSS.match(/@keyframes tevi-premium-sheen \{[\s\S]*?\n\}/)?.[0] ?? ''
        expect(block).toContain('36%')
        expect(block).toContain('100%')
        // The last two stops are the same frame: the pass is over well before the cycle is.
        expect(block.match(/translate: 100% 0;/g)).toHaveLength(2)
    })
})
