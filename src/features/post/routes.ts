/**
 * `features/post`'s paths, and nothing else — **no imports of its own**.
 *
 * One of the four narrow barrels `CLAUDE.md` sanctions. `features/navigation`'s `menu-rows.ts` is a
 * data module the account drawer reads, and routing its link through `index.ts` would close a cycle
 * between two barrels: navigation → post → (the card's menu) → navigation. ESM resolves that by
 * handing one side a half-initialised module, which is an `undefined is not a function` at render
 * rather than a build error.
 *
 * So: `@features/post/routes`, never `@features/post`, for a consumer that wants only an address.
 */

/**
 * The reader's saved posts.
 *
 * Legacy's URL verbatim (`pages/bookmarks`) — the cutover is same-origin, so every link anybody has
 * kept resolves straight to the new screen. `bookmarks_title` is the row's label.
 */
export const BOOKMARKS_PATH = '/bookmarks'

/**
 * A creator's collections, and one of them.
 *
 * Legacy's URLs verbatim — `/@{slug}/collections/` and `/@{slug}/collections/{id}` — even though
 * the endpoint behind them is **account-scoped** and takes no slug (`v1/posts/collections/`). The
 * slug is the address, not the query: it is how a creator's own screens are spelled throughout the
 * product, and the cutover is same-origin, so anything anybody has linked resolves straight here.
 *
 * `slug` arrives with its `@` already on it — that is how the route segment is spelled and how
 * every caller holds it. Prefixed here when it is missing rather than trusted, because the two
 * spellings both exist in the wild and a `/collections` under a bare name is a 404.
 */
export function collectionsHref(slug: string): string {
    return `/${slug.startsWith('@') ? slug : `@${slug}`}/collections`
}

export function collectionHref(slug: string, collectionId: string): string {
    return `${collectionsHref(slug)}/${collectionId}`
}
