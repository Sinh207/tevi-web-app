import { MyMembershipView } from '@features/membership'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/my-membership` — the memberships this account holds.
 *
 * The URL is legacy's (`pages/my-membership/index.js`), kept so existing links and anything the mobile
 * apps deep-link to still resolve. Nothing is needed in `proxy.ts`: that list is for paths that
 * *moved*. It is reached from the account drawer's MY CONTENT section, which is the only entry point
 * either app has ever had.
 *
 * A sub-page, so it sits in `(main)` and **not** in `(tabs)`: it brings its own back bar instead of the
 * global mobile top bar, like `/my-star` and `/settings/blocked-accounts`. It joins `(rail)` because
 * its column caps at 612 — the one thing that group's layout requires.
 *
 * ## The bar is rendered by the view, which is unusual and deliberate
 *
 * Every other sub-page renders `PageBackBar` here, with `getServerT()`. This one hands the title down
 * instead, because the bar carries the payment filter and that control reads and writes state held by
 * `useMyMemberships` — which a server component cannot reach into. The title is still resolved on the
 * server, so the `h1` and the metadata match on the first paint; see `MyMembershipView` for the
 * markup that moved.
 *
 * ## Everything below the bar is client code, and it has to be
 *
 * The list is `subscription/my-subscriptions/` **as this bearer**, and there is no SSR bearer in this
 * app by construction (`shared/lib/api/token.ts`). So the server renders the shell, the bar and the
 * title, and the rows resolve after hydration. This is not a case `createServerApiModel` could improve:
 * that client is for public content, and what somebody subscribes to is the opposite of public.
 *
 * ## `noindex, nofollow`, and deliberately **not** in `robots.ts`
 *
 * A personal screen whose content differs for every visitor, means nothing to a crawler, and — like
 * the blocked list — is a list of *other people's* names. Legacy sets the same pair here.
 *
 * Disallowing it in `robots.ts` would be the reflex and it is the wrong move, for the reason
 * `/identification`, `/my-star` and the earnings report all write down: a disallowed URL is one a
 * crawler never *fetches*, so it never reads the `noindex` either — and a URL linked from a row in the
 * account drawer on every screen can still surface as a bare address. Crawlable + `noindex` is the
 * combination that actually keeps it out of the index.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('my_membership_title'),
        alternates: { canonical: '/my-membership' },
        robots: { index: false, follow: false },
    }
}

export default async function MyMembershipPage() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col">
            <MyMembershipView title={t('my_membership_title')} />
        </main>
    )
}
