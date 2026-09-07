import { PREMIUM_SPARK } from '@shared/lib/motion'
import { PREMIUM_BADGE_SPARK_PAINTS, PREMIUM_SPARK_SHAPE } from '@shared/lib/premium-sparkle'
import { cn } from '@shared/lib/utils'
import { AppBarBadge } from '@shared/ui/app-bar'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'
import type { CSSProperties } from 'react'

/**
 * The premium badge — the DS `App Bar/Badge` art board with the sprite's `premium` glyph in it.
 *
 * ## Why this exists rather than the two lines it replaces
 *
 * `<AppBarBadge><Icon name="premium" weight="filled" /></AppBarBadge>` was written out at both
 * call sites — the channel header's name row and the top bar's premium button — so the badge had
 * two definitions of itself and no single place to change. It is one thing in the product, so it
 * is one component; `size` is the part that legitimately differs (18 beside a display name, 22 in
 * the bar's button).
 *
 * That seam is the point: the badge art is due to be replaced by an animated JSON asset, and this
 * is the one file that has to change when it is.
 *
 * ## Two shapes, and `href` is what picks between them
 *
 * Legacy's `BadgePremium` is a **control**: it renders an image with an `onClick` that pushes
 * `/premium`, everywhere a crown appears next to somebody's name — posts, comments, DMs, and the
 * channel header. That is an entry point into the offer, and this repo had lost it: the badge was
 * decorative at every call site.
 *
 * It is one prop rather than a second component because the badge is one thing, and because two of
 * the three call sites **must not** be links. The top bar's badge already sits inside an
 * `AppBarButton` pointing at `/premium` — an `<a>` inside an `<a>` is invalid and behaves
 * differently in every browser. The drawer's profile card hangs its crown off the avatar inside an
 * `aria-hidden` wrapper, over a card that is itself one stretched link to `/my-space`. Both keep
 * the plain badge, and the type below is what makes that a decision rather than an oversight.
 *
 * ## The sparks scale themselves, because the art box does
 *
 * `AppBarBadge` draws its children inside a **24-unit box** scaled by `size / 24`, which is how one
 * 24px glyph serves 16, 18, 22 and 48. The burst is laid out in that same box — distances and
 * particle sizes in art units, not pixels — so it scales with the badge for free and there is one
 * layout to reason about rather than four. At 18px a spark travelling 20 units covers 15 real
 * pixels; at 48 it covers 40, which is the right relationship and not one anybody has to maintain.
 *
 * Twelve of them, against a hundred and fifty on `/premium`'s hero. The hero's mark is 100px on an
 * empty band; this one is 18px beside somebody's name, and the same density there is not
 * enthusiasm, it is a rendering fault.
 *
 * ## `shared/` does not know where `/premium` is, and must not
 *
 * The path is `features/premium`'s (`PREMIUM_PATH` in its import-free `routes.ts`) and `shared/`
 * may not import a feature. So the caller passes the address: the component owns *that a crown can
 * be a link and how that link behaves*, and the feature owns *where it goes*.
 */
/** One spark, in the badge art's own 24-unit box: where it starts, where it gets to, how fast. */
interface BadgeSpark {
    rimX: number
    rimY: number
    x: number
    y: number
    size: number
    /** Index into {@link PREMIUM_BADGE_SPARK_PAINTS}. */
    ink: 0 | 1 | 2 | 3
    turn: number
    ms: number
    delay: number
}

/**
 * The burst, seeded once and written out — never rolled at render, which would differ between the
 * server's HTML and the client's and is a hydration mismatch jsdom can never show.
 *
 * Every spark starts on the crown's own rim (6.5-9.5 units from the centre, so **behind** the art at
 * the moment it appears) and travels outward along the same bearing. That is what reads as coming
 * out of the badge rather than floating near it. Durations are 1.6-3.2s and deliberately all
 * different: one shared duration makes twelve particles decelerate together, which is a pulse, not a
 * spray.
 */
const SPARKS: readonly BadgeSpark[] = [
    { rimX: 8.8, rimY: 0.8, x: 21.7, y: 1.9, size: 7, ink: 0, turn: 6, ms: 3100, delay: 0 },
    { rimX: -4.5, rimY: 5.6, x: -12.9, y: 15.8, size: 9, ink: 1, turn: 60, ms: 2100, delay: 1866 },
    { rimX: -0.3, rimY: 7.8, x: -0.4, y: 12.1, size: 8, ink: 2, turn: 84, ms: 2400, delay: 533 },
    { rimX: 2.4, rimY: -8.1, x: 4.2, y: -14.3, size: 7, ink: 3, turn: 84, ms: 1900, delay: 2400 },
    { rimX: -0.5, rimY: -8.4, x: -1.0, y: -18.9, size: 7, ink: 0, turn: 30, ms: 2800, delay: 1066 },
    { rimX: -7.6, rimY: 4.0, x: -11.1, y: 5.8, size: 8, ink: 1, turn: 24, ms: 3000, delay: 2933 },
    {
        rimX: -9.1,
        rimY: -2.6,
        x: -13.5,
        y: -3.8,
        size: 10,
        ink: 2,
        turn: 12,
        ms: 1600,
        delay: 1600,
    },
    { rimX: -4.2, rimY: -6.7, x: -6.4, y: -10.2, size: 12, ink: 3, turn: 12, ms: 3100, delay: 266 },
    { rimX: 3.1, rimY: 6.9, x: 6.2, y: 13.5, size: 8, ink: 0, turn: 54, ms: 1900, delay: 2133 },
    { rimX: 7.2, rimY: 4.1, x: 15.5, y: 8.8, size: 9, ink: 1, turn: 78, ms: 2600, delay: 800 },
    { rimX: 8.8, rimY: -4.5, x: 19.3, y: -9.9, size: 7, ink: 2, turn: 0, ms: 2500, delay: 2666 },
    {
        rimX: -7.2,
        rimY: -6.8,
        x: -11.1,
        y: -10.6,
        size: 9,
        ink: 3,
        turn: 54,
        ms: 2500,
        delay: 1333,
    },
]

type PremiumBadgeProps = {
    /** 18 beside a 20px display name, 22 in the top bar's button. */
    size?: number
    /**
     * Throw sparkles off the crown. On by default — it is what a Premium mark does in this product.
     *
     * ⚠ **The top bar's badge is the one to watch.** It is a persistent entry point rendered on every
     * page for every visitor, so its twelve loops run for the whole session rather than for the life
     * of one screen. Nothing clips it (checked) and twelve opacity/transform animations on a 22px
     * button is small, but `LIVE_BREATH`'s rule applies — a loop competes with the content for as
     * long as the page is open. This is the switch if that ever reads as too much; the channel row
     * and the drawer card are per-screen and not the same question.
     */
    sparkle?: boolean
    className?: string
    /**
     * Forwarded to whichever element is outermost — the link, or the badge itself.
     *
     * `shared/` **receives** a testid scope and never authors one (`docs/TEST_IDS.md`), and the link
     * variant is the outer element, so a caller has no other way to reach it. Same category as
     * `DialogContent` forwarding one to its overlay.
     */
    'data-testid'?: string
} & (
    | {
          /** Where the crown goes when pressed — `PREMIUM_PATH`, from `@features/premium/routes`. */
          href: string
          /**
           * Required **when it is a link**: a link with no accessible name is announced as its URL,
           * and this one has no text of its own. The plain badge may go unlabelled because its host
           * (a button, a name row) already carries the name.
           */
          label: string
      }
    | { href?: undefined; label?: string }
)

export function PremiumBadge({
    size = 18,
    label,
    className,
    sparkle = true,
    'data-testid': testId,
    ...props
}: PremiumBadgeProps) {
    const badge = (
        <AppBarBadge
            size={size}
            className={props.href ? undefined : className}
            data-testid={props.href ? undefined : testId}
            /*
             * Only the plain badge names itself. As a link, the name belongs to the `<a>` — labelling
             * both makes a screen reader announce the crown twice inside one stop.
             */
            role={!props.href && label ? 'img' : undefined}
            aria-label={props.href ? undefined : label}
            aria-hidden={props.href ? true : undefined}
        >
            <Icon name="premium" weight="filled" size={24} />
            {sparkle && <SparkBurst />}
        </AppBarBadge>
    )

    if (!props.href) return badge

    return (
        <Link
            href={props.href}
            aria-label={label}
            data-testid={testId}
            /*
             * **The tap target is bigger than the art.** The badge is 18px beside a display name and
             * nothing in that row can grow without pushing the name around, so the target is an
             * `after:` pseudo-element that spills 6px on every side — 30px of touchable area out of
             * an 18px box, with the layout untouched. Its neighbours in that row (the verified tick,
             * the lock) are not interactive, so there is nothing for it to steal a press from.
             */
            className={cn(
                'relative inline-flex flex-none rounded-full',
                'after:absolute after:-inset-1.5 after:content-[""]',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                className,
            )}
        >
            {badge}
        </Link>
    )
}

/**
 * The sparks themselves — twelve clipped `<span>`s inside the badge's own art box.
 *
 * A `clip-path` rather than a sprite glyph, for the reason `PREMIUM_SPARK_SHAPE` gives: the design
 * system has no single four-point sparkle, and these are 2.5-6 art units — under two pixels at the
 * smallest badge, where a glyph is a smudge and `IconSize` does not go anyway.
 *
 * `aria-hidden` and `pointer-events-none` in full. The badge may be a **link**, and twelve moving
 * children of a link are twelve things that can swallow the press or be announced; neither is
 * wanted. The link's own target is its `after:` pseudo-element, which sits above these.
 *
 * Under reduced motion the burst is **absent** rather than frozen: the base state is `opacity-0` and
 * `PREMIUM_SPARK`'s `motion-reduce:animate-none` leaves it there. Twelve sparkles stopped mid-flight
 * around somebody's name is not a calmer version of this, it is a worse picture.
 */
function SparkBurst() {
    return (
        <span aria-hidden className="pointer-events-none absolute inset-0">
            {SPARKS.map(spark => (
                <span
                    key={`${spark.rimX},${spark.rimY}`}
                    className={cn(
                        'absolute opacity-0',
                        PREMIUM_BADGE_SPARK_PAINTS[spark.ink],
                        PREMIUM_SPARK,
                    )}
                    style={
                        {
                            /*
                             * The art box is 24 units square, so its centre is 12/12 and every number
                             * here is in those units — the enclosing scale turns them into pixels.
                             * The rim offset is a **margin**, because the keyframe animates
                             * `translate`: a base translate for the same job would be overwritten and
                             * every spark would launch from the corner.
                             */
                            left: 12,
                            top: 12,
                            marginLeft: spark.rimX - spark.size / 2,
                            marginTop: spark.rimY - spark.size / 2,
                            width: spark.size,
                            height: spark.size,
                            clipPath: PREMIUM_SPARK_SHAPE,
                            /*
                             * **Where the growth starts, and it is the badge's whole visibility
                             * problem.** `tevi-premium-spark` climbs to full size across the flight
                             * from a default 0.15 — right for a 100px mark, and a sub-pixel speck on
                             * an 18px one: measured at 1.5px while nominally 4. At 0.55 a spark is
                             * already over half size the moment it appears, which is what makes it
                             * visible at all at this scale.
                             */
                            '--spark-scale-from': 0.55,
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
