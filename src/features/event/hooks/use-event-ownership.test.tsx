// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eventDetailSchema } from '../api/types'
import type { EventOwnership } from './use-event-ownership'
import { useEventOwnership } from './use-event-ownership'

/**
 * The gate that decides **who reads a creator's revenue**.
 *
 * Every claim here is about a *combination of two async sources settling in some order*, which is
 * not something a comment can pin and not something a browser shows you: each wrong answer looks
 * like a plausible screen. The two that matter are opposite failures —
 *
 * - collapsing `'unknown'` into `'viewer'` shows a host a **paywall for their own broadcast** for a
 *   frame, then swaps it for a revenue report;
 * - collapsing it into `'host'`, or matching on two absent ids, shows a **stranger somebody else's
 *   earnings**.
 *
 * Legacy's own comment records the second one happening: *"comparing two undefined values used to
 * come out true, which showed the creator dashboard (revenue, analytics) to a visitor whose channel
 * had not loaded yet"*.
 */
const auth = vi.hoisted(() => ({
    state: { isAuthenticated: true, isBootstrapping: false } as {
        isAuthenticated: boolean
        isBootstrapping: boolean
    },
}))
const channel = vi.hoisted(() => ({
    state: { myChannel: null as { id: string; slug: string } | null, isLoading: false },
}))

vi.mock('@features/auth', () => ({ useAuth: () => auth.state }))
vi.mock('@features/channel', () => ({ useMyChannel: () => channel.state }))

const event = (channelFields: Record<string, unknown> | null = { id: 'ch-1', slug: 'ada' }) =>
    eventDetailSchema.parse({
        code: 'evt-1',
        title: 'A stream',
        status: 'LIVE',
        channel: channelFields,
    })

function ownership(subject: ReturnType<typeof event> | null): EventOwnership {
    let seen: EventOwnership = 'unknown'
    function Probe() {
        seen = useEventOwnership(subject)
        return null
    }
    render(<Probe />)
    return seen
}

beforeEach(() => {
    auth.state = { isAuthenticated: true, isBootstrapping: false }
    channel.state = { myChannel: null, isLoading: false }
})

describe('before anything has settled', () => {
    it('is unknown with no event', () => {
        expect(ownership(null)).toBe('unknown')
    })

    /** `normalizeEvent` refuses a payload with no channel, so this is the belt rather than braces. */
    it('is unknown when the event carries no channel', () => {
        expect(ownership(event(null))).toBe('unknown')
    })

    /**
     * ⚠ **Checked before `isAuthenticated`, and the order is the whole fix.** `isAuthenticated` is
     * false for *everybody* during the bootstrap — host included — because it is derived from a
     * `/me` that has not landed. Checked after, a host's own report flashes the viewer's page first.
     */
    it('is unknown while the session is bootstrapping, even for the host', () => {
        auth.state = { isAuthenticated: false, isBootstrapping: true }
        channel.state = { myChannel: { id: 'ch-1', slug: 'ada' }, isLoading: false }
        expect(ownership(event())).toBe('unknown')
    })

    /** The account has a channel query still in flight — the answer could still be either. */
    it('is unknown while my-channel is still loading', () => {
        channel.state = { myChannel: null, isLoading: true }
        expect(ownership(event())).toBe('unknown')
    })
})

describe('once the session is known', () => {
    it('is viewer for a signed-out reader', () => {
        auth.state = { isAuthenticated: false, isBootstrapping: false }
        expect(ownership(event())).toBe('viewer')
    })

    it('is host when the account own channel is the one hosting', () => {
        channel.state = { myChannel: { id: 'ch-1', slug: 'ada' }, isLoading: false }
        expect(ownership(event())).toBe('host')
    })

    it('is viewer when the account hosts a different channel', () => {
        channel.state = { myChannel: { id: 'ch-2', slug: 'grace' }, isLoading: false }
        expect(ownership(event())).toBe('viewer')
    })

    /** No channel of their own means they cannot host this one. */
    it('is viewer for an account with no channel, once that is settled', () => {
        channel.state = { myChannel: null, isLoading: false }
        expect(ownership(event())).toBe('viewer')
    })
})

/**
 * ⚠ **The reported bug from legacy — and why the guard is not what stops it here.**
 *
 * Legacy's `myChannel.id === event.channel.id` answers `true` when both are absent, which handed the
 * revenue report to any visitor whose channel had not loaded. This port keeps both existence checks.
 *
 * **Removing them does not fail these tests**, and that was worth finding out: the two ids come from
 * two schemas that normalise absence *differently* — `channelSchema`'s `id` falls back to `''`,
 * `eventChannelSchema`'s is `nullableId` and falls back to `null`. `'' === null` is false, so the
 * collision legacy hits cannot occur across this particular pair today.
 *
 * So the assertions below pin the **behaviour** (never `'host'` without two real ids) and the one
 * after them pins the **invariant that is actually holding the line** — because that invariant is
 * one `nullableId` → `id` edit away from disappearing, at which point the guard becomes the only
 * thing left and these tests start earning their keep.
 */
describe('both ids must exist', () => {
    it('is viewer when the account channel has no id', () => {
        channel.state = { myChannel: { id: '', slug: 'ada' }, isLoading: false }
        expect(ownership(event())).toBe('viewer')
    })

    it('is viewer when the event channel has no id', () => {
        channel.state = { myChannel: { id: 'ch-1', slug: 'ada' }, isLoading: false }
        expect(ownership(event({ slug: 'ada' }))).toBe('viewer')
    })

    /** The shape legacy answers `'host'` for. */
    it('is viewer when neither has an id', () => {
        channel.state = { myChannel: { id: '', slug: 'ada' }, isLoading: false }
        expect(ownership(event({ slug: 'ada' }))).toBe('viewer')
    })

    /**
     * The invariant the three above quietly rely on. If this ever changes, the comparison can meet
     * two equal falsy values and the guard in `useEventOwnership` becomes load-bearing rather than
     * defensive — which is exactly when somebody would be tempted to delete it as dead code.
     */
    it('parses an absent event channel id to null, never to an empty string', () => {
        expect(event({ slug: 'ada' }).channel?.id).toBeNull()
    })
})
