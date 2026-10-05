'use client'

import { useRequireAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Icon } from '@shared/ui/icon'
import { useRouter } from 'next/navigation'
import type { Post } from '../api/types'
import { usePostUnlock } from '../hooks/use-post-unlock'
import { isLocked } from '../lib/post-access'
import { replyAudience, replyAudienceNotice, showsReplyAudienceNotice } from '../lib/who-can-reply'
import { PostUnlockDialogs } from './post-unlock-dialogs'

/**
 * *Who can reply?* — legacy's `WhoCanReply`, the panel that stands where the box would be.
 *
 * ## It is the answer to a silence
 *
 * A reader barred from replying used to be told nothing: the composer drew `null`, and the card's
 * *Comment* button called an unlock flow that, on a followers-only post, had nothing to unlock and
 * so did nothing at all. `lib/who-can-reply.ts` has the six audiences and which of them this client
 * had never read.
 *
 * ## Two of the six offer a way in, and neither is performed here
 *
 * - **followers** — a link to the space, because that is where the real *Follow* control lives.
 *   `features/post` may not import `features/channel` (the dependency runs the other way), so
 *   following from inside this panel would need either a barrel cycle or a second copy of the
 *   follow mutation. Sending the reader one tap away is what `usePostUnlock` already does for the
 *   membership route, and for the same reason.
 * - **paid-users** — `usePostUnlock`, so the press opens whichever of the three paywall flows this
 *   post actually has (membership page, purchase confirmation, or the dialog offering both).
 *   Naming one of them here would be the fourth place that branch is written. The **label** does
 *   split in two, which is iOS's behaviour and not legacy web's: a post still behind its paywall
 *   says *Unlock post to reply*, one the reader can already read says *Become a member*. Legacy web
 *   says "unlock" for both, which offers to sell somebody something they own.
 *
 * The other four are statements of fact with no control, which is right: there is no button that
 * makes a reader verified, or mentioned in somebody else's post.
 *
 * ## Geometry is legacy's
 *
 * A tinted 12px block with a 24px glyph, a 14/600 title and a 14/400 body — the DS draws no such
 * panel. The glyph is the sprite's `comment-text-question-circle` rather than legacy's hand-drawn
 * two-bubble SVG: the same idea, and `DESIGN_SYSTEM.md` bars hand-drawn paths.
 */
export function ReplyAudienceNotice({ post, testId }: { post: Post; testId?: string }) {
    const { t } = useTranslation()
    const router = useRouter()
    const requireAuth = useRequireAuth()
    const unlock = usePostUnlock(post)

    /*
     * `locked` is what splits the members-only label in two — *Unlock post to reply* for a post the
     * reader cannot read yet, *Become a member* for one they can read but may not reply to. iOS
     * branches on the same fact (`post.needUnlockPackage`); `isLocked` is this repo's reading of it,
     * and consults `viewer` as well, which is the half `post-access.ts` explains.
     */
    const notice = replyAudienceNotice(replyAudience(post), { locked: isLocked(post) })
    /*
     * Both checks, and not one: `showsReplyAudienceNotice` also asks whether the reader may reply
     * after all — a member of a members-only space must get the box, not a lecture about a rule
     * they already satisfy. The second narrows the type for the render below.
     */
    if (!showsReplyAudienceNotice(post) || !notice) return null

    const slug = post.channel?.slug ?? null
    /*
     * The follow route needs somewhere to go. A payload with no slug has none, so the sentence is
     * still shown and the control is not — the same rule every optional control on the card
     * follows, and better than a link to `/@`.
     */
    const action =
        notice.action === 'follow'
            ? slug
                ? {
                      label: t('who_can_reply_follow_space'),
                      press: requireAuth(() => router.push(`/@${slug}`)),
                  }
                : null
            : notice.action === 'unlock'
              ? { label: t('who_can_reply_unlock_post'), press: unlock.press }
              : notice.action === 'join'
                ? { label: t('who_can_reply_become_member'), press: unlock.press }
                : null

    return (
        <>
            <section
                data-testid={testId}
                className="flex items-start gap-3 rounded-[12px] bg-(--background-segment) p-3"
            >
                <Icon
                    name="comment-text-question-circle"
                    size={24}
                    className="flex-none text-(--icon-secondary)"
                />
                <div className="flex min-w-0 flex-col items-start">
                    <p
                        data-testid={subTestId(testId, 'title')}
                        className="type-dense-emphasis text-(--text-title)"
                    >
                        {t('who_can_reply_title')}
                    </p>
                    <p
                        data-testid={subTestId(testId, 'description')}
                        className="type-dense-default text-(--text-subtitle)"
                    >
                        {t(notice.descriptionKey)}
                    </p>
                    {action ? (
                        <button
                            type="button"
                            onClick={action.press}
                            data-testid={subTestId(testId, 'trigger')}
                            className="type-dense-emphasis mt-1 text-(--text-brand)"
                        >
                            {action.label}
                        </button>
                    ) : null}
                </div>
            </section>

            {/*
             * Mounted beside the panel rather than inside the button: `usePostUnlock` owns the
             * dialog state, and a flow whose dialogs are not rendered is a press that opens nothing
             * — which is exactly the failure this panel exists to fix, one level down.
             */}
            <PostUnlockDialogs flow={unlock} testId={subTestId(testId, 'panel')} />
        </>
    )
}
