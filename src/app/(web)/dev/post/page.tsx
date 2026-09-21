import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PostPreview } from './preview'

export const metadata: Metadata = {
    title: 'Post card',
    robots: { index: false, follow: false },
}

/**
 * Dev-only preview of `features/post`: `pnpm dev`, then open /dev/post. 404s in production.
 *
 * ## Why it is a catalogue and not a sample
 *
 * **Most of these states belong to somebody else's data.** A developer looking at their own space is
 * always the owner, so they never see a locked post or a stranger's overflow menu; the
 * sensitive-content cover needs the classifier to have flagged something; the author's earnings
 * strip needs a post that has earned; the tombstone exists for the seconds between a delete and a
 * refetch. None of that is reachable by navigating, and several of them are mutually exclusive —
 * one account cannot be both the owner and the locked-out reader.
 *
 * So the list is grouped by **what the card decides**, and each group holds every answer that
 * decision can produce. That is the property worth maintaining: a flat list makes a missing state
 * invisible, while a group with one case in it is visibly incomplete.
 *
 * ## The writes are real
 *
 * Unlike the first cut, this page is not read-only: reacting, bookmarking, the overflow menu and the
 * paywall all run their actual flows against the API with the signed-in account. The two things
 * stubbed are the ones this feature cannot own — `onShare` and `onOpenMiniApp`, which belong to the
 * surface that mounts a feed (`post-attachments.tsx` explains the boundary) — and both raise an
 * `alert` so it is obvious they are the harness's and not the card's.
 *
 * Fixtures carry ids like `prod-1`, so a purchase will be refused by the backend. That refusal is
 * itself worth seeing: it is the path `docs/API_ERRORS.md` governs.
 */
export default function DevPostPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="flex flex-col gap-6 p-6">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">Post card</h1>
                <p className="type-dense-default text-(--text-body)">
                    `features/post` — every state the card can be in, grouped by the decision that
                    produces it. Identity, body, paywall, sensitive content, interaction, the
                    overflow menu, attachments, and navigation.
                </p>
            </header>
            <PostPreview />
        </main>
    )
}
