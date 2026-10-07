'use client'

import { BarIconButton } from '@shared/components/bar-icon-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { AppBar, AppBarCluster, AppBarTitle, AppBarTitleText } from '@shared/ui/app-bar'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { EVENT_CONTAINER } from '../lib/container'

/**
 * The event page's bar — back, and the words **Live details**.
 *
 * ## Why not `PageBackBar`
 *
 * One reason, and it is a semantic one: that bar renders its title as the page's `<h1>`
 * (`AppBarTitleText as="h1"`). Here the `<h1>` has to be the **event's own title**, which is the
 * page's subject and what a crawler and a screen reader should meet first — it is on screen at full
 * size two rows down. Handing it to the bar instead would either give the page two `h1`s saying
 * different things, or make "Live details" the document's heading, which describes the *template*
 * rather than the content.
 *
 * So this is `PageBackBar`'s bar with the title demoted to a `<span>`, which is exactly the call
 * `ChannelTopBar` makes one route over and for the same reason. The back button is a deliberate copy
 * of that component's — same `BarIconButton`, same filled glyph, same RTL mirror, same
 * history-length fallback — so the two sub-page bars do not read as different things.
 *
 * ## `home` is the space, not the home feed
 *
 * This page is frequently the **first** page of a session: a shared link, or a QR code on a poster.
 * `history.length` is then 1 and `router.back()` leaves the site entirely. The host's space is the
 * nearest thing the reader was actually looking for — `PageBackBar` defaults to `/` and legacy sends
 * them there, which is a step further from where they were going.
 */
export function EventTopBar({
    slug,
    actions,
}: {
    slug: string | null
    /**
     * The bar's trailing control. Today: **Share**, and only on the host's live screen.
     *
     * A node rather than a boolean, because the viewer's page already carries Share inside
     * `EventDetailsCard` (`EventActions`) and must not grow a second one. The host's live screen
     * does not draw that card — it is two blocks that have to fit one viewport — so the action moves
     * up here for that state alone. `EventScreen` decides; this bar only makes room.
     */
    actions?: ReactNode
}) {
    const { t } = useTranslation()
    const router = useRouter()
    const home = slug ? `/@${encodeURIComponent(slug)}` : '/'

    return (
        // `md:px-0` — the same rule, at the same breakpoint, as `PageBackBar` and `ChannelTopBar`:
        // the bar's inset matches the *content*, and this page's column is full-bleed below `md`.
        // `max-md:px-0` last, over the container's `px-4`: the edge controls are ghost.
        <AppBar className={cn(EVENT_CONTAINER, 'md:px-0', 'max-md:px-0')}>
            <AppBarCluster className="min-w-0">
                <BarIconButton
                    data-testid="event-back"
                    name="angle-left"
                    weight="filled"
                    mirrored
                    label={t('common_back')}
                    onClick={() => {
                        if (window.history.length > 1) router.back()
                        else router.push(home)
                    }}
                />
            </AppBarCluster>

            {/*
             * `AppBarTitle`'s centred variant is `position: absolute` at 50% with a translate back,
             * so it does not participate in the flex row and will run under the buttons. One 40px
             * disc plus the bar's padding is 56px on the leading side; the cap is symmetric so the
             * label stays optically centred rather than centred-in-the-gap.
             */}
            <AppBarTitle className="max-w-[calc(100%-112px)]">
                <AppBarTitleText className="min-w-0 truncate">
                    {t('event_live_details')}
                </AppBarTitleText>
            </AppBarTitle>

            {/*
             * A second cluster at the trailing edge, which is what `AppBar`'s own `justify-between`
             * is drawn for — and `PageBackBar`'s note names this slot as the place for exactly this
             * kind of control: *"a filter, a share, an overflow menu … because a button pressed
             * against the back arrow reads as part of the back affordance rather than as a separate
             * thing."*
             *
             * ⚠ The title's `max-w-[calc(100%-112px)]` already reserves **both** ends. It is centred
             * absolutely, so it does not participate in the flex row and would otherwise run under
             * whatever lands here; 112 is two 40px discs plus the bar's padding, and the cap is
             * symmetric so the label stays optically centred rather than centred-in-the-gap. That
             * number was already right for a trailing control before there was one — which is why
             * adding this needed no change to it.
             */}
            {actions && <AppBarCluster className="flex-none">{actions}</AppBarCluster>}
        </AppBar>
    )
}
