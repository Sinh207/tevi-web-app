import type { CheckoutAction } from './checkout-action'
import type { CheckoutOrder } from './checkout-order'

/**
 * The checkout state machine — one value, never a set of booleans.
 *
 * ## Why this is a machine and not four `useState`s
 *
 * Legacy holds the outcome as **three independent booleans** (`checkoutResult.processing`,
 * `.success`, `.failed` in `providers/balance/index.js`), each with its own `{ open, type, msg }`.
 * The consequences are all in the code: every transition has to remember to close the other two (one
 * branch forgets), the "processing" dialog can be open behind the "failed" one, and there is no
 * value anywhere in the app that answers "what is happening right now". A union answers it by
 * construction — two states cannot both be true.
 *
 * ## `settling` is bounded, and `slow` is not a failure
 *
 * The callback endpoint answers `PM0003` while the bank is still deciding. Legacy polls it every
 * two seconds **forever**, from three different files, with no unmount cleanup. Here the schedule is
 * finite (`lib/settle-poll.ts`) and running out lands in `slow`: *the payment is still being
 * processed*. Calling that "failed" would tell somebody whose money has left that nothing happened,
 * and calling it "succeeded" is worse. It is its own state because it is its own sentence.
 *
 * ## Which states may be left, and which may not
 *
 * `confirming` — the moment `stripe.confirm*` is in flight — cannot be dismissed: closing it would
 * unmount the Elements instance that is completing a charge. `settling` **can** be dismissed; the
 * money has already left and the poll belongs to the provider, not to the dialog (when it settles
 * with nobody watching, the provider invalidates the balance and toasts instead of re-opening a
 * dialog — `canDismiss` is what draws that line).
 *
 * ## `order` is nullable on purpose
 *
 * A payment resumed from a URL after a 3DS redirect has no order: the page was reloaded, and all the
 * client knows is a `payment_intent_client_secret`. That is a real state, so the type says so rather
 * than making the resume path invent an order to satisfy it.
 */
export type CheckoutState =
    | { kind: 'idle' }
    /** `POST checkout/` in flight. */
    | { kind: 'creating'; order: CheckoutOrder }
    /** Elements mounted, waiting for the reader. */
    | { kind: 'card'; order: CheckoutOrder; clientSecret: string }
    /** `stripe.confirm*` in flight. **Not dismissable.** */
    | { kind: 'confirming'; order: CheckoutOrder; clientSecret: string }
    /** About to hand the browser to a hosted page or a bank. */
    | { kind: 'leaving'; order: CheckoutOrder; url: string }
    /** A third-party checkout inside an iframe (Coda). */
    | { kind: 'embedded'; order: CheckoutOrder; provider: 'coda'; txnId: string }
    /**
     * Asking the backend whether it settled. `attempt` starts at 0.
     *
     * `settleRef` is **not** a client secret, and the distinction is load-bearing: a Stripe payment
     * settles against `payment/v3/stripe/callback/` keyed by its `clientSecret`, but a gateway
     * round-trip settles against `redirect-callback/` and has no secret at all — only a `TxnId` or a
     * gateway name. Both reach this state, so the field is named for what it is: an opaque handle on
     * *this* settlement, carried for display and for `slow`'s copy. **Nothing builds a request from
     * it** — the request lives in the poll's own closure, which is what lets the two shapes share
     * one state.
     */
    | { kind: 'settling'; order: CheckoutOrder | null; settleRef: string; attempt: number }
    /** Still pending after the whole schedule. Not a failure — see above. */
    | { kind: 'slow'; order: CheckoutOrder | null; settleRef: string }
    | { kind: 'succeeded'; order: CheckoutOrder | null; purchaseType: string | null }
    /**
     * `messageKey` is a translation key and is always set; `text` is the backend's or Stripe's own
     * sentence, shown **in place of** the key when present. Only ever taken from a 4xx body or from
     * a Stripe error (both are written for the person paying) — never from `error.message`, which
     * falls back to axios's own wording. Same rule as `signInErrorText` in `features/auth`.
     */
    | { kind: 'failed'; order: CheckoutOrder | null; messageKey: string; text: string | null }

export type CheckoutEvent =
    | { type: 'START'; order: CheckoutOrder }
    /** `checkout/` answered — or, for a handoff, another feature's endpoint did. */
    | { type: 'ACTION'; action: CheckoutAction }
    /** The reader pressed Pay. */
    | { type: 'SUBMIT' }
    /** `stripe.confirm*` resolved without an error, or the embedded checkout reported done. */
    | { type: 'CONFIRMED' }
    | { type: 'CONFIRM_FAILED'; text: string | null }
    /**
     * Back from a redirect, with whatever the URL identified the settlement by — a PaymentIntent
     * secret for Stripe, a `TxnId` for a gateway. No order is known: the page was reloaded.
     */
    | { type: 'RESUME'; settleRef: string }
    /** One poll answered `PM0003`. */
    | { type: 'SETTLE_PENDING' }
    | { type: 'SETTLED'; purchaseType: string | null }
    | { type: 'REJECTED'; text: string | null }
    /** The schedule ran out and it is still pending. */
    | { type: 'EXHAUSTED' }
    /** Anything that is not the payment's own verdict: transport, an unsupported action, no config. */
    | { type: 'FAILED'; messageKey: string; text?: string | null }
    | { type: 'CLOSE' }

export const IDLE: CheckoutState = { kind: 'idle' }

/** Copy keys the machine itself decides. Everything else comes in on the event. */
export const CHECKOUT_ERROR_KEYS = {
    unsupported: 'payment_error_unsupported_method',
    generic: 'payment_error_generic',
} as const

/**
 * The order still in play, if any — `null` once the machine is idle.
 *
 * Terminal states keep it so "Try again" can restart the same purchase, which is the one thing
 * legacy's failure dialog cannot do: it discards everything and drops the reader back to the page.
 */
export function checkoutOrder(state: CheckoutState): CheckoutOrder | null {
    return 'order' in state ? state.order : null
}

/** Work is in flight and the reader should not be offered a second press. */
export function isCheckoutBusy(state: CheckoutState): boolean {
    return (
        state.kind === 'creating' ||
        state.kind === 'confirming' ||
        state.kind === 'leaving' ||
        state.kind === 'settling'
    )
}

/**
 * Whether the dialog may be closed.
 *
 * Only `confirming` refuses — see the note on the type.
 *
 * ⚠ `leaving` is dismissable, and this **is** a case somebody reaches. The note here used to say it
 * was not, on the grounds that the browser is already navigating away. The back-forward cache is the
 * counter-example: press Back at Stripe and both engines restore this page with the reducer still in
 * `leaving`, which every consumer reads as busy — a confirmation dialog with two dead buttons that
 * no reload-free gesture closes. `useCheckout` dispatches `CLOSE` on a persisted `pageshow` for
 * exactly that, and it relies on this function answering `true` here.
 */
export function canDismissCheckout(state: CheckoutState): boolean {
    return state.kind !== 'confirming'
}

/** Nothing left to do: the reader is reading an outcome. */
export function isCheckoutSettled(state: CheckoutState): boolean {
    return state.kind === 'succeeded' || state.kind === 'failed' || state.kind === 'slow'
}

const TERMINAL = new Set(['idle', 'succeeded', 'failed', 'slow'])

/**
 * The reducer. **Every unhandled pair returns the state unchanged** — that is not laziness, it is the
 * guard: a `SETTLED` arriving while idle (a poll that outlived its dialog) must not resurrect a
 * success screen, and a second `START` while a charge is confirming must not abandon it.
 */
export function checkoutReducer(state: CheckoutState, event: CheckoutEvent): CheckoutState {
    switch (event.type) {
        case 'START':
            // Retrying from a terminal state is the same transition as starting fresh.
            return TERMINAL.has(state.kind) ? { kind: 'creating', order: event.order } : state

        case 'ACTION': {
            if (state.kind !== 'creating') return state
            const { action } = event
            switch (action.kind) {
                case 'card':
                    return { kind: 'card', order: state.order, clientSecret: action.clientSecret }
                case 'redirect':
                    return { kind: 'leaving', order: state.order, url: action.url }
                case 'embedded':
                    return {
                        kind: 'embedded',
                        order: state.order,
                        provider: action.provider,
                        txnId: action.txnId,
                    }
                default:
                    return {
                        kind: 'failed',
                        order: state.order,
                        messageKey: CHECKOUT_ERROR_KEYS.unsupported,
                        text: null,
                    }
            }
        }

        case 'SUBMIT':
            return state.kind === 'card'
                ? { kind: 'confirming', order: state.order, clientSecret: state.clientSecret }
                : state

        case 'CONFIRMED':
            if (state.kind === 'confirming') {
                return {
                    kind: 'settling',
                    order: state.order,
                    settleRef: state.clientSecret,
                    attempt: 0,
                }
            }
            /*
             * An embedded checkout has no client secret of ours to poll — Coda settles server-side and
             * the balance arrives over the socket. So it goes straight to the success screen, and the
             * figure it shows comes from the refreshed balance rather than from a callback.
             */
            if (state.kind === 'embedded') {
                return { kind: 'succeeded', order: state.order, purchaseType: null }
            }
            return state

        case 'CONFIRM_FAILED':
            return state.kind === 'confirming'
                ? {
                      kind: 'failed',
                      order: state.order,
                      messageKey: CHECKOUT_ERROR_KEYS.generic,
                      text: event.text,
                  }
                : state

        case 'RESUME':
            /*
             * Allowed from a terminal state **and** from `card`: a 3DS step can navigate away from a
             * mounted Elements form and come back to a fresh page, and the URL is then the only truth
             * about what happened. Not allowed while `confirming` or already `settling` — that is the
             * same payment being handled by the code that started it.
             */
            return TERMINAL.has(state.kind) || state.kind === 'card'
                ? {
                      kind: 'settling',
                      order: checkoutOrder(state),
                      settleRef: event.settleRef,
                      attempt: 0,
                  }
                : state

        case 'SETTLE_PENDING':
            return state.kind === 'settling' ? { ...state, attempt: state.attempt + 1 } : state

        case 'SETTLED':
            return state.kind === 'settling' || state.kind === 'confirming'
                ? {
                      kind: 'succeeded',
                      order: checkoutOrder(state),
                      purchaseType: event.purchaseType,
                  }
                : state

        case 'REJECTED':
            return state.kind === 'settling' || state.kind === 'confirming'
                ? {
                      kind: 'failed',
                      order: checkoutOrder(state),
                      messageKey: CHECKOUT_ERROR_KEYS.generic,
                      text: event.text,
                  }
                : state

        case 'EXHAUSTED':
            return state.kind === 'settling'
                ? { kind: 'slow', order: state.order, settleRef: state.settleRef }
                : state

        case 'FAILED':
            // Reachable from anywhere except idle: transport can fail at any point in the flow.
            return state.kind === 'idle'
                ? state
                : {
                      kind: 'failed',
                      order: checkoutOrder(state),
                      messageKey: event.messageKey,
                      text: event.text ?? null,
                  }

        case 'CLOSE':
            return canDismissCheckout(state) ? IDLE : state
    }
}

/**
 * The action the machine is currently carrying out, reconstructed from its state.
 *
 * The state deliberately does **not** store the `CheckoutAction` object: it stores the parts each
 * state actually needs (`clientSecret`, `url`, `txnId`), so an impossible pair — a `card` state holding
 * a redirect URL — cannot be represented. The UI still wants the union back, because "which panel do I
 * render" is one switch over four kinds rather than four checks over five states.
 *
 * `null` for every state that is not carrying one: nothing has been created yet, or the payment has
 * moved past the step a panel belongs to.
 */
export function checkoutActionOf(state: CheckoutState): CheckoutAction | null {
    switch (state.kind) {
        case 'card':
        case 'confirming':
            return { kind: 'card', clientSecret: state.clientSecret }
        case 'leaving':
            return { kind: 'redirect', url: state.url }
        case 'embedded':
            return { kind: 'embedded', provider: state.provider, txnId: state.txnId }
        default:
            return null
    }
}
