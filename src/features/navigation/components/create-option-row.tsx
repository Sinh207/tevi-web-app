import { cn } from '@shared/lib/utils'
import { Badge } from '@shared/ui/badge'
import { Icon } from '@shared/ui/icon'
import {
    ListLeading,
    ListLeadingTile,
    ListRowAccessory,
    ListRowContent,
    ListRowLeading,
    ListRowRule,
    ListRowSubtitle,
    ListRowText,
    ListRowTitle,
    ListRowTitleRow,
    ListRowTrailing,
} from '@shared/ui/list'
import type { CSSProperties } from 'react'
import type { CreateOption } from '../hooks/use-create-action'

/**
 * The inside of one Create row, so the rail's popover and the phone's dialog draw the *same* thing.
 *
 * ## Why the two surfaces share the content and not the wrapper
 *
 * The wrapper has to differ: in a popover the row is an `ActionMenuItem` (`role="menuitem"`, roving
 * arrow-key focus, closes on press) and in a dialog it is a `ListRow as="button"`. Neither can be
 * the other. Everything *inside* is the same `List/Action` anatomy the account drawer, `/my-star`
 * and `/my-wallet` already draw — 48px leading slot, 32px coloured tile, two-line text — so the
 * Create list reads as one component at both widths instead of a tiled list on the phone and a
 * plain text menu on the desktop, which is what it was.
 *
 * `ListRow`'s own doc calls it "a 48px leading slot and a two-line text block", so the second line
 * is the component's shape rather than something added to it: legacy carries the same two lines
 * ("What's on your mind?", "Create a broadcast Live") on its 69px create rows.
 *
 * ## "Coming soon" is a `Badge`, not an opacity
 *
 * `ActionRows` renders a row with no destination at `opacity-40` with the reason `sr-only`, and
 * that is right where the row has nowhere to say it. Here the row has a title row and a second
 * line, so the reason can be **visible** — a DS `Badge`, which is the element the design system
 * already ships for exactly this kind of label.
 *
 * That changes what may be dimmed. Opacity does not reset on a child, so fading the row would fade
 * the badge with it and hide the very thing that explains the row. So the fade is on the **tile**
 * and the title drops to `--text-subtitle`; the row is still a real `disabled` control, which is
 * what takes it out of the tab order and stops the press. And the badge, being row content rather
 * than an `sr-only` description, is announced by a screen reader without an `aria-describedby` to
 * keep in sync.
 *
 * `status="outline"` and not `"disabled"`: the disabled palette is `--text-disabled` on
 * `--button-secondary-bg-disabled`, which is two greys apart and unreadable at 12px — measured on
 * screen, not guessed. Outline puts `--text-body` inside a hairline, which is quiet enough to read
 * as unavailable and dark enough to actually be read.
 */
export function CreateOptionRow({
    option,
    unavailableLabel,
    showRule,
    showChevron,
}: {
    option: CreateOption
    /** The badge beside the title when the option has no action yet. */
    unavailableLabel: string
    /** The DS rule between rows. Off in the popover — `ActionMenu` draws its own. */
    showRule?: boolean
    /** Off in the popover: a chevron says "this row navigates", and a menu row does not. */
    showChevron?: boolean
}) {
    const available = Boolean(option.onSelect)

    return (
        <>
            <ListRowLeading>
                <ListLeading variant="rounded">
                    {/*
                     * The tile lifts under the pointer *and* under keyboard focus — base-ui marks
                     * the arrow-key row `data-highlighted`, so both wrappers publish the same
                     * `group/create-row` and a keyboard reader gets the same acknowledgement a
                     * mouse does. 1.06 on a 32px tile is 2px: enough to register, not enough to
                     * disturb the text beside it. The unavailable row does not respond, which is
                     * the point — nothing happens when you press it either.
                     */}
                    <ListLeadingTile
                        style={tileStyle(option.tile)}
                        className={cn(
                            'transition-transform duration-[160ms] ease-out motion-reduce:transition-none',
                            available
                                ? 'group-hover/create-row:scale-[1.06] group-data-[highlighted]/create-row:scale-[1.06]'
                                : 'opacity-40',
                        )}
                    >
                        <Icon name={option.icon} size={20} />
                    </ListLeadingTile>
                </ListLeading>
            </ListRowLeading>
            <ListRowContent>
                {showRule && <ListRowRule />}
                {/* `rightAction` on both, or `ListRowText` takes `w-full` and a long label pushes
                    the trailing slot off the row — the trap `ActionRows` records. */}
                <ListRowAccessory rightAction>
                    <ListRowText rightAction>
                        {/*
                         * The badge sits **beside the title**, not in the trailing slot, and that
                         * is a width decision as much as a visual one: the trailing slot is a
                         * sibling of the whole text block, so a badge there eats ~90px from the
                         * subtitle as well — enough that "What's on your mind?" truncated in
                         * English, and every locale here is longer than English. `ListRowTitleRow`
                         * is the DS's own `flex items-center gap-1` for a title plus a mark.
                         */}
                        <ListRowTitleRow>
                            <ListRowTitle
                                className={cn('truncate', !available && 'text-(--text-subtitle)')}
                            >
                                {option.label}
                            </ListRowTitle>
                            {!available && (
                                <Badge size="small" status="outline" className="flex-none">
                                    {unavailableLabel}
                                </Badge>
                            )}
                        </ListRowTitleRow>
                        {/*
                         * Wraps rather than truncates. A second line costs a few pixels once; a
                         * clipped one costs the sentence in **nine** locales, and Vietnamese,
                         * Filipino and Arabic all run longer than the English this was measured on.
                         * The title still truncates — it is short by construction and a heading
                         * that reflows reads as a layout fault.
                         */}
                        <ListRowSubtitle>{option.hint}</ListRowSubtitle>
                    </ListRowText>
                    {available && showChevron && (
                        <ListRowTrailing>
                            <Icon
                                name="angle-right"
                                size={20}
                                // The chevron points the way the language reads.
                                className="text-(--text-body) rtl:-scale-x-100"
                            />
                        </ListRowTrailing>
                    )}
                </ListRowAccessory>
            </ListRowContent>
        </>
    )
}

/**
 * `--tevi-left-bar-tile` / `-glyph` are the DS's own custom property names — named for the
 * component that introduced them, and worth nothing if renamed: the property would simply never
 * match and every tile would fall back to Indigo. Written out here rather than imported because
 * `ActionRows` keeps its copy private; two call sites is not yet a reason to widen its surface.
 */
function tileStyle(tile: string): CSSProperties {
    return {
        '--tevi-left-bar-tile': tile,
        '--tevi-left-bar-glyph': 'var(--white)',
    } as CSSProperties
}
