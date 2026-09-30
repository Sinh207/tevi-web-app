'use client'

import { DialogScreenHeader } from '@shared/components/dialog-screen-header'
import { ResponsiveDialog } from '@shared/components/responsive-dialog'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import type { Post } from '../api/types'
import type { ReplyComposerAuthor } from '../lib/reply-author'
import { useReplyDialogStore } from '../store/reply-store'
import { PostMediaBlock } from './post-card'
import { PostHeader } from './post-header'
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
 * photo post quoted as a name and a date is a reply to nothing the reader can see.
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

                {post.text ? (
                    <p
                        data-testid={subTestId(testId, 'description')}
                        className="type-dense-default whitespace-pre-wrap break-words text-(--text-title)"
                    >
                        {post.text}
                    </p>
                ) : null}

                {/*
                 * No `onOpenMedia`: the block then keeps its own lightbox, which is the right one
                 * here — a viewer that paged to the *next post* from inside a reply box would take
                 * the reader away from a draft they are in the middle of.
                 */}
                <PostMediaBlock post={post} testId={subTestId(testId, 'item') ?? testId} />

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
                    testId={subTestId(testId, 'panel')}
                />
            </div>
        </ResponsiveDialog>
    )
}
