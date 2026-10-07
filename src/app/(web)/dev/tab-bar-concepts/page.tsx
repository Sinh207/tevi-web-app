import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { TabBarConceptsPreview } from './preview'

export const metadata: Metadata = {
    title: 'Tab bar concepts',
    robots: { index: false, follow: false },
}

/**
 * Dev-only: the mobile bottom bar as it ships, beside two proposed redesigns, in a phone frame over
 * a scrolling feed — so the glass, the slide and the press can be judged on a device rather than
 * from a screenshot. `pnpm dev`, then open `/dev/tab-bar-concepts` on a phone. 404s in production.
 *
 * Nothing here is wired to the real shell: `AppTabBar` is untouched until a concept is chosen.
 */
export default function TabBarConceptsPage() {
    if (process.env.NODE_ENV === 'production') notFound()
    return <TabBarConceptsPreview />
}
