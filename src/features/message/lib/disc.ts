/**
 * Legacy's round action button — the one shape every control in its DM screens takes: a white
 * disc with a soft shadow (`0 2px 10px rgba(0,0,0,.1)`) and a dark glyph. The row kebab (32), a
 * message's Reply and More (36 on a phone, 40 wider), the back button, Send and "jump to latest"
 * (40) are all it.
 *
 * A class string rather than a Button variant: the DS Button has no such variant, and `shared/ui`
 * changes only to track the DS. It is layered over `Button` / `ActionMenuTrigger` (both
 * `variant="ghost"`), and `cn`'s merge lets the fill, the colour and the hover here win over the
 * ghost ones — disabled included: legacy keeps the white disc and greys the glyph, where ghost would
 * drop the fill and leave a lone faded glyph. `shadow-md` is the DS elevation nearest legacy's
 * shadow, and it flips with the theme.
 */
export const DISC =
    'rounded-(--radius-fill) bg-(--background-surface) text-(--icon-default) shadow-md hover:not-disabled:bg-(--background-surface) hover:text-(--icon-default) data-[popup-open]:bg-(--background-surface) data-[popup-open]:text-(--icon-default) disabled:bg-(--background-surface) disabled:text-(--icon-disabled)'
