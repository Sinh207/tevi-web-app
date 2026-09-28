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
} as const
