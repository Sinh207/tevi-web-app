'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { displayUrl } from '../lib/channel-slug'

/**
 * The space's own address, as a control that copies it.
 *
 * ## It is a `<button>`, and that is the whole point of the rewrite
 *
 * This row was an `<a href>` until now, on the reasoning that legacy's version is broken: legacy
 * renders an anchor and then cancels its own navigation (`onClick` → `preventDefault()` → copy, or
 * `pointerEvents: none` over the top), producing something that looks like a link, cannot be opened,
 * middle-clicked, or copied by the browser's own context menu, and copies when you press it for no
 * stated reason. That criticism was right about legacy and wrong about the fix: the answer is not to
 * make it a link, it is to stop pretending. Copying the URL is what people want here — it is their
 * own share link — so the row is a button that says so, with a copy glyph after the text.
 *
 * Nothing is lost by not being an anchor: the address is `tevi.com/@slug`, i.e. the page you are
 * already on. There was never anywhere to navigate to.
 *
 * ## Two confirmations, because they are read by different people
 *
 * A toast states the fact, and the copy glyph becomes a tick for two seconds for the eye that is
 * already on the pointer and will not look at a corner of the screen. Same pairing as
 * `CopyHexButton`, which is the app's other copy control — deliberately, so the gesture means one
 * thing everywhere.
 *
 * The failure branch is real rather than defensive padding: `navigator.clipboard` does not exist on
 * insecure origins and can be refused by permissions policy. It puts the URL in the toast so the
 * reader can select it by hand, instead of leaving them with a control that visibly did nothing.
 *
 * ⚠ `pages` is this repo's copy glyph. The sprite has no `copy` — only `copyright` — so reaching for
 * the obvious name gets a type error, and substituting a shape is what `CLAUDE.md` forbids.
 */
const TOAST_ID = 'channel-copy-link'

export function ChannelCopyLink({
    url,
    /** Matches the surrounding text: 16 in the identity hint, 20 in the About card's row. */
    size = 16,
    className,
}: {
    url: string
    size?: 16 | 20
    className?: string
}) {
    const { t } = useTranslation()
    const [copied, setCopied] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

    // The timeout outlives the component if the reader navigates within two seconds of pressing.
    useEffect(() => () => clearTimeout(timer.current), [])

    async function copy() {
        try {
            await navigator.clipboard.writeText(url)
            // One id, so pressing it twice replaces the toast rather than stacking two.
            toast.success(t('channel_link_copied'), { id: TOAST_ID })
            setCopied(true)
            clearTimeout(timer.current)
            timer.current = setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.error(t('channel_link_copy_failed', { url }), { id: TOAST_ID })
        }
    }

    return (
        <button
            data-testid="channel-copy-link"
            type="button"
            onClick={copy}
            // The visible text is the URL, which does not say what pressing it does — so the
            // accessible name has to, and it carries the URL too for a reader with no pointer.
            aria-label={t('channel_copy_link_url', { url: displayUrl(url) })}
            className={cn(
                'relative flex w-fit min-w-0 cursor-pointer items-center gap-1 rounded-(--radius-sm) text-start text-(--text-link) transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                /*
                 * A hit area taller than the ink, without taller ink.
                 *
                 * In the identity block this row is 21px tall, because the DS pins
                 * `CardUserHeader[type=space]` at 51 = 30 + 21 and that number is not ours to move.
                 * 21 is under WCAG 2.5.8's 24×24 minimum, and well under what a thumb wants. Padding
                 * would fix the target and break the 51.
                 *
                 * So the box stays 21 and an absolutely-positioned pseudo-element extends the
                 * *pointer* area 10px above and below — pseudo-elements hit-test to their owner, so
                 * the button gains 41px of touchable height while the layout gains nothing. Nothing
                 * else sits in those 10px: the row above is the display name's own line box and the
                 * one below is the bio block's `gap-3`.
                 */
                "after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-['']",
                className,
            )}
        >
            <Icon name="link-simple" weight="filled" size={size} className="flex-none" />
            {/*
             * `tevi.com/@ada`, not `https://tevi.com/@ada` — the DS draws it without the scheme
             * (`preview/space.html`), and it is the right call: `https://` is eight characters of no
             * information competing for the width a long slug needs, on the line where truncation is
             * most likely.
             *
             * The **full** URL is what goes on the clipboard. What is displayed and what is copied
             * are allowed to differ here; a pasted `tevi.com/@ada` with no scheme is not a link in
             * half the places people paste it.
             */}
            <span aria-hidden className="min-w-0 truncate">
                {displayUrl(url)}
            </span>
            {/*
             * Always visible, never hover-only. This screen is mobile-first and there is no hover on
             * touch — an affordance that only appears to a pointer is invisible to most of the
             * people it is for.
             */}
            {copied ? (
                <Icon
                    name="check"
                    size={size}
                    className="flex-none text-(--text-success)"
                    aria-hidden
                />
            ) : (
                <Icon name="pages" weight="filled" size={size} className="flex-none" aria-hidden />
            )}
        </button>
    )
}
