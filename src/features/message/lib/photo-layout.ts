/**
 * How a message lays out its photos — legacy's `getLayoutConfig` (`itemMessage/image`), one entry
 * per count from 1 to 10 (the attachment sheet's limit).
 *
 * One photo is a fixed 290 × 323 portrait. More are square tiles 1px apart, in rows: **large**
 * tiles are 144px, **small** 95px, and **responsive** ones are small on a phone and large from
 * `sm` — legacy's `responsiveWidth`, which it switches at its own 600px breakpoint. Rows of two
 * are always large (two 144s fill a phone bubble); rows of three are small or responsive (three
 * 144s would not).
 *
 * Legacy draws a single photo for any count it has no entry for, i.e. more than ten — the first
 * one, silently dropping the rest. That is kept as the rule and nothing more is invented: the
 * service does not send more than ten.
 */

export type PhotoTile = 'large' | 'small' | 'responsive'

export type PhotoRow = { indices: number[]; tile: PhotoTile }

export type PhotoLayout = { kind: 'single' } | { kind: 'rows'; rows: PhotoRow[] }

const row = (tile: PhotoTile, ...indices: number[]): PhotoRow => ({ indices, tile })

const LAYOUTS: Record<number, PhotoRow[]> = {
    2: [row('large', 0, 1)],
    3: [row('responsive', 0, 1, 2)],
    4: [row('large', 0, 1), row('large', 2, 3)],
    5: [row('large', 0, 1), row('small', 2, 3, 4)],
    6: [row('responsive', 0, 1, 2), row('responsive', 3, 4, 5)],
    7: [row('large', 0, 1), row('large', 2, 3), row('small', 4, 5, 6)],
    8: [row('large', 0, 1), row('small', 2, 3, 4), row('small', 5, 6, 7)],
    9: [row('responsive', 0, 1, 2), row('responsive', 3, 4, 5), row('responsive', 6, 7, 8)],
    10: [row('large', 0, 1), row('large', 2, 3), row('small', 4, 5, 6), row('small', 7, 8, 9)],
}

export function photoLayout(count: number): PhotoLayout {
    const rows = LAYOUTS[count]
    return rows ? { kind: 'rows', rows } : { kind: 'single' }
}

/** Legacy's pixel sizes, for `next/image`'s intrinsic width and height. */
export const PHOTO_SIZE = {
    singleWidth: 290,
    singleHeight: 323,
    large: 144,
    small: 95,
} as const
