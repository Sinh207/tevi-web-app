import { create } from 'zustand'
import type { Post } from '../api/types'

/**
 * Which post the reply popup is open on, or `null`.
 *
 * ## Why a store, and why one renderer
 *
 * The same arrangement `composer-store.ts` beside this file argues for, and the same reason: **the
 * openers are everywhere and the renderer is one place.** Every `PostCard` in a feed carries a
 * *Comment* button, so state held in the card would be one dialog per row — a hundred portals on a
 * long feed, and base-ui focusing whichever mounted first.
 *
 * It also has to survive the card: a windowed feed stands rows down as the reader scrolls
 * (`useRenderWindow`), so a dialog owned by a row would close itself when the row behind it was
 * unmounted. Here the post is held by the store and the row is free to go.
 *
 * ## It holds the post, not an id
 *
 * The popup draws the post it is replying to — author, text, media — and the row that opened it
 * already has that object. An id would mean a second fetch for something the opener was holding,
 * and a reply is not a route: nothing else needs to resolve it.
 *
 * It is UI state, so Zustand is correct per `CLAUDE.md`'s first rule. The **draft** is not in here:
 * it belongs to the composer inside the dialog, dies with it, and nothing outside reads it.
 */
interface ReplyDialogState {
    post: Post | null
    open: (post: Post) => void
    close: () => void
}

export const useReplyDialogStore = create<ReplyDialogState>(set => ({
    post: null,
    open: (post: Post) => set({ post }),
    close: () => set({ post: null }),
}))

/**
 * Open the reply popup for a post.
 *
 * Exported as a plain function as well as the hook, so a control that already has the post can open
 * it without subscribing to a store it never reads — a feed of cards subscribing one-by-one would
 * re-render every row each time the dialog opened.
 */
export function openReplyDialog(post: Post) {
    useReplyDialogStore.getState().open(post)
}
