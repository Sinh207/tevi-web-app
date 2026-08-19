import { cn } from '@shared/lib/utils'
import { Logo } from '@shared/ui/logo'
import type { ComponentPropsWithoutRef } from 'react'

/**
 * The brand layer that covers the viewport while the session bootstraps.
 *
 * ## It is a cover, not a gate
 *
 * `position: fixed` over the app, **not** rendered in place of it. That distinction is the
 * whole design. Legacy's equivalent (`components/loading`, raised by `AuthenticationProvider`)
 * returns the splash *instead of* `children`, so on every cold load nothing below it mounts,
 * no query starts, and a crawler receives a page whose only content is a logo. Here the tree
 * renders underneath from the first byte — this element merely sits on top of it — which is
 * what keeps the invariant `features/channel/lib/onboarding-gate.ts` states: nothing in this
 * codebase blocks the tree on a session request.
 *
 * ## Server-rendered on purpose
 *
 * No `'use client'`, no hooks, no `mounted` guard. `isBootstrapping` starts `true` in the auth
 * store, so the server render and the first client render agree and this ships inside the
 * initial HTML. That is also why it cannot flash: there is no frame in which the app is
 * visible before the cover arrives. `SplashGate` owns every decision that needs a clock.
 *
 * ## Why `--background` and not the brand purple
 *
 * A native app splash can be a flat brand fill because it has one appearance. This one is the
 * first paint of a themed document, and `docs/WEBVIEW.md` treats "a dark screen never flashes
 * white first" as a contract. `--background` inverts with the mode, so the cover is already
 * the colour the app underneath will be. The mark stays legible on either because
 * `--primary-500` is the one ramp step that does not invert (see `shared/ui/logo.tsx`).
 *
 * ## Why there is no spinner, and what replaces it
 *
 * There was a `Loader` under the lock-up and it is gone on purpose. A progress indicator is a
 * promise that the wait is long enough to need one, and this wait is capped at three seconds —
 * so the dots spent most of their life telling the user to brace for something that had already
 * finished. If a genuinely long wait ever needs covering, that is a screen with a `Loader` in
 * it, not this one with the dots put back.
 *
 * What replaces them is a sequence rather than an indicator, in three beats:
 *
 * 1. **In** — the mark pops, the lettering rises in behind it 90ms later, both over 480ms. Below
 *    `md` there is no lettering, so this is the mark alone.
 * 2. **Hold** — the assembled lock-up breathes, 2.5% over 2800ms. Not progress: just the
 *    difference between a screen that is waiting and one that has stopped.
 * 3. **Out** — the lock-up swells to 1.06 while the cover fades under it, so the splash opens
 *    onto the app rather than being switched off in front of it.
 *
 * The keyframes and the reasoning for each number live beside them in `globals.css`.
 *
 * ## Why no accessible name
 *
 * `aria-hidden`, and deliberately so. It is on screen for 0.6–3s, it blocks nothing for a
 * screen reader — the content is right there behind it in the accessibility tree — so
 * announcing it would be noise about a state the user is not in.
 */
/**
 * Length of the exit, in ms.
 *
 * It lives beside the utility that spells it rather than beside the hook that waits it out: the
 * number is duplicated between the `animate-[…_320ms_…]` classes below and whatever timer
 * unmounts this element, and duplication is only safe while one of the two copies is obviously
 * the original. Callers import it from here.
 */
export const SPLASH_FADE_MS = 320

export type SplashProps = Omit<ComponentPropsWithoutRef<'div'>, 'children'> & {
    /** Play the exit fade. The caller unmounts on its own timer — see `useSplashState`. */
    leaving?: boolean
}

export function Splash({ leaving, className, ...props }: SplashProps) {
    return (
        <div
            // Queried by `<noscript>` and by the E2E spec. A `data-` hook rather than a class,
            // because a class on a Tailwind element is a styling handle someone will later
            // "clean up".
            data-splash=""
            aria-hidden="true"
            className={cn(
                'fixed inset-0 z-[100] flex items-center justify-center',
                'bg-(--background)',
                leaving &&
                    'pointer-events-none animate-[tevi-fade-out_320ms_ease-in_both] motion-reduce:animate-none',
                className,
            )}
            {...props}
        >
            {/* The same lock-up as `features/auth/components/auth-layout.tsx`, one size up:
                mark beside "Tevi" as live text in Chella — and the mark on its own below `md`.
                There is no wordmark asset in the design system, and drawing one here would be
                inventing brand. 64/40 keeps auth's 36/24 ratio, so the two screens read as the
                same lock-up rather than two attempts at it.

                Three animations at two depths, because one element cannot run more than one
                `animation` at a time: the cover fades, this row breathes and then swells on the
                way out, and the mark and the lettering each play their own entrance. */}
            <div
                className={cn(
                    'flex items-center gap-3',
                    leaving
                        ? 'animate-[tevi-splash-out_320ms_ease-in_both]'
                        : 'animate-[tevi-splash-breath_2800ms_ease-in-out_560ms_infinite]',
                    'motion-reduce:animate-none',
                )}
            >
                {/* `tevi-pop` for the mark, `tevi-rise` for the lettering — the app's own two
                    entrances, at the app's own curve, but over **480ms rather than 240**.

                    That is the one deliberate deviation on this screen and it is not a taste
                    call: 240ms is the beat for a region arriving *inside* a working app, where
                    the user is already looking at something. This is the first thing they see,
                    and an entrance that fast reads as a flicker rather than as a brand. Same
                    curve, half the cadence — the same voice speaking more slowly.

                    The 90ms offset on the lettering is what makes it a lock-up assembling
                    rather than two things appearing: the mark lands, the word follows it in.
                    Both settle at 570ms, just inside `SPLASH_MIN_MS` — the floor is what buys
                    the room for this, which is the other half of why 600 is the number.

                    `tevi-pop` scales, so it may only go on an element whose box is reserved:
                    `Logo` renders a fixed 64×64 `<svg>`, and `scale` does not affect layout. */}
                <Logo
                    size={64}
                    title={null}
                    className="animate-[tevi-pop_480ms_cubic-bezier(0.32,0.72,0,1)_both] motion-reduce:animate-none"
                />
                {/* Mark only below `md` (900px here, not Tailwind's 768 — see the breakpoints in
                    `globals.css`). The lettering is what a splash can afford to lose: the mark
                    alone still says Tevi on the one screen size where it is also the app icon
                    the user just tapped, and a 64/40 lock-up on a narrow viewport is a wide
                    horizontal band in a space that reads better with a single centred object.

                    `hidden`, not `sr-only` — the whole cover is `aria-hidden`, so there is no
                    accessible name being taken away, and a flex `gap` leaves no space behind an
                    undisplayed item. */}
                <span className="type-display-large-bold hidden animate-[tevi-rise_480ms_cubic-bezier(0.32,0.72,0,1)_90ms_both] font-brand text-(--text-title) motion-reduce:animate-none md:block">
                    Tevi
                </span>
            </div>
        </div>
    )
}
