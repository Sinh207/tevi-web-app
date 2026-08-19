'use client'

import {
    ChannelEmptyState,
    ChannelError,
    type ChannelEvent,
    ChannelEventCard,
    ChannelLiveTab,
    LIVE_EVENTS_ART,
} from '@features/channel/dev'

/**
 * The fixtures and the three states, in a client component because `ChannelError` takes an
 * `onRetry` callback and a server component cannot hand a function across the boundary.
 */
const FIXTURES: ChannelEvent[] = [
    {
        code: 'live-1',
        title: 'Friday night listening party',
        start_at: '2025-02-20T14:30:00.000Z',
        status: 'LIVE',
        images: { banner: null },
    },
    {
        code: 'soon-1',
        title: 'Album Q&A — bring your questions, this one has a long title to truncate',
        start_at: '2025-03-02T09:00:00.000Z',
        status: 'PUBLISHED',
        images: { banner: null },
    },
    {
        code: 'prep-1',
        title: 'Sound check',
        start_at: '2025-03-02T08:00:00.000Z',
        status: 'PREPARING',
        images: { banner: null },
    },
    {
        code: 'paused-1',
        title: 'Paused mid-stream',
        start_at: '2025-01-11T19:00:00.000Z',
        status: 'PAUSED',
        images: { banner: null },
    },
    {
        code: 'ended-1',
        title: 'New Year countdown',
        start_at: '2024-12-31T16:00:00.000Z',
        status: 'ENDED',
        images: { banner: null },
    },
    {
        code: 'cancelled-1',
        title: 'Rained off',
        start_at: '2024-11-02T12:00:00.000Z',
        status: 'CANCELLED',
        images: { banner: null },
    },
    {
        code: 'unknown-1',
        title: 'Status the client has never heard of — renders no chip',
        start_at: null,
        status: 'SOMETHING_NEW',
        images: { banner: null },
    },
]

export function LiveStates() {
    return (
        <main className="mx-auto flex w-full max-w-[612px] flex-col gap-10 p-3 md:p-6">
            {/*
             * The real tab, query and all. It needs an owner session to return anything, so on a
             * plain load it lands on the error state — which is itself worth seeing. Intercept
             * `v4/events/` to drive it with data.
             */}
            <Section title="The tab itself — heading row, sticky under the tab strip">
                <ChannelLiveTab slug="ada" />
            </Section>

            <Section title="Rows — every status">
                <div className="flex min-w-0 flex-col gap-4">
                    {FIXTURES.map(event => (
                        <ChannelEventCard key={event.code} event={event} slug="ada" />
                    ))}
                </div>
            </Section>

            <Section title="Empty">
                <ChannelEmptyState
                    art={LIVE_EVENTS_ART.empty}
                    title="No live events yet"
                    body="Create your first live event to connect with your fanbase in real time."
                />
            </Section>

            <Section title="Error — unavailable (retryable)">
                <ChannelError kind="unavailable" onRetry={() => {}} />
            </Section>

            <Section title="Error — restricted (no retry). Legacy has neither; it shows Empty.">
                <ChannelError kind="restricted" />
            </Section>
        </main>
    )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="flex min-w-0 flex-col gap-3">
            <h2 className="type-caption-label text-(--text-placeholder)">{title}</h2>
            {children}
        </section>
    )
}
