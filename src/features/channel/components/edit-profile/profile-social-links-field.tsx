'use client'

import { FIELD_SURFACE } from '@shared/components/field'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import { useRef, useState } from 'react'
import { useSocialPlatforms } from '../../hooks/use-profile-options'
import {
    invalidSocialRows,
    moveSocialLink,
    normalizeLinkUrl,
    SOCIAL_LINKS_MAX,
    type SocialLinkDraft,
} from '../../lib/profile-form'
import {
    detectPlatform,
    isRepeatablePlatform,
    isWebLink,
    SOCIAL_ICON,
    socialMarkUrl,
} from '../../lib/social-links'

/**
 * Up to four links out to the rest of a creator's internet.
 *
 * ## Four behaviours that are not decoration
 *
 * 1. **Paste re-tags the row.** Drop a TikTok URL into a row that says X and the row becomes
 *    TikTok. People paste first and check the icon second; without this the space publishes an X
 *    mark pointing at TikTok, and nothing on the form ever said so. `detectPlatform` only returns
 *    platforms the server actually offers.
 * 2. **The scheme is completed on blur.** `tevi.com` becomes `https://tevi.com` when the field is
 *    left — in the field, visibly, the way an address bar does it. `normalizeLinkUrl` explains why
 *    that is not the same as guessing, and why a `javascript:` value is deliberately left intact so
 *    the validator can still refuse it.
 * 3. **A row goes red on blur, not on the first keystroke.** Judging `h` as an invalid URL is true
 *    and useless. Untouched rows stay quiet; the group's message line still explains what is
 *    holding Save, so nothing is silently blocking.
 * 4. **A platform can only be used once** — except `website` and `custom_link`, which are the
 *    generic slots and are meant to repeat (`isRepeatablePlatform`). Two X rows publish the same
 *    mark twice.
 *
 * ## Reordering, and why it is pointer events rather than HTML drag-and-drop
 *
 * The array's order is the display order on the public space, so reordering is a real edit
 * (`moveSocialLink`). Native `draggable` does not fire on touch at all, which would make this a
 * desktop-only feature on a screen most creators open on a phone. Pointer events cover mouse, pen
 * and touch from one code path — `touch-action: none` on the handle is what stops the browser
 * claiming the gesture for scrolling.
 *
 * The handle is also a real `<button>` with **ArrowUp / ArrowDown**, which is the only way this is
 * operable from a keyboard: dragging cannot be. That is `docs/DEFINITION_OF_DONE.md` §11, and it
 * costs four lines.
 *
 * ## The platform list is server-driven, so the picker is a native `<select>`
 *
 * The option set arrives over the network (`my-channel/social-links/supported-platforms/`) and the
 * DS ships no Dropdown. A native select renders correctly everywhere including a phone's own
 * wheel, and is keyboard- and screen-reader-complete for free. Its **arrow** is the one thing that
 * differs per OS, so it is hidden (`appearance-none`) and replaced with the DS's `angle-down`.
 */
export function ProfileSocialLinksField({
    links,
    onChange,
    /** The rejection the backend sent for `social_links`, if any. */
    serverError,
    disabled,
}: {
    links: SocialLinkDraft[]
    onChange: (next: SocialLinkDraft[]) => void
    serverError?: string
    disabled?: boolean
}) {
    const { t } = useTranslation()
    const { platforms } = useSocialPlatforms()
    const invalid = new Set(invalidSocialRows(links))

    /**
     * Which rows have been left at least once.
     *
     * Held by **position**, which is the same identity the rows themselves have (they have no id
     * until they are saved). A reorder therefore has to move these too, or the red follows the
     * slot rather than the row — see `move`.
     */
    const [touched, setTouched] = useState<number[]>([])
    const markTouched = (index: number) =>
        setTouched(current => (current.includes(index) ? current : [...current, index]))

    const add = () => {
        const first = platforms.find(option => canUse(option.value))
        if (!first || links.length >= SOCIAL_LINKS_MAX) return
        onChange([...links, { platform: first.value, title: first.name, url: '' }])
    }

    const update = (index: number, patch: Partial<SocialLinkDraft>) => {
        onChange(links.map((link, i) => (i === index ? { ...link, ...patch } : link)))
    }

    const remove = (index: number) => {
        onChange(links.filter((_, i) => i !== index))
        // Positions shift under the removal, so the "has been blurred" marks shift with them.
        setTouched(current => current.filter(i => i !== index).map(i => (i > index ? i - 1 : i)))
    }

    const move = (from: number, to: number) => {
        if (from === to) return
        onChange(moveSocialLink(links, from, to))
        setTouched(current =>
            current.map(i => {
                if (i === from) return to
                if (from < i && i <= to) return i - 1
                if (to <= i && i < from) return i + 1
                return i
            }),
        )
    }

    /** A platform may be picked if it is repeatable or not already spoken for. */
    const canUse = (value: string, exceptIndex?: number) =>
        isRepeatablePlatform(value) ||
        !links.some((link, i) => i !== exceptIndex && link.platform === value)

    /**
     * Set the URL, and re-tag the row if the value names a platform.
     *
     * Guarded by `canUse`: pasting a second X link into a form that already has one must not
     * produce two X rows. The URL still lands — the person can then pick a platform or remove the
     * duplicate — it is only the automatic re-tagging that stands down.
     */
    const setUrl = (index: number, value: string) => {
        const detected = detectPlatform(
            value,
            platforms.map(option => option.value),
        )
        const platform =
            detected && detected !== links[index].platform && canUse(detected, index)
                ? platforms.find(option => option.value === detected)
                : undefined
        update(index, {
            url: value,
            ...(platform ? { platform: platform.value, title: platform.name } : {}),
        })
    }

    // ── drag ──────────────────────────────────────────────────────────────────────────────
    const rowsRef = useRef<(HTMLDivElement | null)[]>([])
    const [dragging, setDragging] = useState<number | null>(null)

    /** The row whose box the pointer is inside, by midpoint — cheap at four rows. */
    const rowAt = (clientY: number, fallback: number) => {
        for (const [index, row] of rowsRef.current.entries()) {
            if (!row) continue
            const box = row.getBoundingClientRect()
            if (clientY >= box.top && clientY <= box.bottom) return index
        }
        return fallback
    }

    const message = serverError ?? (invalid.size > 0 ? t('profile_social_url_invalid') : null)

    return (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="type-dense-strong text-(--text-body)">
                {t('profile_social_links')}
            </legend>
            <p className="type-caption-meta pb-1 text-(--text-subtitle)">
                {t('profile_social_links_hint')}
            </p>

            {/*
             * Nothing yet — say so inside a box the same height as a row, rather than leaving the
             * Add button floating under a heading with a gap where the list will be. It also gives
             * the section a shape while the platform list is still loading.
             */}
            {links.length === 0 && (
                <p
                    className={cn(
                        FIELD_SURFACE,
                        'type-dense-default flex h-12 items-center border-dashed text-(--text-subtitle)',
                    )}
                >
                    {t('profile_social_empty')}
                </p>
            )}

            {links.map((link, index) => {
                const platform = platforms.find(option => option.value === link.platform)
                const sprite = SOCIAL_ICON[link.platform]
                // Red only once the row has been left, or once the backend has named this field.
                const rowInvalid = invalid.has(index) && (touched.includes(index) || !!serverError)
                const isDragging = dragging === index

                return (
                    <div
                        // The index **is** the identity here: these rows have no id until they are
                        // saved, and two rows can legitimately be the same generic link.
                        // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional, see above
                        key={index}
                        ref={node => {
                            rowsRef.current[index] = node
                        }}
                        className={cn(
                            FIELD_SURFACE,
                            'flex items-center gap-1 px-2 transition-shadow',
                            rowInvalid && 'border-(--input-border-error)',
                            // The dragged row lifts off the page and everything else stays put —
                            // the reorder happens live underneath it.
                            isDragging && 'z-10 shadow-lg',
                        )}
                    >
                        {/*
                         * The grab handle. `touch-action: none` is what makes a drag a drag on a
                         * phone instead of a page scroll, and the arrow keys are what make the
                         * whole feature exist for a keyboard.
                         */}
                        <button
                            data-testid="channel-profile-link-reorder"
                            data-index={index}
                            type="button"
                            disabled={disabled || links.length < 2}
                            aria-label={t('profile_social_reorder', { index: index + 1 })}
                            onPointerDown={event => {
                                event.currentTarget.setPointerCapture(event.pointerId)
                                setDragging(index)
                            }}
                            onPointerMove={event => {
                                if (dragging === null) return
                                const target = rowAt(event.clientY, dragging)
                                if (target !== dragging) {
                                    move(dragging, target)
                                    setDragging(target)
                                }
                            }}
                            onPointerUp={() => setDragging(null)}
                            onPointerCancel={() => setDragging(null)}
                            onKeyDown={event => {
                                if (event.key === 'ArrowUp' && index > 0) {
                                    event.preventDefault()
                                    move(index, index - 1)
                                } else if (event.key === 'ArrowDown' && index < links.length - 1) {
                                    event.preventDefault()
                                    move(index, index + 1)
                                }
                            }}
                            className={cn(
                                'flex size-8 flex-none touch-none items-center justify-center rounded-md',
                                'text-(--text-placeholder) transition-colors',
                                'hover:bg-(--background-segment) hover:text-(--text-body)',
                                'disabled:cursor-not-allowed disabled:opacity-0',
                                isDragging ? 'cursor-grabbing' : 'cursor-grab',
                            )}
                        >
                            <Icon name="drag-vertical" size={18} aria-hidden />
                        </button>

                        <span className="flex size-6 flex-none items-center justify-center">
                            {isWebLink(link.platform) ? (
                                <Icon name="globe" weight="filled" size={20} aria-hidden />
                            ) : sprite ? (
                                <Icon name={sprite} size={24} aria-hidden />
                            ) : link.platform ? (
                                <Image
                                    src={socialMarkUrl(link.platform)}
                                    alt=""
                                    width={24}
                                    height={24}
                                />
                            ) : null}
                        </span>

                        {/* The select and its chevron are one control, so the arrow is positioned
                            over the select rather than placed after it — otherwise a short
                            platform name leaves the arrow floating in the gap. */}
                        <span className="relative flex flex-none items-center">
                            <select
                                data-testid="channel-profile-link-platform"
                                data-index={index}
                                value={link.platform}
                                disabled={disabled}
                                aria-label={t('profile_social_platform_n', { index: index + 1 })}
                                onChange={event => {
                                    const next = platforms.find(
                                        option => option.value === event.target.value,
                                    )
                                    if (!next) return
                                    // `title` travels with the platform: the API stores the human
                                    // name alongside the slug, and legacy writes both.
                                    update(index, { platform: next.value, title: next.name })
                                }}
                                className="type-body-default h-10 w-24 cursor-pointer appearance-none bg-transparent pe-5 text-(--input-text) focus:outline-none sm:w-32"
                            >
                                {/*
                                 * The row's own platform stays selectable even when the fetched
                                 * list does not contain it — a link saved under a platform the
                                 * backend has since retired must not silently become the first
                                 * entry, which is what a `<select>` does with an unmatched value.
                                 */}
                                {!platform && link.platform && (
                                    <option value={link.platform}>
                                        {link.title ?? link.platform}
                                    </option>
                                )}
                                {platforms.map(option => (
                                    <option
                                        key={option.value}
                                        value={option.value}
                                        // Already used elsewhere — offered but not choosable, which
                                        // says *why* it cannot be picked. Removing it would just
                                        // look like the platform does not exist.
                                        disabled={!canUse(option.value, index)}
                                    >
                                        {option.name}
                                    </option>
                                ))}
                            </select>
                            <Icon
                                name="angle-down"
                                size={16}
                                aria-hidden
                                className="pointer-events-none absolute end-0 text-(--text-placeholder)"
                            />
                        </span>

                        {/* The hairline that makes the row read as two fields in one control
                            rather than one squashed line. */}
                        <span aria-hidden className="h-6 w-px flex-none bg-(--separator-default)" />

                        <input
                            data-testid="channel-profile-link-url"
                            data-index={index}
                            type="url"
                            inputMode="url"
                            value={link.url}
                            disabled={disabled}
                            placeholder="https://"
                            aria-label={t('profile_social_url_n', { index: index + 1 })}
                            aria-invalid={rowInvalid || undefined}
                            onChange={event => setUrl(index, event.target.value)}
                            onBlur={event => {
                                markTouched(index)
                                const normalized = normalizeLinkUrl(event.target.value)
                                if (normalized !== link.url) setUrl(index, normalized)
                            }}
                            className="type-body-default h-10 min-w-0 flex-auto bg-transparent ps-1 text-(--input-text) placeholder:text-(--input-placeholder) focus:outline-none"
                        />

                        <button
                            data-testid="channel-profile-link-remove"
                            data-index={index}
                            type="button"
                            disabled={disabled}
                            onClick={() => remove(index)}
                            className="flex size-8 flex-none items-center justify-center rounded-md text-(--icon-secondary) transition-colors hover:bg-(--background-segment) hover:text-(--text-title) disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Icon name="xmark" size={18} />
                            <span className="sr-only">
                                {t('profile_social_remove_n', { index: index + 1 })}
                            </span>
                        </button>
                    </div>
                )
            })}

            <div className="min-h-4">
                {message ? (
                    <p
                        role={serverError ? 'alert' : undefined}
                        className="type-caption-meta text-(--text-error)"
                    >
                        {message}
                    </p>
                ) : null}
            </div>

            {links.length < SOCIAL_LINKS_MAX && (
                <div>
                    <Button
                        data-testid="channel-profile-link-add"
                        type="button"
                        variant="ghost"
                        size="medium"
                        // No platforms left to pick means nothing to add *to* — either the list
                        // never loaded, or every non-repeatable one is already on a row.
                        disabled={disabled || !platforms.some(option => canUse(option.value))}
                        onClick={add}
                    >
                        <Icon name="plus" size={18} />
                        {t('profile_social_add')}
                    </Button>
                </div>
            )}
        </fieldset>
    )
}
