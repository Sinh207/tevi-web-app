import { parseChannelSlug } from '@features/channel'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CollectionScreen } from './collection-screen'

/**
 * `/@{slug}/collections/{id}` — one collection's posts.
 *
 * Legacy's URL verbatim (`pages/[channelSlug]/collections/[collectionId]`).
 *
 * ## The bar is the screen's, not this file's
 *
 * Unlike every other sub-page here, the title is **data** — the collection's name — and the two
 * controls beside it write to the query that carries it. So `CollectionDetail` draws its own bar
 * and this route draws only the column. The metadata title stays generic for the same reason: a
 * server that cannot read the collection cannot name it, and there is no SSR bearer in this app by
 * construction (`shared/lib/api/token.ts`).
 *
 * **`noindex, nofollow`** — a private organising screen. Not in `robots.ts`'s disallow list, for
 * the reason `/identification` spells out: a disallowed URL is never fetched, so its `noindex` is
 * never read.
 *
 * ⚠ A bad slug is `notFound()` and a **soft 404** — 200 with the not-found body, because a
 * `loading.tsx` above has already streamed by the time it runs. `[slug]/page.tsx` has the table and
 * why it is left alone.
 *
 * The collection id is **not** validated here. Its shape is the backend's to decide, and a wrong
 * one is already a state the screen draws — `isMissing`, which is what a reader gets for a
 * collection that was deleted from another tab as well.
 */
type PageProps = { params: Promise<{ slug: string; collectionId: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug: raw, collectionId } = await params
    const slug = parseChannelSlug(raw)
    const t = await getServerT()
    return {
        title: t('collections_title'),
        ...(slug ? { alternates: { canonical: `/@${slug}/collections/${collectionId}` } } : {}),
        robots: { index: false, follow: false },
    }
}

export default async function CollectionPage({ params }: PageProps) {
    const { slug: raw, collectionId } = await params
    const slug = parseChannelSlug(raw)
    if (!slug || !collectionId) notFound()

    return (
        <main className="mx-auto flex w-full max-w-[612px] flex-1 flex-col">
            <CollectionScreen slug={slug} collectionId={collectionId} />
        </main>
    )
}
