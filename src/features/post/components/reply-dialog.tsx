'use client'

import { DialogScreenHeader } from '@shared/components/dialog-screen-header'
import { ResponsiveDialog } from '@shared/components/responsive-dialog'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Icon } from '@shared/ui/icon'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { Post } from '../api/types'
import { postDisplay } from '../lib/post-access'
import type { ReplyComposerAuthor } from '../lib/reply-author'
import { useReplyDialogStore } from '../store/reply-store'
import { PostMediaBlock } from './post-card'
import { PostHeader } from './post-header'
import { PostLockPanel } from './post-lock-panel'
import { ReplyComposer } from './reply-composer'

/**
 * The reply popup — legacy's `CommentForm`, which is what a post's *Comment* button opens.
 *
 * ## All three clients open a composer; none of them navigate
 *
 * Legacy's `handleOpenComment` raises this modal (`layoutPost/provider` renders `<CommentForm>` on
 * `isOpenComment`). Android's `onClickComment` calls `DialogManager.showReplyPostDialog`, and iOS's
 * `postPlayerMultiMediaInteractiveReply` runs `prepareReply`. This app sent the reader to the post's
 * page instead, which loses their place in the feed to do something the feed could have done.
 *
 * The post's **own page** keeps its inline box (`PostDetailView` → `ReplyComposer`) and is not
 * routed through here: that is legacy's split too, and it is why `ReplyComposer`'s header calls
 * itself *"the inline bar rather than the modal its feed uses"*. `PostCard` tells them apart by
 * `disableDetail`, which is already the flag for "we are on the post".
 *
 * ## The shell is `ResponsiveDialog`, which is legacy's `ResponsiveModal`
 *
 * A card above the breakpoint, a full-height panel from the trailing edge below it — legacy's
 * `StyledDialog maxWidth='sm'` / `StyledDrawer anchor='right'`. The one deliberate divergence is the
 * dismiss control: legacy's band carries the word *Cancel*, and this uses `DialogScreenHeader`,
 * whose leading slot is the DS cross. `docs/DESIGN_SYSTEM.md` §7 says a screen-shaped dialog puts
 * its dismiss at the leading edge and that nothing may hand-roll a fourth one, so the geometry is
 * legacy's and the chrome is the design system's — the trade this port makes everywhere.
 *
 * ## What it draws, and what it delegates
 *
 * The post being replied to (author line, words, and nothing else), then `ReplyComposer`. The
 * composer already owns every rule this popup would otherwise have to restate: the sign-in gate on
 * the press, the *Who can reply?* panel when the post is closed to this reader, the Star price on
 * the submit button, the image rules and the three refusals a draft can carry.
 *
 * The quote carries the post's **media** as well as its words, which is legacy's `PostComment`: a
 * photo post quoted as a name and a date is a reply to nothing the reader can see. A post the
 * reader has not paid for shows its **paywall** in the same slot, for the same reason and on
 * legacy's own arrangement (`PostComment` renders `<LockPost>` beside the gallery) — quoting a
 * locked post as a bare name and date says nothing about why there is nothing to see.
 *
 * Everything in the quote is a **picture**: no menu, no media viewer, no *Unlock* button. See
 * `PostMediaBlock`'s `interactive` for the measured reason — a second `z-50` layer opened from
 * inside this dialog interleaves with it rather than covering it. Unlocking is still offered where
 * it belongs: `ReplyAudienceNotice`, which `ReplyComposer` renders in place of the box when the
 * post cannot be replied to, carries its own `usePostUnlock` **and** mounts its dialogs.
 */
export function ReplyDialog({
    author,
    isPremiumReader = false,
    testId = 'post-reply',
}: {
    /**
     * The reader, flattened — see `lib/reply-author.ts`. Supplied by the host in `app/`, because
     * `useMyChannel` lives in `features/channel` and that feature imports this one.
     */
    author: ReplyComposerAuthor | null
    /** Premium readers are exempt from paid interaction — `features/premium`'s fact, not the post's. */
    isPremiumReader?: boolean
    testId?: string
}) {
    const post = useReplyDialogStore(state => state.post)
    const close = useReplyDialogStore(state => state.close)

    /*
     * Nothing at all until a post is set — base-ui mounts no portal for a closed dialog, so a
     * session that never replies pays one store subscription. `MiniAppHost` and `PostComposerHost`
     * strike the same bargain.
     */
    if (!post) return null

    return (
        <ReplyDialogBody
            post={post}
            author={author}
            isPremiumReader={isPremiumReader}
            onClose={close}
            testId={testId}
        />
    )
}

/**
 * Split out so the composer's state is **keyed to the post**.
 *
 * Mounting happens when a post arrives and unmounting when it leaves, so a draft typed against one
 * post can never be handed to the next one the reader opens. Doing it with a `key` on the body
 * rather than a `useEffect` that clears the draft means there is no window where the old text is on
 * screen under the new post.
 */
function ReplyDialogBody({
    post,
    author,
    isPremiumReader,
    onClose,
    testId,
}: {
    post: Post
    author: ReplyComposerAuthor | null
    isPremiumReader: boolean
    onClose: () => void
    testId: string
}) {
    const { t } = useTranslation()

    return (
        <ResponsiveDialog
            key={post.id}
            open
            onOpenChange={next => {
                if (!next) onClose()
            }}
            data-testid={testId}
            /*
             * 612 and a 90dvh ceiling, which is `PostComposerDialog`'s box — the two are the same
             * kind of surface (a quoted thing, a text box, a submit) and a reply popup half the
             * width of the post composer reads as a different product. Legacy asks for MUI's
             * `maxWidth='sm'`, 600px; 612 is this app's own column width and the nearer number to
             * reach for. Below `sm` the sheet ignores both and fills the screen.
             */
            className="flex max-h-[90dvh] w-full max-w-[612px] flex-col gap-0 overflow-hidden p-0"
        >
            <DialogScreenHeader
                title={t('post_reply_title')}
                testId={testId}
                className="flex-none"
            />

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
                {/*
                 * The post, as a **picture**: `PostHeader` with no `actions` draws no kebab and
                 * makes the identity a `span` instead of a link, which its own prop doc calls for —
                 * a menu here would offer to delete the post being replied to, and a link to the
                 * author's space would throw the draft away to go somewhere the reader is not
                 * trying to go. The composer's *Preview* is the other caller that needs exactly
                 * this.
                 */}
                <PostHeader post={post} testId={subTestId(testId, 'item')} />

                {/*
                 * ⚠ **The thread line**, and it is why the body is indented rather than flush.
                 *
                 * Legacy's `PostComment` puts the quoted post's content in a grid whose left column
                 * holds a vertical divider running under the avatar, and the reply box below
                 * repeats it — that pair of lines is what makes the popup read as *this post, then
                 * your answer to it* instead of two unrelated blocks. Only the box had one here, so
                 * it started from nothing.
                 *
                 * `w-10` is `AnimatedAvatar size="medium"`, and `gap-2` is `PostHeader`'s own gap,
                 * so the line lands under the centre of the avatar above it without a grid. Both
                 * numbers are read off that header; if it changes, this has to follow.
                 */}
                <div className="flex min-w-0 gap-2">
                    {/*
                     * ⚠ `flex-col`, and it is not cosmetic. The line is `w-px flex-1`, and in a
                     * **row** `flex-1` sets `flex-basis: 0` and grows along the main axis — so the
                     * hairline stretched to the column's full 40px and painted a grey block where
                     * a 1px rule belongs. The column has to run downwards for `flex-1` to mean
                     * height.
                     */}
                    <span aria-hidden="true" className="flex w-10 flex-none flex-col items-center">
                        <span className="w-px flex-1 bg-(--separator-default)" />
                        {/*
                         * ⚠ The three dots at the **foot** of the line, which legacy draws in both
                         * of its thread columns (`PostComment` and the form beside it): a 24px
                         * vertical ellipsis in the same `#E0E0E0` as the rule above it. They are
                         * what makes the line read as *the thread carries on* rather than as a
                         * bracket that stops. Without them it ends in mid-air.
                         */}
                        <Icon
                            name="more-vertical"
                            size={24}
                            className="flex-none text-(--separator-default)"
                        />
                    </span>

                    <CollapsibleQuote testId={testId}>
                        {post.text ? (
                            <p
                                data-testid={subTestId(testId, 'description')}
                                /*
                                 * ⚠ Legacy ramps this 12 → 14 (`Content`: `fontSize: { xs: 12,
                                 * md: 14 }`) and this **cannot** today: the `.type-*` classes are
                                 * declared in `@layer components`, which Tailwind v4 does not
                                 * register as utilities, so `md:type-dense-default` compiles to
                                 * nothing and the base class wins at every width. Measured, not
                                 * assumed — and the 19 existing `md:type-*` in this repo are dead
                                 * the same way. Flat 14 until those are declared with `@utility`.
                                 */
                                className="type-dense-default whitespace-pre-wrap break-words text-(--text-title)"
                            >
                                {post.text}
                            </p>
                        ) : null}

                        {/*
                         * The same split `PostCard` makes, and it has to be made here too: a locked
                         * post's media is **not** drawn, because there is none to draw — what
                         * stands in its place is the paywall. Rendering `PostMediaBlock`
                         * unconditionally showed a paid post as a name, a date and a gap.
                         *
                         * ⚠ Both branches are inert. `onPress` omitted makes the panel a picture
                         * rather than a dead button — its own prop doc calls for exactly that, and
                         * it is the same rule as `interactive={false}` beside it.
                         */}
                        {postDisplay(post) === 'locked' ? (
                            <PostLockPanel post={post} testId={subTestId(testId, 'panel')} />
                        ) : (
                            <PostMediaBlock
                                post={post}
                                interactive={false}
                                testId={subTestId(testId, 'item') ?? testId}
                            />
                        )}
                    </CollapsibleQuote>
                </div>

                <ReplyComposer
                    post={post}
                    author={author}
                    isPremiumReader={isPremiumReader}
                    layout="modal"
                    /*
                     * The keyboard is the point of the panel below `sm`, and on a card the reader
                     * pressed *Comment* to type. `ReplyComposer` opens to its full shape when
                     * focused, so this is also what makes the popup look like a form rather than a
                     * one-line bar the moment it appears.
                     */
                    autoFocus
                    /*
                     * Closing on success is legacy's behaviour and the only sensible one: the reply
                     * is not visible from here — the thread is on the post's page — so a popup that
                     * stayed open would show an empty box and no sign anything had happened. The
                     * count on the card behind it is what says so.
                     */
                    onReplied={onClose}
                    testId={subTestId(testId, 'footer')}
                />
            </div>
        </ResponsiveDialog>
    )
}

/**
 * Legacy's height ceiling on the quoted post, so a long one does not push the reply box off screen.
 *
 * Two numbers and they are **not** the same, which is legacy's own arrangement (`PostContentWrapper`)
 * and worth keeping: a post is only clamped once it is taller than `THRESHOLD`, and what it is
 * clamped **to** is `COLLAPSED`. So a post of 300px is shown whole rather than cut to 200 — the
 * cut only pays for itself when there is a lot to hide. One number for both would clip almost every
 * post with a picture in it.
 */
const QUOTE_THRESHOLD = 400
const QUOTE_COLLAPSED = 200

/**
 * The quoted post, clamped when it is long, with a control that opens it.
 *
 * ## Measured, not guessed from the text
 *
 * The decision is `scrollHeight`, taken after render — a post is tall because of its **pictures** as
 * often as its words, and a character count cannot see a gallery. `ResizeObserver` rather than
 * legacy's `setTimeout(…, 100)` plus a resize listener: an image that decodes late changes the
 * height after that timer has fired, and legacy then shows an unclamped wall of post. The observer
 * fires on exactly that.
 *
 * ## The fade is a token, not white
 *
 * Legacy's overlay is a hard-coded white gradient, which in dark mode is a white smear across the
 * bottom of the post. This fades to `--background-subtle`, the fill both the dialog card and the
 * sheet actually paint, so it disappears into whichever one is behind it.
 */
function CollapsibleQuote({ children, testId }: { children: ReactNode; testId: string }) {
    const { t } = useTranslation()
    const contentRef = useRef<HTMLDivElement>(null)
    const [expanded, setExpanded] = useState(false)
    const [long, setLong] = useState(false)

    /**
     * ⚠ **Measure one element, clamp a different one.**
     *
     * This used to put `maxHeight` and `overflow: hidden` on the very node it observed, which makes
     * the measurement a function of its own result — the shape every `ResizeObserver` flicker is
     * made of. Anything that changed the content's height when the clamp went on (a scrollbar
     * appearing in the dialog body and reflowing the text is the easy one) could push the reading
     * back across the threshold, and the component would then clamp, unclamp, clamp, forever.
     *
     * Now the clamp is on the **outer** box and the observer watches the **inner** one, which always
     * has its natural height. The reading cannot be affected by what the reading decides, so there
     * is no loop to tune — it is gone by construction rather than damped.
     *
     * The latch below is the second line of defence: once a post is known to be long it stays long.
     * Content only grows as images decode, and "it briefly measured short" is never a reason to
     * take the control away from under the reader's cursor.
     */
    useEffect(() => {
        const node = contentRef.current
        if (!node) return
        const measure = () => {
            if (node.scrollHeight > QUOTE_THRESHOLD) setLong(true)
        }
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(node)
        return () => observer.disconnect()
    }, [])

    const clamped = long && !expanded

    return (
        <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div
                className="relative min-w-0"
                style={clamped ? { maxHeight: QUOTE_COLLAPSED, overflow: 'hidden' } : undefined}
            >
                <div ref={contentRef} className="flex min-w-0 flex-col gap-2">
                    {children}
                </div>
                {clamped ? (
                    <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-b from-transparent to-(--background-subtle)"
                    />
                ) : null}
            </div>

            {long ? (
                <div className="flex justify-center">
                    <button
                        type="button"
                        onClick={() => setExpanded(current => !current)}
                        aria-expanded={expanded}
                        aria-label={t(expanded ? 'common_show_less' : 'post_reply_show_all')}
                        data-testid={subTestId(testId, 'apply')}
                        className="flex size-8 items-center justify-center rounded-full border border-(--separator-default) bg-(--background-surface) text-(--icon-default) shadow-xs transition-colors hover:bg-(--background-segment)"
                    >
                        <Icon name={expanded ? 'angle-up' : 'angle-down'} size={16} />
                    </button>
                </div>
            ) : null}
        </div>
    )
}
