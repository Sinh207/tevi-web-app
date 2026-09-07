import { Inter } from 'next/font/google'
import localFont from 'next/font/local'

/** Main UI font (Latin). CJK/Thai fall back per-glyph via globals.css. */
export const inter = Inter({
    variable: '--font-inter',
    subsets: ['latin', 'latin-ext'],
    display: 'swap',
})

/**
 * Brand display font (headings / wordmark) — `font-brand` in `globals.css`.
 *
 * **One weight, and it is WOFF2.** Both of those are decisions, and both are cheap to undo wrongly:
 *
 * - `next/font/local` self-hosts whatever file it is handed and does **not** convert, so the format
 *   here is the format every visitor downloads. `font-brand` is on the splash screen, so that is
 *   every visitor. Brand's TTF was 374 KB (123 KB if the server gzips it, which is not something
 *   this repo controls); the WOFF2 `pnpm fonts` produces is **70 KB**, already compressed.
 * - Brand also ships ExtraBold (800) and Black (900). The DS type scale is **400/500/600/700** —
 *   no `.type-*` utility sets 800 or 900, and `CLAUDE.md` forbids setting `font-weight` by hand —
 *   so no conforming markup could request them. They were 711 KB nothing could download. Adding one
 *   back starts with the DS growing a weight, not with a file reappearing in `public/`.
 *
 * The `.ttf` source lives in `design-system/fonts/` and is not served, like the icon sprite's.
 * `display: 'swap'`: the wordmark is decorative, and a blocking swap period would hold the first
 * paint of the splash for a font nobody is reading yet.
 */
export const chella = localFont({
    variable: '--font-chella',
    display: 'swap',
    src: [
        { path: '../../../public/fonts/chella/Chella-Bold.woff2', weight: '700', style: 'normal' },
    ],
})
