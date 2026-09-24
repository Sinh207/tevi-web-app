import { env } from '@shared/config/env'
import { ApiError } from '@shared/lib/api/errors'
import { createApiModel } from '@shared/lib/api/model'
import type { PageCursor } from '@shared/lib/api/page-cursor'
import type { PostBody, UploadedImage } from '../lib/post-draft'
import { normalizeCollection, normalizeCollections, type PostCollection } from './collection-types'
import { normalizeReplies, normalizeReply, type Reply } from './reply-types'
import { normalizePost, type Post } from './types'

/**
 * A post as a thing in its own right — `core/v1/posts/**`.
 *
 * ## What is here, and what is deliberately not
 *
 * Everything the **card** can do: read one post, react, bookmark, and the four writes its overflow
 * menu offers — pin, reply-allowed, delete, and the two Star charges (unlocking a gated post, and
 * paying to interact on a channel that charges).
 *
 * Everything the **post-detail screen** adds on top: the reply list, and posting one.
 *
 * Legacy's `PostModel` declares 32 methods across five groups. The ones still absent belong to
 * surfaces that do not exist yet and would be guesses here: the rest of **comments** (a reply's own
 * reactions, its deletion, and the nested `child-replies/` thread — the reply row draws none of
 * those yet), **collections** (13 — a screen nobody has ported), the bookmark **list** and
 * `deleteAllBookmark` (a screen, not a card), and `updatePost`, which is the post composer's. Each lands with the surface that offers it, the way `report-api.ts` split out of
 * `channel-api.ts`. `post-report-api.ts` beside this file is that split happening again.
 *
 * ## Every write pins the account, and none of them is retried
 *
 * `accountId` is threaded through every method rather than left to the interceptor's idea of who is
 * active: the switcher is two taps from any feed, and a write that resolves after a switch must
 * still belong to the account that made it. And `createApiModel` posts without `{ retry: true }`,
 * which is the correct default for all of these — a 502 on `ecom/purchase/` can arrive *after* the
 * Star left the account, so a replay would charge twice.
 *
 * ## `v1`, and that is not a typo
 *
 * The channel service is on `v3` (`features/channel`) and billing on `v4`/`v5`, but posts are still
 * `v1` — legacy's `PostModel` pins `VERSION = 'v1'` and every path below is one legacy calls today.
 * Do not "modernise" the prefix on the assumption that the services version together; they do not.
 *
 * ## A post list is never fetched from here
 *
 * The lists live with the surfaces that own them — a channel's posts are
 * `channelApi.getThreads` (`features/channel`), home's feed will be home's. This file fetches **one**
 * post, because that is the only request whose shape does not depend on where it is asked from.
 * `normalizePost` and `normalizePosts` are exported from `types.ts` for exactly that reason: a
 * surface owning a list parses its rows with this feature's schema without routing the request
 * through this feature's model.
 *
 * Open contract questions: **B105** in `docs/BACKEND_QUESTIONS.md`.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/core` })

/**
 * The commerce service, and it is **not** the one above.
 *
 * `ecom/purchase/` lives on `billy` — the same service `features/balance` reads the balance from,
 * which is why every write through it invalidates that feature's keys instead of guessing the new
 * figure. `features/mini-app` already calls this exact endpoint for an in-app item; the two are
 * deliberately separate callers rather than a shared helper, because the **body** differs (a post
 * unlock sends one field, an interaction charge sends four) and a helper that took a union of both
 * would be a helper nobody could read.
 */
const billy = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/billy` })

const VERSION = 'v1'

const postPath = (postId: string, suffix = '') =>
    `${VERSION}/posts/${encodeURIComponent(postId)}/${suffix}`

/**
 * A **reply** is addressed under `posts/replies/`, never under `posts/{id}/`.
 *
 * Its own namespace, and the one thing that makes the reply endpoints impossible to confuse with
 * the post ones by accident — which they were, until the detail page's replies were drawn as post
 * cards and their reaction button pointed at `posts/{replyId}/reaction/`.
 */
const replyPath = (replyId: string, suffix = '') =>
    `${VERSION}/posts/replies/${encodeURIComponent(replyId)}/${suffix}`

const POST_SCOPE = ['post'] as const

/**
 * Query keys.
 *
 * **Account-scoped, and every one of them.** A post's payload is viewer-relative in nine fields —
 * `is_owner`, `is_bookmark`, `user_reaction`, `can_reply`, `viewer`, `need_unlock_package` among
 * them — so a cache entry shared across accounts would show one reader another's unlock state. This
 * is the same reason `channelKeys` is keyed on the active account, and it is why nothing here may
 * ever be given `cache: { shared: true }`.
 */
export const postKeys = {
    /** Everything this feature caches — the prefix a sign-out drops. */
    all: POST_SCOPE,
    detail: (postId: string, accountId: string | null) =>
        [...POST_SCOPE, 'detail', postId, accountId ?? 'anon'] as const,
    /** Every page of replies under one post. */
    replies: (postId: string, accountId: string | null) =>
        [...POST_SCOPE, 'replies', postId, accountId ?? 'anon'] as const,
    /** Every page of child replies under one reply — a different endpoint, so a different key. */
    childReplies: (replyId: string, accountId: string | null) =>
        [...POST_SCOPE, 'child-replies', replyId, accountId ?? 'anon'] as const,
    /** The creator's own collections. Account-scoped like everything else here. */
    collections: (accountId: string | null) =>
        [...POST_SCOPE, 'collections', accountId ?? 'anon'] as const,
}

/**
 * The two paid interactions a **post card** can trigger, and the catalogue ids that price them.
 *
 * ## Hard-coded UUIDs, transcribed from legacy's `constants/productType.js`
 *
 * They are catalogue rows on the commerce service, not configuration — legacy has carried the same
 * seven pairs since the feature shipped, and there is no endpoint that lists them. Two of the seven
 * are here because two of them are reachable from a card; the other five (`TRANSLATION`,
 * `ADD_POST`, `LIVE_CHAT`, `CHARGE_STAR`, `FOLLOW_CHANNEL`) belong to surfaces that will copy the
 * pair they need rather than importing a table of things they do not.
 *
 * ⚠ **These are environment-independent in legacy and assumed to be here too.** If staging and
 * production turn out to mint different catalogue ids, this is the file that breaks and it breaks
 * as a `422` rather than as a type error — **B107**.
 */
const INTERACTION_PRODUCTS = {
    react: {
        productId: 'dd5db89c-ef7f-4bb2-ae69-5a38f637468f',
        priceId: 'c9a69a5c-ea6c-4829-be1c-500172177bd0',
    },
    comment: {
        productId: '21adc23b-4cd3-46cc-9913-c30cdd6378e7',
        priceId: 'f18eaa9a-1bda-4453-a1bc-e71548aa0a0e',
    },
} as const

/** Which interaction is being paid for. A union, so a typo cannot reach the wire as `undefined`. */
export type InteractionProduct = keyof typeof INTERACTION_PRODUCTS

/**
 * The backend's code for "not enough Star", on a `422` from `ecom/purchase/`.
 *
 * The same constant `features/mini-app` names, and duplicated rather than imported for the reason
 * that feature's own barrel gives: `features/post` may not import `features/mini-app`, and a string
 * this short is a safer duplicate than a new shared module whose only member is one code. Both
 * copies carry this note so a change to one is findable from the other.
 */
export const INSUFFICIENT_STARS_CODE = 'EC0001'

export const postApi = {
    /**
     * One post by id.
     *
     * **A 404 is an answer**, not a failure, and swallowing it here is what makes the contract
     * `Post | null` for every consumer — a post can be deleted between the feed rendering a card
     * and the reader tapping it, which is ordinary rather than exceptional. The consequences are the
     * ones `channelApi.getChannel` writes down: the query resolves as `success`, so it does not trip
     * `meta.showErrorToast`, and the detail page can say "this post is unavailable" instead of
     * dropping into an error boundary.
     *
     * A post that *is* returned but carries `deleted: true` is a different state — the backend still
     * has the row and the card renders a tombstone. `postDisplay` handles that one.
     */
    async getPost(postId: string, accountId?: string | null): Promise<Post | null> {
        try {
            const body = await api.get<unknown>(
                postPath(postId),
                undefined,
                accountId ? { accountId } : undefined,
            )
            return normalizePost(body)
        } catch (error) {
            if (error instanceof ApiError && error.status === 404) return null
            throw error
        }
    },

    /**
     * React to a post, and take it back.
     *
     * Two endpoints rather than one toggle, and the asymmetry is legacy's: `reaction/` **posts a
     * type** (`LIKE` is the only one any client sends) while `reaction-delete/` takes none, because
     * an account has at most one reaction on a post and removing it needs no discriminator. Declared
     * as a pair here so a caller cannot invent a `DELETE reaction/` that the backend does not serve.
     *
     * Both **pin the account**. A reaction is the account's, and the switcher is two taps from every
     * feed — an unpinned write lands as whoever the interceptor happens to think is active.
     */
    react(postId: string, accountId?: string | null) {
        return api.post<unknown>(
            postPath(postId, 'reaction/'),
            { type: 'LIKE' },
            accountId ? { accountId } : undefined,
        )
    },

    unreact(postId: string, accountId?: string | null) {
        return api.del<unknown>(
            postPath(postId, 'reaction-delete/'),
            undefined,
            accountId ? { accountId } : undefined,
        )
    },

    /**
     * Bookmarking a post, and removing the bookmark.
     *
     * ## The two halves disagree about where the id goes, and that is the contract
     *
     * Adding posts to a **collection-shaped** endpoint — `POST v1/posts/bookmark/` with the id in
     * the **body** — while removing addresses the post itself: `DELETE v1/posts/{id}/bookmark/`.
     * Legacy's `PostModel` spells both out and they are not a typo; the add endpoint is the same
     * one that *lists* a reader's bookmarks, so the id has to be in the body because the path is
     * already spoken for. A caller that "tidies" these into one shape gets a 404 on one of them.
     *
     * ## The response carries a `success` flag and it is not decoration
     *
     * Legacy flips its local state only on `status === 201 && data.success` (and `200 && success`
     * for the delete), so the client treats a 2xx **without** that flag as a write that did not
     * land. Ported as-is — see `usePostBookmark` for why that makes bookmarking confirm-then-flip
     * where reacting is optimistic. Whether the flag can actually be `false` on a 2xx is **B106**.
     */
    async addBookmark(postId: string, accountId?: string | null): Promise<boolean> {
        const body = await api.post<unknown>(
            `${VERSION}/posts/bookmark/`,
            { post_id: postId },
            accountId ? { accountId } : undefined,
        )
        return isSuccessBody(body)
    },

    async removeBookmark(postId: string, accountId?: string | null): Promise<boolean> {
        const body = await api.del<unknown>(
            postPath(postId, 'bookmark/'),
            undefined,
            accountId ? { accountId } : undefined,
        )
        return isSuccessBody(body)
    },

    /**
     * Pin a post to the top of its space, or unpin it.
     *
     * ## `PATCH` on the post itself, not a `pin/` sub-path
     *
     * Legacy's `togglePinPost` is `PATCH v1/posts/{id}/` with `{ pinned }`, and `toggleReplyAllowed`
     * below is the **same endpoint** with `{ reply_allowed }`. They are two names for one partial
     * update, and they are kept as two methods here rather than one `updatePost(fields)` on purpose:
     * a general partial update over this endpoint is how a caller ends up sending `text` from a menu
     * row. The composer, when it exists, gets its own `updatePost`.
     *
     * Both answer with the **updated post**, which is why they return a parsed `Post` rather than
     * `void` — the caller writes the server's answer back rather than assuming its own optimism was
     * right. A body that will not parse degrades to `null`; the write still landed.
     */
    async setPinned(postId: string, pinned: boolean, accountId?: string | null) {
        const body = await api.patch<unknown>(
            postPath(postId),
            { pinned },
            accountId ? { accountId } : undefined,
        )
        return normalizePost(body)
    },

    /**
     * Open or close replies on a post — the creator's own switch.
     *
     * Not to be confused with `can_reply`, which is the backend's answer about **this reader**.
     * `lib/post-access.ts` writes down why the two are not interchangeable; this endpoint moves the
     * first one only.
     */
    async setReplyAllowed(postId: string, replyAllowed: boolean, accountId?: string | null) {
        const body = await api.patch<unknown>(
            postPath(postId),
            { reply_allowed: replyAllowed },
            accountId ? { accountId } : undefined,
        )
        return normalizePost(body)
    },

    /**
     * Delete a post.
     *
     * The row survives the call: the backend keeps it and flips `deleted`, which is what
     * `postDisplay`'s tombstone branch renders. So a caller must **not** remove the card from its
     * list on success — it refetches, and the post comes back as a tombstone until the list is
     * next rebuilt. Legacy does the same and the card exists for exactly that window.
     */
    deletePost(postId: string, accountId?: string | null) {
        return api.del<unknown>(postPath(postId), undefined, accountId ? { accountId } : undefined)
    },

    /**
     * Unlock one gated post with Star.
     *
     * ## The body is **one field**, and the price is not in it
     *
     * `{ product_id }` — legacy's body verbatim. The post's `price` is displayed and never sent: a
     * client-supplied price on a purchase is either ignored or trusted, and only one of those is
     * safe. The backend prices the product.
     *
     * ## `422 EC0001` is the answer, not an error to phrase
     *
     * "Not enough Star" arrives as a 422 carrying that code — the same one `features/mini-app`
     * branches on, which is why the constant lives beside this call. The caller turns it into an
     * offer to top up rather than a failure toast; every other failure is a failure.
     *
     * The balance is still checked **before** the request (`useRequireStars`), because a reader who
     * cannot afford it should be offered Star instead of being charged a round trip to be told no.
     * This branch is what catches the gap between that check and the charge.
     */
    purchasePost(productId: string, accountId?: string | null) {
        return billy.post<unknown>(
            `${VERSION}/ecom/purchase/`,
            { product_id: productId },
            accountId ? { accountId } : undefined,
        )
    },

    /**
     * Pay the channel's interaction fee — what reacting or commenting costs on a space that charges.
     *
     * ## Four fields, and every one of them is legacy's
     *
     * | | |
     * |---|---|
     * | `product_id` / `price_id` | which *kind* of interaction — see `INTERACTION_PRODUCTS` |
     * | `quantity` | the **cost in Star**, not a count of items |
     * | `metadata.beneficial_channel_id` | who receives it |
     *
     * `quantity` carrying a price is the field to be careful with: legacy passes
     * `paidInteractionStarCost` into the `quantity` slot (`handlePurchase(channelId, type, cost)`),
     * so a reading of "quantity means how many" would send `1` and charge the wrong amount. It is
     * transcribed rather than corrected — **B107** asks the backend which of the two it means.
     *
     * The charge is a **separate request that must succeed first**: legacy bails out of the reaction
     * entirely when it fails, and so does `usePostReaction`. Reacting for free on a channel that
     * charges is the failure mode this ordering exists to prevent.
     */
    chargeInteraction(
        {
            product,
            channelId,
            cost,
        }: { product: InteractionProduct; channelId: string; cost: number },
        accountId?: string | null,
    ) {
        const ids = INTERACTION_PRODUCTS[product]
        return billy.post<unknown>(
            `${VERSION}/ecom/purchase/`,
            {
                product_id: ids.productId,
                price_id: ids.priceId,
                quantity: cost,
                metadata: { beneficial_channel_id: channelId },
            },
            accountId ? { accountId } : undefined,
        )
    },

    /**
     * The collections this creator has, one page at a time.
     *
     * ## Three of legacy's thirteen, and the other ten belong to a screen nobody has ported
     *
     * `PostModel` has list, read, create, rename, delete, add-posts, remove-posts and more. What the
     * **composer** needs is three: see what exists, make a new one, and file the post once it is
     * published. The rest are a collections screen — browsing one, reordering it, deleting it — and
     * adding them here would be exported methods with no caller, which `post-report-api.ts` already
     * argues against.
     *
     * Page-numbered, not cursor-paginated, and legacy asks for ten at a time.
     */
    async getCollections({
        page = 1,
        accountId,
        signal,
    }: {
        page?: number
        accountId?: string | null
        signal?: AbortSignal
    }) {
        const body = await api.get<{ results?: unknown; next?: string | null; count?: number }>(
            `${VERSION}/posts/collections/`,
            { page, page_size: COLLECTIONS_PAGE_SIZE },
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return {
            results: normalizeCollections(body?.results),
            hasMore: Boolean(body?.next),
        }
    },

    /** Make one. The body is a name and nothing else — legacy's `createCollection`. */
    async createCollection(
        name: string,
        accountId?: string | null,
    ): Promise<PostCollection | null> {
        return normalizeCollection(
            await api.post<unknown>(
                `${VERSION}/posts/collections/`,
                { name },
                accountId ? { accountId } : undefined,
            ),
        )
    },

    /**
     * File a post into collections — **after** it is created.
     *
     * ⚠ Addressed by the **post**, not by the collection: `v1/posts/{id}/add-collections/` with
     * `collection_ids`, which is the endpoint legacy's composer calls. There is a mirror-image one
     * (`collections/{id}/add-posts/` with `post_ids`) and it is a different call — the composer has
     * one post and several collections, so this is the direction that takes one request.
     *
     * A failure here does **not** un-publish the post. The post exists; it is simply not filed, and
     * telling the author their post failed would be false. `useCreatePost` treats it accordingly.
     */
    addPostToCollections(postId: string, collectionIds: string[], accountId?: string | null) {
        return api.post<unknown>(
            postPath(postId, 'add-collections/'),
            { collection_ids: collectionIds },
            accountId ? { accountId } : undefined,
        )
    },

    /**
     * Publish a post.
     *
     * ## `v3/channel/my-channel/threads/`, which is not where the rest of this file points
     *
     * Every other call here is `v1/posts/…`. Creating one is a **channel** operation on the same
     * `/core` service — the endpoint is the write half of the list `channelApi.getThreads` reads,
     * and `my-channel` is how the backend knows which space to publish to without being told. Both
     * legacy web and iOS post to this exact path. Do not "correct" it to `v1/posts/`.
     *
     * The body is `lib/post-draft.ts`'s to build; this only sends it. That split is what lets the
     * six places legacy web and iOS disagree be settled in a pure function with a test, rather than
     * inside a request.
     *
     * Answers with the created post. Not retried — a replayed create is a second post.
     */
    async createPost(body: PostBody, accountId?: string | null): Promise<Post | null> {
        return normalizePost(
            await api.post<unknown>(
                'v3/channel/my-channel/threads/',
                body,
                accountId ? { accountId } : undefined,
            ),
        )
    },

    /**
     * Post a reply — under a **post**, or under another **reply**.
     *
     * ## The body is three fields, and two of them are conditional
     *
     * `{ lang, text?, images? }` — legacy's `handleProcessCommentData` verbatim, minus the half this
     * client cannot honour. Legacy also sends **`html_text`**: it runs the typed text through
     * `linkifyjs`, shortens every URL it finds through the link service, and splices `<a>` tags back
     * in. That is deliberately not ported, and not merely to save a request:
     *
     * - **`PostCard` never renders `html_text`** (creator-authored markup, no sanitiser in this
     *   repo — the card's own note states the refusal). A reply sent as `html_text` with no `text`
     *   beside it is therefore a reply *this client cannot display*, which is a worse outcome than
     *   an unlinked URL.
     * - Splicing markup built from user input is the injection surface the card exists to avoid.
     *   Making links live is a parser over `text`, when someone builds it.
     *
     * So the words go out as `text`, exactly as typed. Nothing is lost that this app can show.
     *
     * ## `lang` is the **reader's** two-letter code, not `'en'`
     *
     * Legacy web hard-codes `'en'` on every comment from all nine of its locales. That was
     * transcribed here at first, on the grounds that nothing documented the accepted values — and
     * then iOS settled it: `PostLocal.swift` sends `LZ.getCurrentLanguage().twoCharactersCode` on
     * every post it creates, so a two-letter code is a value the backend already receives daily
     * from a shipped client. `postLang` narrows the locale; **B109** still asks what the field
     * drives.
     *
     * ## Not retried, and the reason is the charge beside it
     *
     * `createApiModel` posts without `{ retry: true }`, which is right here twice over: a replayed
     * reply is a duplicate row the reader did not write, and on a channel that charges, the Star has
     * already left the account before this call is made.
     *
     * Answers with the **created reply**, in the reply shape (`api/reply-types.ts`) rather than the
     * post one, so the caller can put the row on screen without waiting for a refetch. A body that
     * will not parse degrades to `null`; the reply still landed, and the list refetch recovers it.
     */
    async createReply(
        {
            target,
            text,
            images,
            lang,
        }: {
            target: ReplyTarget
            text: string | null
            images: ReplyImage[]
            /** The reader's own two-letter code — `postLang`. See the note above. */
            lang: string
        },
        accountId?: string | null,
    ): Promise<Reply | null> {
        const body: {
            lang: string
            text?: string
            images?: ReplyImage[]
        } = { lang }
        if (text) body.text = text
        if (images.length > 0) body.images = images

        /*
         * Two endpoints, **one body**. Legacy splits the call the same way — `createCommentPost`
         * and `createCommentReply` — and keeps a single `handleProcessCommentData` behind both,
         * which is the half worth copying: an answer to a reply is a reply, and a second body
         * builder is a second place for `lang` or the image shape to drift.
         */
        const path =
            target.kind === 'post'
                ? postPath(target.postId, 'replies/')
                : replyPath(target.replyId, 'child-replies/')

        return normalizeReply(
            await api.post<unknown>(path, body, accountId ? { accountId } : undefined),
        )
    },

    /**
     * One page of replies under a post.
     *
     * Cursor-paginated like the channel's own thread list, and the cursor is a **full URL the client
     * must not fetch** — `shared/lib/api/page-cursor.ts` explains why (an internal hostname, and the
     * credential rules in `origins.ts`).
     *
     * ⚠ **The rows are replies, not posts, and the envelope carries no `count`.** Both were wrong
     * here and both were silent: `normalizePosts` parsed every row into a post-shaped object whose
     * author field (`channel`) does not exist on a reply, and `body.count ?? 0` printed
     * *"0 replies"* over a list that had some. The real envelope is `{ next, previous, results }` —
     * cursor pagination has no total. `api/reply-types.ts` carries the measured shape.
     *
     * The heading's number is the **parent post's** `reply_count` instead, which is a field that
     * exists. It can lag this list by a moment; a figure that is occasionally one behind beats one
     * that is always zero.
     */
    async getReplies({
        postId,
        cursor,
        accountId,
        signal,
    }: {
        postId: string
        cursor?: PageCursor | null
        accountId?: string | null
        signal?: AbortSignal
    }) {
        const body = await api.get<{ results?: unknown; next?: string | null }>(
            postPath(postId, 'replies/'),
            cursor ?? { limit: REPLIES_PAGE_SIZE },
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return { results: normalizeReplies(body?.results), next: body?.next ?? null }
    },

    /**
     * One page of **child** replies — the answers to a reply.
     *
     * A different path entirely (`v1/posts/replies/{id}/child-replies/`, not
     * `v1/posts/{id}/replies/`), the same row shape, and every row carries `parent_id` pointing back
     * at the reply asked about. Legacy expands these inline under each comment.
     */
    async getChildReplies({
        replyId,
        cursor,
        accountId,
        signal,
    }: {
        replyId: string
        cursor?: PageCursor | null
        accountId?: string | null
        signal?: AbortSignal
    }) {
        const body = await api.get<{ results?: unknown; next?: string | null }>(
            replyPath(replyId, 'child-replies/'),
            cursor ?? { limit: REPLIES_PAGE_SIZE },
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return { results: normalizeReplies(body?.results), next: body?.next ?? null }
    },

    /**
     * React to a reply, and take it back — **not** the post endpoints.
     *
     * `v1/posts/replies/{id}/reaction/` and `…/reaction-delete/`. A reply's id is not a post's id,
     * so sending one to `v1/posts/{id}/reaction/` is a 404 — which is exactly what the detail page
     * did while it drew replies as post cards. The asymmetry is the post pair's: the add posts a
     * `type`, the remove takes none.
     */
    reactToReply(replyId: string, accountId?: string | null) {
        return api.post<unknown>(
            replyPath(replyId, 'reaction/'),
            { type: 'LIKE' },
            accountId ? { accountId } : undefined,
        )
    },

    unreactFromReply(replyId: string, accountId?: string | null) {
        return api.del<unknown>(
            replyPath(replyId, 'reaction-delete/'),
            undefined,
            accountId ? { accountId } : undefined,
        )
    },

    /**
     * Delete a reply — the author's own, or the post owner's moderation.
     *
     * `DELETE v1/posts/replies/{id}/`. Unlike `deletePost`, whose row survives as a tombstone, what
     * a deleted reply does is **unmeasured** — the payload has a `deleted` flag, so the row may well
     * come back flagged rather than disappear. The caller therefore refetches rather than removing
     * the row itself, which is right either way. **B109**.
     */
    deleteReply(replyId: string, accountId?: string | null) {
        return api.del<unknown>(
            replyPath(replyId),
            undefined,
            accountId ? { accountId } : undefined,
        )
    },
}

/**
 * Legacy's own first-page size for replies, and the reason it is `10` rather than the `20` posts
 * use: a reply is one line and a screen holds far more of them, but each carries a nested
 * child-reply list the backend expands inline. Twenty of those is a visibly slower first paint.
 */
export const REPLIES_PAGE_SIZE = 10

/** Legacy's own page size for the collection picker. */
export const COLLECTIONS_PAGE_SIZE = 10

/**
 * What a new reply hangs off.
 *
 * A discriminated union rather than two optional ids, so a caller cannot pass both, pass neither,
 * or pass a reply's id where a post's belongs — which is the mistake that turns into a 404 rather
 * than a type error, exactly as it did when replies were reacted to through the post endpoints.
 */
export type ReplyTarget =
    /** A top-level reply: `v1/posts/{id}/replies/`. */
    | { kind: 'post'; postId: string }
    /** An answer to a reply: `v1/posts/replies/{id}/child-replies/`. */
    | { kind: 'reply'; replyId: string }

/**
 * One uploaded image, in the shape `createReply` sends it.
 *
 * An **alias** of the post body's own `UploadedImage`, not a second declaration: legacy builds the
 * images array identically for a post and a comment, and two identical interfaces are two places
 * for the dimension spelling to drift. `w`/`h` are the natural pixel dimensions, measured in the
 * browser before the upload; `postImageSchema` reads both this spelling and `width`/`height` on the
 * way back.
 */
export type ReplyImage = UploadedImage

/**
 * Did the write land?
 *
 * `success: false` on a 2xx is the only thing that counts as "no". An **absent** flag is treated as
 * a yes, deliberately: the field is legacy's and no schema documents it, so a backend that stops
 * sending it must not silently turn every bookmark into a failure. The strict reading —
 * `success === true` — fails closed on a payload change nobody would notice until users did.
 */
function isSuccessBody(body: unknown): boolean {
    if (typeof body !== 'object' || body === null) return true
    const flag = (body as { success?: unknown }).success
    return flag === undefined || flag === true
}
