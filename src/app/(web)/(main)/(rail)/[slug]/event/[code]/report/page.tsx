import { parseChannelSlug } from '@features/channel'
import { EventReportScreen } from '@features/event'
import { eventReportPath } from '@features/event/routes'
import { getEventForRequest } from '@features/event/server'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'

/**
 * `/@{slug}/event/{code}/report` — **the host's per-order report** for one broadcast: every ticket,
 * gift and interactive game somebody bought during it.
 *
 * ## A route, where legacy has a modal
 *
 * Legacy opens this in a `ResponsiveModal` from the *Revenue summary* header — a popup on a desktop,
 * a full-page sheet on a phone. Both were approximating a page, and this port started as a dialog at
 * every width. The content is a scrollable table of up to fifty rows with its own tabs and its own
 * search, which is a screen's worth of interaction to put behind an overlay.
 *
 * As a route it gets what neither could: the browser's own **back** closes it, a refresh stays on
 * it, and it has a `loading.tsx` rather than a spinner inside a popup. `earnings-report/[dateTs]`
 * is the same shape one directory over — a report drilled into by URL.
 *
 * ## Owner-only, and the server cannot enforce it
 *
 * There is no bearer during a server render (`shared/lib/api/token.ts`), so the ownership check is
 * `EventReportScreen`'s, on the client. That is not the security boundary and does not need to be:
 * all three endpoints behind the screen answer for the bearer about an event the bearer must own, so
 * a stranger who forced them gets a 403. What the client decides is **what to render**, and it sends
 * a non-host to the event page rather than showing them a wall — there is a real page for them one
 * level up.
 *
 * ## The server render earns its keep the same way the event page's does
 *
 * `getEventForRequest` is React-cached, so `generateMetadata` and the body share one upstream
 * request — and the body it returns seeds `useEvent`, which is what keeps the page title and the
 * ownership check off a skeleton. It carries no bearer, so `purchased` / `need_unlock_package` read
 * as their fail-closed defaults; nothing here reads them.
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string; code: string }>
}): Promise<Metadata> {
    const { slug, code } = await params
    if (!parseChannelSlug(slug)) return {}

    const t = await getServerT()
    const { status, event } = await getEventForRequest(code)
    const title = t('event_report_details')

    return {
        /*
         * The broadcast's name in the tab title, because a host with several of these open is
         * otherwise looking at three identical tabs. Falls back to the bare heading.
         */
        title: status === 'ok' && event.title ? `${title} — ${event.title}` : title,
        /*
         * `nofollow` as well as `noindex`, unlike the event page. That one is public content whose
         * links a crawler should still walk back to the space; this is **one person's revenue**, and
         * there is nothing under it worth crawling. The same pair `/mcn-partnership` and
         * `/my-wallet` carry.
         *
         * ⚠ And deliberately **not** disallowed in `robots.ts`: a disallowed URL is one a crawler
         * never fetches, so it never reads the `noindex` either. Crawlable + `noindex` is what
         * actually keeps it out.
         */
        robots: { index: false, follow: false },
    }
}

export default async function EventReportPage({
    params,
}: {
    params: Promise<{ slug: string; code: string }>
}) {
    const { slug, code } = await params
    const parsed = parseChannelSlug(slug)
    if (!parsed) notFound()

    /*
     * `notFound()` walks up to `[code]/not-found.tsx` — the **event's** wall, not the channel's and
     * not the app's. A report for an event that does not exist is a missing event, and that boundary
     * is what says so; see its own note for the bug that existed before it.
     */
    const { status, event } = await getEventForRequest(code)
    if (status === 'gone') notFound()

    /*
     * ## The handle is collapsed onto the space's own, exactly as on the event page
     *
     * This shipped the other way — *"no canonical-slug redirect here"*, on the grounds that the page
     * is `noindex, nofollow`, owner-only and shared with nobody, so a handle variant costs no crawler
     * and no attribution and a redirect would be "motion with no reason behind it".
     *
     * Every clause of that is true and none of it was the reason. The cost here is **internal**: an
     * event is addressed by its code, so the handle is whatever link somebody followed, and
     * `EventReportScreen` reads it back out to build `parent` — the destination of both its back
     * control and its non-host bounce. After a rename, back goes to a space page for a handle that
     * no longer resolves. The SEO argument was answering a question nobody had asked.
     *
     * The screen defends itself too (it prefers `event.channel.slug` once the payload lands, and
     * corrects the address bar via `useCanonicalEventSlug`). Doing it here as well is not
     * belt-and-braces: redirecting here means the prop is already canonical on the first paint, so
     * there is no beat where `parent` is wrong and no client-side replace to pay for. (⚠ It leaves
     * as a meta refresh in a 200 rather than a 308 — the event page's own note has the measurement.
     * Irrelevant on this route, which no crawler is meant to see anyway.) The hook stays for the two
     * renders this cannot reach — a failed server fetch, and a client-side navigation.
     */
    const ownSlug = event?.channel?.slug
    if (ownSlug && ownSlug !== parsed) permanentRedirect(eventReportPath(ownSlug, code))

    return <EventReportScreen code={code} slug={parsed} initialEvent={event} />
}
