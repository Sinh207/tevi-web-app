import { AppTopBarDock } from '@features/navigation'

/**
 * Tab destinations — the screens the bottom Tab Bar and the left rail point at (home,
 * following, chat, …). They share the app's **global** mobile top bar: menu · star
 * balance · premium · notifications · search.
 *
 * A sub-page (`/privacy`, and every "you tapped into this from somewhere" screen after
 * it) lives in `(main)` directly instead, outside this group, and renders its own bar
 * with a back button. That is the whole rule — the group a route joins decides its
 * chrome, so nothing has to inspect the pathname at runtime.
 *
 * The URLs are untouched: `(tabs)` is a route group, so home is still `/`.
 *
 * The desktop **end rail** is *not* here: it belongs to a wider set than the tab destinations —
 * every screen with a 612 column — so it is mounted one level up, in `(rail)/layout.tsx`.
 */
export default function TabsLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            {/* Sticky, frosted, and tucked away while scrolling down — `AppTopBarDock` says why. */}
            <AppTopBarDock />
            {children}
        </>
    )
}
