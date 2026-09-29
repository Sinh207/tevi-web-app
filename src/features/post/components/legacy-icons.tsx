/**
 * Glyphs taken from the legacy app's own artwork, because the design system's are a different
 * drawing — or, in one case, the wrong drawing.
 *
 * ## This is an exception to `CLAUDE.md`, and it is meant to be a visible one
 *
 * The rule is: icons come from the DS sprite, a shape is never substituted, a path is never
 * hand-drawn. Nothing here is hand-drawn or adapted — each is **legacy's own path, verbatim**, the
 * same artwork this port is reproducing. The one edit is `currentColor` in place of legacy's
 * hard-coded `#141414` / `white`, which would have no dark mode.
 *
 * They live in one file so the exception is auditable: a reviewer can see every glyph the port
 * takes from outside the sprite, and what has to be true before each one is deleted.
 *
 * ### `BookmarkIcon` — the sprite's glyph is the **slashed** variant
 *
 * `bookmark-simple` is the sprite's only bookmark and both of its weights carry a slash: the same
 * `1.46967 2.53033 → 22.5303 21.4697` diagonal `bell-slash` draws, with the ribbon clipped to it.
 * Verified against upstream **Zappicon v1.2.0**, whose `bookmark-simple` has **one** path where the
 * Tevi sprite has **two** — same ribbon coordinates (`9.668`, `14.306`), plus a slash the upstream
 * glyph does not have. So the Figma library exports a slashed bookmark under the plain name, and
 * using it drew a crossed-out bookmark on a post that had never been saved.
 *
 * **This one is a library defect and should be raised with Brand**, not patched around forever. The
 * usual repair — adding the upstream glyph to `design-system/tevi-icons.extra.svg` — cannot be used
 * here: that overlay is for glyphs the library *lacks*, and `icon-names.test.ts` fails on an id
 * present in both files. `bookmark-simple` is present; it is simply wrong.
 *
 * ### `LockIcon` — the sprite's glyph is correct, and still not legacy's
 *
 * `lock-simple--filled` **is** upstream's `lock-simple` filled (verified: identical shape, the
 * sprite's serialisation is absolute cubics where upstream uses arcs). No defect. But legacy's
 * paywall pill draws an **outline padlock with a keyhole** and the sprite ships a **solid padlock
 * with none**, at the only weight it has — there is no `lock-simple--regular`. At 16px on a dark
 * pill the solid one reads as a blob where legacy reads as a lock.
 *
 * Deleting this one needs either an outline weight or a keyholed `lock` in the library.
 *
 * ### `CollectionListGlyph` — the sprite has a document, not a list
 *
 * See the glyph's own note. Deleting it needs a plain bulleted list in the library.
 */

/**
 * The bookmark, hollow when the post is not saved and solid when it is — one shape, two states.
 *
 * Legacy draws the hollow one as two subpaths under `evenodd` (ribbon and cut-out) and the solid
 * one as a single closed path. Both carry the V notch at `(12, 14.5257)`, which is what makes it
 * read as a bookmark rather than as a tag.
 */
export function BookmarkIcon({ filled, size = 24 }: { filled: boolean; size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            focusable="false"
        >
            <path
                fillRule="evenodd"
                clipRule="evenodd"
                d={filled ? BOOKMARK_SOLID : BOOKMARK_HOLLOW}
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="0.5"
            />
        </svg>
    )
}

/**
 * The padlock on the paywall pill.
 *
 * `viewBox` is `0 0 16 17` and the glyph is drawn into a **square** box, which is legacy's own
 * `width={16} height={16}` on that viewBox — a one-seventeenth vertical squash. Kept rather than
 * corrected: at 16px it is invisible, and matching the comps matters more than the arithmetic.
 */
export function LockIcon({ size = 16 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 16 17"
            fill="none"
            aria-hidden="true"
            focusable="false"
        >
            <path d={LOCK} fill="currentColor" />
        </svg>
    )
}

/** Saved — a single closed ribbon. */
const BOOKMARK_SOLID =
    'M4 3.93873C4 3.42028 4.40934 3 4.91429 3H19.0857C19.5907 3 20 3.42028 20 3.93873V20.0594C20 20.8812 19.0443 21.3063 18.4604 20.7442L12 14.5257L5.5396 20.7442C4.95568 21.3063 4 20.8812 4 20.0594V3.93873Z'

/** Not saved — the same ribbon with its middle cut out by `evenodd`. */
const BOOKMARK_HOLLOW =
    'M5.37143 4.40809V18.976L11.3747 13.1975C11.7264 12.859 12.2736 12.859 12.6253 13.1975L18.6286 18.976V4.40809H5.37143ZM4 3.93873C4 3.42028 4.40934 3 4.91429 3H19.0857C19.5907 3 20 3.42028 20 3.93873V20.0594C20 20.8812 19.0443 21.3063 18.4604 20.7442L12 14.5257L5.5396 20.7442C4.95568 21.3063 4 20.8812 4 20.0594V3.93873Z'

/** Shackle, body outline and keyhole — the three parts the sprite's solid padlock has none of. */
const LOCK =
    'M11.1666 5.69222V4.82292C11.1666 3.07692 9.74592 1.65625 7.99992 1.65625C6.25392 1.65625 4.83325 3.07692 4.83325 4.82292V5.69222C3.54125 5.86355 2.83325 6.72025 2.83325 8.15625V12.1562C2.83325 13.7683 3.72125 14.6562 5.33325 14.6562H10.6666C12.2786 14.6562 13.1666 13.7683 13.1666 12.1562V8.15625C13.1666 6.72092 12.4586 5.86422 11.1666 5.69222ZM7.99992 2.65625C9.19459 2.65625 10.1666 3.62825 10.1666 4.82292V5.65625H5.83325V4.82292C5.83325 3.62825 6.80525 2.65625 7.99992 2.65625ZM12.1666 12.1562C12.1666 13.2076 11.7179 13.6562 10.6666 13.6562H5.33325C4.28192 13.6562 3.83325 13.2076 3.83325 12.1562V8.15625C3.83325 7.10492 4.28192 6.65625 5.33325 6.65625H10.6666C11.7179 6.65625 12.1666 7.10492 12.1666 8.15625V12.1562ZM8.8466 9.48958C8.8466 9.76425 8.70525 9.99629 8.49992 10.1476V11.4896C8.49992 11.7656 8.27592 11.9896 7.99992 11.9896C7.72392 11.9896 7.49992 11.7656 7.49992 11.4896V10.1309C7.30792 9.97819 7.17651 9.75292 7.17651 9.48958C7.17651 9.02958 7.54659 8.65625 8.00659 8.65625H8.01327C8.47327 8.65625 8.8466 9.02958 8.8466 9.48958Z'

/**
 * What is behind the paywall, in the pill at the bottom corner: a stack of images, a video frame or
 * an open book.
 *
 * All three are legacy's, and the two the sprite would have supplied are **different objects**, not
 * different styles: `film-play` is a film strip where legacy draws a rounded video frame, and
 * `document` is a page where legacy draws an open **book**. A book and a page do not mean the same
 * thing on a pill that is selling written content.
 *
 * Same `0 0 16 17` viewBox and the same square-box squash as `LockIcon` — they sit on the same pill
 * and have to match it.
 */
export function LockMediaIcon({
    kind,
    size = 16,
}: {
    kind: 'images' | 'video' | 'text'
    size?: number
}) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 16 17"
            fill="none"
            aria-hidden="true"
            focusable="false"
        >
            <path d={LOCK_MEDIA[kind]} fill="currentColor" />
        </svg>
    )
}

const LOCK_MEDIA: Record<'images' | 'video' | 'text', string> = {
    images: 'M14.7833 3.49959C14.45 3.05692 13.9146 2.7816 13.1912 2.6796L6.15055 1.69295C5.42722 1.59095 4.83993 1.70761 4.3986 2.04028C3.95593 2.37361 3.67995 2.90893 3.57861 3.63093L3.48055 4.32169H3.11125C1.64258 4.32169 0.833252 5.13035 0.833252 6.59968V12.3783C0.833252 13.8477 1.64258 14.6563 3.11125 14.6563H10.2232C11.4959 14.6563 12.2713 14.0469 12.4566 12.9296C13.496 12.8456 14.1579 12.1709 14.3306 10.9716L15.1299 5.2517C15.2332 4.53103 15.116 3.94159 14.7833 3.49959ZM3.11125 5.32169H10.2232C11.1312 5.32169 11.502 5.69168 11.502 6.59968V9.9864L9.21989 7.70434C8.79189 7.27701 8.09722 7.27767 7.67122 7.70434L4.88924 10.4864L4.4786 10.0749C4.0506 9.64694 3.35593 9.64828 2.92993 10.0749L1.83325 11.1716V6.59968C1.83325 5.69168 2.20391 5.32169 3.11125 5.32169ZM10.2232 13.6563H3.11125C2.27391 13.6563 1.89791 13.3356 1.84391 12.5743L3.63656 10.7816C3.67256 10.7463 3.73391 10.7456 3.77124 10.7816L4.32861 11.3389C4.63795 11.6489 5.1426 11.6476 5.4506 11.3389L8.37858 8.41104C8.41591 8.37504 8.47727 8.37571 8.51327 8.41104L11.502 11.3997V12.3783C11.502 13.2863 11.1312 13.6563 10.2232 13.6563ZM14.1399 5.11238L13.3406 10.8316C13.2439 11.5023 12.9906 11.8402 12.502 11.9236V6.59968C12.502 5.13035 11.6926 4.32169 10.2232 4.32169H4.48991L4.56795 3.77172C4.63195 3.32105 4.77659 3.00694 4.99992 2.83894C5.22125 2.67161 5.56191 2.61835 6.01058 2.68302L13.0519 3.66967C13.5026 3.73367 13.8159 3.87832 13.9839 4.10099C14.1519 4.32299 14.2039 4.66305 14.1399 5.11238ZM3.6779 7.82299C3.6779 7.45499 3.97324 7.15632 4.34058 7.15632H4.34595C4.71328 7.15632 5.01123 7.45499 5.01123 7.82299C5.01123 8.19099 4.71328 8.48966 4.34595 8.48966C3.97928 8.48966 3.6779 8.19099 3.6779 7.82299Z',
    video: 'M11.75 1.73438H4.25C2.47667 1.73438 1.5 2.71104 1.5 4.48438V11.9844C1.5 13.7577 2.47667 14.7344 4.25 14.7344H11.75C13.5233 14.7344 14.5 13.7577 14.5 11.9844V4.48438C14.5 2.71104 13.5233 1.73438 11.75 1.73438ZM13.5 4.48438V5.73438H10.5V2.73438H11.75C12.9767 2.73438 13.5 3.25771 13.5 4.48438ZM6.5 5.73438V2.73438H9.5V5.73438H6.5ZM4.25 2.73438H5.5V5.73438H2.5V4.48438C2.5 3.25771 3.02333 2.73438 4.25 2.73438ZM11.75 13.7344H4.25C3.02333 13.7344 2.5 13.211 2.5 11.9844V6.73438H13.5V11.9844C13.5 13.211 12.9767 13.7344 11.75 13.7344ZM9.98202 8.9777L7.8833 7.69303C7.5353 7.4797 7.09801 7.47173 6.74268 7.67106C6.38201 7.87306 6.16732 8.23968 6.16732 8.65234V11.1497C6.16732 11.5624 6.38201 11.929 6.74268 12.131C6.91401 12.227 7.10403 12.2751 7.29403 12.2751C7.49869 12.2751 7.70263 12.2197 7.8833 12.109L9.98136 10.825C10.306 10.6264 10.5 10.281 10.5 9.90104C10.5 9.52104 10.306 9.1757 9.98202 8.9777ZM9.45931 9.97168L7.36068 11.2563C7.30601 11.289 7.2607 11.2751 7.23136 11.2591C7.20203 11.2424 7.16667 11.2104 7.16667 11.1497V8.65234C7.16667 8.59234 7.20203 8.55964 7.23136 8.54297C7.24736 8.53364 7.26934 8.52572 7.29468 8.52572C7.31468 8.52572 7.33733 8.53107 7.36133 8.54574L9.45996 9.8304C9.45996 9.8304 9.46003 9.8304 9.46069 9.8304C9.48669 9.8464 9.50065 9.87039 9.50065 9.90039C9.50065 9.93039 9.48598 9.95568 9.45931 9.97168Z',
    text: 'M13.9527 3.09502C13.9521 3.09435 13.9521 3.09502 13.9527 3.09502C12.8467 2.56969 11.6168 2.38441 10.3041 2.54774C9.28145 2.67307 8.44008 3.31237 8.00008 4.18104C7.56008 3.31237 6.71871 2.67307 5.69604 2.54774C4.37938 2.38507 3.1541 2.57035 2.0481 3.09502C1.8161 3.20502 1.66675 3.44374 1.66675 3.70374V12.3737C1.66675 12.5831 1.76276 12.7764 1.93009 12.9017C2.10009 13.0297 2.31405 13.0704 2.52205 13.011C4.48539 12.4537 6.21668 12.7011 7.81535 13.7671C7.82001 13.7697 7.82549 13.7684 7.83016 13.7717C7.83549 13.775 7.83736 13.7811 7.84269 13.7837C7.89202 13.8104 7.94608 13.823 8.00008 13.823C8.05408 13.823 8.10814 13.8097 8.15747 13.7837C8.1628 13.7811 8.16467 13.7744 8.17 13.7717C8.17467 13.769 8.18015 13.7704 8.18481 13.7671C9.78415 12.7011 11.5174 12.4544 13.4781 13.011C13.6854 13.0704 13.9001 13.0297 14.0701 12.9017C14.2374 12.7757 14.3334 12.5831 14.3334 12.3737V3.70374C14.3334 3.44441 14.1834 3.20569 13.9527 3.09502ZM4.49015 12.0537C3.79815 12.0537 3.08075 12.1603 2.33341 12.373L2.33667 3.69504C3.33867 3.22037 4.40948 3.06038 5.61548 3.20838C6.78481 3.35238 7.66675 4.34969 7.66675 5.52902V12.8944C6.66141 12.3338 5.60949 12.0537 4.49015 12.0537ZM13.6667 3.70301L13.6607 12.3697C11.7074 11.815 9.95808 11.9857 8.33341 12.8951V5.52975C8.33341 4.35042 9.21535 3.35303 10.3847 3.20903C10.674 3.1737 10.9547 3.15573 11.2294 3.15573C12.1001 3.15573 12.9034 3.33507 13.6654 3.69707L13.8087 3.39572L13.6667 3.70301ZM12.3334 6.15638C12.3334 6.34038 12.1841 6.48971 12.0001 6.48971H10.0001C9.81608 6.48971 9.66675 6.34038 9.66675 6.15638C9.66675 5.97238 9.81608 5.82305 10.0001 5.82305H12.0001C12.1841 5.82305 12.3334 5.97238 12.3334 6.15638ZM11.6667 8.15638C11.6667 8.34038 11.5174 8.48971 11.3334 8.48971H10.0001C9.81608 8.48971 9.66675 8.34038 9.66675 8.15638C9.66675 7.97238 9.81608 7.82305 10.0001 7.82305H11.3334C11.5174 7.82305 11.6667 7.97238 11.6667 8.15638Z',
}

/**
 * The small star inside the Star-cost chip.
 *
 * A **separate drawing** from `StarMark`, and legacy keeps them separate for a reason this port has
 * to keep too: `StarMark` is the brand mark — a coloured asset sized for a figure it sits beside —
 * while this is a 12px white glyph on a filled chip, carrying a `drop-shadow` so it survives on the
 * lighter end of that fill. Swapping in the brand mark puts a coloured star on a coloured chip.
 *
 * `viewBox` is legacy's `0 0 10 11` drawn into a 12px square, so the proportions match the comps.
 */
export function StarCostGlyph({ size = 12 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 10 11"
            fill="none"
            aria-hidden="true"
            focusable="false"
        >
            <path
                d="M5.40076 2.41494L6.20993 4.04702C6.27077 4.16994 6.38827 4.25495 6.52452 4.27453L8.3924 4.54451C8.7349 4.59409 8.87159 5.0141 8.62367 5.25493L7.27327 6.56536C7.17452 6.66119 7.12949 6.7991 7.15282 6.93452L7.46156 8.72786C7.52406 9.09161 7.14199 9.3691 6.81449 9.19785L5.19451 8.34995C5.07285 8.2862 4.92783 8.2862 4.80658 8.34995L3.18783 9.19702C2.85991 9.36868 2.47657 9.09076 2.53948 8.72618L2.84827 6.93452C2.8716 6.7991 2.82658 6.66119 2.72783 6.56536L1.37742 5.25493C1.12909 5.0141 1.26573 4.59409 1.60865 4.54451L3.47658 4.27453C3.61241 4.25495 3.72991 4.16994 3.79116 4.04702L4.60033 2.41494C4.76325 2.08369 5.23659 2.08369 5.40076 2.41494Z"
                fill="currentColor"
                style={{ filter: 'drop-shadow(0 1px 1px rgb(0 0 0 / 0.1))' }}
            />
        </svg>
    )
}

/**
 * The bulleted list in a collection card's count pill — legacy's `CollectionItem`, 12px, white on
 * the dark pill.
 *
 * The sprite's nearest is `document-list`, which is a **page** with lines on it: a document, where
 * legacy's is three bullets and nothing around them — a list, which is what a collection is. Same
 * reasoning as `LockMediaIcon`'s book. Deleting this needs a plain bulleted-list glyph in the
 * library.
 */
export function CollectionListGlyph({ size = 12 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
            focusable="false"
        >
            <path d={COLLECTION_LIST} fill="currentColor" />
        </svg>
    )
}

const COLLECTION_LIST =
    'M1.74971 8.25029C2.16376 8.25029 2.49942 8.58595 2.49942 9C2.49942 9.41405 2.16376 9.74971 1.74971 9.74971C1.33566 9.74971 1 9.41405 1 9C1 8.58595 1.33566 8.25029 1.74971 8.25029ZM3.75017 8.5H10.5017C10.7779 8.5 11.0017 8.72386 11.0017 9C11.0017 9.25642 10.8087 9.46775 10.56 9.49664L10.5017 9.5H3.75017C3.47403 9.5 3.25017 9.27614 3.25017 9C3.25017 8.74358 3.44319 8.53225 3.69186 8.50336L3.75017 8.5H10.5017H3.75017ZM1.74971 5.25029C2.16376 5.25029 2.49942 5.58595 2.49942 6C2.49942 6.41405 2.16376 6.74971 1.74971 6.74971C1.33566 6.74971 1 6.41405 1 6C1 5.58595 1.33566 5.25029 1.74971 5.25029ZM3.75017 5.5H10.5017C10.7779 5.5 11.0017 5.72386 11.0017 6C11.0017 6.25642 10.8087 6.46775 10.56 6.49664L10.5017 6.5H3.75017C3.47403 6.5 3.25017 6.27614 3.25017 6C3.25017 5.74358 3.44319 5.53225 3.69186 5.50336L3.75017 5.5H10.5017H3.75017ZM1.74971 2.25391C2.16376 2.25391 2.49942 2.58956 2.49942 3.00361C2.49942 3.41767 2.16376 3.75332 1.74971 3.75332C1.33566 3.75332 1 3.41767 1 3.00361C1 2.58956 1.33566 2.25391 1.74971 2.25391ZM3.75017 2.50041H10.5017C10.7779 2.50041 11.0017 2.72427 11.0017 3.00041C11.0017 3.25683 10.8087 3.46817 10.56 3.49705L10.5017 3.50041H3.75017C3.47403 3.50041 3.25017 3.27655 3.25017 3.00041C3.25017 2.74399 3.44319 2.53266 3.69186 2.50378L3.75017 2.50041H10.5017H3.75017Z'
