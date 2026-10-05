// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventDetail } from '../api/types'
import { eventDetailSchema } from '../api/types'
import type { EventOwnership } from '../hooks/use-event-ownership'

/**
 * **Which of the two pages behind this URL a reader gets, and in what order the gates are asked.**
 *
 * This screen is a chain of seven branches over three async sources, and every wrong ordering of it
 * renders a plausible screen — which is why it has now been wrong twice, both times caught by a
 * person looking at the result rather than by anything here.
 *
 * 1. `'unknown'` collapsed into `'viewer'` showed a host a paywall for their own broadcast; into
 *    `'host'`, a stranger somebody else's revenue (`use-event-ownership.test.tsx` holds that half).
 * 2. The **age gate above the ownership branch** asked a creator to confirm they were over 18
 *    before showing them their own revenue report — reported from a live stream, and the subject of
 *    this file.
 *
 * Legacy settles it structurally rather than by argument: `isMyEvent ? <Creator /> : <Viewer />`,
 * with `AgeRestricted` inside the *viewer* tree beside Ended, GeoRestricted, PlatformRestricted,
 * Kickout and Locked. The creator tree has no age gate at all.
 */
const state = vi.hoisted(() => ({
    event: null as EventDetail | null,
    isLoading: false,
    ownership: 'viewer' as EventOwnership,
    age: { isResolving: false, isAllowed: true, required: true, confirm: vi.fn() },
    /*
     * The Live studio, off by default. It is the second of the *viewer's* two screens, so it sits
     * below every gate this file is about — ownership, not-found, the outage state and the 18+
     * confirmation are all asked before it — and leaving it off keeps each of those cases about
     * the one thing it pins. `use-live-studio.test.tsx` pins when the hook itself says yes.
     */
    inStudio: false,
    /** A narrow screen — the phone studio is switched off, so a live stream gets the notice. */
    compact: false,
}))

vi.mock('../hooks/use-event', () => ({
    useEvent: () => ({
        event: state.event,
        isLoading: state.isLoading,
        notFound: false,
        isError: false,
        refetch: vi.fn(),
    }),
}))
vi.mock('../hooks/use-event-ownership', () => ({ useEventOwnership: () => state.ownership }))
const ageArgs = vi.hoisted(() => ({ last: null as { required: boolean } | null }))
vi.mock('../hooks/use-age-gate', () => ({
    useAgeGate: (args: { required: boolean }) => {
        ageArgs.last = args
        return state.age
    },
}))
vi.mock('../hooks/use-canonical-event-slug', () => ({ useCanonicalEventSlug: () => {} }))
vi.mock('../hooks/use-live-studio', () => ({
    useLiveStudio: () => state.inStudio,
    useCompactStudio: () => state.compact,
}))

/*
 * The two branch bodies are stubbed to a marker apiece. What is under test is *which* one the chain
 * picks, and rendering either for real drags in the report hooks, the watch panel and the share
 * sheet — none of which can say anything about the ordering.
 */
vi.mock('./event-host-screen', () => ({
    EventHostScreen: () => <div data-testid="stub-host" />,
}))
vi.mock('./event-host-live-screen', () => ({
    EventHostLiveScreen: () => <div data-testid="stub-host-live" />,
}))
vi.mock('./event-age-gate', () => ({ EventAgeGate: () => <div data-testid="stub-age-gate" /> }))
vi.mock('./event-details-card', () => ({
    EventDetailsCard: () => <div data-testid="stub-viewer" />,
}))
vi.mock('./event-host-card', () => ({ EventHostCard: () => null }))
vi.mock('./event-watch-panel', () => ({ EventWatchPanel: () => null }))
vi.mock('./event-description-card', () => ({ EventDescriptionCard: () => null }))
vi.mock('./event-details-auto-follow', () => ({ EventDetailsAutoFollow: () => null }))
vi.mock('./event-top-bar', () => ({ EventTopBar: () => null }))
vi.mock('./event-skeleton', () => ({ EventSkeleton: () => <div data-testid="stub-skeleton" /> }))
vi.mock('./event-studio-skeleton', () => ({
    EventStudioSkeleton: () => <div data-testid="stub-studio-skeleton" />,
}))
vi.mock('./event-studio-screen', () => ({
    EventStudioScreen: () => <div data-testid="stub-studio" />,
}))
vi.mock('./event-mobile-live-notice', () => ({
    EventMobileLiveNotice: () => <div data-testid="stub-mobile-notice" />,
}))
vi.mock('./event-studio-shell', () => ({
    EventStudioShell: ({ children }: { children?: unknown }) => (
        <div data-testid="stub-studio-shell">{children as never}</div>
    ),
}))
vi.mock('./event-state-screens', () => ({
    EventNotFoundState: () => null,
    EventErrorState: () => null,
}))

const { EventScreen } = await import('./event-screen')

/**
 * An 18+ event, which is the only case where the two orderings differ.
 *
 * ⚠ `ENDED`, not `LIVE`. A **live** host takes an earlier branch entirely — `EventHostLiveScreen`,
 * the app hand-off — so a live fixture would exercise that instead of the report and quietly stop
 * testing the thing these cases are about. The live host gets its own case below.
 */
const RESTRICTED_INPUT = {
    code: 'evt-1',
    title: 'A stream',
    status: 'ENDED',
    age_restriction: true,
    channel: { id: 'ch-1', slug: 'ada' },
}
const RESTRICTED = eventDetailSchema.parse(RESTRICTED_INPUT)

function show() {
    render(<EventScreen code="evt-1" slug="ada" initialEvent={undefined} />)
}

beforeEach(() => {
    state.compact = false
    state.event = RESTRICTED
    state.isLoading = false
    state.ownership = 'viewer'
    state.age = { isResolving: false, isAllowed: false, required: true, confirm: vi.fn() }
    state.inStudio = false
})

describe('the host of an 18+ stream', () => {
    /** The reported bug, stated as the thing that must not happen. */
    it('is never shown the age gate for their own broadcast', () => {
        state.ownership = 'host'
        show()

        expect(screen.queryByTestId('stub-age-gate')).toBeNull()
        expect(screen.getByTestId('stub-host')).toBeTruthy()
    })

    /**
     * The consent lookup is per account and per event, so it can still be in flight. A host must not
     * wait on an answer to a question their branch never asks — otherwise the fix above is undone by
     * a skeleton that outlives the page.
     */
    it('does not wait on the consent lookup', () => {
        state.ownership = 'host'
        state.age = { isResolving: true, isAllowed: false, required: true, confirm: vi.fn() }
        show()

        expect(screen.getByTestId('stub-host')).toBeTruthy()
        expect(screen.queryByTestId('stub-skeleton')).toBeNull()
    })
})

/**
 * The host branch forks again on status, and the age gate has to stay behind **both** halves — the
 * fix was about who is asked, not about which of the host's two screens they land on.
 */
describe('the host of an 18+ stream that is on air', () => {
    it('gets the app hand-off, and still no age gate', () => {
        state.event = eventDetailSchema.parse({
            code: 'evt-1',
            title: 'A stream',
            status: 'LIVE',
            age_restriction: true,
            channel: { id: 'ch-1', slug: 'ada' },
        })
        state.ownership = 'host'
        show()

        expect(screen.getByTestId('stub-host-live')).toBeTruthy()
        expect(screen.queryByTestId('stub-age-gate')).toBeNull()
        expect(screen.queryByTestId('stub-host')).toBeNull()
    })
})

describe('a viewer of an 18+ stream', () => {
    it('is shown the age gate before any of the content', () => {
        show()

        expect(screen.getByTestId('stub-age-gate')).toBeTruthy()
        expect(screen.queryByTestId('stub-viewer')).toBeNull()
    })

    it('sees the page once the confirmation is in hand', () => {
        state.age = { isResolving: false, isAllowed: true, required: true, confirm: vi.fn() }
        show()

        expect(screen.getByTestId('stub-viewer')).toBeTruthy()
        expect(screen.queryByTestId('stub-age-gate')).toBeNull()
    })

    /** Still a skeleton rather than a gate flashed at somebody who may already have confirmed. */
    it('waits on the consent lookup rather than guessing', () => {
        state.age = { isResolving: true, isAllowed: false, required: true, confirm: vi.fn() }
        show()

        expect(screen.getByTestId('stub-skeleton')).toBeTruthy()
        expect(screen.queryByTestId('stub-age-gate')).toBeNull()
    })
})

describe('before ownership has resolved', () => {
    /**
     * ⚠ The skeleton, and **not** the age gate — even though the gate would be the answer for a
     * viewer. `'unknown'` means the question is still open, and showing a creator an 18+ prompt for
     * a frame before swapping it for their revenue report is the same flash in a smaller form.
     */
    it('shows the skeleton, not the gate', () => {
        state.ownership = 'unknown'
        show()

        expect(screen.getByTestId('stub-skeleton')).toBeTruthy()
        expect(screen.queryByTestId('stub-age-gate')).toBeNull()
        expect(screen.queryByTestId('stub-host')).toBeNull()
    })
})

/**
 * **Live details or Live studio** — the viewer's two screens, and the order of the gates in front
 * of them.
 *
 * `useLiveStudio` is stubbed, so these say nothing about *when* it answers yes (that is
 * `use-live-studio.test.tsx`). What they pin is the part that is easy to get wrong here: which
 * gates the studio is behind. Every one of them is a case where the studio drawing itself would be
 * a real defect — a full-viewport stage over a revenue report, over an unanswered 18+ prompt, or
 * over a page that is still loading.
 */
describe('the Live studio', () => {
    /*
     * On air and **locked** — a refusal, which is the only kind of state Phase A routes to the
     * stage. A free live stream is `watchable` and deliberately stays on the details page; it is
     * the subject of its own case at the foot of this block.
     */
    const LIVE_LOCKED = eventDetailSchema.parse({
        code: 'evt-1',
        title: 'A stream',
        status: 'LIVE',
        price: '250',
        product_id: 'prod-1',
        channel: { id: 'ch-1', slug: 'ada' },
    })

    beforeEach(() => {
        state.event = LIVE_LOCKED
        state.age = { isResolving: false, isAllowed: true, required: false, confirm: vi.fn() }
        state.inStudio = true
    })

    it('replaces the viewer cards rather than joining them', () => {
        show()
        expect(screen.getByTestId('stub-studio')).toBeTruthy()
        // The details card is the one block that would still be visible under a `fixed` stage if
        // both rendered, which is why it is the one asserted against.
        expect(screen.queryByTestId('stub-viewer')).toBeNull()
    })

    it('is withheld from the host, who gets their own screen', () => {
        state.ownership = 'host'
        show()
        expect(screen.queryByTestId('stub-studio')).toBeNull()
    })

    /*
     * The gate that would be worst to get wrong: the stage draws the creator's own art as its
     * backdrop, so a studio in front of an unanswered 18+ prompt shows the material the prompt is
     * asking permission for.
     */
    /**
     * The question is asked **in the studio's frame** (legacy's `AgeRestricted` inside `LiveView`),
     * but in the shell — the frame with nothing running — never in front of the studio itself,
     * which would already have spent a preview and joined the room.
     */
    it('is withheld until the 18+ confirmation is in hand, asked in the studio frame', () => {
        state.age = { isResolving: false, isAllowed: false, required: true, confirm: vi.fn() }
        show()
        expect(screen.getByTestId('stub-studio-shell')).toBeTruthy()
        expect(screen.getByTestId('stub-age-gate')).toBeTruthy()
        expect(screen.queryByTestId('stub-studio')).toBeNull()
    })

    it('is withheld while the consent lookup is still out — the frame stands alone', () => {
        state.age = { isResolving: true, isAllowed: false, required: true, confirm: vi.fn() }
        show()
        expect(screen.getByTestId('stub-studio-shell')).toBeTruthy()
        expect(screen.queryByTestId('stub-age-gate')).toBeNull()
        expect(screen.queryByTestId('stub-studio')).toBeNull()
    })

    it('is withheld while ownership is still unknown', () => {
        state.ownership = 'unknown'
        show()
        expect(screen.queryByTestId('stub-studio')).toBeNull()
    })

    it('holds the studio’s own frame while the screen is undecided — details skeleton below md', () => {
        state.ownership = 'unknown'
        show()
        // Both are in the tree; CSS (`md:hidden` / `hidden md:block`) shows one.
        expect(screen.queryByTestId('stub-studio-skeleton')).not.toBeNull()
        expect(screen.queryByTestId('stub-skeleton')).not.toBeNull()
    })

    it('keeps the plain details skeleton for a stream that is not live', () => {
        state.ownership = 'unknown'
        state.event = { ...state.event, status: 'ENDED' } as typeof state.event
        show()
        expect(screen.queryByTestId('stub-studio-skeleton')).toBeNull()
        expect(screen.queryByTestId('stub-skeleton')).not.toBeNull()
    })

    /**
     * ⚠ **The case that inverted.**
     *
     * A stream the reader can actually watch is exactly what the studio is *for*, and it used to
     * be the one thing excluded from it — a leftover from the phase when the stage had no player.
     * The clause outlived its reason, and the symptom was that nobody could watch a live at all.
     *
     * Keeping the case rather than deleting it: the assertion is now the opposite one, so a
     * future change that re-adds the exclusion fails here instead of shipping.
     */
    it('takes a stream this reader can already watch — that is what it is for', () => {
        state.event = eventDetailSchema.parse({
            code: 'evt-1',
            title: 'A stream',
            status: 'LIVE',
            price: '0',
            channel: { id: 'ch-1', slug: 'ada' },
        })
        show()
        expect(screen.getByTestId('stub-studio')).toBeTruthy()
        expect(screen.queryByTestId('stub-viewer')).toBeNull()
    })
})

/**
 * `age_restriction` gates the **broadcast**, not the page about it — legacy reads it in `LiveView`
 * alone, after its ended branch. An 18+ event that is upcoming or over shows its details freely.
 */
describe('the 18+ question', () => {
    it('is asked only while the event is live', () => {
        for (const status of ['UPCOMING', 'ENDED', 'CANCELLED', 'PAUSED']) {
            state.event = eventDetailSchema.parse({ ...RESTRICTED_INPUT, status })
            show()
            expect(ageArgs.last?.required).toBe(false)
            cleanup()
        }
        state.event = eventDetailSchema.parse({ ...RESTRICTED_INPUT, status: 'LIVE' })
        show()
        expect(ageArgs.last?.required).toBe(true)
    })
})

/**
 * A phone on a live stream gets one clear screen — "Live isn't available on mobile web", with the
 * way into the app — while the phone studio is switched off. Not on any other status, and never
 * for the host, whose live screen is the app hand-off already.
 */
describe('a narrow screen on a live stream', () => {
    it('shows the mobile notice to a viewer', () => {
        state.compact = true
        state.age = { isResolving: false, isAllowed: true, required: false, confirm: vi.fn() }
        state.event = eventDetailSchema.parse({ ...RESTRICTED_INPUT, status: 'LIVE' })
        show()
        expect(screen.getByTestId('stub-mobile-notice')).toBeTruthy()
    })

    it('keeps the details page for a stream that is not live', () => {
        state.compact = true
        state.age = { isResolving: false, isAllowed: true, required: false, confirm: vi.fn() }
        state.event = eventDetailSchema.parse({ ...RESTRICTED_INPUT, status: 'ENDED' })
        show()
        expect(screen.queryByTestId('stub-mobile-notice')).toBeNull()
    })
})
