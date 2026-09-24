import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EventStates } from './event-states'

export const metadata: Metadata = {
    title: 'Event page states',
    robots: { index: false, follow: false },
}

/**
 * Dev-only harness for `/@{slug}/event/{code}`: `pnpm dev`, then `/dev/event`. 404s in production.
 *
 * ## Why it exists
 *
 * Almost nothing on that page can be reached by browsing. The **watch panel** alone has six states
 * and they are mutually exclusive — one real event is on air *or* upcoming *or* cancelled, never two
 * — and four of the six additionally need a condition somebody else has to create: a price, a
 * membership tier, a platform restriction, an 18+ flag. The age gate needs the flag *and* an
 * unconfirmed account. The two failure screens need a service that is down.
 *
 * That is exactly the shape of thing this repo's `/dev/live` harness was written for, and the
 * post-mortem it records applies here verbatim: the first version of that tab shipped as the wrong
 * component entirely because it was written from grepped fragments instead of from looking at
 * anything.
 *
 * The fixtures go through the **real schema** rather than being typed as literals. Hand-typed
 * fixtures go stale the first time the schema learns a field, and `eventDetailSchema` is young.
 */
export default function EventStatesPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return <EventStates />
}
