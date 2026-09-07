'use client'

import { StarChangeFlash, useBalanceDisplay } from '@features/balance'
import { GET_STAR_PATH } from '@features/payment/routes'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { useTranslation } from '@shared/i18n/use-translation'
import { AppBarStarIcon } from '@shared/ui/app-bar'
import Link from 'next/link'
import { useAvatarSource } from '../../hooks/use-avatar-source'
import { GetAppButton } from './get-app-button'

/**
 * The pill at the head of the end rail — Star balance · Get App · avatar, on one white
 * capsule. Legacy: `trending/navBar/index.js`.
 *
 * ## The figure is `—` before it is known, not `0`
 *
 * `useBalanceDisplay()` already makes that call for the whole shell, which is why this file
 * does no formatting of its own. Legacy renders `balanceTVSDisplay`, which is
 * `formatNumber(0)` until the first response lands — so a creator holding 40,000 Star is told
 * they have none, on every cold load, on the most prominent figure in the chrome.
 *
 * ## The Star figure flashes when it moves
 *
 * `StarChangeFlash` floats `-120 ★` (or `+500 ★`) off the balance, the way legacy's
 * `starSpendAnimation` does. It is driven by the realtime `balance_change` frame, which is the only
 * place the *size* of a change can be known — by the time the refetched figure lands the old one is
 * gone.
 *
 * It is wrapped **with the balance link, not with the pill**. The flash centres itself in its
 * positioning context, so a `relative` pill drops it under the middle of the whole capsule — which is
 * Get App, not the figure that moved.
 *
 * Three things legacy gets wrong here and this does not: its animation runs 4s while the state that
 * mounts it clears at 2s, so half has never played; it has no `key`, so a second spend inside that
 * window does not restart it; and a **top-up is silent**, because the delta is negative for a credit
 * and its guard drops it. See `StarChangeFlash`.
 *
 * ## `/get-star` — where the comp always sent it
 *
 * It pointed at `/my-star` while the purchase screen did not exist, on the argument that the
 * destination should match what the control *shows*. That was a stand-in, and it is no longer
 * needed: this pill carries no `+` of its own, so the whole capsule is the one purchase
 * affordance the rail has, and sending it to the balance it is already displaying makes the
 * press a no-op in meaning. The balance's own screen stays one tap away in the account drawer.
 *
 * ## The avatar goes to `/my-space` for everyone
 *
 * Legacy forks: signed in it links to `/@{slug}`, signed out it is a person glyph that opens
 * the login dialog. `/my-space` needs no slug and renders its own prompt for a visitor with
 * no account, so one link covers both — which is exactly what `AppNavbar` already does with
 * the same avatar, and two pieces of chrome showing the same face should not disagree about
 * where it goes.
 */
export function EndRailPill() {
    const { t } = useTranslation()
    const { star, isKnown } = useBalanceDisplay()
    const avatar = useAvatarSource()

    return (
        <div
            data-slot="end-rail-pill"
            className={[
                'flex w-fit items-center gap-2 rounded-(--radius-fill)',
                'bg-(--background-surface) py-1 ps-3 pe-2 shadow-md',
            ].join(' ')}
        >
            {/*
             * Shown to everyone, unlike legacy's `isAuthenticated` gate. A visitor with no
             * account has a balance of zero rather than an unknown one, and `useBalanceDisplay`
             * reports that honestly — hiding the control would just mean the pill changes shape
             * on sign-in for no information gained.
             */}
            {/*
             * `relative` sits on **this wrapper, not the pill**, and that is the whole positioning
             * decision: `StarChangeFlash` is `absolute inset-x-0`, so it centres itself in whatever
             * establishes the context. On the pill that is the full capsule — star, Get App, divider
             * and avatar — so the number drifted down under *Get App*, several controls away from the
             * figure it belongs to. Scoped here it falls directly beneath the balance.
             *
             * A sibling of the link rather than a child of it: the flash carries a `role="status"`
             * sentence, and text inside an anchor is content of that anchor.
             */}
            <span className="relative flex flex-none items-center">
                <Link
                    data-testid="navigation-end-rail-get-star"
                    href={GET_STAR_PATH}
                    aria-label={t('balance_action_get_star')}
                    className="flex items-center gap-1 rounded-(--radius-fill) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                >
                    <AppBarStarIcon />
                    {/*
                     * `aria-hidden` on the em dash: "—" is read out as punctuation or skipped
                     * entirely, so the link's own label carries the meaning while the figure is
                     * still loading.
                     */}
                    <span
                        className="type-body-strong text-(--text-title)"
                        aria-hidden={isKnown ? undefined : true}
                    >
                        {star}
                    </span>
                </Link>

                <StarChangeFlash />
            </span>

            <GetAppButton />

            {/* 24 tall, not the pill's full 40: legacy's MUI `Divider variant="middle"` insets a
                vertical rule by 8 at each end, and the rule reading shorter than the things it
                separates is the point. */}
            <span aria-hidden className="h-6 w-px flex-none bg-(--separator-default)" />

            {/*
             * `flex`, not just `flex-none`. An anchor is inline by default, so it gets a line box
             * — and a 40px avatar inside one measures 46, which pushed the whole pill to 54 where
             * legacy's is 48. `flex-none` only stops it growing as a flex *child*; it does nothing
             * about how it lays out its own content.
             */}
            <Link
                data-testid="navigation-end-rail-profile"
                href="/my-space"
                aria-label={t('nav_profile')}
                className="flex flex-none rounded-(--radius-fill) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
            >
                <AnimatedAvatar {...avatar} alt="" size="medium" />
            </Link>
        </div>
    )
}
