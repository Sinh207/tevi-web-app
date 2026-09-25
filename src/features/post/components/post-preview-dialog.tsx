'use client'

import { DialogScreenHeader } from '@shared/components/dialog-screen-header'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Dialog, DialogContent } from '@shared/ui/dialog'
import type { Post } from '../api/types'
import { postDisplay } from '../lib/post-access'
import { videoSrc } from '../lib/post-media'
import { PostHeader } from './post-header'
import { PostImageGallery } from './post-image-gallery'
import { PostLockPanel } from './post-lock-panel'

/**
 * **Your audience view** — the draft as the people it is for would receive it.
 *
 * ## It is the only place a paywall can be checked before it is charged for
 *
 * The composer shows the author their own words and their own pictures. What a reader gets is a
 * different object, and on a paid post a very different one: the media is not in the payload, the
 * caption may be withheld, and a blurred cover with a price pill stands in for the lot. A creator
 * setting a price has no other way to see that screen without publishing, buying their own post, or
 * asking somebody. `buildPreviewPost` assembles the reader's object and this draws it.
 *
 * ## Reused components, not a second card
 *
 * `PostHeader`, `PostImageGallery` and `PostLockPanel` render it — the same three the feed uses.
 * Each already had the optional handler that makes it read-only (`actions`, `onOpen`, `onPress`),
 * so none needed a preview mode: **absent handler, no control**. A copy of the card here would be a
 * second place for the lock rules to drift, and the lock rules are the thing being previewed.
 *
 * ## Three things legacy draws that this deliberately does not
 *
 * - **The action bar.** Legacy's preview has no reaction or reply row either, and it should not:
 *   buttons that cannot be pressed on a post that does not exist.
 * - **The sensitive-content cover.** `PostNsfwGuard` decides from the **reader's** account setting,
 *   and the reader here is the author — so on an account with sensitive content switched on the
 *   cover would simply not appear, and the author would be shown an uncovered preview of a post
 *   every stranger sees covered. A gate that answers for the wrong person is worse than none, so
 *   the media is drawn plainly and the *Content warning* switch is taken at its word.
 * - **A live `<video>` for a locked clip.** A paid video post has no playable source for its
 *   audience at all; the cover is what they get, and that is what `postDisplay` routes to here.
 *
 * The dismiss is `DialogScreenHeader`'s leading control rather than legacy's *Cancel* word: this is
 * the fifth dialog the composer opens and the other four already dismiss that way
 * (`DESIGN_SYSTEM.md` §7). A dialog in a stack that closes differently from its siblings is a
 * control the reader has to re-learn at the one moment they are looking at something else.
 */
export function PostPreviewDialog({
    open,
    onClose,
    post,
    /**
     * Its **own** scope, not a part of the composer's.
     *
     * `post-composer-overlay` was the first choice and it collided: `DialogContent` derives its
     * backdrop's id as `${testId}-overlay`, so the composer's own scrim already answers to that
     * name. A driver asking for the preview got two elements — `docs/TEST_IDS.md` §5's first-match
     * failure, caught here only because Playwright is strict about it. The four settings dialogs
     * are parts of the composer and keep its scope; this one is a surface of its own and takes one.
     */
    testId = 'post-preview',
}: {
    open: boolean
    onClose: () => void
    /**
     * The audience's copy, from `buildPreviewPost`.
     *
     * `null` is an ordinary state rather than a caller's mistake — the builder answers `null` for a
     * draft with nothing in it, and the parse it runs can refuse a shape as well. The dialog draws
     * nothing at all in that case instead of an empty frame.
     */
    post: Post | null
    testId?: string
}) {
    const { t } = useTranslation()

    return (
        <Dialog
            open={open && post !== null}
            onOpenChange={next => {
                if (!next) onClose()
            }}
        >
            <DialogContent
                /* `overflow-hidden` because the body below scrolls itself — see the settings dialogs. */
                className="flex max-h-[85dvh] w-full max-w-[512px] flex-col gap-0 overflow-hidden p-0"
                data-testid={testId}
            >
                <DialogScreenHeader
                    title={t('post_preview_title')}
                    onClose={onClose}
                    testId={subTestId(testId, 'header')}
                />
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                    {post ? <PreviewCard post={post} testId={testId} /> : null}
                </div>
            </DialogContent>
        </Dialog>
    )
}

/** The card itself: who posted it, the words that survive the paywall, and what stands for the media. */
function PreviewCard({ post, testId }: { post: Post; testId?: string }) {
    /*
     * The same union the feed branches on, so the preview cannot show a state the card would not.
     * `deleted` cannot arise on a draft and `nsfw` is not gated here (the header says why), which
     * leaves the two that matter: `locked` draws the paywall, everything else draws the media.
     */
    const display = postDisplay(post)
    const images = post.images ?? []
    const clip = videoSrc(post.video)

    return (
        <article data-testid={subTestId(testId, 'panel')} className="flex flex-col gap-2">
            {/* No `actions`, so no menu and no link out — `PostHeader`'s prop doc carries the rule. */}
            <PostHeader post={post} testId={subTestId(testId, 'panel')} />

            <div className="flex min-w-0 flex-col gap-1">
                {post.text ? (
                    <p
                        data-testid={subTestId(testId, 'description')}
                        className="type-dense-default whitespace-pre-wrap break-words text-(--text-title)"
                    >
                        {post.text}
                    </p>
                ) : null}

                {display === 'locked' ? (
                    /* No `onPress`: a picture, not a button. Nothing here can be unlocked. */
                    <PostLockPanel post={post} testId={subTestId(testId, 'overlay')} />
                ) : (
                    <>
                        {images.length > 0 ? (
                            /* No `onOpen`: the tiles are not buttons, so the preview grows no focus stops. */
                            <PostImageGallery images={images} testId={subTestId(testId, 'item')} />
                        ) : null}
                        {clip ? (
                            /*
                             * The real clip, playable — not the feed's poster tile. A feed mounts no
                             * `<video>` because a page of them costs a decode each; there is exactly
                             * one here, and "does my video look right" is half of what the author
                             * opened this for. The source is the `blob:` the picker made, so it
                             * plays without an upload.
                             */
                            // biome-ignore lint/a11y/useMediaCaption: a clip the author has not published yet has no track to caption it with.
                            <video
                                src={clip}
                                controls
                                playsInline
                                preload="metadata"
                                data-testid={subTestId(testId, 'slide')}
                                className="max-h-[420px] w-full rounded-[8px] bg-(--background-segment)"
                            />
                        ) : null}
                    </>
                )}
            </div>
        </article>
    )
}
