/**
 * The event namespace's **paths**, and nothing else.
 *
 * Import-free, and at the feature root, for the reason `CLAUDE.md` gives at length: a module that
 * only needs to know where an event lives must not pull in the screen, the dialogs,
 * `@features/membership` and `@features/balance` to find out. `features/channel` has three surfaces
 * that link at an event — the Live tab's card, the Live-now strip, the Following row — and each of
 * them builds the URL by hand today, which is three places for the shape to drift.
 *
 * Same rule and same file name as `@features/channel/routes` and `@features/payment/routes`:
 * `@features/event/routes`, never `@features/event`.
 */

/**
 * `/@{slug}/event/{code}` — one space's live event.
 *
 * Legacy's URL, kept exactly: it is what every share link, QR code and mobile deep link in the wild
 * already points at, and `proxy.ts` does not rewrite it.
 *
 * Both segments are percent-encoded. That is not defensive decoration — a slug is chosen by its
 * owner and an event code is minted by the backend, so neither is guaranteed to be URL-safe, and a
 * raw `#` or `?` in either would silently truncate the path. The leading `@` is added here rather
 * than expected in `slug`, because every payload in this app carries the slug without it.
 */
export function eventPath(slug: string, code: string): string {
    return `/@${encodeURIComponent(slug.replace(/^@/, ''))}/event/${encodeURIComponent(code)}`
}

/**
 * `/@{slug}/event/{code}/report` — **the host's per-order report**: every ticket, gift and
 * interactive game bought during one broadcast.
 *
 * ## A route, where legacy has a modal
 *
 * Legacy opens this in a `ResponsiveModal` — a dialog on a desktop, a full-page sheet on a phone. A
 * route is what both of those were approximating, and it buys the three things neither could: the
 * browser's own **back** closes it, a refresh stays on it, and it gets a `loading.tsx` of its own
 * instead of a spinner inside a popup. `earnings-report/[dateTs]` is the same shape one directory
 * over — a report you drill into by URL.
 *
 * **Owner-only, and it has no visitor form.** Every endpoint behind it answers for the bearer about
 * an event the bearer must own, so somebody else opening this URL is sent to the event page rather
 * than shown a refusal: there is a real page for them one level up. `noindex, nofollow` for the same
 * reason — it is one person's revenue.
 *
 * Not a **new** address in the wild: legacy has no URL for this at all, so nothing links here yet
 * and there is nothing to keep working. The shape follows this app's own convention rather than a
 * legacy one.
 */
export function eventReportPath(slug: string, code: string): string {
    return `${eventPath(slug, code)}/report`
}
