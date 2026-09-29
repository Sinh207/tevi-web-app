import { describe, expect, it } from 'vitest'
import { conversationPath, isMessagesPath, slugFromMessagesPath } from './routes'

describe('slugFromMessagesPath', () => {
    it('reads the slug of a conversation, with or without an encoded @', () => {
        expect(slugFromMessagesPath('/@ada/messages')).toBe('ada')
        expect(slugFromMessagesPath('/%40ada/messages/')).toBe('ada')
    })

    it('decodes what conversationPath encoded', () => {
        expect(slugFromMessagesPath(conversationPath('a.b_c'))).toBe('a.b_c')
    })

    it('is null on the inbox and everywhere else', () => {
        expect(slugFromMessagesPath('/messages')).toBeNull()
        expect(slugFromMessagesPath('/@ada')).toBeNull()
        expect(slugFromMessagesPath('/ada/messages')).toBeNull()
        expect(slugFromMessagesPath('/@ada/messages/extra')).toBeNull()
        expect(slugFromMessagesPath('/@%E0%A4/messages')).toBeNull()
    })
})

describe('isMessagesPath', () => {
    it('is the inbox and every conversation', () => {
        expect(isMessagesPath('/messages')).toBe(true)
        expect(isMessagesPath('/@ada/messages')).toBe(true)
        expect(isMessagesPath('/@ada')).toBe(false)
    })
})
