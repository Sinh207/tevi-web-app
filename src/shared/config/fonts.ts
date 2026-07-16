import { Inter } from 'next/font/google'
import localFont from 'next/font/local'

/** Main UI font (Latin). CJK/Thai fall back per-glyph via globals.css. */
export const inter = Inter({
    variable: '--font-inter',
    subsets: ['latin', 'latin-ext'],
    display: 'swap',
})

/** Brand display font (headings / wordmark). */
export const chella = localFont({
    variable: '--font-chella',
    display: 'swap',
    src: [
        { path: '../../../public/fonts/chella/Chella-Bold.ttf', weight: '700', style: 'normal' },
        {
            path: '../../../public/fonts/chella/Chella-ExtraBold.ttf',
            weight: '800',
            style: 'normal',
        },
        { path: '../../../public/fonts/chella/Chella-Black.ttf', weight: '900', style: 'normal' },
    ],
})
