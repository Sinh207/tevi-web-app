import { McnInvitationView } from '@features/channel'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/invitation/verify` — the MCN invitation a creator opens out of an email, and where they accept
 * or reject it.
 *
 * ## The same address legacy uses, query parameter included
 *
 * `pages/invitation/verify` in the legacy app, reading **`invite_token`**. Neither can move: the URL
 * is baked into mail the backend has already sent, and unanswered invitations are sitting in inboxes
 * right now. There is nothing for `proxy.ts` to redirect — a same-origin cutover lands every one of
 * those links straight on this screen.
 *
 * ⚠ The *other* invitation screen is `/mcn-user-invitation/verify` and reads **`token`**. That is the
 * **manager** invitation — a different endpoint with different copy, and its own route beside this
 * one. Do not "unify" the parameter names: each spelling is a contract with mail already sent.
 *
 * A sub-page, so it sits in `(main)` and **not** in `(tabs)`: it brings its own back bar rather than
 * the global mobile top bar, and `TabBarShell` correctly draws no tab bar over it. It is in `(rail)`
 * because its column caps at 612, which is that layout's condition.
 *
 * ## `searchParams` here, rather than `useSearchParams()` in the view
 *
 * The screen cannot render anything without the token, so it is needed in the **first** render.
 * `useSearchParams()` would opt the route into dynamic rendering (or demand a Suspense boundary) and
 * hand the value over a render later; reading the server prop puts it in the first paint with no hook
 * at all. This route is dynamic regardless — reading `searchParams` makes it so, and there is nothing
 * to cache: every visit is one person's private invitation.
 *
 * ## The page is a shell, and even the bar belongs to the view
 *
 * Everything below is client code and has to be: the invitation is read **as this bearer**, and
 * there is no SSR bearer in this app by construction (`shared/lib/api/token.ts`). The bar is the
 * view's because the whole screen is one panel whose surface it has to match. Same arrangement, and
 * the same reason, as `/mcn-partnership` and `/star-transfer`.
 *
 * ## `noindex, nofollow`, and deliberately **not** in `robots.ts`
 *
 * A private one-time link whose content is a commercial offer to one person. Legacy sets the same
 * pair. Disallowing it in `robots.ts` would be the reflex and is the wrong move, for the reason
 * `/mcn-partnership`, `/identification` and `/my-star` all write down: a disallowed URL is one a
 * crawler never *fetches*, so it never reads the `noindex` either — and a URL that turns up in a
 * forwarded email can still surface as a bare address. Crawlable + `noindex` is what actually keeps
 * it out.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('mcn_invitation_title'),
        /*
         * The canonical drops the query string, which is the point: the token is a credential, and a
         * canonical carrying it would publish it in the page's own `<head>` — from where anything
         * that scrapes a forwarded screenshot or a page archive can read it. Legacy sets exactly this
         * bare path too.
         */
        alternates: { canonical: '/invitation/verify' },
        robots: { index: false, follow: false },
    }
}

export default async function McnInvitationPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
    const params = await searchParams
    const raw = params.invite_token
    /*
     * `?invite_token=a&invite_token=b` arrives as an array. Taking neither is the right answer rather
     * than taking the first: two tokens on one URL is a malformed link, and guessing which one was
     * meant would spend the wrong invitation. The screen shows its "this link does not work" wall.
     */
    const token = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null

    return (
        <main className="flex flex-1 flex-col">
            <McnInvitationView token={token} />
        </main>
    )
}
