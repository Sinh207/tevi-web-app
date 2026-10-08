'use client'

import { useRequireAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { FLOAT, LIVE_BREATH, RISE, riseDelay, TWINKLE } from '@shared/lib/motion'
import { PREMIUM_SPARK_SHAPE } from '@shared/lib/premium-sparkle'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import type { TeviIconName } from '@shared/ui/icon-names'
import Image from 'next/image'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import { HOME_ART } from '../lib/illustrations'

/**
 * What the feed shows when it has nothing — legacy's `notPost`, generalised to the four cases home
 * actually has.
 *
 * ## Four states, not one
 *
 * | | when | what it offers |
 * |---|---|---|
 * | signed out | no account, so no follow list | **Sign in** |
 * | empty | signed in, following nobody who has posted | **Discover creators** → `/search` |
 * | no lives | signed in, nobody followed is on air | **Discover creators** → `/search` |
 * | error | the request failed | retry |
 *
 * Collapsing the first two is the tempting mistake: a guest told "the spaces you follow have not
 * posted anything" is told something false, and offering them *Discover creators* sends them to a
 * search page where every follow button will raise a sign-in dialog. They are different problems
 * with different exits.
 *
 * The error state is separate from both for the reason `ChannelThreadList` gives: an empty state on
 * a failed request claims there is nothing here, which is the one thing nobody knows.
 *
 * ## Two kinds of exit, because two of them are not navigations
 *
 * *Discover creators* is a `Link`: `/search` is a real page, so it is middle-clickable, openable in
 * a new tab and announced as a link. Legacy uses a `Button` with `router.push`, which is none of
 * those.
 *
 * *Sign in* is not. It raises the app's one login dialog through `useRequireAuth(() => undefined)`
 * — the same idiom `/my-wallet`'s signed-out card uses, and the reason there is no `/login`
 * navigation here: a reader who signs in from a dialog stays on the feed and watches it fill,
 * where a round trip through `/login` would land them back at `/` having lost the tab they were on.
 * The callback is empty because the dialog *is* the whole action: `useRequireAuth` runs its
 * argument only for an account that already exists, and by construction nobody here has one.
 *
 * Geometry follows `docs/DESIGN_SYSTEM.md`'s empty-state rule: a 16/600 title over a
 * `max-w-[400px]` body.
 *
 * ## Figma's *Nothing's Live… Yet*, and the three that borrow its shape
 *
 * `Live Display Improvements` draws exactly one of the four (`5126:228228`): the 154 × 183
 * illustration, 12 above a 16/600 title and a 16 Regular body in a 400 column, 20 above a 48px
 * accent button that fills that column, 48 from the top of the panel. The other three are not
 * drawn, so they take the same column, the same type and the same button — with the icon disc in
 * place of a picture nobody has made for them. Four empty states on one screen should not be four
 * layouts.
 */
/**
 * Four states, three tables — rather than three nested ternaries repeating the same four-way branch.
 *
 * A ternary chain has to be read three times to answer "what does `no-lives` look like", and the
 * fourth state was added to exactly one of the three the first time round. A table per slot makes a
 * missing entry a **type error**, because the key is the union.
 */
const ICONS: Record<HomeEmptyKind, TeviIconName> = {
    'signed-out': 'user-simple-alt',
    empty: 'comment-dots',
    'no-lives': 'film-play',
    error: 'exclamation-circle',
}

const TITLES: Record<HomeEmptyKind, string> = {
    'signed-out': 'home_feed_signed_out_title',
    empty: 'home_feed_empty_title',
    'no-lives': 'home_lives_empty_title',
    error: 'home_feed_error_title',
}

const BODIES: Record<HomeEmptyKind, string> = {
    'signed-out': 'home_feed_signed_out_body',
    empty: 'home_feed_empty_body',
    'no-lives': 'home_lives_empty_body',
    error: 'home_feed_error_body',
}

/**
 * The sparkles around the *Nothing's Live… Yet* stage, placed on its 154 × 183 art — up by the
 * notes, beside the chair, off the spotlight's edge, down at the floor. Staggered across one
 * `TWINKLE` cycle so one is always catching the light, the arrangement `ChatLeaderboard`'s empty
 * board uses. A token gold rather than the leaderboard's literals: that board only ever sits on a
 * dark wash, and this one is drawn in both themes — `--accents-warning-active` is `#ca8a04` in
 * both, which reads as gold on the light page and on the black one.
 */
const STAGE_SPARKLES: {
    id: string
    at: CSSProperties
    size: number
    ink: string
    delay: number
}[] = [
    {
        id: 'notes',
        at: { insetInlineStart: '14%', top: '4%' },
        size: 14,
        ink: 'var(--accents-warning-active)',
        delay: 0,
    },
    {
        id: 'beam',
        at: { insetInlineEnd: '-4%', top: '26%' },
        size: 12,
        ink: 'var(--accents-warning-active)',
        delay: 600,
    },
    {
        id: 'chair',
        at: { insetInlineStart: '-8%', top: '46%' },
        size: 10,
        ink: 'var(--accents-warning-active)',
        delay: 1200,
    },
    {
        id: 'floor',
        at: { insetInlineEnd: '2%', top: '80%' },
        size: 13,
        ink: 'var(--accents-warning-active)',
        delay: 1800,
    },
]

/**
 * The empty Lives tab's picture, brought to life — it is an invitation to come back, not a dead end.
 *
 * The art is one raster, so the motion is **around** it rather than inside it: the stage floats on a
 * slow loop (`FLOAT`), over a warm glow that breathes like the spotlight it draws (`LIVE_BREATH`,
 * the same heartbeat as every live mark on the screen), with four sparkles taking turns. The glow
 * also does a job in Dark: the mic and chair are drawn in near-black, and without a lit ground
 * behind them their outlines sink into the page.
 *
 * Every layer is `aria-hidden` and `pointer-events-none`, and every one stops under reduced motion —
 * the float and the breath rest, the sparkles hide — leaving exactly Figma's still frame.
 */
function StageArt() {
    return (
        <div className="relative grid flex-none place-items-center">
            <span
                aria-hidden
                className={cn(
                    'pointer-events-none absolute -inset-x-[12%] top-[10%] bottom-0 rounded-full blur-2xl',
                    /*
                     * A pale yellow in Light and a bright gold in Dark — one warning token is not
                     * both: `--accents-warning-focus` is `#a26e03` in Light, and a brown haze behind
                     * a lit stage reads as dirt, not light.
                     */
                    '[--stage-glow:var(--accents-warning-disabled)] dark:[--stage-glow:var(--accents-warning-focus)]',
                    'bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--stage-glow)_75%,transparent),transparent)]',
                    LIVE_BREATH,
                )}
            />
            <span className={cn('relative flex', FLOAT)}>
                <Image
                    src={HOME_ART.noLives.src}
                    alt=""
                    width={HOME_ART.noLives.width}
                    height={HOME_ART.noLives.height}
                />
            </span>
            {STAGE_SPARKLES.map(sparkle => (
                <span
                    key={sparkle.id}
                    aria-hidden
                    className={cn('pointer-events-none absolute', TWINKLE)}
                    style={{
                        ...sparkle.at,
                        width: sparkle.size,
                        height: sparkle.size,
                        background: sparkle.ink,
                        clipPath: PREMIUM_SPARK_SHAPE,
                        animationDelay: `${sparkle.delay}ms`,
                    }}
                />
            ))}
        </div>
    )
}

export type HomeEmptyKind = 'signed-out' | 'empty' | 'no-lives' | 'error'

export function HomeEmptyState({
    kind,
    onRetry,
    testId = 'home-empty',
}: {
    kind: HomeEmptyKind
    /** Only read on `error`. */
    onRetry?: () => void
    testId?: string
}) {
    const { t } = useTranslation()
    const requireAuth = useRequireAuth()

    const icon: TeviIconName = ICONS[kind]

    return (
        <div
            data-testid={testId}
            /*
             * The three regions arrive in turn — picture, words, way out — 60ms apart, rather than
             * as one slab. Each carries its own `RISE`; the wrapper does not, or the stagger would
             * ride on top of a second entrance.
             */
            className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center"
        >
            <div className={RISE}>
                {kind === 'no-lives' ? (
                    <StageArt />
                ) : kind === 'empty' ? (
                    /* Legacy's `NoPost` picture, at its size — decoration beside a title that says it. */
                    <Image
                        src={HOME_ART.lonely.src}
                        alt=""
                        width={HOME_ART.lonely.width}
                        height={HOME_ART.lonely.height}
                    />
                ) : (
                    <span className="flex size-12 items-center justify-center rounded-full bg-(--background-segment) text-(--icon-secondary)">
                        <Icon name={icon} size={24} />
                    </span>
                )}
            </div>
            <div className="flex w-full max-w-[400px] flex-col gap-5">
                <div className={cn('flex flex-col', RISE)} style={riseDelay(1)}>
                    <p
                        data-testid={subTestId(testId, 'title')}
                        className="type-body-strong text-(--text-title)"
                    >
                        {t(TITLES[kind])}
                    </p>
                    {/* Title ink, not subtitle grey — Figma sets both lines in `#141414`. */}
                    <p className="type-body-default text-(--text-title)">{t(BODIES[kind])}</p>
                </div>

                <div className={RISE} style={riseDelay(2)}>
                    {kind === 'error' ? (
                        <Button
                            variant="secondary"
                            size="large"
                            fullWidth
                            onClick={onRetry}
                            data-testid={subTestId(testId, 'retry')}
                        >
                            {t('common_retry')}
                        </Button>
                    ) : kind === 'signed-out' ? (
                        /*
                         * Raises the login dialog rather than navigating — see the header. It shares
                         * `trigger` with the discover button because they occupy the same slot: a test
                         * asserting "the empty state's exit was pressed" should not have to know which of
                         * the two states it is in, and `kind` is already readable from the title.
                         */
                        <Button
                            variant="accent"
                            size="large"
                            fullWidth
                            data-testid={subTestId(testId, 'trigger')}
                            onClick={requireAuth(() => undefined)}
                        >
                            {t('auth_sign_in')}
                        </Button>
                    ) : (
                        <Button
                            variant="accent"
                            size="large"
                            fullWidth
                            data-testid={subTestId(testId, 'trigger')}
                            /* The app's idiom for a "go somewhere" button — `button.tsx` derives the link
                       role from the render element rather than asking every call site to say so. */
                            render={<Link href="/search" />}
                        >
                            {t('home_feed_discover')}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    )
}
