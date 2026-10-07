'use client'

import { toChannelPath, useMyChannel } from '@features/channel'
import { useMiniAppCoversScreen } from '@features/mini-app'
import { cn } from '@shared/lib/utils'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { isTabDestination } from '../lib/tab-destinations'
import { AppTabBar } from './app-tab-bar'

/**
 * The mobile tab bar and the space it occupies — together, because they are one decision.
 *
 * The bar is a `fixed` floating pill (`AppTabBar`), so it overlays the page rather than sitting in
 * flow, and the content column reserves room for it instead. Those two must agree on every route
 * or the page is wrong in one of two visible ways — a bar over the last line of content, or dead
 * space under a page that has no bar. Splitting them across a layout and a component is how they
 * come to disagree, so this owns both and answers once.
 *
 * ## The geometry, and the one variable that carries it
 *
 * The pill floats above the bottom edge by 12px, or the device's safe area plus 4
 * where that is larger (an iPhone's home indicator is 34), so it never sits on the indicator and is
 * not lifted for one on a device that has none — the DS bar padded a fixed 32px for every device.
 * The reserve is that lift + the 64px pill + 12px of air, published as **`--tab-bar-reserve`** on
 * the content wrapper. It is the only spelling of the number: the wrapper pads by it, and a screen
 * that sizes itself to the window (`MessagesShell`) subtracts it — where it used to subtract a
 * literal 84 that had to be kept in step by hand. Unset off the four destinations and from `md`, so
 * a reader falls back to `0px`.
 *
 * **Why a runtime check and not a route group**, against this app's rule everywhere else:
 * one of the four destinations is *your own* channel, which shares a route with everybody
 * else's. See `lib/tab-destinations.ts` — the reasoning is there, with the rule itself.
 *
 * `children` are server-rendered and simply passed through; the client boundary here buys
 * `usePathname` and `useMyChannel` and costs nothing else.
 */
export function TabBarShell({ children }: { children: ReactNode }) {
    const pathname = usePathname()
    /*
     * A context read, not a request: `MyChannelProvider` holds the account's own channel for
     * the whole app (`app/session-providers.tsx`). `undefined` while unknown and `null` for an account
     * with no channel both collapse to "not my channel", which is what `isTabDestination`
     * treats as no.
     */
    const { myChannel } = useMyChannel()
    /*
     * A mini app is running full-screen over this route, so the bar stands down — both the bar and
     * the 84px it reserves. The player is `z-40` (below every dialog it can raise) and this bar is
     * `z-50`, so without this the app's navigation would sit on top of a third-party application
     * that has covered the screen. `useMiniAppCoversScreen` carries the full reasoning; the short
     * version is that the two z-indices cannot both be right and this is the one that yields.
     *
     * Reserving no space is the other half: the player is `fixed`, so the page underneath is not
     * being read, and leaving the bar's padding under it would show as a gap the moment the player
     * closes and the bar comes back — which happens in the same commit.
     */
    const coveredByMiniApp = useMiniAppCoversScreen()
    const show =
        !coveredByMiniApp &&
        isTabDestination(pathname, myChannel ? toChannelPath(myChannel.slug) : null)

    return (
        <>
            <div
                className={cn(
                    'flex min-w-0 flex-1 flex-col',
                    /*
                     * The rail's width answered on the trailing edge too, so the content area is
                     * symmetric about the centre of the *window* rather than offset into the
                     * space left over beside the rail.
                     *
                     * Without it every page sat half a rail right of centre: the rail is in flow,
                     * so `mx-auto` on a page's column (612 on the channel and the settings screens,
                     * 900 on brand assets, 1080 on the policies) centres it inside `vw - 88`, and
                     * a column centred in the remainder is not a column centred on the screen.
                     * Legacy put the rail in `position: fixed` under a full-window container, so
                     * this is also what the app being rewritten does — and legacy's own right-hand
                     * furniture assumes it: `Trending` is pinned at `right: calc(50vw - 646px)`,
                     * i.e. anchored to the centre of the window, and it only clears a 612 column
                     * if that column is centred on the window too.
                     *
                     * **Padding, not a fixed rail and not a change to the six column constants.**
                     * The sub-pages' sticky bars carry a background and a `md:border-b` across the
                     * full width while only their *contents* take the column class — a background
                     * paints across padding, so the bar still spans edge to edge and its border now
                     * ends a rail's width from both edges instead of one. Taking the rail out of
                     * flow would run that bar underneath it; moving the constants instead would
                     * leave the panels that have a background of their own (`PROFILE_PANEL`)
                     * misaligned against the pages that don't.
                     *
                     * The cost is 88px of usable width: `LEGAL_CONTAINER` starts shrinking below
                     * 1256 rather than 1168. That is the right trade — a column has no business
                     * being wider than the symmetric frame it sits in.
                     *
                     * Only flow is affected, so the fixed furniture legacy parks on the right —
                     * `Trending`, the chat popup, the star button — is untouched when it lands.
                     * A page that genuinely wants the full width (a watch screen, when one exists)
                     * has to opt out with `md:-me-(--rail-width)`. None does today.
                     */
                    'md:pe-(--rail-width) print:md:pe-0',
                    // `print:pb-0` on the reserve for the same reason the bar itself is
                    // `print:hidden`: navigation is not part of the page on paper, and the
                    // policy pages are printed.
                    show &&
                        '[--tab-bar-reserve:calc(76px_+_max(12px,_calc(env(safe-area-inset-bottom)_+_4px)))] pb-(--tab-bar-reserve) md:pb-0 md:[--tab-bar-reserve:0px] print:pb-0',
                )}
            >
                {children}
            </div>
            {show && (
                <div
                    data-viewport="md-down"
                    className="fixed inset-x-3 bottom-[max(12px,_calc(env(safe-area-inset-bottom)_+_4px))] z-50 md:hidden print:hidden"
                >
                    <AppTabBar />
                </div>
            )}
        </>
    )
}
