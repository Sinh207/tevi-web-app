'use client'

import { type KeyboardEvent, useCallback, useMemo, useRef, useState } from 'react'
import { type ChatEmoji, findColonQuery, searchChatEmoji } from '../lib/chat-emoji'

/**
 * **`:shortcode` suggestions for a text field** — the state machine behind the strip that opens
 * when a reader types `:` in the chat.
 *
 * The rules live in `lib/chat-emoji.ts` (when a colon counts, how a query matches); this owns the
 * interaction:
 *
 * - **Read on every edit and every caret move**, so arrowing back into `:fi` reopens it and
 *   clicking away from it closes it.
 * - **Never while composing.** Telex, VNI, and the Korean and Chinese IMEs build a character over
 *   several keystrokes, and the field's value mid-composition is not what the reader means — the
 *   strip would flicker on every accent. `compositionstart`/`compositionend` gate it.
 * - **Keys belong to the strip while it is open**: ↑↓ (and ←→, it is a row) move, Enter and Tab
 *   insert, Escape dismisses. ⚠ Enter inserting rather than sending is the one that matters — a
 *   reader picking 🔥 must not post `:fi` to a paid room.
 * - **Inserting replaces the whole `:query`** with the emoji, puts the caret after it, and respects
 *   the field's length cap; past the cap nothing is inserted rather than the message truncated.
 * - **Escape sticks until the colon changes**: dismissing `:fi` and typing on does not reopen it
 *   for the same colon, which is what makes Escape mean something.
 */
export function useEmojiSuggest({
    value,
    onChange,
    maxLength,
}: {
    value: string
    onChange: (next: string) => void
    maxLength: number
}) {
    const inputRef = useRef<HTMLInputElement | null>(null)
    const composing = useRef(false)
    const [match, setMatch] = useState<{ start: number; query: string; caret: number } | null>(null)
    const [active, setActive] = useState(0)
    const [dismissedAt, setDismissedAt] = useState<number | null>(null)

    const read = useCallback(() => {
        const node = inputRef.current
        if (!node || composing.current) return
        const caret = node.selectionStart ?? node.value.length
        const found = findColonQuery(node.value, caret)
        setMatch(found ? { ...found, caret } : null)
        setActive(0)
        if (!found) setDismissedAt(null)
    }, [])

    const items: ChatEmoji[] = useMemo(() => (match ? searchChatEmoji(match.query) : []), [match])
    const isOpen = match !== null && items.length > 0 && dismissedAt !== match.start

    const insert = useCallback(
        (emoji: ChatEmoji) => {
            if (!match) return
            const next = value.slice(0, match.start) + emoji.char + value.slice(match.caret)
            if (next.length > maxLength) return
            onChange(next)
            setMatch(null)
            const caret = match.start + emoji.char.length
            // After React has written the new value, or the caret lands in the old one.
            requestAnimationFrame(() => {
                inputRef.current?.focus()
                inputRef.current?.setSelectionRange(caret, caret)
            })
        },
        [match, maxLength, onChange, value],
    )

    const onKeyDown = useCallback(
        (e: KeyboardEvent<HTMLInputElement>) => {
            if (!isOpen || e.nativeEvent.isComposing) return
            const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]
            if (step) {
                e.preventDefault()
                setActive(i => (i + step + items.length) % items.length)
                return
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                insert(items[active])
                return
            }
            if (e.key === 'Escape') {
                e.preventDefault()
                if (match) setDismissedAt(match.start)
            }
        },
        [active, insert, isOpen, items, match],
    )

    return {
        inputRef,
        isOpen,
        items,
        active,
        setActive,
        insert,
        /** Spread onto the `<input>`. */
        fieldProps: {
            onKeyDown,
            onSelect: read,
            onInput: read,
            onBlur: () => setMatch(null),
            onCompositionStart: () => {
                composing.current = true
            },
            onCompositionEnd: () => {
                composing.current = false
                read()
            },
        },
    }
}
