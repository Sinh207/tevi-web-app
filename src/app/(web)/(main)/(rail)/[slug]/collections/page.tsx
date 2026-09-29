import { parseChannelSlug } from '@features/channel'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CollectionsScreen } from './collections-screen'

/**
 * `/@{slug}/collections` — a creator's collections.
 *
 * Legacy's URL verbatim (`pages/[channelSlug]/collections`), kept because the cutover is
 * same-origin: the button on a creator's own Posts tab links here and so does anything anybody has
 * saved. `features/post/routes.ts` notes the oddity that the address carries a slug the **endpoint**
 * does not — the list is account-scoped — and `collections-screen.tsx` is where that is reconciled.
 *
 * **`noindex, nofollow`.** A private organising screen: it means nothing to a crawler and its rows
 * are the reader's own filing. Deliberately not in `robots.ts`'s disallow list, for the reason
 * `/identification` spells out — a disallowed URL is never fetched, so its `noindex` is never read.
 *
 * Nothing renders on the server but the column: the list is `v1/posts/collections/` as this
 * bearer, and there is no SSR bearer in this app by construction (`shared/lib/api/token.ts`). The
 * bar is legacy's own (`CollectionScreenHeader` — a centred title between two floating discs), and
 * its `+` is the owner's, so it is drawn by the client boundary rather than by `PageBackBar` here.
 *
 * ⚠ **A bad slug is `notFound()` here and a soft 404 on the wire.** `app/layout.tsx` awaits
 * `cookies()`, so every route in this app is dynamically rendered, and a `notFound()` raised
 * *during* a render can no longer set the status — see `[slug]/page.tsx` for the table and the two
 * ways out, neither free. The body is right; the status is 200.
 */
type PageProps = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug: raw } = await params
    const slug = parseChannelSlug(raw)
    const t = await getServerT()
    return {
        title: t('collections_title'),
        ...(slug ? { alternates: { canonical: `/@${slug}/collections` } } : {}),
        robots: { index: false, follow: false },
    }
}

export default async function CollectionsPage({ params }: PageProps) {
    const { slug: raw } = await params
    const slug = parseChannelSlug(raw)
    if (!slug) notFound()

    return (
        <main className="mx-auto flex w-full max-w-[612px] flex-1 flex-col">
            <CollectionsScreen slug={slug} />
        </main>
    )
}
