'use client'

import { PREMIUM_SPARK } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import type { CSSProperties } from 'react'
import { PREMIUM_SPARK_PAINTS, PREMIUM_SPARK_SHAPE } from '../lib/premium-surface'

/**
 * Where the mark's centre sits in this box, as a percentage of its height.
 *
 * The band puts the badge at 60-160px and the field is 320 tall, so its middle is 110/320. Every
 * particle is launched from here, which is what makes the burst *the badge's* rather than the
 * band's — and it is a percentage so the two stay together if the field's height changes.
 */
const MARK_CENTRE_TOP = '34%'

/** One sparkle: where it comes off the rim, where it gets to, how big, and how fast. */
interface Spark {
    /** The point on the mark's rim it emerges from, in px from the centre. */
    rimX: number
    rimY: number
    /** How far it travels from there, in px. Positive `y` is downwards, as CSS counts. */
    x: number
    y: number
    /** Side of the square the sparkle is clipped out of, in px. 3 to 28, weighted small. */
    size: number
    /** Index into {@link PREMIUM_SPARK_PAINTS}. */
    ink: 0 | 1 | 2
    /** Degrees, 0-90: a four-point cross repeats every quarter turn, so 90 covers every angle. */
    turn: number
    /** This one's flight time. Deliberately not shared — see the note on the table. */
    ms: number
    /** Where in that flight it starts, so the spray is continuous rather than a volley. */
    delay: number
}

/**
 * A hundred and fifty sparkles **thrown out of the mark**, drawn by a seeded generator and written
 * out as literals.
 *
 * Not `Math.random()` at render: the server and the client would each roll their own field, which is
 * a hydration mismatch — and one jsdom can never show, because a mismatch needs two renderers.
 * Writing the roll down also makes it reviewable, which matters, because it encodes four decisions:
 *
 * - **They start on the rim, not at the centre and not scattered across the band.** Each particle
 *   begins 26-52px from the mark's middle, which is *behind the badge* — the artwork is opaque and
 *   the field is `-z-10`, so a sparkle is hidden until it clears the edge. That is what reads as
 *   coming out of the icon. The previous version placed them across the whole band and drifted them
 *   a few pixels, which reads as a starfield that happens to surround a badge.
 * - **It is a fan, not a sphere.** The vertical component of every vector is scaled to 0.30 and then
 *   capped at 95px, which is where the paragraph starts under the mark; anything travelling within
 *   26px of straight up or down is thrown away, because that is the copy's own axis. The reference
 *   screenshot's burst is horizontal for the same reason its screen is.
 * - **Every particle has its own flight time** (1.5-3.6s). A field on one duration reads as a pulse
 *   however the delays are spread — everything decelerates together. This is the difference between
 *   a spray and a heartbeat, and it is why `PREMIUM_SPARK`'s own duration is overridden here.
 * - **Mostly tiny**, 3-10px with a few up to 28, which is the reference's own mix.
 *
 * Phases are dealt out by a coprime stride across 3600ms rather than in position order, so no two
 * neighbours are in step and the spray never bunches.
 */
const SPARKS: readonly Spark[] = [
    // 150 particles, 194 draws
    { rimX: -7.5, rimY: -30.6, x: -41, y: -49, size: 4, ink: 2, turn: 60, ms: 2850, delay: 0 },
    { rimX: 23.6, rimY: -30.6, x: 177, y: -69, size: 22, ink: 0, turn: 24, ms: 3050, delay: 71 },
    { rimX: -27.6, rimY: 42.8, x: -106, y: 49, size: 9, ink: 0, turn: 57, ms: 2900, delay: 142 },
    { rimX: 40.2, rimY: -31.7, x: 118, y: -28, size: 5, ink: 2, turn: 51, ms: 2500, delay: 213 },
    { rimX: 22.8, rimY: 27.8, x: 106, y: 39, size: 14, ink: 2, turn: 27, ms: 3200, delay: 284 },
    { rimX: 12.2, rimY: 37.3, x: 40, y: 36, size: 3, ink: 0, turn: 27, ms: 3350, delay: 355 },
    { rimX: 34.6, rimY: 21.8, x: 287, y: 54, size: 22, ink: 2, turn: 24, ms: 3200, delay: 426 },
    { rimX: -43.9, rimY: -14.0, x: -114, y: -11, size: 7, ink: 1, turn: 48, ms: 3350, delay: 497 },
    { rimX: 41.9, rimY: 22.0, x: 233, y: 37, size: 28, ink: 0, turn: 87, ms: 2450, delay: 568 },
    { rimX: 12.2, rimY: -43.9, x: 29, y: -32, size: 3, ink: 1, turn: 21, ms: 1800, delay: 639 },
    { rimX: 51.2, rimY: -3.2, x: 302, y: -6, size: 14, ink: 0, turn: 3, ms: 2550, delay: 710 },
    { rimX: 46.8, rimY: 17.4, x: 218, y: 24, size: 5, ink: 2, turn: 51, ms: 2750, delay: 781 },
    { rimX: -32.4, rimY: -3.6, x: -217, y: -7, size: 10, ink: 0, turn: 3, ms: 2700, delay: 852 },
    { rimX: -21.8, rimY: 42.1, x: -84, y: 49, size: 4, ink: 0, turn: 84, ms: 2850, delay: 923 },
    { rimX: -47.9, rimY: 16.9, x: -195, y: 21, size: 12, ink: 0, turn: 87, ms: 2000, delay: 994 },
    { rimX: -34.9, rimY: 2.1, x: -130, y: 2, size: 16, ink: 2, turn: 33, ms: 2200, delay: 1065 },
    { rimX: 32.1, rimY: 15.6, x: 117, y: 17, size: 8, ink: 0, turn: 24, ms: 1900, delay: 1136 },
    { rimX: -50.8, rimY: -5.1, x: -189, y: -6, size: 5, ink: 0, turn: 9, ms: 2750, delay: 1207 },
    { rimX: 42.0, rimY: -12.3, x: 164, y: -14, size: 5, ink: 1, turn: 3, ms: 2500, delay: 1278 },
    { rimX: 40.9, rimY: -16.5, x: 228, y: -28, size: 5, ink: 0, turn: 84, ms: 2750, delay: 1349 },
    { rimX: 37.7, rimY: 8.1, x: 161, y: 10, size: 22, ink: 0, turn: 0, ms: 2350, delay: 1420 },
    { rimX: 25.9, rimY: -30.7, x: 70, y: -25, size: 22, ink: 1, turn: 42, ms: 2350, delay: 1491 },
    { rimX: 41.7, rimY: 22.8, x: 296, y: 49, size: 3, ink: 0, turn: 72, ms: 3350, delay: 1562 },
    { rimX: -10.6, rimY: 48.4, x: -33, y: 45, size: 8, ink: 1, turn: 3, ms: 2350, delay: 1633 },
    {
        rimX: -25.2,
        rimY: -25.3,
        x: -196,
        y: -59,
        size: 22,
        ink: 0,
        turn: 48,
        ms: 2400,
        delay: 1704,
    },
    { rimX: -37.4, rimY: 21.7, x: -91, y: 16, size: 4, ink: 0, turn: 33, ms: 1900, delay: 1775 },
    { rimX: -45.6, rimY: -4.2, x: -185, y: -5, size: 5, ink: 2, turn: 48, ms: 2900, delay: 1846 },
    { rimX: -44.0, rimY: 25.6, x: -78, y: 14, size: 8, ink: 1, turn: 78, ms: 2900, delay: 1917 },
    { rimX: 24.6, rimY: 45.0, x: 109, y: 60, size: 7, ink: 1, turn: 87, ms: 2600, delay: 1988 },
    { rimX: 20.5, rimY: -22.0, x: 93, y: -30, size: 9, ink: 1, turn: 30, ms: 2750, delay: 2059 },
    { rimX: 40.9, rimY: 30.1, x: 122, y: 27, size: 12, ink: 1, turn: 78, ms: 2250, delay: 2130 },
    { rimX: -32.3, rimY: 23.0, x: -219, y: 47, size: 16, ink: 0, turn: 66, ms: 2950, delay: 2201 },
    { rimX: 24.7, rimY: -45.7, x: 115, y: -64, size: 7, ink: 1, turn: 21, ms: 1950, delay: 2272 },
    { rimX: 34.3, rimY: 28.4, x: 71, y: 18, size: 10, ink: 1, turn: 81, ms: 1650, delay: 2343 },
    { rimX: -25.3, rimY: 32.2, x: -180, y: 69, size: 4, ink: 1, turn: 69, ms: 1650, delay: 2414 },
    { rimX: -33.2, rimY: 31.3, x: -120, y: 34, size: 7, ink: 1, turn: 27, ms: 2750, delay: 2485 },
    { rimX: 37.0, rimY: -17.4, x: 226, y: -32, size: 4, ink: 0, turn: 54, ms: 3300, delay: 2556 },
    { rimX: -3.9, rimY: -30.8, x: -32, y: -74, size: 7, ink: 1, turn: 3, ms: 2300, delay: 2627 },
    { rimX: 48.9, rimY: 9.7, x: 260, y: 15, size: 8, ink: 1, turn: 12, ms: 2650, delay: 2698 },
    { rimX: -33.9, rimY: 1.6, x: -207, y: 3, size: 8, ink: 0, turn: 75, ms: 2700, delay: 2769 },
    { rimX: 31.0, rimY: -40.6, x: 126, y: -50, size: 10, ink: 1, turn: 39, ms: 2850, delay: 2840 },
    { rimX: -31.8, rimY: 33.0, x: -187, y: 58, size: 22, ink: 0, turn: 15, ms: 2150, delay: 2911 },
    { rimX: -42.2, rimY: 2.9, x: -271, y: 6, size: 6, ink: 0, turn: 51, ms: 1900, delay: 2982 },
    { rimX: 44.3, rimY: 8.6, x: 302, y: 17, size: 6, ink: 0, turn: 75, ms: 2850, delay: 3053 },
    { rimX: -17.1, rimY: 26.3, x: -102, y: 47, size: 7, ink: 0, turn: 69, ms: 2150, delay: 3124 },
    { rimX: -42.3, rimY: -30.2, x: -171, y: -37, size: 8, ink: 0, turn: 3, ms: 2600, delay: 3195 },
    { rimX: 8.4, rimY: -32.9, x: 33, y: -39, size: 8, ink: 0, turn: 15, ms: 2100, delay: 3266 },
    { rimX: 50.0, rimY: -3.2, x: 243, y: -5, size: 10, ink: 0, turn: 39, ms: 2150, delay: 3337 },
    { rimX: -25.3, rimY: 18.9, x: -250, y: 56, size: 14, ink: 0, turn: 78, ms: 3300, delay: 3408 },
    { rimX: -29.5, rimY: 1.1, x: -223, y: 2, size: 22, ink: 0, turn: 21, ms: 2600, delay: 3479 },
    { rimX: 33.4, rimY: 18.2, x: 166, y: 27, size: 3, ink: 0, turn: 18, ms: 2650, delay: 3550 },
    { rimX: 15.5, rimY: 33.8, x: 51, y: 33, size: 7, ink: 0, turn: 75, ms: 3050, delay: 21 },
    { rimX: -25.5, rimY: 11.6, x: -103, y: 14, size: 22, ink: 1, turn: 33, ms: 1950, delay: 92 },
    { rimX: -30.0, rimY: -25.4, x: -233, y: -59, size: 22, ink: 2, turn: 54, ms: 1600, delay: 163 },
    { rimX: -26.4, rimY: -15.6, x: -108, y: -19, size: 8, ink: 1, turn: 57, ms: 2900, delay: 234 },
    { rimX: 15.9, rimY: -33.3, x: 46, y: -29, size: 7, ink: 0, turn: 78, ms: 2000, delay: 305 },
    { rimX: -37.1, rimY: -1.0, x: -293, y: -2, size: 14, ink: 0, turn: 48, ms: 2600, delay: 376 },
    { rimX: 28.8, rimY: 2.2, x: 188, y: 4, size: 4, ink: 0, turn: 9, ms: 3200, delay: 447 },
    { rimX: 11.8, rimY: -23.8, x: 112, y: -68, size: 16, ink: 1, turn: 0, ms: 3550, delay: 518 },
    { rimX: -18.9, rimY: 43.3, x: -127, y: 87, size: 4, ink: 1, turn: 42, ms: 1700, delay: 589 },
    { rimX: -18.9, rimY: -24.8, x: -117, y: -46, size: 4, ink: 0, turn: 42, ms: 3200, delay: 660 },
    { rimX: 10.8, rimY: -25.5, x: 37, y: -26, size: 4, ink: 0, turn: 54, ms: 2050, delay: 731 },
    { rimX: 36.7, rimY: -3.9, x: 135, y: -4, size: 7, ink: 1, turn: 21, ms: 2200, delay: 802 },
    { rimX: -22.9, rimY: -12.8, x: -210, y: -35, size: 6, ink: 1, turn: 87, ms: 3300, delay: 873 },
    { rimX: 36.2, rimY: -23.0, x: 285, y: -54, size: 6, ink: 0, turn: 42, ms: 2100, delay: 944 },
    { rimX: -15.0, rimY: -37.5, x: -85, y: -64, size: 28, ink: 1, turn: 66, ms: 3100, delay: 1015 },
    {
        rimX: -34.2,
        rimY: -23.1,
        x: -216,
        y: -44,
        size: 16,
        ink: 1,
        turn: 51,
        ms: 3150,
        delay: 1086,
    },
    { rimX: 17.9, rimY: -39.8, x: 131, y: -87, size: 3, ink: 0, turn: 33, ms: 3050, delay: 1157 },
    { rimX: -26.9, rimY: -33.3, x: -123, y: -46, size: 6, ink: 1, turn: 54, ms: 2000, delay: 1228 },
    { rimX: -42.8, rimY: -22.6, x: -222, y: -35, size: 5, ink: 2, turn: 84, ms: 2250, delay: 1299 },
    { rimX: 11.7, rimY: -35.7, x: 90, y: -82, size: 5, ink: 0, turn: 9, ms: 3500, delay: 1370 },
    { rimX: 28.3, rimY: -7.8, x: 245, y: -20, size: 8, ink: 0, turn: 3, ms: 2300, delay: 1441 },
    { rimX: -5.4, rimY: -48.2, x: -26, y: -70, size: 5, ink: 0, turn: 36, ms: 3250, delay: 1512 },
    { rimX: 7.1, rimY: -47.0, x: 40, y: -78, size: 8, ink: 1, turn: 87, ms: 1900, delay: 1583 },
    { rimX: 46.1, rimY: 1.8, x: 154, y: 2, size: 14, ink: 2, turn: 87, ms: 1650, delay: 1654 },
    { rimX: 18.5, rimY: -35.6, x: 145, y: -84, size: 28, ink: 1, turn: 81, ms: 3450, delay: 1725 },
    { rimX: 26.2, rimY: 35.3, x: 150, y: 61, size: 5, ink: 0, turn: 63, ms: 2100, delay: 1796 },
    { rimX: -17.8, rimY: 29.7, x: -97, y: 49, size: 9, ink: 0, turn: 69, ms: 1800, delay: 1867 },
    { rimX: 33.6, rimY: 10.9, x: 302, y: 29, size: 7, ink: 0, turn: 45, ms: 1900, delay: 1938 },
    { rimX: -36.7, rimY: -8.4, x: -188, y: -13, size: 4, ink: 0, turn: 0, ms: 2750, delay: 2009 },
    { rimX: 37.1, rimY: -12.4, x: 318, y: -32, size: 8, ink: 2, turn: 51, ms: 2250, delay: 2080 },
    { rimX: -9.8, rimY: -47.9, x: -26, y: -39, size: 8, ink: 2, turn: 0, ms: 3500, delay: 2151 },
    { rimX: -35.1, rimY: -32.8, x: -90, y: -25, size: 6, ink: 2, turn: 27, ms: 3350, delay: 2222 },
    { rimX: -15.8, rimY: 45.6, x: -53, y: 45, size: 7, ink: 0, turn: 39, ms: 1500, delay: 2293 },
    { rimX: -17.0, rimY: -46.0, x: -70, y: -57, size: 8, ink: 2, turn: 15, ms: 2800, delay: 2364 },
    { rimX: -33.5, rimY: 31.7, x: -73, y: 21, size: 5, ink: 2, turn: 39, ms: 2150, delay: 2435 },
    { rimX: 18.4, rimY: -20.0, x: 157, y: -51, size: 5, ink: 0, turn: 9, ms: 2900, delay: 2506 },
    { rimX: 43.6, rimY: -2.5, x: 150, y: -3, size: 16, ink: 0, turn: 36, ms: 3250, delay: 2577 },
    { rimX: -38.5, rimY: 27.5, x: -151, y: 32, size: 6, ink: 0, turn: 18, ms: 2500, delay: 2648 },
    { rimX: 35.8, rimY: 32.1, x: 199, y: 54, size: 8, ink: 0, turn: 63, ms: 2900, delay: 2719 },
    { rimX: 44.5, rimY: -1.2, x: 272, y: -2, size: 12, ink: 0, turn: 66, ms: 2250, delay: 2790 },
    {
        rimX: -30.9,
        rimY: -38.6,
        x: -207,
        y: -77,
        size: 10,
        ink: 1,
        turn: 18,
        ms: 2050,
        delay: 2861,
    },
    { rimX: -38.3, rimY: -17.2, x: -293, y: -39, size: 6, ink: 0, turn: 78, ms: 2450, delay: 2932 },
    { rimX: 45.9, rimY: 8.4, x: 181, y: 10, size: 5, ink: 2, turn: 36, ms: 2400, delay: 3003 },
    { rimX: 16.0, rimY: -48.7, x: 29, y: -27, size: 22, ink: 2, turn: 9, ms: 3500, delay: 3074 },
    {
        rimX: -22.6,
        rimY: -19.5,
        x: -252,
        y: -65,
        size: 22,
        ink: 1,
        turn: 69,
        ms: 1950,
        delay: 3145,
    },
    { rimX: -26.4, rimY: -10.1, x: -101, y: -12, size: 5, ink: 0, turn: 36, ms: 2400, delay: 3216 },
    { rimX: 27.2, rimY: -40.7, x: 189, y: -85, size: 22, ink: 0, turn: 60, ms: 3000, delay: 3287 },
    { rimX: 23.9, rimY: 22.1, x: 79, y: 22, size: 6, ink: 1, turn: 3, ms: 2450, delay: 3358 },
    { rimX: -11.8, rimY: -43.6, x: -62, y: -69, size: 10, ink: 0, turn: 75, ms: 1700, delay: 3429 },
    { rimX: 25.5, rimY: -35.2, x: 157, y: -65, size: 3, ink: 0, turn: 87, ms: 3200, delay: 3500 },
    { rimX: -25.0, rimY: 36.4, x: -103, y: 45, size: 6, ink: 0, turn: 21, ms: 3450, delay: 3571 },
    { rimX: 31.6, rimY: -19.9, x: 144, y: -27, size: 6, ink: 0, turn: 57, ms: 1650, delay: 42 },
    { rimX: 24.2, rimY: 43.7, x: 163, y: 88, size: 5, ink: 2, turn: 39, ms: 3450, delay: 113 },
    { rimX: 21.1, rimY: -32.0, x: 107, y: -49, size: 5, ink: 0, turn: 33, ms: 1600, delay: 184 },
    { rimX: -43.6, rimY: -16.0, x: -191, y: -21, size: 5, ink: 1, turn: 27, ms: 2100, delay: 255 },
    { rimX: -13.9, rimY: -36.0, x: -38, y: -30, size: 9, ink: 0, turn: 81, ms: 2450, delay: 326 },
    { rimX: -22.3, rimY: 28.4, x: -194, y: 74, size: 22, ink: 0, turn: 0, ms: 3050, delay: 397 },
    { rimX: -6.3, rimY: -35.7, x: -46, y: -78, size: 3, ink: 0, turn: 57, ms: 3350, delay: 468 },
    { rimX: 17.4, rimY: 28.8, x: 130, y: 65, size: 10, ink: 0, turn: 51, ms: 1950, delay: 539 },
    { rimX: 35.3, rimY: 10.2, x: 214, y: 18, size: 7, ink: 0, turn: 72, ms: 1800, delay: 610 },
    { rimX: -28.8, rimY: 8.8, x: -230, y: 21, size: 12, ink: 0, turn: 63, ms: 3050, delay: 681 },
    { rimX: 17.3, rimY: 21.1, x: 107, y: 39, size: 4, ink: 1, turn: 21, ms: 3200, delay: 752 },
    { rimX: -10.6, rimY: -30.4, x: -84, y: -72, size: 6, ink: 0, turn: 36, ms: 1500, delay: 823 },
    { rimX: 12.0, rimY: -38.9, x: 83, y: -81, size: 9, ink: 0, turn: 3, ms: 2450, delay: 894 },
    { rimX: -34.5, rimY: 7.7, x: -316, y: 21, size: 12, ink: 0, turn: 57, ms: 2700, delay: 965 },
    { rimX: -24.2, rimY: 40.2, x: -169, y: 84, size: 22, ink: 1, turn: 6, ms: 3100, delay: 1036 },
    { rimX: -42.6, rimY: -26.0, x: -134, y: -25, size: 4, ink: 0, turn: 45, ms: 3450, delay: 1107 },
    { rimX: -44.9, rimY: 25.4, x: -190, y: 32, size: 8, ink: 0, turn: 84, ms: 1550, delay: 1178 },
    { rimX: 36.3, rimY: 28.4, x: 168, y: 39, size: 22, ink: 2, turn: 3, ms: 2100, delay: 1249 },
    { rimX: 18.6, rimY: 41.0, x: 89, y: 59, size: 5, ink: 0, turn: 30, ms: 1550, delay: 1320 },
    { rimX: 35.7, rimY: 2.5, x: 160, y: 3, size: 6, ink: 0, turn: 12, ms: 1850, delay: 1391 },
    { rimX: -30.3, rimY: -9.3, x: -110, y: -10, size: 4, ink: 1, turn: 36, ms: 3150, delay: 1462 },
    { rimX: -26.5, rimY: -39.6, x: -182, y: -82, size: 8, ink: 1, turn: 12, ms: 2450, delay: 1533 },
    { rimX: 11.1, rimY: -47.8, x: 52, y: -68, size: 3, ink: 0, turn: 66, ms: 3300, delay: 1604 },
    { rimX: -30.7, rimY: -32.5, x: -205, y: -65, size: 5, ink: 2, turn: 18, ms: 3200, delay: 1675 },
    { rimX: -49.6, rimY: -6.4, x: -131, y: -5, size: 22, ink: 2, turn: 87, ms: 1550, delay: 1746 },
    { rimX: 22.7, rimY: 21.2, x: 127, y: 36, size: 5, ink: 1, turn: 3, ms: 3050, delay: 1817 },
    { rimX: 15.6, rimY: -29.2, x: 105, y: -59, size: 14, ink: 2, turn: 33, ms: 2150, delay: 1888 },
    {
        rimX: -22.0,
        rimY: -35.4,
        x: -100,
        y: -48,
        size: 10,
        ink: 0,
        turn: 36,
        ms: 3250,
        delay: 1959,
    },
    { rimX: -23.4, rimY: 23.2, x: -177, y: 53, size: 4, ink: 0, turn: 66, ms: 3100, delay: 2030 },
    { rimX: -19.6, rimY: -47.5, x: -124, y: -90, size: 8, ink: 1, turn: 24, ms: 1750, delay: 2101 },
    { rimX: -44.7, rimY: -3.0, x: -250, y: -5, size: 10, ink: 1, turn: 18, ms: 2400, delay: 2172 },
    { rimX: -23.4, rimY: -43.2, x: -88, y: -49, size: 22, ink: 1, turn: 57, ms: 2300, delay: 2243 },
    { rimX: 9.4, rimY: 30.3, x: 31, y: 30, size: 16, ink: 0, turn: 84, ms: 2800, delay: 2314 },
    { rimX: -34.7, rimY: 11.0, x: -280, y: 27, size: 28, ink: 0, turn: 39, ms: 2250, delay: 2385 },
    { rimX: -46.5, rimY: -12.7, x: -322, y: -26, size: 8, ink: 2, turn: 6, ms: 3550, delay: 2456 },
    { rimX: 38.2, rimY: 4.3, x: 315, y: 11, size: 22, ink: 0, turn: 84, ms: 3600, delay: 2527 },
    { rimX: -33.1, rimY: 29.4, x: -194, y: 52, size: 4, ink: 1, turn: 6, ms: 2600, delay: 2598 },
    { rimX: -20.9, rimY: 18.8, x: -232, y: 63, size: 7, ink: 0, turn: 36, ms: 1800, delay: 2669 },
    { rimX: -17.3, rimY: -40.8, x: -92, y: -65, size: 4, ink: 2, turn: 75, ms: 2750, delay: 2740 },
    { rimX: -38.1, rimY: 4.8, x: -259, y: 10, size: 9, ink: 0, turn: 15, ms: 1750, delay: 2811 },
    { rimX: -31.4, rimY: 17.1, x: -151, y: 25, size: 9, ink: 0, turn: 54, ms: 1500, delay: 2882 },
    { rimX: -41.7, rimY: -16.1, x: -285, y: -33, size: 4, ink: 1, turn: 27, ms: 2600, delay: 2953 },
    { rimX: -26.4, rimY: -16.0, x: -272, y: -49, size: 3, ink: 0, turn: 63, ms: 2350, delay: 3024 },
    { rimX: -16.2, rimY: 36.1, x: -103, y: 69, size: 9, ink: 0, turn: 36, ms: 1500, delay: 3095 },
    { rimX: 31.9, rimY: -22.1, x: 208, y: -43, size: 4, ink: 0, turn: 69, ms: 3450, delay: 3166 },
    { rimX: -45.7, rimY: 23.0, x: -119, y: 18, size: 28, ink: 0, turn: 63, ms: 3350, delay: 3237 },
    { rimX: -34.0, rimY: 8.7, x: -172, y: 13, size: 8, ink: 0, turn: 87, ms: 2800, delay: 3308 },
    { rimX: 27.5, rimY: -2.6, x: 97, y: -3, size: 28, ink: 0, turn: 48, ms: 1950, delay: 3379 },
]

/**
 * The sparkles coming off the Premium mark.
 *
 * ## Three versions, and the reference rejected the first two
 *
 * Six gold stars on the badge's rim, flying outward — too few and the wrong colour. Then a wide
 * static field of violet sparkles across the band — the right colour, and it read as a starfield
 * rather than as something the badge was doing. This one launches everything from the mark's own rim
 * with its own speed, which is the "phun ra" the reference actually shows.
 *
 * ## The particle is a clipped `<span>`, not an `<Icon>`
 *
 * `PREMIUM_SPARK_SHAPE` carries the reasoning: the design system has no single four-point sparkle
 * (`sparkles` is a cluster of three, `ai-sparkle` a lettered badge), and a `clip-path` also goes
 * below 16px — the smallest `IconSize` — where most of these live.
 *
 * ## Behind the copy, and it says nothing
 *
 * `-z-10` inside the hero's `isolate`, exactly as the member's confetti texture is layered, so the
 * particles pass behind the badge and the heading rather than over them. That is load-bearing twice:
 * it is what hides each sparkle until it clears the artwork, and it is what keeps a hundred and
 * fifty moving shapes from ever competing with a word. `aria-hidden` and `pointer-events-none` in
 * full — otherwise this is a hundred and fifty announcements.
 *
 * Under reduced motion the field is **absent** rather than frozen: the base state is `opacity-0` and
 * the keyframe is what raises it.
 */
export function PremiumSparkField() {
    return (
        <span
            aria-hidden
            /*
             * `top-0 h-[320px]`: the band is taller than the field on purpose. The burst lives in the
             * dark top of the ramp and around the title, and stops before the plan cards — sparkles
             * behind three prices would be sparkles behind three prices.
             *
             * `overflow-clip` because the longest vectors reach 340px, which is past the column's
             * edge on a phone; they leave rather than widening anything. **Clip and not hidden** —
             * hidden makes the box a scroll container, which is how a rounded panel elsewhere in this
             * app silently broke a `sticky` child.
             */
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[320px] overflow-clip"
        >
            {SPARKS.map(spark => (
                <span
                    key={`${spark.rimX},${spark.rimY},${spark.x}`}
                    /*
                     * `opacity-0` is the base state and the keyframe raises it, which is what makes
                     * `motion-reduce:animate-none` (inside `PREMIUM_SPARK`) leave no frozen field.
                     */
                    className={cn(
                        'absolute opacity-0',
                        PREMIUM_SPARK_PAINTS[spark.ink],
                        PREMIUM_SPARK,
                    )}
                    style={
                        {
                            /*
                             * Every particle is pinned to the mark's centre and pushed onto the rim by
                             * a **margin**, because `tevi-premium-spark` animates the `translate`
                             * property: a base `translate` for the offset would be the same property,
                             * and the keyframe would overwrite it — every sparkle would launch from
                             * the centre of the band instead of from the badge's edge.
                             *
                             * `left` and not the logical `start`: a burst has no reading order, and
                             * mirroring it under `dir="rtl"` would only swap two sides of a
                             * symmetrical fan. The travel is a physical `translate` anyway.
                             */
                            left: '50%',
                            top: MARK_CENTRE_TOP,
                            marginLeft: spark.rimX - spark.size / 2,
                            marginTop: spark.rimY - spark.size / 2,
                            width: spark.size,
                            height: spark.size,
                            clipPath: PREMIUM_SPARK_SHAPE,
                            rotate: `${spark.turn}deg`,
                            animationDuration: `${spark.ms}ms`,
                            animationDelay: `${spark.delay}ms`,
                            '--spark-x': `${spark.x}px`,
                            '--spark-y': `${spark.y}px`,
                        } as CSSProperties
                    }
                />
            ))}
        </span>
    )
}
