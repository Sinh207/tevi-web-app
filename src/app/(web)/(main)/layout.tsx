import { AppSide, MenuProvider, TabBarShell } from '@features/navigation'

/**
 * The signed-in app shell: DS chrome plus the page.
 *
 * A route group, so the URLs are unchanged — `/login` and `/dev/*` sit outside it
 * and get no chrome. New surfaces belong in here.
 *
 * The **global mobile top bar lives one level down**, in `(tabs)/layout.tsx`, not here.
 * A tab destination gets it; a sub-page like `/privacy` brings its own bar with a back
 * button instead, and two sticky bars stacked on a phone is not a screen anyone wants.
 * Which group a route joins is therefore the whole decision — no pathname sniffing, no
 * "hide the bar" flag threaded through a context.
 *
 * Two different Figma components, one per breakpoint: `Navbar (Web)` is the 88px
 * left rail from md (900) up, `Tab Bar` is the bottom bar below it. Only one is
 * ever visible, so only one owns the navigation at a time.
 *
 * **The tab bar is not on every screen in here.** It belongs to the four destinations
 * it points at — Home, Following, Messages and your own space — and a sub-page like
 * `/settings/password` or `/identification` gets none: the bar's job is to say where
 * you are among the tabs, and on a screen that is not one of them it says nothing
 * while covering the bottom of the page. `TabBarShell` owns that decision *and* the reserve
 * the fixed bar needs, because the two must agree on every route; the rule itself is
 * in `features/navigation/lib/tab-destinations.ts`.
 *
 * It is the one piece of chrome here that is **not** decided by the route group, and
 * the exception is forced: My Space lands on `/@{slug}`, the same route that serves
 * every other channel, so the question is about data rather than about the URL. The
 * top bar above stays a pure group decision.
 *
 * That reserve is why the content column is a flex context. A page that wants the
 * full height must take it with `flex-1`, **not** `min-h-[var(--window-height)]` —
 * a viewport min-height inside the tab bar's reserve (`--tab-bar-reserve`) overflows the viewport by exactly
 * the reserve and puts a scrollbar on every mobile page.
 */
export default function MainLayout({ children }: { children: React.ReactNode }) {
    return (
        <MenuProvider>
            {/* Navigation is not part of the page on paper: the rail, the tab bar and the
                space reserved for it all drop out when printed. Pages that people are
                asked to keep a copy of — the policies, a receipt — depend on it, and no
                page is worse off for it. */}
            {/* `data-app-shell` is what a full-screen surface marks `inert` while it covers
                the site — the Live studio does (`features/event`'s `StudioPortal`). */}
            <div data-app-shell className="flex min-h-[var(--window-height)]">
                <AppSide />
                <TabBarShell>{children}</TabBarShell>
            </div>
        </MenuProvider>
    )
}
