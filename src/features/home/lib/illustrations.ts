/**
 * The pictures the home feed draws — committed under `public/illustrations/`, never fetched
 * (`docs/STATIC_ASSETS.md`).
 *
 * `noLives` is the same file the space page's empty Live tab uses (`LIVE_EVENTS_ART` in
 * `features/channel`), which is also what legacy's home `noData` and Figma's *Nothing's Live… Yet*
 * draw. Declared here rather than imported: that constant is not on the channel barrel, and one
 * path string is cheaper than widening a barrel for a picture. Width and height are the drawn box,
 * 154 × 183, as Figma's `Isolation_Mode` frame.
 */
export const HOME_ART = {
    noLives: { src: '/illustrations/no-live-events.png', width: 154, height: 183 },
    /**
     * The empty feed — legacy's `NoPost` (`IMAGES_STATIC.post.isolation`), drawn at its 93 × 117.
     * The same committed file as `COLLECTION_ART.noPosts` (`collection/no-posts.svg`, 94 × 118
     * native): one upstream vector, so one copy on disk; the path is repeated rather than imported
     * for the reason given for `noLives` above.
     */
    lonely: { src: '/illustrations/collection/no-posts.svg', width: 93, height: 117 },
} as const
