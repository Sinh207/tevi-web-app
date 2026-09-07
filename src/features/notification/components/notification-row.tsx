'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import {
    ListRowRule,
    ListUserItem,
    ListUserItemAvatar,
    ListUserItemContent,
    ListUserItemCta,
    ListUserItemNameRow,
    ListUserItemPreview,
} from '@shared/ui/list'
import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { type InboxMessage, inboxBody, inboxTitle } from '../api/types'
import type { InboxTarget } from '../lib/inbox-link'
import { formatInboxTime } from '../lib/inbox-time'
import { NotificationRowMenu } from './notification-row-menu'

/**
 * One notification: what happened, when, and the two things that can be done to the row.
 *
 * The DS `List/User Item` (2089:2965) with the title row carrying a timestamp — the sibling of
 * `BlockedAccountRow` and `FollowRequestRow`, built the same way and deliberately not shared with
 * them. The three rows differ in the slot that matters (one button, two buttons, a kebab) and agree
 * on everything the DS already owns.
 *
 * ## The DS has no notification row, and this is the closest thing it *does* have
 *
 * Checked: the design system ships `Conversation List/Item` (100:22097), which is the same shape —
 * avatar, name, time, a preview line, an unread badge — but it is a **direct-message** row: its
 * unread affordance is a message *count*, its preview has typed variants for voice, photo and
 * location, and its `__time` slot is a right-aligned column the notification title needs the width
 * of. Porting it for this screen would mean porting a chat component and using a fifth of it.
 * `List/User Item` is already ported, is the row every other list in this app is built from, and
 * needs one addition (the time beside the title) rather than five subtractions.
 *
 * ## Unread is a tint **and** a dot, not one or the other
 *
 * Legacy tints the row `rgb(249, 247, 254)` — a faint purple — and does nothing else. That is a
 * ~2% luminance difference between read and unread, which is invisible to a reader with low
 * contrast sensitivity, gone entirely in a high-contrast mode, and meaningless to a screen reader.
 * So the tint is kept, a dot sits on the avatar's top-right corner, and the word "Unread" leads the
 * press target's accessible name — see `label`, which is also where the reason it cannot live in the
 * markup is written down. The dot's placement is not cosmetic and the note on it explains why: in
 * the title row it misaligned the row's two lines, and out of flow it costs the text nothing.
 *
 * ⚠ **The tint is `--primary-50`, a ramp step rather than a semantic token, and that is deliberate.**
 * CLAUDE.md's rule is semantic tokens only, and there is no semantic token for this because the DS
 * has no notification list to have named one. `--primary-50` is the right step for two reasons that
 * can be checked rather than argued: in Light it is `#f6f2fe`, which is legacy's own colour to
 * within a hair, and the Primary ramp **inverts** between modes, so in Dark it resolves to
 * `#140735` — a deep purple against `--background-surface`'s `#18181b`, still a tint of the brand,
 * still readable. Every other candidate fails one mode: `--background-subtle` is `--zinc-100`, which
 * *is* `--background` in Light (invisible) and identical to surface in Dark (also invisible). The
 * day the DS names an unread token, this is one line.
 *
 * ## The whole band is the press target, via a stretched pseudo-element
 *
 * A notification's hit area should be the row, not the sentence inside it — a 24px-tall title on a
 * 390px phone is a poor target and legacy's is no better (it puts `onClick` on the avatar and on
 * the text, and the gap between them does nothing). But the row also contains a kebab, and a button
 * inside a link is invalid HTML that browsers resolve differently.
 *
 * So the link (or button) wraps only the text column and stretches over the row with an
 * `after:absolute` box, while the kebab is lifted above it with `relative z-10`. One element carries
 * the accessible name, the whole band — avatar included — is pressable, and there is no nesting.
 * The overlay's geometry has one non-obvious term in it (`-start-[72px]`); `pressClass` below says
 * why, and it is the difference between the avatar being part of the target and not.
 *
 * ## Three kinds of press, and the row does not decide which
 *
 * `target` comes from `resolveInboxTarget`, which is where the rule lives and is tested. This
 * component only renders it: an internal `next/link`, an external anchor with `rel="noreferrer"`,
 * or a plain button for the app-only case. That is what makes the first two middle-clickable and
 * copyable — a notification pointing at a creator's space *is* a link, and legacy renders all three
 * as a `div` with an `onClick`.
 */
export function NotificationRow({
    message,
    target,
    rule,
    busy = false,
    exiting = false,
    enterDelay = 0,
    locale = 'en',
    onOpen,
    onToggleRead,
    onDelete,
    testId,
    rowIndex,
}: {
    message: InboxMessage
    /** Where the press goes. Resolved by the view, so the row stays presentational. */
    target: InboxTarget
    /** Draw a hairline above this row — true for every row with a *visible* row above it. */
    rule: boolean
    /** A write on this list is in flight; the kebab is held. */
    busy?: boolean
    /** Playing its exit after a delete. Still mounted, already gone to the reader. */
    exiting?: boolean
    /** First-paint stagger, in ms. Zero for rows appended by pagination. */
    enterDelay?: number
    /**
     * The row's own `data-testid`, plus the identity of the thing it shows in a companion
     * attribute. Passed rather than spread because this component has a closed prop list — a
     * `data-testid` handed to it would otherwise be dropped silently, which is a whole class of
     * "the id is there but nothing can find it". See docs/TEST_IDS.md.
     */
    testId?: string
    rowIndex?: number
    locale?: string
    /**
     * The press. Called for **every** target kind, including the two that navigate — it is what
     * marks the notification read, and it must run before the navigation takes the row away.
     */
    onOpen: () => void
    onToggleRead: () => void
    onDelete: () => void
}) {
    const { t } = useTranslation()

    const title = inboxTitle(message)
    const body = inboxBody(message)
    const time = formatInboxTime(message.created_at, locale)
    const unread = !message.read

    /**
     * The accessible name of the press target.
     *
     * Title and body joined, because either alone can be the whole content of a notification: the
     * social kinds send a body with no title ("reacted to your post"), the system kinds a title
     * with no body. A row with neither falls back to a generic label rather than presenting an
     * unnamed link — `docs/DEFINITION_OF_DONE.md` §10.
     *
     * **"Unread" is part of the name, and it has to be here rather than in the markup.** An
     * `sr-only` word beside the dot is the obvious way to state it, and it does not work: an
     * `aria-label` on the press target *replaces* everything inside it as the accessible name, so
     * the hidden word was computed and then discarded. The unread state — the whole reason the row
     * is tinted — was announced to nobody. The dot stays `aria-hidden` and the word rides here.
     */
    const label =
        [unread ? t('notification_unread') : null, title, body].filter(Boolean).join(' — ') ||
        t('notification_row_generic')

    /**
     * The press target's classes, and **it is `ListUserItemInfo` in disguise.**
     *
     * The DS's text column is a `<div>` component, and this slot has to *be* the anchor — a link
     * wrapping it would nest two identical flex columns, and a link inside it would leave the rest
     * of the column unpressable. So the column's own three classes (`min-w-0 flex-1 flex-col`,
     * `items-start`) are reproduced here rather than the component being used. If `ListUserItemInfo`
     * ever gains a `render`/`as` escape, this collapses back into it.
     *
     * ## `-start-[72px]` is what makes the avatar pressable, and it is not a fudge
     *
     * `after:inset-0` resolves against the nearest *positioned* ancestor, and that is
     * `ListUserItemContent` — which is `relative` because `ListRowRule` positions against it. So
     * the overlay covered the text column only: the 72px avatar gutter did nothing when tapped,
     * which is the exact gap legacy has (`onClick` on the avatar and on the text, nothing in
     * between) and the one this was written to close.
     *
     * 72 is the DS's own arithmetic, not a measurement: `ListUserItemAvatar` is `ps-4 pe-2` around
     * a 48px avatar — 16 + 48 + 8 — and its own doc states that the content column therefore starts
     * at 72. `start`, so it mirrors under RTL without a variant. Making `ListUserItemContent`
     * `static` instead would have been the tidier fix and is wrong: the rule would then position
     * against the row and run the full width, under the avatar, instead of starting after it.
     */
    const pressClass = cn(
        'flex min-w-0 flex-1 flex-col items-start text-start',
        'after:absolute after:inset-y-0 after:-start-[72px] after:end-0 after:content-[""]',
        'outline-none focus-visible:outline-none',
        // The focus ring is drawn on the stretched box, so a keyboard user sees the *row* focused
        // rather than a 24px sliver of text. `-outline-offset` keeps it inside the row's bounds so
        // it is not clipped by the card's rounded corners.
        'focus-visible:after:-outline-offset-2 focus-visible:after:outline-2 focus-visible:after:outline-(--focus-ring)',
    )

    const content: ReactNode = (
        <>
            <ListUserItemNameRow className="w-full">
                {title && (
                    /*
                     * Not `ListUserItemName` — that is the DS's *display name*, and it carries a
                     * `premium` gradient and a `truncate` built for a person's name. This is a
                     * notification's heading, so it takes the same 16/semibold Text-Title type
                     * through the utility and clamps to one line on its own.
                     */
                    <span className="min-w-0 truncate type-body-strong text-(--text-title)">
                        {title}
                    </span>
                )}
                {time && (
                    <>
                        {/*
                         * The separator dot legacy draws between title and time (`CircleRounded` at
                         * 6px). Decorative — the `<time>` beside it says the same thing.
                         *
                         * `--text-placeholder`, the **time's own** colour, and not
                         * `--separator-default`: this is punctuation inside a line of text, not a
                         * rule between rows. `--separator-default` is tuned for a 1px hairline
                         * (`#e4e4e7` in Light), and at 6px across it simply vanished in both
                         * modes — the title and the time read as two things with a gap rather than
                         * one meta cluster. Matching the time makes them one.
                         */}
                        {title && (
                            <span
                                aria-hidden="true"
                                className="size-1.5 flex-none rounded-full bg-(--text-placeholder)"
                            />
                        )}
                        {/*
                         * A real `<time>` with a machine-readable `dateTime`, so the relative
                         * phrase has an absolute value behind it — which is what lets a reader
                         * hover for the exact moment and what stops "2 hours ago" from being the
                         * only record of when this happened. `created_at` is already normalised to
                         * ISO by the schema, so it is a valid attribute value.
                         */}
                        {/*
                         * A step darker when there is **no title**, because then this is the only
                         * thing on the row's first line.
                         *
                         * `--text-placeholder` is right for a timestamp trailing a bold title — it
                         * is legacy's tertiary grey and it should recede. On the social
                         * notifications that send a body and no title ("reacted to your post"),
                         * that same grey left line one looking empty and line two looking like the
                         * title, which reads as a broken row rather than a quiet one.
                         */}
                        <time
                            dateTime={message.created_at ?? undefined}
                            className={cn(
                                'flex-none type-caption-meta',
                                title ? 'text-(--text-placeholder)' : 'text-(--text-body)',
                            )}
                        >
                            {time}
                        </time>
                    </>
                )}
            </ListUserItemNameRow>
            {body && (
                /*
                 * Two lines, then ellipsis. Legacy clamps nothing, so a long system notice pushes
                 * the row to four or five lines and the 80px band the DS draws stops being a band
                 * at all — twenty of those is a list with no rhythm. Two lines is what fits: the
                 * title row is 24 and the band's content box is 64, so 2 × 21 = 42 sits inside it
                 * (the 2px the DS's own three-line stack overflows by is documented on
                 * `ListUserItemPreview`).
                 */
                <span className="line-clamp-2 w-full min-w-0 type-dense-default text-(--text-body)">
                    {body}
                </span>
            )}
        </>
    )

    return (
        <li
            data-testid={testId}
            data-index={rowIndex}
            /*
             * `aria-hidden` while exiting, because the row is on its way out of the document and a
             * screen reader must not be able to land on a control that is about to be removed.
             * `pointer-events-none` for the same reason with a mouse.
             */
            aria-hidden={exiting || undefined}
            className={cn(
                exiting
                    ? 'pointer-events-none animate-[tevi-row-collapse_320ms_cubic-bezier(0.32,0.72,0,1)_both] motion-reduce:hidden motion-reduce:animate-none'
                    : 'animate-[tevi-rise_240ms_cubic-bezier(0.32,0.72,0,1)_both] motion-reduce:animate-none',
            )}
            style={!exiting && enterDelay ? { animationDelay: `${enterDelay}ms` } : undefined}
        >
            <ListUserItem
                className={cn(
                    // The Surface override every list in a card has to make: `ListUserItem` paints
                    // `--background-listing`, which is `--black` in Dark and would repaint the page
                    // colour over the card. See the warning on `ListUserItem`.
                    unread ? 'bg-(--primary-50)' : 'bg-(--background-surface)',
                    'transition-colors duration-[160ms] ease-out',
                    /*
                     * Hover on the whole row, since the whole row is the target — and **one step
                     * along the row's own ramp**, not a single shared value.
                     *
                     * A shared `--background-segment` hover repainted an unread row grey, so
                     * pointing at an unread notification made it look read: the tint that is the
                     * unread signal was replaced by the hover. `--primary-100` is the next step up
                     * from `--primary-50` and inverts with it (`#ede4fd` Light, `#210b52` Dark), so
                     * the row gets darker without changing what it is saying.
                     *
                     * For a read row `--background-segment` is the right step, because
                     * `--background-subtle` and `--background-surface` are the same value in Dark
                     * and a hover in that token would be invisible in exactly one mode.
                     */
                    unread ? 'hover:bg-(--primary-100)' : 'hover:bg-(--background-segment)',
                )}
            >
                <ListUserItemAvatar>
                    {/*
                     * The unread mark, on the avatar's top-right corner — **out of the text flow**,
                     * which is the whole point.
                     *
                     * It began as an 8px dot leading the title inside `ListUserItemNameRow`, and
                     * that was wrong twice over. Rendered conditionally it shifted the title 12px
                     * (the dot plus the row's `gap-1`) on the very press that marks the row read.
                     * Reserving the slot fixed the jump and introduced a worse defect: the reserved
                     * gutter indents the **title** and not the **body** below it, because the body
                     * is the name row's *sibling* and starts at the column's edge. So every row had
                     * its two lines misaligned by 12px, permanently — a fix that traded a momentary
                     * jump for a standing one.
                     *
                     * Absolutely positioned, none of it happens: the title and body both start at
                     * the content column's edge (so this row lines up with `BlockedAccountRow` and
                     * `FollowRequestRow`, which is the other thing the indent broke), the text keeps
                     * its full width on a phone, and there is nothing in flow to shift.
                     *
                     * The coordinates are `ListUserItemPin`'s convention — measured from the avatar
                     * **column's** edge, not the avatar's, which is why it is `start-[50px]` and not
                     * an inset offset. The column is `ps-4` around a 48px avatar, so the avatar
                     * spans 16→64 and this 14px box sits flush against its right edge at 50→64.
                     * `ListUserItemPin` itself is not used: it is a 20px indigo badge for a pin
                     * glyph, and overriding its size, colour and ring would leave nothing of it.
                     *
                     * The ring is the **row's own** colour rather than `--background`, so the dot
                     * reads as a cut-out from the row it sits on — `--background` is white in Light,
                     * i.e. invisible against a surface that is also white.
                     *
                     * ## `--badge-bg`, and why the brand purple was wrong
                     *
                     * It was `--button-accent-bg` — `--primary-500` — and that token is **defined
                     * once and never inverted**: `#501bc0` in both modes, because 500 is the pivot
                     * the Primary ramp mirrors around. So in Dark it was a deep violet dot sitting
                     * on `--primary-50`'s `#140735` row tint, two shades of the same near-black
                     * purple, and the mark all but disappeared. Only Dark was affected, which is
                     * why it survived a Light-mode review.
                     *
                     * `--badge-bg` is the design system's token for exactly this — an unread badge —
                     * and it resolves to `--accents-error-active`, `#ff3636`, which is also defined
                     * once and therefore reads on both a white surface and a near-black one.
                     *
                     * Measured against the row it sits on, and it is **not** a pure win: Dark goes
                     * 2.03 → **5.25**, which is the whole point, and Light goes 8.43 → 3.27. The
                     * light figure is the trade and it is an acceptable one — 3:1 is the WCAG 1.4.11
                     * floor for a non-text indicator, this clears it, and the 2px ring in the row's
                     * own colour is doing most of the separating anyway. Swapping the token per mode
                     * would buy back the light contrast and cost the agreement with the bells, which
                     * is the more valuable of the two.
                     *
                     * It is the fix for a **second** problem as well, and the worse one: both bells
                     * already draw their unread dot with `--badge-bg` (`NavbarItem`'s `BADGE_DOT`
                     * for the rail, `AppTopBar` for mobile). This row was the only place in the app
                     * painting "unread" a different colour from the control that announces it.
                     *
                     * `aria-hidden`: the state is in the press target's accessible name (see
                     * `label`), because an `aria-label` there discards any text inside it.
                     */}
                    <span
                        aria-hidden="true"
                        className={cn(
                            'absolute top-2 start-[50px] z-10 size-[14px] rounded-full',
                            'border-2 bg-(--badge-bg)',
                            unread ? 'border-(--primary-50)' : 'border-(--background-surface)',
                            // 160ms, matching the row tint fading beside it — the two are one
                            // change and must not arrive at different times. No `motion-reduce:`
                            // guard: reduced motion is about *movement*, and an opacity fade moves
                            // nothing (`MENU_ITEM_BASE` transitions colour unguarded for the same
                            // reason). The guards in this file are on `tevi-rise` and
                            // `tevi-row-collapse`, which translate and collapse.
                            'transition-opacity duration-[160ms] ease-out',
                            unread ? 'opacity-100' : 'opacity-0',
                        )}
                    />
                    {message.icon ? (
                        /*
                         * The service chooses this image per notification kind — an avatar for a
                         * social event, a glyph for a system one — so it is **not** the sender's
                         * avatar and is not linked as one: there is no slug beside it to link to.
                         * Decorative, because the text says what happened; an `alt` would have a
                         * screen reader announce the row twice.
                         *
                         * ⚠ **`unoptimized`, and it is a correctness measure, not a performance
                         * one.** `next/image` only fetches hosts listed in `next.config.ts`'s
                         * `remotePatterns`, and an unlisted one is a **runtime throw** — not a
                         * fallback to the raw image. This URL is chosen by the *notification*
                         * service, whose payload this client is guessing at wholesale (**B79**);
                         * the enumerated hosts are the channel and media services'. One
                         * notification minted with an icon on a host nobody listed would take the
                         * entire list down, and it would reach production the way that class of
                         * bug always does — on the first payload that contains one.
                         *
                         * `ProgramAvatar` makes the identical call for the identical reason (a
                         * partner's `icon_url`), and states the rule: no allow-list can be written
                         * ahead of a host nobody has seen. The cost is one un-transcoded 48px image
                         * per row, which is what these already are.
                         */
                        <Image
                            src={message.icon}
                            alt=""
                            width={48}
                            height={48}
                            unoptimized
                            className="size-12 flex-none rounded-full bg-(--background-subtle) object-cover"
                        />
                    ) : (
                        /* No icon: a neutral bell in a tile the same 48px, so the text column
                           starts in the same place on every row whether or not the art arrived. */
                        <span className="flex size-12 flex-none items-center justify-center rounded-full bg-(--background-subtle) text-(--icon-secondary)">
                            <Icon name="bell" size={20} />
                        </span>
                    )}
                </ListUserItemAvatar>
                <ListUserItemContent>
                    {rule && <ListRowRule />}
                    {/*
                     * `items-center`, the override `ListUserItemPreview` documents: the DS band is
                     * drawn for a three-line stack, and this row has two (a title row and a
                     * clamped body), which left 21px of air underneath and read bottom-heavy.
                     */}
                    <ListUserItemPreview className="items-center">
                        {target.kind === 'internal' ? (
                            <Link
                                data-testid="notification-row-link"
                                href={target.href}
                                aria-label={label}
                                className={pressClass}
                                onClick={onOpen}
                            >
                                {content}
                            </Link>
                        ) : target.kind === 'external' ? (
                            /*
                             * `noopener noreferrer` on a URL a *service* chose: `noopener` so the
                             * opened page cannot reach back through `window.opener`, `noreferrer`
                             * so it is not told which of our pages sent the reader. Modern browsers
                             * imply `noopener` for `target="_blank"`, and it is written anyway —
                             * the security property should not depend on the browser's default.
                             */
                            <a
                                data-testid="notification-row-external"
                                href={target.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={label}
                                className={pressClass}
                                onClick={onOpen}
                            >
                                {content}
                            </a>
                        ) : (
                            /* App-only: there is nowhere on the website to send the reader, so the
                               press opens the get-the-app dialog. A button, because it is not a
                               link — nothing to copy, nothing to middle-click. */
                            <button
                                data-testid="notification-row-press"
                                type="button"
                                aria-label={label}
                                className={pressClass}
                                onClick={onOpen}
                            >
                                {content}
                            </button>
                        )}
                        {/* Above the stretched press target, or the kebab would be unclickable —
                            the pseudo-element covers it otherwise. */}
                        <ListUserItemCta className="relative z-10 self-center">
                            <NotificationRowMenu
                                read={message.read}
                                title={title}
                                disabled={busy || exiting}
                                onToggleRead={onToggleRead}
                                onDelete={onDelete}
                            />
                        </ListUserItemCta>
                    </ListUserItemPreview>
                </ListUserItemContent>
            </ListUserItem>
        </li>
    )
}
