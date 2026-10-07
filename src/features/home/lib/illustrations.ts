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
} as const
