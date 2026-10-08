import type { TeviIconName } from '@shared/ui/icon-names'

/**
 * The glyph for what a locked post is hiding — on the paywall pill, the media tile and the
 * *Add posts* rows.
 *
 * From the DS sprite, which is the only place an icon may come from (what `/dev/icons` shows).
 * These replaced legacy's own paths (`legacy-icons.tsx`, deleted): legacy draws a rounded video
 * frame where `film-play` is a film strip, and an open book where `document` is a page — different
 * drawings of the same idea, which is the trade the one-source rule makes.
 */
export const LOCK_MEDIA_GLYPH = {
    images: 'image',
    video: 'film-play',
    text: 'document',
} as const satisfies Record<'images' | 'video' | 'text', TeviIconName>

export type LockMediaKind = keyof typeof LOCK_MEDIA_GLYPH
