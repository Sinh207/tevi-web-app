/**
 * Brand marks the design system does not carry.
 *
 * ## Why this file is allowed to exist, and what may go in it
 *
 * `CLAUDE.md` is categorical: icons come **only** from the DS sprite (`/dev/icons`), and a missing
 * glyph is stood in for from that set, never hand-drawn. This file is on `scripts/check-icons.mjs`'s
 * `ALLOWED` list because what it draws is not an icon.
 *
 * Neither route covers a third-party *logo*. The Figma library ships six brand marks
 * (`facebook-icon`, `telegram-icon`, `x-icon`, `instagram-icon`, `tiktok-icon`, `linkedin-icon`) and
 * that set is closed; Zappicon v1.2.0 was checked and carries **no brand marks at all** — not
 * Messenger, not WhatsApp, not even the six the library has. A logo is also not a glyph in the sense those rules are written about: it is not drawn to
 * the DS's grid, it cannot be restyled by weight, and its shape is the other company's.
 *
 * So marks of that kind live **beside the feature that needs them**, never in the sprite, and each
 * one states where its path came from. Nothing here is drawn by hand or adapted from a neighbouring
 * shape, which is the actual thing the rule protects against.
 *
 * The moment Brand ships one of these in the Figma library, the entry here is deleted and the row's
 * `glyph` becomes the sprite name — one line in `lib/share-channels.ts` either way.
 */

/**
 * Messenger's bolt.
 *
 * **Path copied verbatim from legacy `components/share/components/content/shareTo/btnMessage`**, the
 * button that ships today — so this is the mark Tevi already puts on screen, not a new drawing.
 * White fill, because it only ever sits on Messenger's own gradient.
 *
 * 30×16 is the path's real box, and it is deliberately *not* squared off to 24: the bolt is wider
 * than it is tall and stretching it to a square is how a logo ends up subtly wrong.
 */
export function MessengerMark() {
    return (
        <svg
            width="26"
            height="14"
            viewBox="0 0 30 16"
            fill="none"
            aria-hidden="true"
            focusable="false"
        >
            <path
                d="M0.191023 14.2105L7.43441 2.80452C7.7069 2.37509 8.06612 2.0064 8.48939 1.72173C8.91266 1.43705 9.3908 1.24258 9.89361 1.15058C10.3964 1.05858 10.913 1.07105 11.4107 1.18721C11.9084 1.30337 12.3764 1.5207 12.7853 1.82546L18.5492 6.11494C18.8065 6.30617 19.1195 6.40901 19.441 6.4079C19.7624 6.4068 20.0748 6.30181 20.3307 6.10882L28.1104 0.246738C29.1461 -0.536505 30.5023 0.699552 29.8119 1.79487L22.5623 13.1947C22.2898 13.6242 21.9306 13.9928 21.5073 14.2775C21.0841 14.5622 20.6059 14.7567 20.1031 14.8487C19.6003 14.9407 19.0837 14.9282 18.586 14.812C18.0883 14.6959 17.6203 14.4785 17.2114 14.1738L11.4476 9.8843C11.1902 9.69307 10.8772 9.59023 10.5557 9.59134C10.2343 9.59244 9.92197 9.69743 9.66599 9.89042L1.88628 15.7525C0.850634 16.5357 -0.505575 15.3058 0.191023 14.2105Z"
                fill="currentColor"
            />
        </svg>
    )
}
