'use client'

import { useFollowedLives } from '@features/channel'
import type { Post } from '@features/post'
import { LiveDot } from '@shared/components/live-dot'
import { StickyTabs } from '@shared/components/sticky-tabs'
import { useMediaQuery } from '@shared/hooks/use-media-query'
import { useTranslation } from '@shared/i18n/use-translation'
import { useEffect, useState } from 'react'
import { HOME_LIVE_LIMIT, HomeLiveFeed } from './home-live-feed'
import { HomeLiveStrip } from './home-live-strip'
import { HomePostFeed } from './home-post-feed'

/**
 * `publicFeed` is the first page of the feed as the server read it, anonymously — shown only while
 * nobody is signed in. `null` when the server had none, which leaves the sign-in prompt in its place.
 */
type HomeViewProps = { testId?: string; publicFeed?: readonly Post[] | null }

/**
 * Home — the feed of the spaces this account follows, in legacy's two tabs.
 *
 * ## `mountAll={false}`, which is the whole reason the choice exists
 *
 * Each panel owns a request: Posts is a paginated feed, Lives asks for fifty live rows. Mounting
 * both on load fires both for a reader who will look at one — the Lives *request* is now made
 * anyway, for the tab's red dot (below), but its fifty rendered cards are not. `StickyTabs`' own
 * note names exactly this case;
 * TanStack Query's cache makes coming back instant, so nothing is preserved by keeping them
 * mounted.
 *
 * Legacy mounts both and gates each with an `isActive` check inside the panel, which is the same
 * intention expressed where it cannot be seen from the tab row.
 *
 * ## `adaptive` — underline on a phone, a capsule from `md`
 *
 * Figma's `Menu` component has exactly those two variants (`Mobile=True|False`), and so does legacy
 * (`mobileTabsSx` / `desktopTabsSx`). This file used to pick `underline` for both widths, because a
 * breakpoint-switched skin seemed to need a viewport read in JS. It does not: `StickyTabs`'
 * `adaptive` variant is one tree restyled by `md:` utilities, so the server's HTML is already right
 * at both widths and there is nothing to hydrate differently.
 *
 * ## The red dot on *Lives*, and the request it costs
 *
 * Figma's note on the screen: *"when a creator is live, show the animated red dot"*. That needs to
 * know whether anybody followed is on air **while the reader is on Posts**, so this view asks
 * `followed-channels/lives/` itself — with the Lives panel's own `limit`, which makes it the same
 * query key: one request serves both the dot and the panel, and opening the tab afterwards is
 * instant. It is the one request `mountAll={false}` below no longer saves, and it is spent on purpose.
 *
 * ## Below `sm` there is no tab row — Lives is a strip at the head of Posts
 *
 * A phone gets one feed: `HomeLiveStrip` (who is on air, as a sideways row) over the posts, and the
 * tab row is `hidden` until `sm` (612). From `sm` to `md` the row is back as Figma's
 * `Mobile=True` underline band, full width; from `md` it is the capsule. The strip and the Lives
 * tab are the same query, so nothing is fetched twice. The tabs stay **one tree** styled by breakpoint rather than two trees swapped in
 * JS — the server's HTML is right at both widths — and the only thing JS does is the one thing CSS
 * cannot: a reader who picked *Lives* on a wide window and then narrowed it would be left on a
 * panel with no row to leave by, so crossing below `sm` hands the selection back to Posts. That
 * read happens in an effect, after hydration, so it can never be a mismatch.
 *
 * ## `stickyOffset` follows the top bar
 *
 * Below `md` the global top bar (`AppTopBarDock`) is sticky and slides away on a scroll down. The
 * tab row — shown from `sm` — parks at the bar's bottom edge, which the dock publishes as
 * `--top-bar-inset` (`60px` shown, `0px` hidden), on the same 240ms curve so the two move as one.
 * This read `0` before, which parked the row *under* the bar where the bar's `z-20` hid it once
 * stuck. From `md` there is no bar and the property is unset, so the fallback `0px` is right.
 */
export function HomeView({ testId = 'home', publicFeed = null }: HomeViewProps) {
    const { t } = useTranslation()
    const { total: liveCount } = useFollowedLives({ limit: HOME_LIVE_LIMIT, collapsible: false })
    const [tab, setTab] = useState('posts')
    // `sm` is 612 in this app (`globals.css`), so "below sm" is anything narrower.
    const belowSm = useMediaQuery('(max-width: 611.98px)')

    useEffect(() => {
        if (belowSm) setTab('posts')
    }, [belowSm])

    return (
        <StickyTabs
            testId={testId}
            label={t('home_tabs_label')}
            variant="adaptive"
            mountAll={false}
            value={tab}
            onValueChange={setTab}
            /*
             * No row below `sm` (see the header). `sm`–`md`: Figma's `Mobile=True`, a white band —
             * the surface the feed's bands are painted on. From `md`: the capsule on the page
             * colour, inset 8 from the top as Figma's `Posts Container`.
             */
            /*
             * Under the global top bar while it shows, at the top once it slides away — the dock
             * publishes where its edge is. Unset from `md`, where there is no bar: `0px`.
             */
            stickyOffset="var(--top-bar-inset, 0px)"
            barClassName="hidden sm:block sm:bg-(--background-surface) md:bg-(--background) md:py-2 transition-[top] duration-240 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
            tabs={[
                {
                    id: 'posts',
                    label: t('home_tab_posts'),
                    panel: (
                        <>
                            <HomeLiveStrip />
                            <HomePostFeed publicFeed={publicFeed} />
                        </>
                    ),
                },
                {
                    id: 'lives',
                    label: t('home_tab_lives'),
                    adornment: liveCount > 0 ? <LiveDot /> : undefined,
                    panel: <HomeLiveFeed />,
                },
            ]}
        />
    )
}
