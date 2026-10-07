import { parseChannelSlug, serializeJsonLd } from '@features/channel'
import { EventScreen } from '@features/event'
import {
    buildEventDescription,
    buildEventTitle,
    eventCanonicalPath,
    eventJsonLd,
    getEventForRequest,
    mayDescribeEventForCrawler,
    studioBackdropUrl,
} from '@features/event/server'
import { siteOpenGraph } from '@shared/config/seo'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'

/**
 * `/@{slug}/event/{code}` — **one of a space's live events.**
 *
 * Legacy's URL, kept exactly: it is what every share link, QR code and mobile deep link already
 * points at, and three surfaces in this app link at it (the Live tab card, the Live-now strip, the
 * Following row). `proxy.ts` does not rewrite it.
 *
 * ## What replaced the stand-in that was here
 *
 * This route used to render `ChannelLiveEventScreen` — a single centred panel saying "watch this in
 * the app", with the event resolved by a `find` over `channel.lives[]`. It existed ahead of any
 * event feature because the alternative was a 404 on a URL that ends up on posters, and its own doc
 * said so.
 *
 * Two things were wrong with it and both are gone. It could only resolve events **listed in the
 * space payload**, so an ended stream — or one the array simply omitted — 404'd although it existed.
 * And it showed the reader nothing *about* the broadcast: no banner, no schedule, no description, no
 * price, no host. `v4/public/events/{code}/` answers all of that without a bearer, which is what
 * makes this page possible at all.
 *
 * The app hand-off survives, as one block of a real page (`EventWatchPanel`), because the player is
 * still the app's — see `docs/EVENT.md` §3.
 *
 * ## The server render, and the two things it must not do
 *
 * `getEventForRequest` is cached per render, so `generateMetadata` and the body share one upstream
 * request. It has **no bearer** (auth is in `localStorage` by construction), so the body it gets is
 * the event's half of the payload and not the reader's: `purchased` and `need_unlock_package` read
 * as their fail-closed defaults. Two consequences, both stated where they are enforced:
 *
 * 1. **Nothing may be authorised from it.** The render is shared, so a server decision about *this*
 *    reader's access would be a decision about every reader's. `EventScreen` asks that question on
 *    the client.
 * 2. The body is passed down as a **seed**, dated to the epoch, so TanStack refetches on mount
 *    (`use-event.ts`). It buys the first paint and nothing else.
 *
 * ## A failed request does not 404
 *
 * `gone` (a real 404 from the service) raises `notFound()`. `unavailable` — a 5xx, a timeout, an
 * unparseable body — renders the page with **no seed** and lets the client's own fetch decide.
 * Collapsing the two would turn an outage into "your link is broken" on the URL printed on a
 * poster, and would do it with a cacheable response.
 *
 * `notFound()` renders **this segment's own** `not-found.tsx`, which draws the event's wall. That
 * file exists because the nearest boundary above it is `[slug]/not-found.tsx` — the *channel's* — so
 * without it a dead event link said "this Space isn't available" about a space that exists and whose
 * page is one level up. The rule it follows: `app/not-found.tsx` is for a URL matching **no route in
 * the app**; a route that exists and cannot find its *data* answers for itself.
 *
 * ⚠ **It is still a soft 404** — 200 with the not-found body. Not this route's doing: this route
 * has a `loading.tsx`, and so do `[slug]` and the app root, so by the time `notFound()` runs a
 * fallback has streamed and the status line is sent. `(main)/[slug]/page.tsx` carries the
 * measurement and why it is left alone. Which is also
 * why `generateMetadata` returns **no `robots`** on that path: Next emits its own `noindex` for a
 * not-found render, and a second tag beside it is two where one is expected.
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string; code: string }>
}): Promise<Metadata> {
    const { slug, code } = await params
    const t = await getServerT()
    // A malformed handle is not a lookup — `parseChannelSlug` rejects anything that is not `@slug`.
    if (!parseChannelSlug(slug)) return {}

    const { status, event } = await getEventForRequest(code)
    // No metadata to build. `{}` rather than a `noindex` pair: on the `gone` path the page itself
    // raises `notFound()` and Next emits the directive, and on `unavailable` the page renders — so
    // deindexing a live stream over one failed request would be the wrong permanent decision.
    if (status !== 'ok') return {}

    const canonical = eventCanonicalPath(event)

    // NSFW space or an 18+ stream: the generic card, nothing of the broadcast's own. The reasons —
    // and why the 18+ half diverges from legacy — are on `mayDescribeEventForCrawler`.
    if (!mayDescribeEventForCrawler(event)) {
        return {
            title: { absolute: t('event_meta_fallback_title') },
            ...(canonical ? { alternates: { canonical } } : {}),
            robots: { index: false, follow: false },
        }
    }

    const title = buildEventTitle(event, t('channel_event_untitled'))
    const description = buildEventDescription(
        event,
        t('event_seo_join', { name: event.channel?.name ?? `@${event.channel?.slug ?? ''}` }),
    )

    return {
        // `absolute`: legacy's shape already ends in `on Tevi`, and the template would add `· Tevi`.
        title: { absolute: title },
        description,
        ...(canonical ? { alternates: { canonical } } : {}),
        /*
         * `noindex, follow`. A live event is the most perishable page in the app — indexed, it puts
         * "watch now" in results for a broadcast that ended hours ago and competes with the space
         * page for the same creator's name. `follow` so a crawler still walks the links back to that
         * space. Legacy sets this exact pair on this exact route; `lib/event-seo.ts` has the rest,
         * including why this URL must **not** be disallowed in `robots.ts`.
         */
        robots: { index: false, follow: true },
        openGraph: siteOpenGraph({
            ...(canonical ? { url: canonical } : {}),
            title,
            description,
            ...(event.images.banner ? { images: [{ url: event.images.banner }] } : {}),
        }),
    }
}

export default async function ChannelEventPage({
    params,
}: {
    params: Promise<{ slug: string; code: string }>
}) {
    const { slug, code } = await params
    const parsed = parseChannelSlug(slug)
    if (!parsed) notFound()

    const { status, event } = await getEventForRequest(code)
    if (status === 'gone') notFound()

    /*
     * ## The slug in the URL is collapsed onto the space's own spelling
     *
     * An event is addressed by its **code**, which is globally unique — the handle in front of it is
     * decoration, and a shared link routinely carries a different casing (or, after a rename, a
     * different handle entirely). Left alone, `/@Ada/event/x` and `/@ada/event/x` are two URLs for
     * one broadcast, which splits the share attribution and gives a crawler a duplicate to fold.
     *
     * `rel=canonical` alone is not enough here, and legacy agrees — it issues a **301** for exactly
     * this case.
     *
     * ## ⚠ It is not a 308 on the wire, and that is measured
     *
     * `permanentRedirect` is Next's 308 and this comment used to say so. It is not what ships. Same
     * cause as the soft 404 one directory up (`[slug]/page.tsx` carries the measurement): a
     * `loading.tsx` fallback has streamed before this runs, and a redirect raised *after* that can
     * no longer set a status. What Next emits instead is a `<meta http-equiv="refresh" content="0;url=…">`
     * inside a **200**:
     *
     * ```
     * /@wronghandle/event/{code}   200  → lands on /@sinhpn11/event/{code}
     * /@SinhPn11/event/{code}      200  → lands on /@sinhpn11/event/{code}
     * ```
     *
     * So the correction *works* — a reader and a browser both end up on the canonical URL, and Google
     * reads a zero-delay meta refresh as a permanent redirect. What is lost is the rest of the
     * machines: not every proxy or share-unfurler follows one, which is why `alternates.canonical`
     * in `generateMetadata` carries more of the duplicate-folding weight than this block does.
     *
     * Not worth chasing here: the fix is the soft 404's fix, and `[slug]/page.tsx` says why it is
     * not taken. Written down so the next reader does not conclude from a 200 that the redirect is
     * broken. `[slug]/page.tsx`'s own `canonicalChannelRedirect` is subject to exactly the same
     * thing.
     *
     * ## Compared **exactly**, and it used to be compared case-insensitively
     *
     * `ownSlug.toLowerCase() !== parsed.toLowerCase()` is what shipped, which meant the paragraph
     * above described something the code did not do: `/@Ada/event/x` and `/@ada/event/x` both stood,
     * so the duplicate this block exists to fold was the one case it let through — and casing is by
     * far the commonest way the two spellings diverge.
     *
     * Exact is also the rule one directory up. `canonicalChannelRedirect` compares exactly because
     * the canonical spelling is **the creator's own** — `channel-slug.ts` records that legacy
     * redirects `/@noraazima` *to* `/@Noraazima`, not the other way round. A case-insensitive
     * comparison here would have the space page and the event page beneath it disagree about which
     * of two spellings is the real one.
     *
     * Only when the payload actually named a slug: a rename is a legitimate redirect, a missing
     * field is not a reason to move anybody.
     *
     * ⚠ This is the **server's** half. It cannot run on the `unavailable` path (there is no event to
     * compare) or on a client-side navigation (there is no server render), so `EventScreen` carries
     * the same rule as a `history.replaceState` — see `useCanonicalEventSlug`. Redirecting here is
     * the better answer wherever it is possible, because it corrects the URL before the page's JS
     * runs at all.
     */
    const ownSlug = event?.channel?.slug
    if (ownSlug && ownSlug !== parsed) {
        const canonical = eventCanonicalPath(event)
        if (canonical) permanentRedirect(canonical)
    }

    const t = await getServerT()

    return (
        <>
            {/*
             * Rendered only for a body we actually have. `Event` structured data built from an
             * `unavailable` render would be a page describing an event it could not read — and
             * never for one the metadata withholds (`mayDescribeEventForCrawler`).
             */}
            {event && mayDescribeEventForCrawler(event) && (
                <script
                    type="application/ld+json"
                    /*
                     * `serializeJsonLd`, never bare `JSON.stringify`: the event's title and
                     * description are creator-typed and reach here verbatim, and `stringify` leaves
                     * angle brackets alone — so a description containing a closing script tag would
                     * end our tag early and run whatever followed. Its own doc has the detail.
                     */
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: escaped by serializeJsonLd
                    dangerouslySetInnerHTML={{
                        __html: serializeJsonLd(eventJsonLd(event, t('channel_event_untitled'))),
                    }}
                />
            )}
            {/*
             * `initialEvent` is `null` on the `unavailable` path and the event on the `ok` one.
             * Never `undefined` here — that third value means "no server fetch happened", which is
             * a client-side navigation into this route and is not reachable from a page that always
             * fetches. `use-event.ts` explains what each of the three does.
             */}
            <EventScreen
                code={code}
                slug={parsed}
                initialEvent={event}
                // `null`, never `undefined`: an undefined prop does not cross to the client.
                backdropUrl={studioBackdropUrl(event)}
            />
        </>
    )
}
