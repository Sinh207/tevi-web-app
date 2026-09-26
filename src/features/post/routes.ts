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
