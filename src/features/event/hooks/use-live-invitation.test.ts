import { describe, expect, it } from 'vitest'
import { parseInvitationFrame } from './use-live-invitation'

/** Legacy's switch on `message.type`: `invitation` opens, everything else that names a type closes. */
describe('parseInvitationFrame', () => {
    it('opens on an invitation, carrying who sent it', () => {
        expect(
            parseInvitationFrame({ type: 'INVITATION', name: ' Ada ', avatar: 'https://x/a.png' }),
        ).toEqual({ name: 'Ada', avatar: 'https://x/a.png' })
    })

    it.each(['accept', 'decline', 'cancelled'])('closes on `%s`', type => {
        expect(parseInvitationFrame({ type })).toBeNull()
    })

    it.each([null, {}, { type: 3 }, 'invitation'])('leaves the state alone for %j', frame => {
        expect(parseInvitationFrame(frame)).toBeUndefined()
    })
})
