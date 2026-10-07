'use client'

import { useRequireAuth } from '@features/auth'
import {
    ActionMenu,
    ActionMenuContent,
    ActionMenuItem,
    ActionMenuTrigger,
} from '@shared/components/action-menu'
import { useTranslation } from '@shared/i18n/use-translation'
import { useWebConfig } from '@shared/lib/remote-config'
import { subTestId } from '@shared/lib/test-id'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Icon } from '@shared/ui/icon'
import { useState } from 'react'
import type { Post } from '../api/types'
import type { PostActions } from '../hooks/use-post-actions'
import { postMenuVisibility } from '../lib/post-access'
import { PostReportDialog } from './post-report-dialog'

/**
 * The post's overflow menu — legacy's `btnMenu`, all six rows.
 *
 * ## Two menus, never one with six rows
 *
 * `postMenuVisibility` returns the owner's set or a stranger's set and they do not overlap. The
 * reasoning is in that function; what it means here is that this component never has to decide, and
 * a payload with a wrong `is_owner` cannot produce a menu offering to delete somebody else's post.
 *
 * ## Both destructive rows confirm, and they confirm for different reasons
 *
 * *Delete* is irreversible. *Block* replaces the author's space with a wall and removes them from
 * the reader's feed. Neither is something to do on one press of a row sitting under a thumb, and
 * legacy asks before both. **Opening or closing replies does not confirm** — it is one press to
 * undo.
 *
 * ## Pinning confirms, unpinning does not
 *
 * A space has **one** pinned post. Pinning another replaces it, and the post it displaced is not
 * one press away from coming back — the author has to find it in the list first. So *Pin* asks
 * "Replace current pin?", every time, which is legacy's `MenuItemPinPost`; *Unpin* replaces
 * nothing and acts at once. Legacy does not know whether a pin exists when it asks, and neither
 * does a card, so the question is worded to be true either way.
 *
 * ## Pin's glyph does not change and its label does
 *
 * The sprite ships `thumbtack` and `thumbtack-slanted`, and slanted is a *drawing*, not the negative
 * of the first — there is no `thumbtack-slash`. A menu row is labelled text, so unlike the bare
 * icon buttons in the action row its state is already said in words ("Pin" / "Unpin"), and a glyph
 * that stays put beside a label that moves is honest. The bell and heart rows in
 * `ChannelViewerMenu` can do better only because the library draws both halves of those pairs. Swap
 * this the day Brand ships the slashed one.
 *
 * ## The trigger is absent on a deleted post, not disabled
 *
 * `postMenuVisibility` answers all-false for a tombstone and this returns `null`, which is legacy's
 * `{!isPostDeleted && <MenuButton/>}`. Every row would act on a row that is already gone.
 *
 * ## Report is gated on sign-in at the **row**, not at the dialog
 *
 * The reasons endpoint answers **401** to an anonymous caller — `ChannelViewerMenu` measured it —
 * so an unguarded press opens a form with an empty list and no way to understand why. The block row
 * needs no such guard: `blocksApi` is an authenticated write and the auth gate is the mutation's.
 */
export function PostMenu({
    post,
    actions,
    testId,
}: {
    post: Post
    /**
     * The writes, **owned by `PostCard`** rather than by this component.
     *
     * The card needs them too — `onChanged` and `onAuthorBlocked` are the card's props, and the
     * hook is where they are called — so the hook sits in the card and the menu is handed its
     * result.
     */
    actions: PostActions
    testId?: string
}) {
    const { t } = useTranslation()
    const requireAuth = useRequireAuth()
    /**
     * A console kill switch on post reporting, failing **closed**: `flag` defaults to `false`, so an
     * unreachable Firebase hides the row rather than offering a queue that may be turned off. The
     * same rule `PostActions` applies to quote.
     */
    const reportEnabled = useWebConfig().report.post.isActive
    const shows = postMenuVisibility(post, { reportEnabled })

    const { pinned, pin, replyAllowed, remove, block } = actions

    const [confirmPin, setConfirmPin] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [confirmBlock, setConfirmBlock] = useState(false)
    const [reportOpen, setReportOpen] = useState(false)

    const anyRow =
        shows.pin || shows.replyAllowed || shows.edit || shows.delete || shows.report || shows.block
    // A trigger that opens an empty popup is worse than no trigger — `ChannelViewerMenu`'s rule.
    if (!anyRow) return null

    const authorName = post.channel?.name ?? post.channel?.slug ?? ''

    return (
        <>
            <ActionMenu>
                <ActionMenuTrigger
                    aria-label={t('post_menu_actions')}
                    data-testid={subTestId(testId, 'trigger')}
                >
                    {/*
                     * `size-5` **as well as** `size={20}`: `Button`'s size variant carries a CSS
                     * rule that beats the presentation attribute, so `size={20}` alone is silently
                     * overridden back to 18. `action-menu.tsx`'s own header states it.
                     */}
                    <Icon name="more-horizontal" size={20} className="size-5" />
                </ActionMenuTrigger>
                <ActionMenuContent>
                    {shows.replyAllowed && (
                        <ActionMenuItem
                            data-testid={subTestId(testId, 'option')}
                            disabled={replyAllowed.isPending}
                            onClick={() => replyAllowed.run(!post.reply_allowed)}
                        >
                            {post.reply_allowed
                                ? t('post_menu_close_replies')
                                : t('post_menu_open_replies')}
                            {/* The state the row is **leaving**, matching its label — the reading
                                `ChannelViewerMenu`'s bell row establishes. */}
                            <Icon
                                name={post.reply_allowed ? 'comment-slash' : 'comment'}
                                size={20}
                                className="flex-none"
                            />
                        </ActionMenuItem>
                    )}
                    {shows.pin && (
                        <ActionMenuItem
                            data-testid={subTestId(testId, 'item')}
                            disabled={pin.isPending}
                            onClick={() => (pinned ? pin.run(false) : setConfirmPin(true))}
                        >
                            {pinned ? t('post_menu_unpin') : t('post_menu_pin')}
                            <Icon name="thumbtack" size={20} className="flex-none" />
                        </ActionMenuItem>
                    )}
                    {shows.delete && (
                        <ActionMenuItem
                            data-testid={subTestId(testId, 'remove')}
                            tone="destructive"
                            disabled={remove.isPending}
                            onClick={() => setConfirmDelete(true)}
                        >
                            {t('post_menu_delete')}
                            <Icon name="trash" size={20} className="flex-none" />
                        </ActionMenuItem>
                    )}
                    {shows.report && (
                        <ActionMenuItem
                            data-testid={subTestId(testId, 'option')}
                            onClick={requireAuth(() => setReportOpen(true))}
                        >
                            {t('post_menu_report')}
                            {/*
                             * `exclamation-circle`, not a flag: the library draws
                             * `flag-swallowtail` in **filled only**, and one solid glyph among
                             * outlines is what a popup looks like when it goes wrong.
                             * `ChannelViewerMenu` made the same call and for the same reason.
                             */}
                            <Icon name="exclamation-circle" size={20} className="flex-none" />
                        </ActionMenuItem>
                    )}
                    {shows.block && (
                        <ActionMenuItem
                            data-testid={subTestId(testId, 'remove')}
                            tone="destructive"
                            disabled={block.isPending}
                            onClick={() => setConfirmBlock(true)}
                        >
                            {t('post_menu_block')}
                            <Icon name="ban" size={20} className="flex-none" />
                        </ActionMenuItem>
                    )}
                </ActionMenuContent>
            </ActionMenu>

            <ConfirmDialog
                open={confirmPin}
                onOpenChange={setConfirmPin}
                title={t('post_pin_replace_title')}
                description={t('post_pin_replace_body')}
                confirmLabel={t('post_menu_pin')}
                pending={pin.isPending}
                onConfirm={() => {
                    pin.run(true)
                    setConfirmPin(false)
                }}
                testId={subTestId(testId, 'overlay')}
            />

            <ConfirmDialog
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title={t('post_delete_title')}
                description={t('post_delete_confirm')}
                confirmLabel={t('post_menu_delete')}
                destructive
                pending={remove.isPending}
                onConfirm={() => {
                    remove.run()
                    setConfirmDelete(false)
                }}
                testId={subTestId(testId, 'panel')}
            />

            <ConfirmDialog
                open={confirmBlock}
                onOpenChange={setConfirmBlock}
                title={t('post_block_title', { name: authorName })}
                description={t('post_block_confirm', { name: authorName })}
                confirmLabel={t('post_menu_block')}
                destructive
                pending={block.isPending}
                onConfirm={() => {
                    block.run()
                    setConfirmBlock(false)
                }}
                testId={subTestId(testId, 'group')}
            />

            <PostReportDialog
                post={post}
                open={reportOpen}
                onOpenChange={setReportOpen}
                /*
                 * "Report and block" is one flow, not two — the caller owns the block so a report
                 * that fails to send cannot still block somebody. `ChannelReportDialog` established
                 * the shape.
                 */
                onBlock={block.run}
            />
        </>
    )
}
