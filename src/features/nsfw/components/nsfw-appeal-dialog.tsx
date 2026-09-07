'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { DialogTitle } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import type { QueryClient } from '@tanstack/react-query'
import Image from 'next/image'
import {
    LATEST_STALE_MS,
    type NsfwPost,
    nsfwAppealApi,
    nsfwAppealKeys,
} from '../api/nsfw-appeal-api'
import { useNsfwAppeal } from '../hooks/use-nsfw-appeal'
import { formatFlaggedPostDate } from '../lib/format'
import { NSFW_APPEAL_ART } from '../lib/illustrations'

/**
 * "Appeal NSFW Status" — the owner's route out of an NSFW label.
 *
 * Ported 1:1 from Figma `5A.2025`, page `[1409] Optimze NSFW theo Level`: the queue (`1468:71372`),
 * its cleared state (`1468:71522`) and the confirmation (`413:108088`). The *sequence* behind them —
 * and the three claims that only hold as a sequence — is `useNsfwAppeal`.
 *
 * ## A dialog that is really a screen
 *
 * The native app pushes a full screen; on the web it is a popup with a **56px title band**, the
 * shape `docs/DESIGN_SYSTEM.md` §7 calls a screen-in-a-dialog — so its dismiss sits in that band's
 * **start slot**, with the app's other seven. It is an `xmark` and never a chevron: the three faces
 * are states of one screen rather than steps, so the reader never navigates between them and there
 * is nothing to go back to. See the note at the control for why the comps' trailing ✕ lost.
 *
 * It is not a route. The flow is opened from a dialog on the space page, it is owner-only, and every
 * call behind it is bearer-derived: a URL for it would be a page that renders nothing for anyone who
 * is not signed in as one particular creator.
 *
 * ## The queue is the appeal
 *
 * There is no form. What the backend wants is that the flagged content is *gone*, so the screen is a
 * list of posts with a Delete on each and a Submit that stays disabled until the list is empty.
 *
 * ## Two type sizes the DS cannot spell
 *
 * The comps draw "How to remove NSFW status" at 16/600 and "Content flagged as NSFW" at 16/**700**.
 * The scale ships one weight at 16 (`type-body-strong`, semibold) and `CLAUDE.md` forbids setting
 * `font-weight` by hand, so both use it. The one-step difference is invisible beside a hierarchy the
 * card boundary already draws.
 */
/**
 * Read `nsfw-appeal/latest/` **before** the screen is shown, so the button that opens it can hold
 * the wait.
 *
 * The answer decides which of two screens this is — the delete queue, or "Appeal submitted!" — and a
 * screen that renders before it knows has to either guess or go blank. Both were tried. So the press
 * takes the wait instead: the CTA spins, this resolves, and the screen opens already knowing.
 *
 * Exported from **this** module rather than from the api one so the caller keeps its single dynamic
 * import: the CTA awaits the same chunk it is about to render, and gets the query with it.
 *
 * Never rejects. A 5xx here is not a reason to refuse to open — the screen has an error face and a
 * retry, and its own `useQuery` will surface the failure. Swallowing it means the button always
 * leads somewhere.
 */
export function prefetchAppealEntry(queryClient: QueryClient, accountId: string | null) {
    return queryClient
        .fetchQuery({
            queryKey: nsfwAppealKeys.latest(accountId),
            queryFn: ({ signal }) => nsfwAppealApi.getLatestAppeal({ signal }),
            staleTime: LATEST_STALE_MS,
        })
        .catch(() => undefined)
}

export function NsfwAppealScreen({
    /** The screen is on. Drives the reads — nothing is fetched while the info step is showing. */
    active,
    onClose,
}: {
    active: boolean
    onClose: () => void
}) {
    const { t } = useTranslation()
    const appeal = useNsfwAppeal({ enabled: active })

    /*
     * A **fragment**, not a wrapping element, and that is load-bearing.
     *
     * `DialogContent` is the flex column and its `max-h` is a cap rather than a height — so a
     * wrapper carrying `flex-1` (`flex: 1 1 0%`) resolves to a basis of zero with no free space to
     * grow into, and the whole popup collapses to a 1px line. Measured, not reasoned: the first cut
     * of this rendered an invisible dialog. The band, the body and the footer are therefore direct
     * children of the shell, exactly as they were when this owned its own `DialogContent`.
     */
    return (
        <>
            <div className="relative flex h-14 flex-none items-center justify-center border-(--separator-default) border-b bg-(--background-surface) px-2">
                {/*
                 * **Leading**, which is where every other screen-shaped dialog in this app puts
                 * it — `StarPurchaseDialog`, `CardCheckoutDialog`, `AddCardDialog`,
                 * `MembershipDetailDialog` and the two payout pickers. The comps draw it
                 * trailing, and it was built that way for a day; that was the wrong call.
                 *
                 * The band is the app bar, and `docs/DESIGN_SYSTEM.md` §7 puts back/close in its
                 * start slot for a structural reason: `StarPurchaseDialog` carries `angle-left`
                 * *or* `xmark` in that one slot depending on the step, so a reader learns one
                 * place to look. Seven dialogs teaching that and an eighth teaching the opposite
                 * is worse than any single screen being a pixel off its comp — and the excuse
                 * this file had ("nothing to go back to, so it can only mean leave") argues for
                 * nothing: the root step of `StarPurchaseDialog` has nothing to go back to
                 * either, and its `xmark` is still on the leading edge.
                 */}
                <button
                    data-testid="nsfw-appeal-close"
                    type="button"
                    aria-label={t('common_close')}
                    onClick={onClose}
                    className="absolute start-2 flex size-10 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-(--text-title) outline-none hover:bg-(--background-segment) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                >
                    <Icon name="xmark" size={20} />
                </button>
                <DialogTitle className="truncate">{t('nsfw_appeal_title')}</DialogTitle>
            </div>

            {/*
             * **The three faces are chosen in this order, and `loading` has to come first.**
             *
             * It used to be the innermost branch — the queue's chrome ("How to remove NSFW status",
             * "Content flagged as NSFW") rendered immediately and only the *list* was a skeleton. So
             * pressing the CTA committed the screen to "delete your posts" before
             * `nsfw-appeal/latest/` had answered, and an owner who had **already appealed** watched
             * that instruction card sit there for a beat and then be replaced by "Appeal submitted!".
             * The screen was asserting something it did not yet know.
             *
             * A neutral loading face says nothing instead: the bar the reader pressed towards, and
             * two skeletons. It is also the same shape as the chunk's own `loading` placeholder, so a
             * cold press is one continuous wait rather than two.
             */}
            {appeal.step === 'loading' ? (
                <LoadingFace />
            ) : appeal.step === 'submitted' ? (
                <SubmittedFace onClose={onClose} />
            ) : (
                <>
                    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                        {/* The instructions are a **card** on the page ground; the list below is
                                its own surface. That band of ground between them is the whole
                                separation — there is no rule and no heading above the card. */}
                        <div className="flex-none p-4">
                            <section className="flex min-w-0 flex-col gap-2 rounded-(--radius-xl) bg-(--background-surface) p-4">
                                <h3 className="type-body-strong m-0 text-(--text-title)">
                                    {t('nsfw_appeal_how_title')}
                                </h3>
                                {/*
                                 * A real `<ol>`: the steps are an order, and the comps number
                                 * them. `list-outside` with `ps-5` hangs the markers the way the
                                 * comps do — a wrapped third step indents under its own text,
                                 * not back under the number.
                                 */}
                                <ol className="type-dense-default m-0 flex list-outside list-decimal flex-col gap-1 ps-5 text-(--text-subtitle)">
                                    <li>{t('nsfw_appeal_how_step_1')}</li>
                                    <li>{t('nsfw_appeal_how_step_2')}</li>
                                    <li>{t('nsfw_appeal_how_step_3')}</li>
                                </ol>
                            </section>
                        </div>

                        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-(--background-surface)">
                            <header className="flex min-w-0 items-start gap-3 px-4 pt-4 pb-3">
                                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                    <h3 className="type-body-strong m-0 text-(--text-title)">
                                        {t('nsfw_appeal_flagged_title')}
                                    </h3>
                                    <p className="type-dense-default m-0 text-(--text-subtitle)">
                                        {t('nsfw_appeal_flagged_body')}
                                    </p>
                                </div>
                                {/*
                                 * The comps' "3 items". Only while there *are* items and only
                                 * once the page is in hand — a count beside an empty list, or
                                 * one drawn from a page still loading, is worse than none.
                                 */}
                                {appeal.posts.length > 0 && (
                                    <span className="type-dense-default flex-none text-(--text-subtitle)">
                                        {t('nsfw_appeal_flagged_count', {
                                            count: appeal.posts.length,
                                        })}
                                    </span>
                                )}
                            </header>

                            {appeal.isQueueLoading ||
                            (appeal.isQueueRefreshing && appeal.posts.length === 0) ? (
                                /* The first read, or the page behind one just cleared. Either way the
                                   queue's own chrome above is already true, so only the rows are a
                                   skeleton. */
                                <div className="flex flex-col gap-3 px-4 pb-4" aria-busy="true">
                                    <Skeleton h={70} className="w-full" />
                                    <Skeleton h={70} className="w-full" />
                                </div>
                            ) : appeal.isQueueError ? (
                                <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                                    <p className="type-dense-default m-0 text-(--text-subtitle)">
                                        {t('nsfw_appeal_load_failed')}
                                    </p>
                                    <Button
                                        data-testid="nsfw-appeal-retry"
                                        variant="secondary"
                                        size="small"
                                        onClick={appeal.retry}
                                    >
                                        {t('common_retry')}
                                    </Button>
                                </div>
                            ) : appeal.posts.length === 0 ? (
                                <ClearedFace />
                            ) : (
                                <ul
                                    className="m-0 flex flex-col border-(--separator-default) border-t px-4 ps-4 pe-4"
                                    // Re-read after every delete, so the list is stale rather
                                    // than absent while that is in flight — say so instead of
                                    // blanking rows the reader is working through.
                                    aria-busy={appeal.isQueueRefreshing}
                                >
                                    {appeal.posts.map(post => (
                                        <FlaggedPostRow
                                            key={post.id}
                                            post={post}
                                            isDeleting={appeal.deletingId === post.id}
                                            onDelete={() => appeal.deletePost(post.id)}
                                        />
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>

                    <div className="flex-none border-(--separator-default) border-t bg-(--background-surface) p-4">
                        <Button
                            data-testid="nsfw-appeal-submit"
                            variant="accent"
                            size="large"
                            fullWidth
                            // `canSubmit` already goes false while the POST is in flight — see
                            // `useNsfwAppeal`. `aria-busy` is what says *why* it is disabled,
                            // since the DS button draws no spinner.
                            disabled={!appeal.canSubmit}
                            aria-busy={appeal.isSubmitting}
                            onClick={() => appeal.submitAppeal()}
                        >
                            {t('nsfw_appeal_submit')}
                        </Button>
                    </div>
                </>
            )}
        </>
    )
}

/**
 * What the screen shows before it knows which screen it is.
 *
 * Deliberately empty of claims: no instruction card, no "Content flagged as NSFW" heading, nothing
 * that presumes the answer to `nsfw-appeal/latest/`. Two skeletons at the sizes the queue's own first
 * rows occupy, so the popup does not resize when the real content replaces them.
 */
function LoadingFace() {
    return (
        <div className="flex flex-col gap-3 p-4" aria-busy="true">
            <Skeleton h={110} className="w-full" />
            <Skeleton h={70} className="w-full" />
        </div>
    )
}

/**
 * Nothing flagged left — the comps' `thumb-up` character over two lines of encouragement.
 *
 * It replaces the list rather than sitting under the header's own copy, which still reads correctly
 * above it ("you need to remove all flagged content to appeal" — you have). Follows the app's
 * empty-state treatment: a 16/600 title and a body capped at 400.
 */
function ClearedFace() {
    const { t } = useTranslation()
    const art = NSFW_APPEAL_ART.cleared

    return (
        <div
            data-testid="nsfw-appeal-cleared"
            className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center"
        >
            <Image src={art.src} alt="" width={art.width} height={art.height} />
            <div className="flex min-w-0 max-w-[400px] flex-col gap-1">
                <p className="type-body-strong m-0 text-balance text-(--text-title)">
                    {t('nsfw_appeal_cleared_title')}
                </p>
                <p className="type-dense-default m-0 text-pretty text-(--text-subtitle)">
                    {t('nsfw_appeal_cleared_body')}
                </p>
            </div>
        </div>
    )
}

/**
 * The confirmation, reached two ways: the `POST` just succeeded, or `latest/` said an appeal is
 * already on file. One face for both, because they are the same fact — there is an appeal waiting on
 * a human — and a separate "you already appealed" screen would be that sentence written twice.
 *
 * The mark follows this app's tile idiom (solid disc, glyph knocked out) at hero size, as the gate's
 * does, and the footer is the comps' **Back to my Space** — which on the web is simply "close", the
 * space being what is behind the dialog.
 *
 * ## The tick is dark, and the two references disagree about that
 *
 * Figma's `413:108088` draws it **white**, which on `--accents-success-active` (`#26bb26`) measures
 * **2.6:1** — under WCAG's 3:1 for a graphical object. The **shipped iOS screen draws it dark**, and
 * dark on that green is 8.1:1. So the two references disagree and contrast breaks the tie in favour
 * of the one that is also what creators see in the app today.
 *
 * `--black`, not `--text-title`: the disc is a fixed `#26bb26` in **both** themes (`active` is one of
 * the accent stops dark mode does not redefine), so the ink on it must be fixed too — a token that
 * inverts would turn the tick white again in dark mode and put the failure back, in exactly the mode
 * where nobody would think to re-measure it.
 */
function SubmittedFace({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation()

    return (
        <>
            {/*
             * **Surface, not the page ground.** The dialog's own fill is `--background` because the
             * queue face needs a band of ground for its instruction card to sit on — and this face
             * has no card, so it inherited a black block between a grey title bar and a grey footer
             * and read as three mismatched pieces. Nothing here is layered, so nothing here wants
             * two levels: one surface, from the bar to the button.
             */}
            <div className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto bg-(--background-surface) px-6 py-10 text-center">
                <span className="flex size-14 flex-none items-center justify-center rounded-(--radius-fill) bg-(--accents-success-active) text-(--black)">
                    <Icon name="check" size={32} aria-hidden="true" />
                </span>
                <div className="flex min-w-0 max-w-[340px] flex-col gap-1">
                    <h2 className="type-body-strong m-0 text-balance text-(--text-title)">
                        {t('nsfw_appeal_submitted_title')}
                    </h2>
                    <p className="type-dense-default m-0 text-pretty text-(--text-subtitle)">
                        {t('nsfw_appeal_submitted_body')}
                    </p>
                </div>
            </div>
            <div className="flex-none border-(--separator-default) border-t bg-(--background-surface) p-4">
                <Button
                    data-testid="nsfw-appeal-back"
                    variant="secondary"
                    size="large"
                    fullWidth
                    onClick={onClose}
                >
                    {t('nsfw_appeal_back_to_space')}
                </Button>
            </div>
        </>
    )
}

/**
 * One flagged post: what it is, what it was worth, and the one thing that can be done to it.
 *
 * ## Every figure here is real, and that is recent
 *
 * The two counters were left out while the payload was unknown, on the grounds that a guessed
 * counter renders `0` — a wrong number, not a missing one, on a screen asking somebody to delete
 * their own work. A captured `nsfw-posts/` response settled them: `reaction_count` is the star
 * (Tevi's reaction *is* a star, which is why the comps draw one) and `reply_count` the comments.
 *
 * The leading mark is the post's **access**, not a count: money for anything with a `price`, the
 * members glyph for anything whose `viewer` is not `EVERYONE`, nothing for a public post.
 *
 * ## The thumbnail is the blurred derivative on purpose
 *
 * `cover_image` on a sensitive post is `imge.tevi.app/unsafe/filters:blur(80)/…` while `images[0]`
 * is the original. This screen lists content flagged as explicit, so it draws the blurred one —
 * `nsfw-appeal-api.ts` says so at the parse. `unoptimized` because these are one-off CDN paths at a
 * 56px box; running them through the optimiser buys nothing and costs a round trip.
 *
 * ## Delete is a soft pill, and there is no confirmation
 *
 * Both from the comps. The tint (`--accents-error-bg-active` under `--text-error`) rather than the
 * DS's solid `destructive`, because a column of solid red buttons reads as a warning about the
 * *screen* rather than an action on each row. And no per-row confirm: the deletion is irreversible,
 * but it is also the only way through, and the sentence above the list already says every flagged
 * post has to go — ten stacked confirmations would be a dialog on a dialog, ten times.
 */
function FlaggedPostRow({
    post,
    isDeleting,
    onDelete,
}: {
    post: NsfwPost
    isDeleting: boolean
    onDelete: () => void
}) {
    const { t, currentLanguage } = useTranslation()
    const when = formatFlaggedPostDate(post.createdAt, currentLanguage)

    return (
        <li
            data-testid="nsfw-appeal-post"
            data-post-id={post.id}
            className="flex min-w-0 items-center gap-3 border-(--separator-default) border-b py-3 last:border-b-0"
        >
            <div className="relative size-14 flex-none overflow-hidden rounded-(--radius-md) bg-(--background-segment)">
                {post.thumbnail ? (
                    <Image
                        src={post.thumbnail}
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover"
                        unoptimized
                    />
                ) : (
                    /* The comps' third row: a post whose picture is gone still has to be
                       identifiable enough to delete. */
                    <span className="flex size-full items-center justify-center text-(--icon-subtle)">
                        <Icon name="image" size={20} aria-hidden="true" />
                    </span>
                )}
                {post.isVideo ? (
                    <span className="absolute start-1 bottom-1 flex items-center gap-0.5 rounded-(--radius-sm) bg-(--opacity-black-50) px-1 py-0.5 text-(--white)">
                        <Icon name="film-play" size={16} aria-hidden="true" />
                    </span>
                ) : post.imageCount > 1 ? (
                    <span className="type-caption-meta absolute start-1 bottom-1 flex items-center gap-0.5 rounded-(--radius-sm) bg-(--opacity-black-50) px-1 py-0.5 text-(--white)">
                        <Icon name="images" size={16} aria-hidden="true" />
                        {post.imageCount}
                    </span>
                ) : null}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {when && (
                    <time
                        dateTime={post.createdAt ?? undefined}
                        className="type-caption-meta text-(--text-subtitle)"
                    >
                        {when}
                    </time>
                )}
                <p
                    className={`type-dense-emphasis m-0 truncate ${
                        post.caption ? 'text-(--text-title)' : 'text-(--text-subtitle)'
                    }`}
                >
                    {post.caption ?? t('nsfw_appeal_post_no_caption')}
                </p>
                <p className="type-caption-meta m-0 flex min-w-0 items-center gap-2 text-(--text-subtitle)">
                    {post.access === 'paid' ? (
                        <Icon
                            name="badge-dollar"
                            size={16}
                            aria-label={t('nsfw_appeal_post_paid')}
                        />
                    ) : post.access === 'restricted' ? (
                        <Icon
                            name="users"
                            size={16}
                            aria-label={t('nsfw_appeal_post_restricted')}
                        />
                    ) : null}
                    <span className="flex items-center gap-1">
                        <Icon name="star" size={16} aria-hidden="true" />
                        {post.starCount.toLocaleString(currentLanguage)}
                    </span>
                    <span className="flex items-center gap-1">
                        <Icon name="comment" size={16} aria-hidden="true" />
                        {post.replyCount.toLocaleString(currentLanguage)}
                    </span>
                </p>
            </div>

            <Button
                data-testid="nsfw-appeal-post-delete"
                variant="ghost"
                size="small"
                disabled={isDeleting}
                aria-busy={isDeleting}
                onClick={onDelete}
                className="flex-none bg-(--accents-error-bg-active) text-(--text-error) hover:not-disabled:bg-(--accents-error-bg-focus)"
            >
                {t('nsfw_appeal_post_delete')}
            </Button>
        </li>
    )
}
