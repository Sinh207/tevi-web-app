import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `sr-only` on the wrong element extends the page, and nothing on screen says so.
 *
 * Tailwind's `sr-only` is `position:absolute; width:1px; height:1px; overflow:hidden; clip-path:
 * inset(50%)`. On a block that is exactly what it looks like: a 1px box that clips its content and
 * keeps it out of the accessibility-free zone. On an element whose size comes from its **content**,
 * `width`/`height` are only *minimums* and the box stays full size — it paints nothing (the clip-path
 * works) and still occupies layout.
 *
 * A `<table>` is the worst case, and it cost real debugging: the trend chart's hidden data table
 * (`features/analytics/components/metric-chart.tsx`) stayed 290 × 768 and, because an
 * `overflow: visible` box hands its overflow to the nearest scroll container, added **768px to the
 * document**. Three symptoms, none of which pointed here: `/dashboard-analytics` scrolled ~240px into
 * empty grey; the document became taller than the shell's flex row, so the sticky left rail stopped
 * sticking and scrolled away; and with the rail gone, the parked account drawer showed down the left
 * edge.
 *
 * The fix is always the same — put `sr-only` on a wrapping `<div>` — so this test states the rule
 * rather than trusting everyone to remember the CSS.
 *
 * Elements listed below are the ones whose used size ignores a 1px request: table boxes (the CSS
 * table algorithm sizes to content) and replaced elements (an intrinsic aspect ratio and size).
 */

const AT_RISK = [
    'table',
    'thead',
    'tbody',
    'tr',
    'td',
    'th',
    'svg',
    'img',
    'video',
    'canvas',
    'iframe',
]

function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) sourceFiles(path, out)
        else if (/\.tsx$/.test(path)) out.push(path)
    }
    return out
}

describe('sr-only', () => {
    it('is never applied to an element that sizes itself to its content', () => {
        const offenders: string[] = []
        for (const file of sourceFiles(join(process.cwd(), 'src'))) {
            const source = readFileSync(file, 'utf8')
            for (const tag of AT_RISK) {
                // `<table … className="… sr-only …"` up to the end of the opening tag. Deliberately
                // simple: the mistake is always written inline like this.
                const pattern = new RegExp(
                    `<${tag}\\b[^>]*className=(?:"[^"]*|\\{[^}]*['\`][^'\`]*)\\bsr-only\\b`,
                    's',
                )
                if (pattern.test(source)) {
                    offenders.push(`${file.replace(`${process.cwd()}/`, '')} — <${tag}>`)
                }
            }
        }
        expect(
            offenders,
            'wrap it in a `<div className="sr-only">` instead — see this file\'s note',
        ).toEqual([])
    })
})
