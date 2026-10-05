import { cn } from '@shared/lib/utils'

/**
 * The channel page's content column: **full width below `md`, 612px from `md` up.**
 *
 * 612 is legacy's `<Container maxWidth='sm'>`. Written as a literal rather than `max-w-sm`, twice
 * over: Tailwind's `sm` is 24rem (384px), and **this repo's `sm` breakpoint is itself 612px** — so
 * `max-w-sm` would be wrong and `sm:max-w-[612px]` would read as if the cap only applied above the
 * cap.
 *
 * The cap used to apply at every width, matching legacy. It does not any more: between 612 and 899 —
 * a landscape phone, a small tablet, a narrow window — a 612px column left a margin either side of a
 * header whose cover image wants the whole width, and the page read as a card floating on a page
 * rather than as the page. `md` (900) is the switch because that is where the tab bar gives way to
 * the left rail, i.e. where the layout stops being the phone layout.
 *
 * Two things already agreed with this and did not have to move: the header card's radius flips at
 * `md` (`rounded-none md:rounded-t-[…]`), so full-bleed and square-cornered happen together; and the
 * card's own padding is `p-3 md:p-6`. The bar's padding *did* have to follow — see
 * `channel-top-bar.tsx`, where the old breakpoint was justified by the behaviour this changed.
 *
 * Same value as `CHANNEL_SETTINGS_CONTAINER` today, and deliberately still its own constant — a
 * page's width is a decision it owns, and two screens agreeing on a number now is not a reason for
 * one to move when the other is redesigned.
 */
export const CHANNEL_CONTAINER = 'mx-auto w-full md:max-w-[612px]'

/**
 * The page column under the bar — and, **below `md`, the space's surface itself.** The header, the
 * tab strip and the walls each paint `--background-surface`, but the column did not, so a phone
 * showed the app's grey ground wherever those stopped: under a short wall, under a thin tab panel,
 * and through the `pb-16` that clears the tab bar. Painting the column makes the page one surface
 * edge to edge and top to bottom (the single-panel rule, `docs/DESIGN_SYSTEM.md` §6); from `md` it
 * is a card on the page again, so the paint goes. `flex-1` is what carries it to the bottom.
 */
export const CHANNEL_COLUMN =
    'flex flex-1 flex-col bg-(--background-surface) pb-16 md:bg-transparent'

/**
 * Horizontal padding inside the header card and the tab panels — 12px, 24px from `md`.
 *
 * From legacy's `CardContent` (`p: { xs: 1.5, md: 3 }`, MUI's 8px unit). Note **`p-6`, not `p-5`**:
 * `--spacing-5` is 24px in the Figma ramp but Tailwind's `p-5` is 20px, and the mapping table at
 * the top of the spacing block in `globals.css` exists because that has already bitten.
 */
export const CHANNEL_PADDING = 'p-3 md:p-6'

/**
 * The content column for the channel's **settings** sub-pages — `/settings/space-visibility`
 * and `/settings/blocked-accounts`.
 *
 * Same 612px cap as `CHANNEL_CONTAINER`, dropped below `md` — legacy's `<Container maxWidth='sm'>`
 * again.
 *
 * This used to be the *distinguishing* property: the channel page capped at every width and only the
 * settings screens went full-bleed below `md`, on the grounds that a feed under a cover image reads
 * fine in a fixed column while a stack of full-width cards does not. The channel page has since gone
 * full-bleed below `md` too — a 612px column between 612 and 899 left a margin either side of a cover
 * that wants the whole width — so the two now agree, and the reason they agree is the same reason.
 *
 * `md` (900) is the switch rather than `sm`, because md is also where the tab bar gives way to
 * the left rail — i.e. where the layout stops being the phone layout. Identical reasoning, and
 * identical value, to `IDENTIFICATION_CONTAINER`; not imported from there because a feature may
 * not reach into another feature's internals, and a layout constant is not worth widening a
 * barrel for.
 */
export const CHANNEL_SETTINGS_CONTAINER = 'mx-auto w-full md:max-w-[612px]'

/**
 * The reading surface the edit-profile form sits on — **from md up only**.
 *
 * ## Why the form needed one and the visibility picker did not
 *
 * `/settings/space-visibility` and `/settings/blocked-accounts` are lists of **cards**: each row
 * already carries `--background-surface` and a border, so the page background is the gap between
 * them and a panel underneath would be a surface behind surfaces. This form is the opposite — a
 * cover photo and seven bare controls — so with nothing under it the whole screen was 612px of
 * content floating on `--background` from md up, with no edge anywhere.
 *
 * Same decision, same tokens and the same breakpoint as `IDENTIFICATION_PANEL`, which is the other
 * form-shaped sub-page in this app. Duplicated rather than imported because a feature may not reach
 * into another feature's internals, and a layout constant is not worth widening a barrel for —
 * `CHANNEL_SETTINGS_CONTAINER` says the same about the width beside it.
 *
 * `--background-surface`, not `--background-subtle`: subtle resolves to `--zinc-100`, which *is*
 * `--background` in Light (invisible) and identical to surface in Dark. Wrong token for "a plane
 * above the page" in both modes, and only obvious once you try it in both.
 *
 * ## **No `overflow-hidden`** — the action bar lives in here now
 *
 * It used to have `md:overflow-hidden`, to clip the cover photo's square top corners to the panel's
 * rounded ones. That is incompatible with what the panel now contains: `overflow: hidden` makes an
 * element a scroll container, and a `position: sticky` descendant sticks inside *that* box rather
 * than to the viewport — so the desktop Cancel/Save bar would stop following the screen and park
 * itself at the bottom of the panel.
 *
 * The clip moved to the cover block itself, which needs it and contains nothing sticky. Same
 * warning `IDENTIFICATION_PANEL` carries, arrived at from the other direction.
 */
/**
 * `/settings/custom-profile`'s surface — **one class in two places**: `<main>` and the sticky bar.
 *
 * `docs/DESIGN_SYSTEM.md` §6. That screen is a **single panel**: one form, no hero, no second block —
 * so below `md` the surface runs from the status bar to the bottom edge and the form scrolls *under* a
 * bar of the same colour, and from `md` both return to the page colour with `PROFILE_PANEL` becoming
 * the card.
 *
 * ⚠ This screen carried the **older** treatment until 2026-08-26: flat on `--background` below `md`,
 * i.e. a phone showing page colour and no surface at all, with the `md:` card identical. §6 named it
 * and `IDENTIFICATION_SCREEN` as the two left to align. Both are aligned now; nothing in the repo
 * should still be copied from the old shape.
 *
 * `--background-surface`, never `--background-subtle` — subtle *is* `--background` in Light.
 */
export const PROFILE_SCREEN = 'bg-(--background-surface) md:bg-(--background)'

export const PROFILE_PANEL = cn(
    // Fill the column from md, so a short form does not leave the panel hugging its content with
    // two thirds of a tall window empty beneath it. Below md it must not grow — see
    // `IDENTIFICATION_PANEL`, where that was measured against a phone viewport.
    'md:grow',
    /*
     * **No top margin.** It carried `md:mt-4`, which put a 16px band of page background between
     * the sticky bar and the panel's top edge — a gap that only reads as a gap while the page is
     * scrolled to the top, and reads as a misalignment the rest of the time, since the content
     * scrolls *under* the bar anyway. The bar is the page's own chrome, not a floating element the
     * card has to clear.
     */
    'md:rounded-2xl md:border md:border-(--separator-default) md:bg-(--background-surface)',
)

/**
 * Height of the page's sticky bar, which the tab row parks under.
 *
 * The DS App Bar shell is 60 tall, which is also what `PageBackBar` renders. Together with the
 * 48px segmented-control track that makes a 108px sticky stack — the number any in-panel anchor
 * needs as `scroll-mt`.
 */
export const CHANNEL_BAR_HEIGHT = 60

/**
 * `/my-space`'s two **empty** states — the signed-out prompt and the no-channel fallback.
 *
 * The route normally renders nothing of its own: it resolves your slug and replaces itself with
 * `/@{slug}`, so what a reader sees is `ChannelSkeleton` and then the channel page, both of which
 * bring their own bar and their own surfaces. The two states where the redirect *cannot* happen had
 * neither — a prompt centred on bare `--background` under no bar at all, on a route the tab bar
 * points at.
 *
 * **The surface follows the bar, and only the bar.** Below `md` the mobile top bar is there, so
 * `--background-surface` runs full-bleed from under it to the bottom edge — the bar is painted in
 * the same colour or the prompt scrolls under a differently coloured strip. From `md` the bar is
 * gone (the left rail is the navigation, and no tab destination draws one — home does not either),
 * so the surface goes with it: a card floating in the middle of a window with nothing above it
 * reads as a panel that lost its header, which is worse than the page colour it sits on.
 *
 * That is the whole reason this is one constant and not the `SCREEN` + `PANEL` pair
 * `/settings/custom-profile` uses. Those two screens are sub-pages with a `PageBackBar` at every
 * width, so their card always has a header over it. This one does not.
 */
export const MY_SPACE_SCREEN = 'bg-(--background-surface) md:bg-(--background)'

/**
 * `/mcn-partnership`'s column — 612 from `md`, full width below it with **12px of side padding**.
 *
 * Padding, unlike `CHANNEL_SETTINGS_CONTAINER`'s screens, because this one is a **stack of cards on
 * the page background** rather than a single panel: its blocks are surfaces with their own edges, so
 * the page colour has to be visible around them (`docs/DESIGN_SYSTEM.md` §6 — the full-bleed rule is
 * for a screen that is *one* block, and this is four). Full-bleed cards would meet the screen edge
 * with a rounded corner and nothing behind it.
 *
 * 12 rather than `/my-star`'s 16: legacy's own value here is 8 (`Box px='8px'`), and 12 is the step
 * the rest of this feature already uses at mobile widths (`CHANNEL_PADDING`). Splitting the
 * difference is deliberate — 8 reads tight against a 12px-padded card, and 16 is a different screen's
 * rhythm.
 */
export const MCN_PARTNERSHIP_CONTAINER = 'mx-auto w-full px-3 md:max-w-[612px] md:px-0'

/**
 * `/mcn-partnership`'s **empty** states — the signed-out prompt, the load failure, and "no MCN".
 *
 * ## Why this screen needs a pair when its ordinary state does not
 *
 * With a partnership to show, `/mcn-partnership` is a **multi-block** screen: three cards with page
 * colour between them, which is `docs/DESIGN_SYSTEM.md` §6's other branch and matches legacy exactly
 * (its body is `#f4f4f4` at every width, its cards white).
 *
 * Take the cards away and one block is left, so the same §6 applies to what remains — and it is
 * explicit about this case: *"the state sits on the same surface as the content it replaces. Floating
 * on `--background` while the list it stands in for is a card reads as a page that failed, not one
 * with nothing in it."* The wall shipped floating, which is what that sentence describes.
 *
 * So the two treatments are chosen by **state**, not by route: cards on the page colour when there is
 * a partnership, a single panel when there is not. Same shape and the same two constants as
 * `MY_SPACE_SCREEN` / `MY_SPACE_PANEL`, whose whole reason is also that a screen's *empty* states are
 * single panels while its ordinary one is something else.
 *
 * `SCREEN` goes on the column **and on the sticky bar** — the bar because content scrolls under it,
 * and a page-coloured bar over a full-bleed surface is a strip of the wrong colour above the panel.
 * It does not go on `<main>`: the column is `flex-1` and full-width below `md`, so it already covers
 * everything `<main>` would have.
 *
 * ⚠ Not applied to the skeleton, in either place it is drawn (here and `loading.tsx`): the skeleton
 * draws the *cards*, so it belongs on the page colour with them. A skeleton painted like the empty
 * state is §6's own "visible half of getting this wrong", from the other direction.
 *
 * `--background-surface`, never `--background-subtle` — subtle *is* `--background` in Light.
 */
export const MCN_PARTNERSHIP_SCREEN = 'bg-(--background-surface) md:bg-(--background)'

export const MCN_PARTNERSHIP_PANEL = cn(
    // Below `md` the surface is already full-bleed and the panel adds nothing; from `md` it becomes
    // the card the wall stands on, matching the cards it is standing in for.
    'md:rounded-2xl md:border md:border-(--separator-default) md:bg-(--background-surface)',
)

/**
 * `/invitation/verify`'s column — 612 from `md`, full width below it, **no side padding**.
 *
 * The counterpart to `MCN_PARTNERSHIP_CONTAINER` right above, and deliberately the *other* branch of
 * `docs/DESIGN_SYSTEM.md` §6: that screen is a stack of cards with page colour between them, this one
 * is a **single panel** — one document, hero to buttons, with nothing between its blocks. So the
 * surface runs edge to edge below `md` and there is no padding for page colour to show through;
 * legacy agrees (`<Container>` with `padding: 0` at every breakpoint, and a `<Paper>` whose radius is
 * `0` below `md` and 16 above).
 *
 * The hero is the reason padding here would be actively wrong rather than merely unnecessary: it is a
 * full-bleed image, and 12px of page colour either side of it turns the top of the screen into a
 * floating card on a phone.
 */
export const MCN_INVITATION_CONTAINER = 'mx-auto w-full md:max-w-[612px]'

/**
 * `/invitation/verify`'s surface — **one class in three places**: `<main>`, the sticky bar, and
 * `loading.tsx`.
 *
 * `docs/DESIGN_SYSTEM.md` §6's single-panel rule, and this screen is the clearest instance of it in
 * the app: below `md` the surface runs from under the bar to the bottom edge and the letter scrolls
 * *under* a bar of the same colour; from `md` both return to the page colour and
 * `MCN_INVITATION_PANEL` becomes the card.
 *
 * Unlike `MCN_PARTNERSHIP_SCREEN` this does **not** switch on state. There, the ordinary state is
 * three cards and only the walls are a single block, so the treatment has to follow the state. Here
 * every state is one block — the letter, the skeleton, the expired-link wall, the sign-in prompt —
 * so the screen is a panel throughout and the skeleton is painted like the thing it stands in for
 * rather than being the exception §6 warns about.
 *
 * `--background-surface`, never `--background-subtle` — subtle *is* `--background` in Light.
 */
export const MCN_INVITATION_SCREEN = 'bg-(--background-surface) md:bg-(--background)'

export const MCN_INVITATION_PANEL = cn(
    // Fill the column from md, so a short state (the expired wall) does not leave the panel hugging
    // 200px of content with two thirds of a tall window empty beneath it. Below md it must not grow:
    // the surface is already full-bleed there and `grow` would fight the sticky footer.
    'md:grow',
    /*
     * ⚠ `overflow-clip`, **not** `overflow-hidden`. The radius has to clip the hero's square top
     * corners, and `overflow: hidden` makes this element a scroll container — which would park the
     * screen's sticky action footer at the bottom of the panel instead of following the viewport.
     * `overflow: clip` clips without establishing a scrollport. Same trap `PROFILE_PANEL` above
     * records from the other direction, where the fix was to move the clip onto the cover block.
     */
    'md:overflow-clip md:rounded-2xl md:border md:border-(--separator-default) md:bg-(--background-surface)',
)
