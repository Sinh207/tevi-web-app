import { EditProfileView, PROFILE_SCREEN } from '@features/channel'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/settings/custom-profile` — the creator edits their own space.
 *
 * Legacy has this as a drawer over the channel page with no URL of its own, so unlike
 * `/settings/space-visibility` there is no legacy path to preserve here and nothing in
 * `proxy.ts` to redirect. See `CUSTOM_PROFILE_PATH` for why it still keeps legacy's *word*.
 *
 * **`noindex, nofollow`**, and crawlable rather than disallowed — the same pairing every account
 * screen in this app uses. A disallowed URL is one a crawler never fetches, so it never reads the
 * `noindex` either; crawlable + `noindex` is the combination that actually keeps it out of an
 * index. Identical reasoning to `/settings/space-visibility` and `/identification`.
 *
 * ## The bar is the view's, not the page's — unlike every other settings screen
 *
 * `/settings/space-visibility` and `/identification` render `PageBackBar` here, on the server, and
 * that is the better default: the title is on screen in the first HTML byte and the client owns
 * only what it must.
 *
 * This screen cannot. Its bar carries **Save**, whose enabled state is the form's — dirty, valid,
 * not already saving — and that state lives in a client component *below* where the bar would be.
 * Passing it up would mean a context provider wrapping both, i.e. a client boundary around the
 * page anyway, for no gain. So the view renders the whole shell and this file is left with the
 * metadata and the `<main>` element.
 *
 * Nothing is lost from the first paint: a client component still server-renders, so the bar and
 * its title ship in the HTML exactly as before — only its interactivity waits for hydration.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('profile_title'),
        alternates: { canonical: '/settings/custom-profile' },
        robots: { index: false, follow: false },
    }
}

export default function CustomProfilePage() {
    return (
        // `PROFILE_SCREEN` — a single-panel screen, see that constant and `docs/DESIGN_SYSTEM.md` §6.
        <main className={`flex flex-1 flex-col ${PROFILE_SCREEN}`}>
            <EditProfileView />
        </main>
    )
}
