import { CHANNEL_SETTINGS_CONTAINER, FollowingView } from '@features/channel'
import { PageBackBar } from '@features/navigation'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/following` — the spaces this account follows, with whichever of them are on air at the top.
 *
 * The URL is legacy's (`pages/following`), kept verbatim so existing links and the mobile apps' deep
 * links resolve straight here on a same-origin cutover.
 *
 * ## It is a **tab destination**, which is why it is in `(tabs)` and not beside `/follow-requests`
 *
 * The DS puts Following second in both the mobile tab bar and the desktop rail, so this is one of
 * the four screens the app's chrome points at directly rather than a sub-page somebody taps *into*.
 * That is the whole difference between the two groups: `(tabs)` supplies the global mobile top bar
 * (menu · balance · premium · notifications · search) and `(rail)/(tabs)/layout.tsx` says so at
 * length, while `(main)` sub-pages bring a `PageBackBar` with a title. Legacy has it the other way —
 * its Following page renders a back button and a centred "Following" heading — because legacy's tab
 * bar does not point here.
 *
 * ## The bar is `PageBackBar`, the same one every other screen wears
 *
 * Neither piece of chrome a tab destination gets carries a name: the global mobile top bar is
 * utilities (menu · balance · premium · notifications · search) and the desktop rail is glyphs. So
 * without a bar this was the only screen in the app with nothing naming it — a bare card against
 * the top of the window, while `/follow-requests`, `/search`, `/my-star` and the rest all wear one
 * with their name in it.
 *
 * It is the **shared** component rather than a tab-destination variant of it, and that is a
 * decision, not the path of least resistance. A dedicated bar shipped here first — same centred
 * 16/600 title, no back button — on the grounds that a tab is a *root*: the bottom tab bar is lit
 * underneath, so an arrow appears to promise somewhere to go back to that a root does not have.
 * That reasoning is real but it lost to a simpler fact: a reader moving between `/following` and
 * `/follow-requests` should see one app, and a bar that is identical except for a missing control
 * reads as the control having failed to render. Legacy agrees — its own Following screen draws
 * `IconBtnBack` beside the title — and so does `/search`, which the rail also points at.
 *
 * `home` stays the default `/`, which is what makes the arrow honest here: with no history to go
 * back through (a shared link, a deep link from the app) it goes to Home, which for a tab root is
 * the right "up".
 *
 * The bar carries the page's `h1`. `FollowingView` repeats the word one level down, as the `h2` on
 * the follow list's own `List/Header` — deliberately, not by accident: the bar names the **screen**
 * and that names the **section**, which has to be named because "Live now" sits directly above it
 * whenever anybody followed is on air. Its own note argues it. What must not happen is the section
 * header becoming a second `h1`; `e2e/following.spec.ts` pins the count.
 *
 ## `hidden md:block` — the bar is desktop-only, and that is the group again
 *
 * A phone on this route already has two pieces of chrome: the global top bar above (menu · balance ·
 * premium · notifications · search) and the tab bar below, with Following lit. A third bar would be
 * a third of the viewport spent on chrome, and its back arrow is the most redundant control on the
 * screen — the tab bar *is* where you would go back to, and it is already on screen. From `md` none
 * of that is true: the global bar is `md:hidden`, the tab bar gives way to the rail, and the rail
 * carries no page title, so the bar is the only thing naming the screen and it pins at `top-0` like
 * every other bar in `(rail)`.
 *
 * ⚠ **The consequence is that a phone has no `h1`,** because `PageBackBar` is where it lives and
 * `display: none` takes an element out of the accessibility tree. That is a deliberate trade rather
 * than an oversight, and the alternatives were both worse: an `sr-only` copy puts a second `h1`
 * element in the DOM for a heading nobody can see, and `sr-only` on the bar itself leaves the back
 * button focusable while invisible — the classic version of that trap. What a phone gets instead is
 * the list's own `List/Header`, an `h2` that says "Following" and is on screen, plus a lit tab
 * saying the same thing. The screen is named; the outline just starts a level down.
 *
 * Being in `(rail)` as well means the desktop end rail is mounted beside it. That is correct by that
 * layout's own rule — the content column caps at 612, which is the width the rail is pinned against.
 *
 * ## `noindex, nofollow`
 *
 * Legacy sets both and so does this: the content differs for every visitor, means nothing to a
 * crawler, and is a list of other people's spaces. Deliberately **not** added to `robots.ts`'s
 * disallow list, for the reason `/identification` and `/follow-requests` both spell out — a
 * disallowed URL is one a crawler never fetches, so it never reads the `noindex` either, and a page
 * linked from the chrome on every screen can still surface as a bare URL. Crawlable + `noindex` is
 * the combination that actually keeps it out.
 *
 * ## Everything below is client code, and it has to be
 *
 * The list is `followed-channels/` **as this bearer**, and there is no SSR bearer in this app by
 * construction (`shared/lib/api/token.ts`). The page still renders on the server — shell and column
 * are there on first paint — and the rows resolve after. No `loading.tsx` for the same reason plus
 * one more: a skeleton chunk imported through a feature barrel is the CSP failure recorded on the
 * earnings route, and there is nothing for it to stand in for here anyway.
 *
 * The content column carries **no side padding, and vertical padding only from `md`**. No sides,
 * exactly as `/follow-requests` and `/settings/blocked-accounts`: the panel is full-bleed below `md`
 * (its rows run edge to edge, as the mobile app's do), so a `px-3` here would inset it by 12px at
 * every width with nothing the panel could do about it. From `md` the panel is a rounded surface and
 * the padding is what leaves its corners something to be seen against.
 *
 * `md:pt-6` as well as `md:pb-6`, which the two sub-pages do **not** need — and the difference is
 * exactly the chrome. They render a `PageBackBar` above the panel, so the page already has 60px of
 * its own between the viewport's top edge and the card. A tab destination has nothing there at `md`
 * and up (the global top bar is `md:hidden`), so without a top pad the card's rounded corners are
 * clipped flat against the window. Measured, not assumed.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('following_title'),
        alternates: { canonical: '/following' },
        robots: { index: false, follow: false },
    }
}

export default async function FollowingPage() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col">
            {/*
             * No hairline under the bar, matching `/follow-requests` and the settings screens: the
             * panel below brings its own edge from `md` up, and a full-bleed rule across a screen
             * whose content is already a bounded surface only draws a second one.
             *
             * The background is on this wrapper rather than the bar so it stays full-bleed while the
             * bar's own box is the content column — the split `PageBackBar` describes.
             */}
            <div className="hidden z-20 bg-(--background) md:sticky md:top-0 md:block">
                <PageBackBar title={t('following_title')} className={CHANNEL_SETTINGS_CONTAINER} />
            </div>
            {/*
             * **No top padding**, which is the rule `PageBackBar` states for every sub-page under
             * it: `AppBar` is 60px around a 44px row, so it already ends with 8px of clear space,
             * and a column that adds its own is asking for the gap twice — which is how the settings
             * screens ended up with four different distances between their title and their first
             * card. `pb-*` only. The `md:pt-6` this carried before was standing in for a bar that
             * was not there.
             */}
            <div className={`${CHANNEL_SETTINGS_CONTAINER} flex flex-1 flex-col md:pb-6`}>
                <FollowingView />
            </div>
        </main>
    )
}
