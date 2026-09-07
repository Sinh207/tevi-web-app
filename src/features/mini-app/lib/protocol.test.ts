import { describe, expect, it } from 'vitest'
import {
    canceledReply,
    failedReply,
    MINI_APP_ACTIONS,
    okReply,
    parseBridgeMessage,
    serializeBridgeMessage,
} from './protocol'

/**
 * The bridge's wire rules. Two of them are the whole reason this file is pure: **which envelope a
 * message is in**, and **what `options` was** — a JSON string on one, an object on the other. Both
 * are things legacy gets wrong in one direction each, and neither is observable from a component.
 */
describe('parseBridgeMessage', () => {
    it('reads the host protocol, with options as a JSON string', () => {
        expect(
            parseBridgeMessage({
                action: MINI_APP_ACTIONS.BUY_ITEM,
                options: '{"item_id":"sword","price":100}',
            }),
        ).toEqual({
            action: MINI_APP_ACTIONS.BUY_ITEM,
            options: { item_id: 'sword', price: 100 },
            envelope: 'action',
        })
    })

    it('reads the SDK protocol, with eventData as an object', () => {
        // `public/sdk/miniapp-sdk.js`'s browser path posts exactly this shape. Legacy's host
        // ignores it entirely, which is why an SDK-based mini app never works on legacy web.
        expect(
            parseBridgeMessage({
                eventType: MINI_APP_ACTIONS.GET_USER_INFO,
                eventData: { app_id: 'a1' },
            }),
        ).toEqual({
            action: MINI_APP_ACTIONS.GET_USER_INFO,
            options: { app_id: 'a1' },
            envelope: 'eventType',
        })
    })

    it('accepts a whole message delivered as a JSON string', () => {
        expect(parseBridgeMessage('{"action":"action.quitGame","options":"{}"}')).toEqual({
            action: MINI_APP_ACTIONS.QUIT_GAME,
            options: {},
            envelope: 'action',
        })
    })

    it('takes an object options on the action envelope too', () => {
        // Apps that hand-roll the browser side commonly skip the stringify.
        expect(parseBridgeMessage({ action: 'x', options: { a: 1 } })?.options).toEqual({ a: 1 })
    })

    it('keeps the action when options are unparseable, rather than dropping the request', () => {
        // The app is still asking for something; refusing to hear it because its arguments were
        // malformed leaves it waiting for a reply that never comes.
        expect(parseBridgeMessage({ action: 'x', options: 'not json' })).toEqual({
            action: 'x',
            options: {},
            envelope: 'action',
        })
    })

    it('rejects an array options rather than treating it as a bag of fields', () => {
        expect(parseBridgeMessage({ action: 'x', options: '[1,2]' })?.options).toEqual({})
    })

    it.each([
        ['null', null],
        ['a number', 42],
        ['a plain string', 'hello'],
        ['an array', [1, 2]],
        ['an unrelated object', { type: 'webpackHotUpdate' }],
        ['an empty action', { action: '' }],
        ['a non-string action', { action: 12 }],
    ])('ignores %s', (_label, input) => {
        // The page also runs Next dev tools, React DevTools, Turnstile and Stripe frames, all of
        // which post messages. Ignoring them has to be silent and cheap.
        expect(parseBridgeMessage(input)).toBeNull()
    })
})

describe('serializeBridgeMessage', () => {
    it('answers in the host protocol when that is what the frame speaks', () => {
        expect(
            serializeBridgeMessage('action', 'a', okReply({ userInfo: { user_id: '1' } })),
        ).toEqual([{ action: 'a', call: 'ok', userInfo: { user_id: '1' } }])
    })

    it('answers in the SDK protocol when that is what the frame speaks', () => {
        expect(serializeBridgeMessage('eventType', 'a', okReply())).toEqual([
            { eventType: 'a', eventData: { call: 'ok' } },
        ])
    })

    it('sends both when the frame has not spoken yet', () => {
        // Only host-initiated events can precede the app's first message (the header buttons). An
        // app that understands one envelope ignores the other.
        expect(serializeBridgeMessage(null, 'a')).toEqual([
            { action: 'a' },
            { eventType: 'a', eventData: {} },
        ])
    })
})

describe('reply payloads', () => {
    it('marks a cancellation as both `cancel` and `response: false`', () => {
        // The contract says `call`; legacy's shipped host says `response`. A mini app branches on
        // whichever its own SDK reads, so both are sent — dropping the one it reads is a hang.
        expect(canceledReply()).toEqual({ call: 'cancel', response: false })
    })

    it('carries our own sentence on a failure, never a backend body', () => {
        expect(failedReply('insufficient stars')).toEqual({
            call: 'insufficient stars',
            response: false,
            message: 'insufficient stars',
        })
    })

    it('still says something when a failure has no sentence', () => {
        expect(failedReply()).toEqual({ call: 'failed', response: false })
    })
})
