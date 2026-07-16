import mitt, { type Emitter } from 'mitt'

/**
 * Small typed event bus for IMPERATIVE cross-module UI signals only.
 *
 * Do NOT use this to sync server state — that is TanStack Query's job
 * (`queryClient.invalidateQueries` / optimistic mutations). Reserve the bus for
 * signals that don't fit the query model (scroll-to-top, replay-after-challenge…).
 */
export type AppEvents = {
    'home:refresh': void
    'auth:turnstile-passed': void
    'auth:signed-in': { userId: string }
    'auth:signed-out': void
}

export const eventBus: Emitter<AppEvents> = mitt<AppEvents>()
