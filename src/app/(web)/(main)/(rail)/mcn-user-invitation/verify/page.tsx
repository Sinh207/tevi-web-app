import { McnUserInvitationView } from '@features/channel'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/mcn-user-invitation/verify` — the MCN **manager** invitation, opened out of an email, and where
 * the reader accepts or rejects it.
 *
 * ## The same address legacy uses, query parameter included
 *
 * `pages/mcn-user-invitation/verify` in the legacy app, reading **`token`**. Neither can move: the
 * URL is baked into mail the backend has already sent, and unanswered invitations are sitting in
 * inboxes right now. There is nothing for `proxy.ts` to redirect — a same-origin cutover lands every
 * one of those links straight on this screen.
 *
 * ⚠ Legacy's *other* invitation screen is `pages/invitation/verify`, reads **`invite_token`**, and
 * hits `v1/organization/invitations/`. That is the **creator** invitation — different endpoint,
 * different payload, different copy — and it is `/invitation/verify` here. Do not "unify" the two
 * parameter names or the two paths: each spelling is a contract with mail already sent, and a
 * creator's token redeemed against the manager endpoint 404s, which renders as *this link has
 * expired* on a live invitation.
 *
 * The path keeps legacy's slightly odd name (`mcn-user-invitation`, where the payload calls the same
 * thing a *manager*) for that reason alone. It is the address in the wild.
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
 * Everything below is client code and has to be: the invitation is read **as this bearer**, and there
 * is no SSR bearer in this app by construction (`shared/lib/api/token.ts`). The bar is the view's
 * because the whole screen is one panel whose surface it has to match. Same arrangement, and the same
 * reason, as `/invitation/verify`, `/mcn-partnership` and `/star-transfer`.
 *
 * ## `noindex, nofollow`, and deliberately **not** in `robots.ts`
 *
 * A private one-time link whose content is an offer of a staff role to one person. Legacy sets the
 * same pair. Disallowing it in `robots.ts` would be the reflex and is the wrong move, for the reason
 * `/invitation/verify`, `/mcn-partnership` and `/my-star` all write down: a disallowed URL is one a
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
        alternates: { canonical: '/mcn-user-invitation/verify' },
        robots: { index: false, follow: false },
    }
}

export default async function McnUserInvitationPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
    const params = await searchParams
    const raw = params.token
    /*
     * `?token=a&token=b` arrives as an array. Taking neither is the right answer rather than taking
     * the first: two tokens on one URL is a malformed link, and guessing which one was meant would
     * spend the wrong invitation. The screen shows its "this link does not work" wall.
     */
    const token = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null

    return (
        <main className="flex flex-1 flex-col">
            <McnUserInvitationView token={token} />
        </main>
    )
}
