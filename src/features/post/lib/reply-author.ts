import type { AvatarVideoInput } from '@shared/lib/avatar-source'

/**
 * The reader, as the reply composer needs to draw them.
 *
 * ## Why this is its own module and not a type on the component
 *
 * It was `export type { ReplyComposerAuthor } from './components/reply-composer'` on the feature
 * barrel, and that **broke the route**: `reply-composer.tsx` carries `'use client'`, the barrel does
 * not, and `page.tsx` — a server component — imports the barrel for `buildPostTitle` and the rest.
 * Re-exporting through a client module from there put that module in the server graph, and the
 * route started answering **404** on every post. Not a type error, not a build error: a page that
 * had worked a minute earlier stopped resolving, which is why it is written down here.
 *
 * A type-only module has no directive and nothing to execute, so the barrel can re-export it and
 * the client component can import it without either side pulling the other in.
 *
 * ## Why it is flat rather than `features/channel`'s `Channel`
 *
 * This feature cannot name that type — the dependency runs channel → post — and what the box draws
 * is these five fields. `PostDetailScreen` (in `app/`, which may read both) flattens the provider's
 * channel into this on the way down.
 */
export interface ReplyComposerAuthor {
    name: string | null
    slug: string | null
    thumb: string | null
    avatarVideo: AvatarVideoInput | null
    isPremium: boolean
    verifiedBadge: string | null
}
