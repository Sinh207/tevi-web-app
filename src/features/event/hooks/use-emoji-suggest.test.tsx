// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEmojiSuggest } from './use-emoji-suggest'

let api: ReturnType<typeof useEmojiSuggest>
let sent: string[] = []

function Field({ max = 250 }: { max?: number }) {
    const [value, setValue] = useState('')
    api = useEmojiSuggest({ value, onChange: setValue, maxLength: max })
    return (
        <form
            onSubmit={e => {
                e.preventDefault()
                sent.push(value)
            }}
        >
            <input
                ref={api.inputRef}
                data-testid="field"
                value={value}
                onChange={e => setValue(e.target.value)}
                {...api.fieldProps}
            />
        </form>
    )
}

function type(input: HTMLInputElement, text: string) {
    fireEvent.change(input, { target: { value: text } })
    input.setSelectionRange(text.length, text.length)
    fireEvent.input(input)
}

describe('useEmojiSuggest', () => {
    afterEach(() => {
        cleanup()
        sent = []
        vi.restoreAllMocks()
    })

    it('opens on a bare colon with the popular row, and filters as the reader types', () => {
        const { getByTestId } = render(<Field />)
        const input = getByTestId('field') as HTMLInputElement
        type(input, 'hi :')
        expect(api.isOpen).toBe(true)
        expect(api.items.length).toBe(8)
        type(input, 'hi :fire')
        expect(api.items[0].char).toBe('🔥')
    })

    it('does not open inside a time or a link', () => {
        const { getByTestId } = render(<Field />)
        const input = getByTestId('field') as HTMLInputElement
        type(input, 'at 10:30')
        expect(api.isOpen).toBe(false)
    })

    it('Enter inserts the emoji in place of the query — it does not send the message', () => {
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
            cb(0)
            return 0
        })
        const { getByTestId } = render(<Field />)
        const input = getByTestId('field') as HTMLInputElement
        type(input, 'so :fi')
        act(() => {
            fireEvent.keyDown(input, { key: 'Enter' })
        })
        expect(input.value).toBe('so 🔥')
        expect(sent).toEqual([])
        expect(api.isOpen).toBe(false)
    })

    it('arrows move the active item and wrap', () => {
        const { getByTestId } = render(<Field />)
        const input = getByTestId('field') as HTMLInputElement
        type(input, ':')
        fireEvent.keyDown(input, { key: 'ArrowUp' })
        expect(api.active).toBe(api.items.length - 1)
        fireEvent.keyDown(input, { key: 'ArrowDown' })
        expect(api.active).toBe(0)
    })

    it('Escape dismisses it for that colon, and a new colon opens again', () => {
        const { getByTestId } = render(<Field />)
        const input = getByTestId('field') as HTMLInputElement
        type(input, ':fi')
        fireEvent.keyDown(input, { key: 'Escape' })
        expect(api.isOpen).toBe(false)
        type(input, ':fir')
        expect(api.isOpen).toBe(false)
        type(input, ':fir :')
        expect(api.isOpen).toBe(true)
    })

    it('stays shut while an IME is composing', () => {
        const { getByTestId } = render(<Field />)
        const input = getByTestId('field') as HTMLInputElement
        fireEvent.compositionStart(input)
        type(input, ':cu')
        expect(api.isOpen).toBe(false)
        fireEvent.compositionEnd(input)
        expect(api.isOpen).toBe(true)
    })

    it('inserts nothing when the emoji would pass the length cap', () => {
        const { getByTestId } = render(<Field max={4} />)
        const input = getByTestId('field') as HTMLInputElement
        type(input, 'ab :')
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(input.value).toBe('ab :')
    })
})
