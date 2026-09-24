// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eventDetailSchema } from '../api/types'

/**
 * **When a host is told the web cannot run their broadcast.**
 *
 * The panel exists because the page said nothing at all while a creator's own stream was on air —
 * it showed the revenue report, which answers "how did this do" to somebody asking "can I run it
 * from here". A silent page reads as a broken one, and that is what was reported.
 *
 * What is worth pinning is the *condition*, not the copy. Drawn on an ended stream it is an offer to
 * open a broadcast that is over; withheld while live it is the original bug back again. And `PAUSED`
 * is the case nobody guesses right: `isOffAir` groups it with `ENDED`, which is legacy's own
 * grouping, so a paused stream gets the report and no hand-off.
 */
vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (k: string) => k, currentLanguage: 'en' }),
}))
vi.mock('./event-app-handoff', () => ({
    EventAppHandoff: () => <div data-testid="stub-handoff" />,
}))
vi.mock('./event-host-screen', () => ({
    EventHostScreen: () => <div data-testid="stub-report" />,
}))
/*
 * Rendered as its `actions` slot alone. The wiring under test is *which states get a Share control
 * in the bar* — the real bar drags in a router and the DS `AppBar` and can say nothing about that.
 */
vi.mock('./event-top-bar', () => ({
    EventTopBar: ({ actions }: { actions?: React.ReactNode }) => <div>{actions}</div>,
}))
vi.mock('./event-share-button', () => ({
    EventShareButton: () => <div data-testid="stub-share" />,
}))
vi.mock('./event-skeleton', () => ({ EventSkeleton: () => <div data-testid="stub-skeleton" /> }))
vi.mock('./event-state-screens', () => ({
    EventNotFoundState: () => null,
    EventErrorState: () => null,
}))
vi.mock('./event-host-info-card', () => ({
    EventHostInfoCard: () => <div data-testid="stub-masthead" />,
}))
vi.mock('./event-host-card', () => ({ EventHostCard: () => null }))
vi.mock('./event-watch-panel', () => ({
    EventWatchPanel: () => null,
    // The host screen draws its notice in this shell — the same card the six watch states use.
    EventPanelShell: ({ testId, children }: { testId: string; children: React.ReactNode }) => (
        <div data-testid={testId}>{children}</div>
    ),
}))
vi.mock('./event-description-card', () => ({ EventDescriptionCard: () => null }))
vi.mock('./event-age-gate', () => ({ EventAgeGate: () => null }))
vi.mock('../hooks/use-event-ownership', () => ({ useEventOwnership: () => 'host' }))
/*
 * The Live studio is a **viewer** screen and every case here is the host's, so the hook is stubbed
 * off rather than driven: what it would otherwise contribute is a `window.matchMedia` call jsdom
 * does not implement. `use-live-studio.test.tsx` pins the hook itself, and `event-screen.test.tsx`
 * pins the branch that chooses between the two viewer screens.
 */
vi.mock('../hooks/use-live-studio', () => ({ useLiveStudio: () => false }))
vi.mock('../hooks/use-age-gate', () => ({
    useAgeGate: () => ({ isResolving: false, isAllowed: true, required: false, confirm: vi.fn() }),
}))
vi.mock('../hooks/use-canonical-event-slug', () => ({ useCanonicalEventSlug: () => {} }))

const event = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('../hooks/use-event', () => ({
    useEvent: () => ({
        event: event.current,
        isLoading: false,
        notFound: false,
        isError: false,
        refetch: vi.fn(),
    }),
}))

const { EventScreen } = await import('./event-screen')

const at = (status: string) =>
    eventDetailSchema.parse({
        code: 'evt-1',
        title: 'A stream',
        status,
        channel: { id: 'ch-1', slug: 'ada' },
    })

function show(status: string) {
    event.current = at(status)
    render(<EventScreen code="evt-1" slug="ada" initialEvent={undefined} />)
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe('the host hand-off', () => {
    it('is the whole screen while the stream is on air', () => {
        show('LIVE')
        expect(screen.getByTestId('event-host-live')).toBeTruthy()
        expect(screen.getByTestId('stub-handoff')).toBeTruthy()
    })

    /*
     * ⚠ **The stream's own details come with it.** An early version was a bare centred notice, which
     * threw away a payload carrying the banner, the title and the schedule — so a perfectly healthy
     * broadcast rendered as something that looks like an error state.
     *
     * It is the **creator's** masthead rather than the viewer's details card, and that is a size
     * decision as much as an editorial one: 141px against 569, which is what lets the page fit a
     * window without scrolling. The masthead is hidden by a `max-height` query below 820px, so this
     * asserts it is *rendered* — jsdom applies no media queries, which is the honest limit of what a
     * unit test can say here. The nine-viewport measurement is in the component's own note.
     */
    it('shows the event rather than only the notice', () => {
        show('LIVE')
        expect(screen.getByTestId('stub-masthead')).toBeTruthy()
    })

    /*
     * Share moves to the bar **for this state only**. The screen drops the viewer's details card,
     * and `EventActions` — the page's own Share — lives inside it, so without this the one thing a
     * creator on a laptop can actually do while broadcasting disappears with the card.
     */
    it('puts Share in the bar', () => {
        show('LIVE')
        expect(screen.getByTestId('stub-share')).toBeTruthy()
    })

    /*
     * ⚠ The point of the rewrite from a card to a screen, and the only assertion that distinguishes
     * them: the report is **gone**, not pushed below a notice. A page that says "you cannot do
     * anything here" above a working dashboard gives two answers to one question.
     */
    it('replaces the report rather than sitting above it', () => {
        show('LIVE')
        expect(screen.queryByTestId('stub-report')).toBeNull()
    })

    /** Nothing is on air to open. Offering the app here is an invitation to a stream that is over. */
    it('is withheld once the stream has ended', () => {
        show('ENDED')
        expect(screen.queryByTestId('event-host-live')).toBeNull()
        expect(screen.getByTestId('stub-report')).toBeTruthy()
    })

    /*
     * ⚠ And the bar's Share goes with it. The report has no details card either, but it is not this
     * screen — a second Share would appear on the viewer's page too, where `EventActions` already
     * draws one inside the card. The slot is filled by state, never unconditionally.
     */
    it('takes the bar Share away with it', () => {
        show('ENDED')
        expect(screen.queryByTestId('stub-share')).toBeNull()
    })

    /**
     * ⚠ The case that is easy to get wrong in either direction. `PAUSED` reads like "still live", and
     * `isOffAir` groups it with `ENDED` — legacy's own grouping, and the reason this goes through
     * `isLive` rather than a comparison written out here.
     */
    it('is withheld while the stream is paused', () => {
        show('PAUSED')
        expect(screen.queryByTestId('event-host-live')).toBeNull()
        expect(screen.getByTestId('stub-report')).toBeTruthy()
    })

    it('is withheld before the stream has started', () => {
        show('PUBLISHED')
        expect(screen.queryByTestId('event-host-live')).toBeNull()
        expect(screen.getByTestId('stub-report')).toBeTruthy()
    })

    it('is withheld on a cancelled stream', () => {
        show('CANCELLED')
        expect(screen.queryByTestId('event-host-live')).toBeNull()
        expect(screen.getByTestId('stub-report')).toBeTruthy()
    })
})
