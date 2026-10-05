'use client'

import { StickyTabs } from '@shared/components/sticky-tabs'
import { useTranslation } from '@shared/i18n/use-translation'
import { HomeLiveFeed } from './home-live-feed'
import { HomePostFeed } from './home-post-feed'

/**
 * Home — the feed of the spaces this account follows, in legacy's two tabs.
 *
 * ## `mountAll={false}`, which is the whole reason the choice exists
 *
 * Each panel owns a request: Posts is a paginated feed, Lives asks for fifty live rows. Mounting
 * both on load fires both for a reader who will look at one — and the Lives request in particular
 * is fifty rows of event payload nobody asked for. `StickyTabs`' own note names exactly this case;
 * TanStack Query's cache makes coming back instant, so nothing is preserved by keeping them
 * mounted.
 *
 * Legacy mounts both and gates each with an `isActive` check inside the panel, which is the same
 * intention expressed where it cannot be seen from the tab row.
 *
 * ## `underline`, not `pill` — and legacy uses both
 *
 * Legacy draws a **pill** capsule on desktop and an **underline** row on mobile, as two style
 * objects on one `Tabs` (`desktopTabsSx` / `mobileTabsSx`). That is a breakpoint-switched component
 * skin, which this app cannot do without either shipping both or reading the viewport in JS — and
 * reading the viewport is a hydration mismatch waiting to happen (`calendar-lazy.tsx` carries the
 * same warning for `Intl`).
 *
 * `underline` is the one that survives both widths: `StickyTabs`' own header calls it "what a
 * full-width page-level tab row wants", and it is what the channel page already uses one level
 * down. Two page-level tab rows in one product should not be two different shapes.
 *
 * ## `stickyOffset` is zero, and that is the mobile top bar's doing
 *
 * `(tabs)/layout.tsx` renders the global top bar `sticky top-0` on phones and `md:hidden` above.
 * The tab row parks directly under whatever is above it, and at both widths that is `0` — on a
 * phone because the bar scrolls with the page rather than staying pinned, and on desktop because
 * there is no bar at all. A non-zero offset would leave a gap in the one place a reader sees the
 * page colour through it.
 */
export function HomeView({ testId = 'home' }: { testId?: string }) {
    const { t } = useTranslation()

    return (
        <StickyTabs
            testId={testId}
            label={t('home_tabs_label')}
            variant="underline"
            mountAll={false}
            tabs={[
                { id: 'posts', label: t('home_tab_posts'), panel: <HomePostFeed /> },
                { id: 'lives', label: t('home_tab_lives'), panel: <HomeLiveFeed /> },
            ]}
        />
    )
}
