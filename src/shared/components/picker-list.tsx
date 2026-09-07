'use client'

import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { LeftBarList, LeftBarRow } from '@shared/ui/left-bar'
import { type KeyboardEvent, type ReactNode, useEffect, useRef } from 'react'

/**
 * The box this list actually scrolls in, which is the **host's** and not this component's: the drawer
 * scrolls its whole screen layer, a dialog scrolls its body.
 *
 * Found by walking up rather than by a selector, so no host has to hand over a ref or a `data-` hook
 * it would otherwise not need. `scrollIntoView` would have saved the walk and is wrong here: it
 * scrolls **every** scrollable ancestor, and these hosts float over a page with its own scroll
 * position — moving that is a visible jump the moment the overlay closes.
 *
 * Moved here from `CurrencyList`, which had it for one list and one host; every picker needs it.
 */
function scrollParent(from: HTMLElement | null): HTMLElement | null {
    let node = from?.parentElement ?? null
    while (node) {
        const overflow = getComputedStyle(node).overflowY
        if (
            (overflow === 'auto' || overflow === 'scroll') &&
            node.scrollHeight > node.clientHeight
        ) {
            return node
        }
        node = node.parentElement
    }
    return null
}

/**
 * The drawer's pick-one list, and now everybody's.
 *
 * It moved out of `features/navigation` when `/my-wallet`'s currency switcher was rebuilt: that
 * screen and the account drawer offer the *same* choice, and the two features cannot import each
 * other (`features/my-wallet/index.ts` states the cycle). A pick-one list over `shared/ui` parts is
 * not the shell's property, so it lives here — the same move `shared/components/ledger.tsx` and
 * `filter-menu.tsx` are already the result of.
 */
export type PickerOption = {
    value: string
    label: string
    /**
     * A second line under the label, for a list whose labels are not self-explaining —
     * `VND` over "Vietnamese Dong". Omitted where the label already says everything, which
     * is Appearance and Language (a language is listed in its own words).
     */
    subtitle?: string
    /**
     * The 32px mark in the leading slot — a flag, a glyph. Never a coloured DS tile: a
     * picker row is a choice, not a destination, and the tiles are the drawer's way of
     * telling its destinations apart.
     *
     * **Optional, and a list either has marks on every row or on none.** Omitting it drops
     * the leading slot itself rather than leaving a 48px hole, so the text starts at the
     * list's own padding — which is what the Change-currency list wants: a currency's
     * `symbol` is as often two letters (`Af`, `Rp`, `RM`, `CHF`) as a glyph, and a column
     * of those reads as a second, worse copy of the code beside it. Appearance and Language
     * keep theirs, because a theme glyph and a flag are genuinely not the row's text.
     */
    mark?: ReactNode
}

/**
 * One choice out of a list, applied on press — Appearance and Language are both this.
 *
 * It is a real `radiogroup`, which is a promise about the keyboard as much as about the
 * announcement: arrow keys move within the group, Home/End jump to its ends, and only one
 * row is in the tab order at a time (the checked one, or the first when nothing is
 * checked) so Tab steps *over* the group rather than through every option. Declaring the
 * roles without that behaviour is worse than not declaring them — a screen reader would
 * say "use the arrow keys" about arrows that do nothing.
 *
 * **Arrows move focus without selecting**, which is the variant the APG allows when
 * activating an option has side effects, and here it has: the language picker closes the
 * drawer on pick, so a selection-follows-focus group would shut itself the moment you
 * pressed Down. Space and Enter select, via the row's own `<button>`.
 *
 * Up/Down only, not Left/Right: the list runs vertically, and the horizontal pair would
 * have to flip under RTL for the eight-language screen that is the most likely place to
 * meet Arabic.
 *
 * `LeftBarRow` renders a `<button>` and the roles are layered on top rather than swapping
 * in a native `<input type="radio">` — that would bring its own hit target and focus ring
 * into a row whose geometry is the design system's.
 */
export function PickerList({
    label,
    options,
    value,
    onSelect,
    flush = false,
    active = true,
    testId,
}: {
    label: string
    options: readonly PickerOption[]
    /** Undefined until the choice is known — the roving tab stop falls to the first row. */
    value: string | undefined
    onSelect: (value: string) => void
    /**
     * Drop the card and run the rows edge to edge.
     *
     * **For a list long enough to scroll.** The default rounded, bordered card is right for Appearance
     * and Language, which are three and eight rows and sit still. Put 150 rows in it and the card is
     * inside the scroll box: its corners are clipped at both ends of the travel, and the 1px side
     * borders become two vertical lines running off the top and bottom of the visible area with no
     * corner attached — measured on a 360-wide phone, where it reads as a rendering fault rather than
     * as a card. Flush is also what a native picker looks like: full-bleed rows, the selected wash
     * reaching both edges, hairlines inset to the text.
     *
     * `-mx-4` cancels the host's own gutter; the rows keep their `px-4`, so the text does not move.
     */
    flush?: boolean
    /**
     * Whether the list is the thing on screen — what drives the scroll-to-selection below.
     *
     * It exists because the account drawer keeps its pushed screens **mounted** while parked, so a
     * mount effect there would scroll a list nobody is looking at (and, on a long one, the drawer
     * under it). A host that mounts the list only while it is visible — a dialog — can leave it
     * alone; the default is `true` for exactly that case.
     */
    active?: boolean
    /**
     * Base `data-testid`. The list takes it; each row is `${testId}-option` carrying
     * `data-option-value={option.value}`.
     *
     * The value goes in a companion attribute rather than into the id, and this component is why
     * one rule has to cover both cases: `option.value` is a closed enum for Appearance and Language
     * and a ~150-row wire list for currencies. It is also what keeps the catalog enumerable — see
     * `shared/lib/test-id.ts`.
     */
    testId?: string
}) {
    const checked = options.findIndex(option => option.value === value)
    const tabStop = checked === -1 ? 0 : checked

    const rootRef = useRef<HTMLDivElement>(null)

    /**
     * What the option set is, rather than which array instance it arrived in.
     *
     * The dependency has to be the *content*: every host builds `options` inline
     * (`countries.map(...)`, `searchCurrencies(...)`), so the array's identity changes on every render
     * and an effect keyed on it would fight the reader for the scroll position on every keystroke —
     * including the ones that changed nothing.
     *
     * O(n) per render on a list that already renders n rows, so it costs nothing measurable.
     */
    const fingerprint = options.map(option => option.value).join('|')

    /** The option set the previous run saw. `null` until the first, which is not a change. */
    const seenFingerprint = useRef<string | null>(null)

    /**
     * Open **at the chosen row**, centred.
     *
     * Without this a creator whose bank is in Viet Nam opens a 250-row country picker at Afghanistan
     * and has to go looking for their own selection to see that it is checked — on a list that long
     * the check mark is otherwise a claim nobody can verify. Same for a currency: `VND` is 200 rows
     * down. Nothing chosen yet? The top *is* the right place to start, so this no-ops.
     *
     * The offset is measured with rects rather than read off `offsetTop`, because a row's
     * `offsetParent` is `LeftBarList` (it is `relative`), so `offsetTop` alone is relative to the
     * wrong box.
     */
    useEffect(() => {
        if (!active) return
        const root = rootRef.current
        const box = scrollParent(root)
        // Nothing scrolls — a three-row Appearance list in a panel that fits. Also what keeps the
        // parked drawer still, since a box with no overflow is never found.
        if (!box) return
        const row = root?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')
        if (!row) return
        const delta = row.getBoundingClientRect().top - box.getBoundingClientRect().top
        box.scrollTop += delta - (box.clientHeight - row.offsetHeight) / 2
    }, [active])

    /**
     * A **changed** option set — a search term, a country switching the method list — sends it back to
     * the top: the results are different, so the offset they were read at means nothing. Leaving it is
     * how a filtered list ends up showing its own third page (seen in `/dev/left-bar` before
     * `CurrencyList` grew this).
     *
     * Its own effect, and that is the fix rather than the tidy-up: as one effect keyed on
     * `[active, fingerprint]` with a "was I active last time" ref, **React's development double-invoke
     * ran it twice** — the second pass saw the ref already set, read that as "the options changed" and
     * reset the scroll to 0, undoing the centring above. Measured: `scrollTop` 0 against a checked row
     * 4,225px down. Split like this, each effect is idempotent, so running twice is running once.
     */
    useEffect(() => {
        if (!active) return
        const previous = seenFingerprint.current
        seenFingerprint.current = fingerprint
        // The first run is not a change, and neither is a re-render with the same options.
        if (previous === null || previous === fingerprint) return
        const box = scrollParent(rootRef.current)
        if (box) box.scrollTop = 0
    }, [active, fingerprint])

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        // `currentTarget` is the list, so the rows come from the DOM rather than from a
        // ref array — `LeftBarRow` is a plain function component and forwards no ref.
        const rows = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'))
        const from = rows.indexOf(document.activeElement as HTMLElement)
        if (from === -1) return

        let to: number
        switch (event.key) {
            case 'ArrowDown':
                to = (from + 1) % rows.length
                break
            case 'ArrowUp':
                to = (from - 1 + rows.length) % rows.length
                break
            case 'Home':
                to = 0
                break
            case 'End':
                to = rows.length - 1
                break
            default:
                return
        }
        // Only once a key we handle has matched, so the drawer's own scrolling and the
        // rest of the page keep theirs.
        event.preventDefault()
        rows[to]?.focus()
    }

    return (
        /*
         * A wrapper, purely so the effect above has a node to walk up from: `LeftBarList` is a plain
         * function component that forwards no ref, and reaching it through a selector would need a
         * hook every host has to remember. `contents` would collapse it out of the box model, but the
         * walk needs a real element — so it is a plain block, which changes no geometry (the flush
         * list's own `-mx-4` still measures against the host's column).
         */
        <div ref={rootRef}>
            <LeftBarList
                bordered={!flush}
                /*
                 * `overflow-visible` on the flush variant, and it is load-bearing rather than tidy.
                 *
                 * `LeftBarList` is `overflow-hidden` so a *card* can clip its own rounded corners. A flush
                 * list has no corners and no fill, so there is nothing to clip — and inside a scrolling
                 * column that clip **hides rows**: the automatic minimum size of a flex item is its
                 * content only while `overflow` is `visible`, and `hidden` makes it zero. So the list
                 * shrinks to whatever is left in the box and silently cuts the rest off, with its own
                 * `overflow: hidden` swallowing the overflow the scroll container was meant to see.
                 *
                 * Measured in the payout country dialog: 61 rows, `scrollHeight` 4209, painted 446 —
                 * fifty-odd countries unreachable, the scroll container reporting nothing to scroll.
                 * `CurrencyList` escapes it only because it happens to wrap this in another flex column,
                 * which is not something a host should have to know.
                 */
                className={cn(flush && '-mx-4 overflow-visible rounded-none bg-transparent')}
                role="radiogroup"
                aria-label={label}
                onKeyDown={handleKeyDown}
                data-testid={testId}
            >
                {options.map((option, i) => {
                    const isChecked = option.value === value
                    return (
                        <LeftBarRow
                            key={option.value}
                            data-testid={subTestId(testId, 'option')}
                            data-option-value={option.value}
                            role="radio"
                            aria-checked={isChecked}
                            tabIndex={i === tabStop ? 0 : -1}
                            className={cn(
                                /*
                                 * **Indigo, not Primary.** This was `--primary-50`, on the grounds that
                                 * the ramp inverts so one tint covers both modes. It does invert — and in
                                 * Dark it inverts to `#140735`, which is *darker* than the Surface the
                                 * list sits on (`#18181b`): the checked row reads as a hole punched in
                                 * the sheet rather than a highlight, in a strongly saturated purple, with
                                 * the blue check mark beside it clashing. Only visible in Dark, which is
                                 * why it shipped.
                                 *
                                 * `--accents-indigo-bg-active` is what this app already paints a
                                 * *selected option* with — the space-visibility cards, the profile
                                 * category chips, the calendar's range, `Badge`'s `info` — each of them
                                 * paired with `--accents-indigo-active`, which is the ink of the check
                                 * mark below. It is also the design system's own selection colour: the DS
                                 * Radio and Checkbox fill Indigo, not brand purple.
                                 *
                                 * And `--primary-50` has a job already: it is the **unread** tint on a
                                 * notification row (`notification-row.tsx` states it). One wash cannot
                                 * mean both "not read yet" and "this is your choice".
                                 */
                                'aria-checked:bg-(--accents-indigo-bg-active)',
                                /*
                                 * No mark, no leading slot. `LeftBarRow` fills that slot with the DS's
                                 * coloured tile when it is handed neither a `brand` nor an `icon`, so a
                                 * mark-less row would otherwise carry an empty indigo square — and
                                 * merely blanking it would leave the text indented 48px against
                                 * nothing. Collapsed here rather than adding a variant to `shared/ui`,
                                 * which tracks the design system.
                                 */
                                option.mark === undefined &&
                                    '[&>[data-slot=list-row-leading]]:hidden',
                            )}
                            rule={i > 0}
                            title={option.label}
                            subtitle={option.subtitle}
                            brand={option.mark}
                            chevron={false}
                            trailing={
                                isChecked ? (
                                    <Icon name="check" size={20} className="text-(--text-link)" />
                                ) : undefined
                            }
                            onClick={() => onSelect(option.value)}
                        />
                    )
                })}
            </LeftBarList>
        </div>
    )
}
