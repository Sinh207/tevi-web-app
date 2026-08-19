/**
 * The phone on the Get App control — **not a design-system glyph, and it must not look like one.**
 *
 * ## Why this exists at all
 *
 * Legacy draws a phone here (`trending/navBar/getApp`). All 554 base glyphs in the DS sprite were
 * read: there is no phone, mobile, handset or smartphone. The house rule is that a missing glyph is
 * reported rather than approximated, and it was — `qr-code` shipped for a while in its place. This
 * mark is here because that call was overridden deliberately: parity with legacy's control won over
 * waiting on the sprite.
 *
 * ## Why it is a component and not an `Icon`
 *
 * `Icon` takes a name typed against the generated sprite, and every glyph it can render is asserted
 * against Figma. Getting this shape in through that door would mean editing
 * `design-system/tevi-icons.svg` — the **upstream import** — so a hand-drawn path would arrive
 * claiming the same provenance as 4,451 verified nodes, and the next design-system sync would either
 * clobber it or carry it forward as though design had authored it.
 *
 * So it stays a plain component, the way `features/auth/components/provider-marks.tsx` keeps the
 * Apple and Google marks and `shared/components/store-badge.tsx` keeps the store badges. A reader
 * can tell at a glance which shapes came from the design system and which did not, which is the
 * whole point of the rule the sprite exists to enforce.
 *
 * ## Provenance
 *
 * The path is copied **verbatim** from legacy's inline SVG — same 24 viewBox, same coordinates — so
 * this is the shape already in production rather than a redraw of it. Two changes:
 *
 * - `fill="currentColor"` in place of legacy's baked `#141414`. Legacy is light-mode only; a
 *   near-black glyph on this app's dark surface would be invisible.
 * - `aria-hidden` / `focusable="false"`: the button's own text says "Get App", so the mark is
 *   decorative and must not be announced twice.
 *
 * **If design ships a phone glyph, delete this file** and go back to `Icon` — that is the intended
 * end state, and `docs/END_RAIL_OPEN_ITEMS.md` (R5) records it.
 */
export function PhoneMark({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            focusable="false"
            className={className}
        >
            <path
                d="M16 21.75H8C5.582 21.75 4.25 20.418 4.25 18V6C4.25 3.582 5.582 2.25 8 2.25H16C18.418 2.25 19.75 3.582 19.75 6V18C19.75 20.418 18.418 21.75 16 21.75ZM8 3.75C6.423 3.75 5.75 4.423 5.75 6V18C5.75 19.577 6.423 20.25 8 20.25H16C17.577 20.25 18.25 19.577 18.25 18V6C18.25 4.423 17.577 3.75 16 3.75H8ZM14.25 6C14.25 5.586 13.914 5.25 13.5 5.25H10.5C10.086 5.25 9.75 5.586 9.75 6C9.75 6.414 10.086 6.75 10.5 6.75H13.5C13.914 6.75 14.25 6.414 14.25 6ZM12 17C11.448 17 11 17.448 11 18C11 18.552 11.448 19 12 19C12.552 19 13 18.552 13 18C13 17.448 12.552 17 12 17Z"
                fill="currentColor"
            />
        </svg>
    )
}
