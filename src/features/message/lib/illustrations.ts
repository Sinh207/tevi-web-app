/**
 * Direct messages' empty-state art, committed under `public/illustrations/message/` by
 * `scripts/build-cdn-art.mjs` (`message-empty`, `message-no-results`). Both are legacy's own
 * (`IMAGES_STATIC.directMessage.emptyConversation` / `.noResultsFound`), copied verbatim — see
 * [`docs/STATIC_ASSETS.md`](../../../../docs/STATIC_ASSETS.md).
 *
 * The boxes are the SVGs' own `width`/`height`. Legacy draws the empty one at 92×100 and the other
 * at 100×100 or 80×100 depending on which of its two copies of the component rendered — the source
 * sizes are what both were cut to, so they are what is used.
 */
export const MESSAGE_ART = {
    empty: { src: '/illustrations/message/empty-conversation.svg', width: 92, height: 101 },
    noResults: { src: '/illustrations/message/no-results.svg', width: 82, height: 100 },
    /**
     * The doodle tile behind a conversation (`message-thread-pattern`) — white line art at ≤20%
     * alpha, one of the three repeats legacy's `background-dm.png` ships side by side. Drawn over
     * `--gradient-message-thread`, height-fitted and repeated sideways; see `ChatRoom`.
     */
    threadPattern: { src: '/illustrations/message/thread-pattern.webp', width: 425, height: 797 },
    /**
     * The Premium mark on a gift card — **`/premium`'s own file**, not a copy: legacy's gift draws
     * the same `logoPremium` the Premium screen does, and two copies of one mark are two versions
     * of it the moment Brand ships a new one. Same call `theo-search.svg` makes for its readers.
     */
    premiumLogo: { src: '/illustrations/premium/logo.webp', width: 100, height: 100 },
} as const
