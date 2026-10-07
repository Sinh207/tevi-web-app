# Posts

**What a creator publishes into their space, and everything a reader does to it.** That covers the
card in every feed, the post page, the paywall and the Star it costs, replies, reactions,
bookmarks, collections, reporting and the composer. One feature, `features/post`, owns all of it.
Home, the space page, `/bookmarks` and the collection screens are **list owners** that mount its
card.

This document collects the reasoning spread across the feature's comments: what the card decides
on its own and what it hands up to the list, why the post page renders the anonymous body and then
replaces it, how a paid action is ordered so that Star never moves for nothing, and what is
deliberately not built. Each call site still carries the full argument for its own decision. This
is the map.

- **Code:** [`src/features/post/`](../src/features/post/). Its `index.ts` says what is exported and,
  more usefully, what is not.
- **Routes:** `(rail)/[slug]/post/[code]/`, `(rail)/bookmarks/`, `(rail)/[slug]/collections/[…]`,
  plus two hosts, [`app/post-composer-host.tsx`](../src/app/post-composer-host.tsx) and
  [`app/reply-dialog-host.tsx`](../src/app/reply-dialog-host.tsx).
- **Open questions:** **B105–B110** in [`BACKEND_QUESTIONS.md`](BACKEND_QUESTIONS.md) (§10).
- **Harness:** `/dev/post` (dev only, 404 in production).

---

## 1. Boundaries — who may import whom

**channel → post, never the reverse.** Post may import `auth`, `balance` (`useRequireStars`,
`balanceKeys`, `useCurrency`) and `share`, plus `@features/channel/routes` (which has no imports of
its own). It may not import `channel`, `mini-app`, `navigation`, `membership` or `premium`: each of
those already imports post, and a second edge would close a barrel cycle. ESM resolves a cycle by
handing one side a half-initialised module, which is an `undefined is not a function` at render
time, not a build error.

What the card needs from those features therefore arrives **from above**:

| Arrives as | Instead of | Why |
| --- | --- | --- |
| `isPremiumReader` prop | `useMyChannel()` | post → channel is a cycle. Premium readers are exempt from paid interaction |
| `author` prop (`ReplyComposerAuthor`) | the reader's own space from `channel` | the same cycle |
| `onOpenMiniApp(app)` | `useMiniApp().open` | post → mini-app → channel → post. Without the callback the banner is not drawn |
| `onOpenMedia(target)` | the card's own viewer | one viewer per **list**, so it can page between posts (§4.4) |
| `onShare()` | a `ShareDialog` per card | one sheet per list |
| `onChanged()` | each card refetching its list | the list owns its own query |
| `onAuthorBlocked(channelId)` | folding into `onChanged` | a pin also fires `onChanged`, and a list must not hide a space because someone pinned a post |

`app/(web)/(main)/(rail)/[slug]/post/[code]/post-detail-screen.tsx` is the client boundary that reads
those values for the post page. Its header warns against "simplifying" it away: doing so is a
runtime failure, not a type error.

**`lib/reply-author.ts` is a type-only module, on purpose.** Re-exporting the type through the
`'use client'` `reply-composer` put that component in the server graph, and the post route 404'd.

**The barrel is narrow.** `index.ts` does not export `PostMenu`, `PostReportDialog`,
`PostUnlockDialogs`, `PostNsfwGuard` or `PostMediaLightbox`. A consumer that could mount one of them
separately could mount it *without* the state that drives it. Three sanctioned side barrels:
`routes.ts` (paths only, no imports, because navigation → post → the card's menu → navigation),
`server.ts` (`getPostForRequest`, `server-only`) and `dev.ts` (the harness and its fixtures).

---

## 2. The API

Three clients in [`api/post-api.ts`](../src/features/post/api/post-api.ts): `core`, `billy` (purchases)
and `search` (the *Add posts* candidates only). The **post paths are `v1`**, because legacy's
`PostModel` pins `VERSION = 'v1'` and every path is one legacy calls today. Do not "modernise" the
prefix.

| Method + path | What |
| --- | --- |
| GET `v1/posts/{id}/` | the post (404 → `null`, an answer rather than an error) |
| PATCH `v1/posts/{id}/` | `{ pinned }`, and separately `{ reply_allowed }` |
| DELETE `v1/posts/{id}/` | delete |
| POST `v1/posts/{id}/reaction/` · DELETE `…/reaction-delete/` | react `{ type: 'LIKE' }` / take it back |
| POST `v1/posts/bookmark/` · DELETE `v1/posts/{id}/bookmark/` | bookmark `{ post_id }` / remove |
| GET `v1/posts/bookmark/` · DELETE `v1/posts/bookmark/all/` | the list / clear all |
| POST `billy/v1/ecom/purchase/` | unlock `{ product_id }`, **or** an interaction charge `{ product_id, price_id, quantity: cost, metadata.beneficial_channel_id }` |
| POST `v3/channel/my-channel/threads/` | **create** a post. Do not "correct" it to `v1/posts/` |
| GET/POST `v1/posts/{id}/replies/` | replies |
| GET/POST `v1/posts/replies/{id}/child-replies/` | answers to a reply |
| POST/DELETE `v1/posts/replies/{id}/reaction[-delete]/` · DELETE `v1/posts/replies/{id}/` | reply reaction / delete |
| GET/POST `v1/posts/collections/` · GET/PATCH/DELETE `…/{id}/` | the owner's collections |
| GET `…/collections/{id}/posts/` · POST `…/add-posts/` · DELETE `…/remove-posts/` `{ post_ids }` | a collection's posts |
| POST `v1/posts/{id}/add-collections/` `{ collection_ids }` | file a post |
| GET `v3/channel/channels/{slug}/post-collections/[{id}/[posts/]]` | the **visitor's** view of a collection |
| GET `search/v2/{channel_id}/posts/?ignore_collection_id&type&q` | *Add posts* candidates |
| GET `v1/report/report/post/contents/` · POST `v1/report/report/posts/{id}/` | report reasons / file a report ([`post-report-api.ts`](../src/features/post/api/post-report-api.ts)) |

Things that look odd and are deliberate:

- **`quantity` carries the price** in an interaction charge. The products (`INTERACTION_PRODUCTS`) are
  hard-coded UUIDs (B107).
- **An absent `success` counts as success** (`isSuccessBody`). Only an explicit `false` on a 2xx is
  a refusal (B106).
- **`422 EC0001` means "not enough Star"** (`INSUFFICIENT_STARS_CODE`).
- **The bookmark add puts the id in the body and the remove puts it in the path.** Don't tidy it;
  that is the contract.
- **No write is retried.** A 502 on `ecom/purchase/` can arrive after the Star has left. Every write
  also threads the `accountId` captured **at the press**, so a write lands on the account that was
  active when the reader pressed. The one exception today is `postReportApi.reportPost`, which does
  not pass it (§11).

### 2.1 Parsing — [`api/types.ts`](../src/features/post/api/types.ts)

Zod `looseObject` with a per-field `.catch()`. `normalizePosts` **drops** a row that will not parse
and keeps the page. The feed is the highest-volume payload in the product, and one bad row should
cost that row. `normalizePost` returns `null`.

Three shapes that are easy to get silently wrong, each annotated in the schema:

- `verified_tick_badge` is an **object**, not a URL.
- `space_tier` is a **number**.
- `playback` is an **object** `{ dash, hls, url }`, though a bare string is accepted too. An object is
  always truthy, so **ask `videoSrc(video)`, never `video.playback`**, whether a post has a clip.

`quoted_post` is parsed one level deep (`postCoreShape` is split out to stop the recursion).
`_insights` is present for the author only.

**A reply is not a post** ([`api/reply-types.ts`](../src/features/post/api/reply-types.ts)). It has
`owner_channel` (who wrote it) and `post_channel` (whose post it is under), `parent_id`, and no
`is_owner`. The table at the top of that file lists every difference. Ownership is `isOwnReply`:
`owner.id` compared with `/me`'s id, which B11 settled are the same id space.

---

## 3. Server state

**Every key is under `['post']` and carries `accountId ?? 'anon'`.** A post is viewer-relative in
nine fields (locked, purchased, reacted, bookmarked, can reply, …). Nothing in this feature may ever
be given `cache: { shared: true }`. The **one** persisted, shared key is the report reasons
(`persist + shared`, one day), which are the same for everybody.

**Owner and visitor collection data are separate keys.** A reader's copy must never be the entry a
rename lands in.

### 3.1 The post page reads twice, and that is the design

[`post-server-api.ts`](../src/features/post/api/post-server-api.ts): `getPostForRequest` runs on the
server, wrapped in `cache()` so the metadata and the body share one fetch. It goes to the in-cluster
API with `unwrapEnvelope` and `revalidate: 60`. It has no bearer, so it is the **anonymous** view.

`usePostDetail` hands that body to the client query as **`placeholderData`, never `initialData`**.
`initialData` would *cache* the anonymous body under the reader's account key, and a post the reader
has unlocked would render locked until the next refetch. As a placeholder it paints immediately and
is replaced by the reader's own copy.

A 200 that will not parse is `unavailable`, not `gone`. An outage must never look like a deletion.

`/bookmarks` and the collection screens render nothing on the server: there is no SSR bearer, and
both lists are the reader's own.

### 3.2 Writes — optimistic or not

| Write | Style | Why |
| --- | --- | --- |
| React, react to a reply | **optimistic**, rollback on failure | local `useState`, re-seeded when `post.id` changes. No cache surgery: the lists belong to other features |
| Pin | optimistic | the menu's Pin / Unpin label flips at once; where the post *sits* moves on the refetch (§8.1) |
| Bookmark | **confirm, then flip** | "a bookmark is a promise" |
| Reply allowed, delete, block | not optimistic | |

- **A double press is blocked by an `inFlight` ref, not `isPending`**, which is what stops a second
  charge.
- **Delete never splices** the post out of a list. It comes back from the refetch as a tombstone
  (`deleted: true`).
- Most writes invalidate `postKeys.all`, plus `balanceKeys.all` whenever Star moved.
- **A write on the post page refetches both the post and its replies** (`threadChanged` in
  `PostDetailView`). They used to be two callbacks, and deleting a reply left the card's
  `reply_count` stale while the reader was looking at it. `post-detail-view.test.tsx` pins it.
- Collection writes invalidate the list, the detail and the posts; a collection delete uses
  `removeQueries`. Adding posts also invalidates `['post', 'collection-candidates', id]`.

---

## 4. The card — [`components/post-card.tsx`](../src/features/post/components/post-card.tsx)

### 4.1 What it shows — [`lib/post-access.ts`](../src/features/post/lib/post-access.ts)

- **The gate** is `postGate`: `open | members | purchase | members-or-purchase`, from `product_id`
  and `required_packages`.
- **Locked** is `gated && viewer === 'STARGAZERS' && need_unlock_package`. `need_unlock_package`
  describes the **post**, not the reader, and stays true after a purchase (B105). That is why
  `viewer` is part of the test. Mixing the two up is the bug that showed a paying member the lock
  screen.
- **Purchased** is `!is_owner && gated && !locked`. It is only ever said of a gated post, and never
  of the author's own: the author is not locked out, which is exactly the shape a purchase has, so
  without `!is_owner` every paid post in their own space read *Purchased* (legacy's
  `isPurchasedPost` opens with `!isMyPost`).
- **The display order is `deleted → locked → nsfw → body`, and the order is the point.** A locked
  post has no media to blur, so the NSFW cover never sits on top of a paywall.

`PostNsfwGuard` covers each **media block**, not the whole post, so the caption stays readable. When
it saves the reader's choice it must send the **whole** `nsfw_settings` object, because the backend
replaces it (B81).

### 4.2 Navigation

- **A real `<Link>` wraps the text only**, for crawlers, middle-click and screen readers. Its
  `onClick` calls `preventDefault`, so a press on the text navigates once (through the card's
  handler) and not twice.
- **The card's own click is a pointer convenience.** `shouldNavigate` is an allowlist of things a
  press does *not* mean "open": `a, button, input, select, textarea, video, label,
  [role=menuitem], [role=dialog], [data-no-navigate]`, and a non-empty text selection. The portal
  entries are there because React events bubble through portals, so a press inside an open menu
  reaches the card.
- `postHref` is `null` when there is no `shareable_url`, when the post is deleted, or with
  `disableDetail` (the post page itself).

### 4.3 Media

**Images** ([`post-image-gallery.tsx`](../src/features/post/components/post-image-gallery.tsx)) are a
native `overflow-x` + `snap-x` row, not a carousel engine (`DESIGN_SYSTEM.md` §10). One height per
context: 260/310 in a feed, 200/300 in the composer, 160/240 in the reply box. **A single image also
goes in the row.** A full-width branch made a portrait photo 612×816. Slides are keyed by index,
because the same URL can appear twice.

**A clip in the feed** (`PostVideoTile`):

- Its aspect comes from `detectVideoAspectRatio`, which is Android's ten-bucket table with clamps.
- Its height is capped at `VIDEO_MAX_HEIGHT = 480` **through its width** (`maxWidth = 480 × ratio`,
  sitting at the leading edge). Capping the height directly cropped the frame.

**Autoplay** follows iOS's rules ([`lib/video-autoplay.ts`](../src/features/post/lib/video-autoplay.ts)):

- clips of 60s or less only (legacy allowed 180);
- never a locked or NSFW post;
- always muted;
- one clip at a time: the one under the 1/3 mark of the window, else the one under 2/3.

iOS plays on Wi-Fi only. The web cannot know that, so the rule becomes a **veto**: `saveData`, a
`cellular` connection or 2G refuse, and silence allows. That is a deliberate divergence.

[`hooks/use-video-autoplay.ts`](../src/features/post/hooks/use-video-autoplay.ts) is a module-level
registry read through `useSyncExternalStore`, throttled to 500ms with a trailing call:

- **The scroll listener is capture-phase.** The post page scrolls inside its own element from `md`
  up (§6), and a scroll event does not bubble.
- **Players are keyed by `useId`, not `post.id`.** Keying by post id played two videos when the same
  post was on screen twice; the harness found it.
- `prefers-reduced-motion` turns autoplay off (`useMayAnimate`).

**The lightbox** ([`post-media-lightbox.tsx`](../src/features/post/components/post-media-lightbox.tsx))
is a `z-50` portal with Esc and the arrow keys. It restores the page's previous `overflow` when it
closes. For video it asks `canPlayType` first: an HLS manifest where the browser has HLS, otherwise
the progressive mp4 (iOS's `backupAsset`, decided before the first frame instead of after a stall),
otherwise a message saying the clip cannot be played here. **There is no HLS engine** (hls.js)
by design; `hlsSupported` is the seam for one.

### 4.4 The slider — one viewer per list

A press on media is handed **up** (`onOpenMedia`) to whoever owns the list: home, the space's thread
list, `/bookmarks`, a collection. The list mounts one `PostSlider` that pages between **posts**. A
card on its own, with no `onOpenMedia`, keeps its own lightbox.

[`hooks/use-post-slider.ts`](../src/features/post/hooks/use-post-slider.ts):

- `sliderMedia` classifies each post. A clip outranks pictures. A locked post is classed from
  `unlock_detail`. Text-only and deleted posts are excluded; including them was a black screen.
- **What you pressed decides the list.** A press on a picture pages through pictures, a press on a
  clip through clips. `mixed` (`'all'`) is for the space's media grid only.
- The post that was pressed is always in the list, and the index clamps if the list shrinks under it.

[`post-slider.tsx`](../src/features/post/components/post-slider.tsx) is a vertical scroll-snap
column whose index is read from `scrollTop`. Only the slides at ±1 carry media. A clip's caption is
in flow rather than overlaid, because the native controls sit there. The picture strip is horizontal
snap; its arrows are desktop-only and hide at the ends.

### 4.5 Actions, the menu, reactions

- **Comment opens the reply popup** (§5.2), except on the post page, where the composer is already
  on screen.
- **The reaction is a Lottie star** (`/lotties/icon-star-reactions.json`). Frame 0 means not
  reacted and frame 60 means reacted. A press plays `[0, 60]` or `[60, 0]`, and the first paint
  never animates, so a feed scrolling into view does not play twenty animations at once. The player
  is shared with the reply row. `LottieAnimation` fetches each file **once per URL** and builds the
  players in time slices; the header of `shared/components/lottie-animation.tsx` has the
  measurements.
- **Pin asks first, Unpin does not.** A space has one pinned post, so *Pin* always confirms
  "Replace current pin?" (legacy's `MenuItemPinPost`); *Unpin* replaces nothing.
- **The menu's owner and stranger sets are disjoint** (`postMenuVisibility`). The owner gets pin,
  *who can reply*, delete (and edit, once it exists). A stranger gets report (behind the kill switch
  below) and block. A deleted post gets nothing. Block is keyed by `owner_id` (a user id) and is
  offered only when it is present. Delete and block are confirmed.
- **Report** loads its reasons only while open. "Report and block" lets the caller own the block.
  The whole entry is behind the remote-config kill switch `report.post.isActive`, which fails closed.
- **Zero counts are drawn.** Timestamps are absolute and 24-hour (`post-format.ts`).
- **The promote card opens the program's mini app in this tab.** A program is a mini app, and its
  referral link is a Tevi page (the program's space), so `PostAffiliateCard` makes it a client-side
  `<Link>` (`teviPath`, now in `shared/lib/tevi-path.ts`). The space opens its app on arrival. The
  link's query must survive: `utm_campaign` is read off the page URL and credits the promoter, which
  is why the app is not opened in place over the feed. Any other host keeps legacy's vetted new tab.

---

## 5. Paid posts and paid interaction

### 5.1 Unlocking

`postIntent` decides what the lock panel offers: `become-a-member | purchase | choose | none`.
`postUnlockPrice` refuses 0 and `null`.

[`hooks/use-post-unlock.ts`](../src/features/post/hooks/use-post-unlock.ts):

- **Becoming a member only navigates**, to the space's membership deep link
  (`channelActionPath(slug, 'become_a_member')` from `@features/channel/routes`). The checkout belongs
  to `features/membership`.
- **A purchase is always confirmed**: Star is money. `requireStars(price, open)` gates the press, so
  a reader who is short is offered Star first.
- **`422 EC0001`** emits `payment:star-purchase-requested` with the **whole** price. The client's idea
  of the balance was what was wrong, so the shortfall it computed cannot be trusted. The error toast
  still fires. The event bus stands in for an import here because `payment` imports `balance` and
  the reverse would close a cycle (`CLAUDE.md`, event bus).
- `PostUnlockDialogs` renders nothing without a price. Legacy's `NotEnoughStars` dialog is dropped
  because `useRequireStars` replaces it.

### 5.2 Paid interaction (comments and reactions that cost Star)

- **`replyCost` is `null` for the post's owner and for a Premium reader.** `replyReactionCost` has
  four exemptions. A reply is priced and credited by **`post_channel`**, never `owner_channel`:
  the creator whose post it is gets paid, not the commenter.
- **Charge, then act.** A priced press with no channel id to credit **does nothing**. Acting for
  free would be the hole.
- **Nothing reverses a charge whose action then failed** (B107). That is the backend's to answer.
- **No price chips.** iOS and Android retired them from the action row, so the web did too. The only
  price shown is on the reply's submit button (`post_reply_submit_priced`), and only when it is
  more than 1.

---

## 6. The post page — `(rail)/[slug]/post/[code]/`

**From `md` up the page owns its scroll; below `md` it does not.** On a desktop the bar stays put
and the thread scrolls under it: `<main>` is exactly one viewport tall with `overflow-hidden`, and the
wrapper below it is the scroller (`md:min-h-0 md:overflow-y-auto`). On a phone it stays document
scroll. An inner scroller under a virtual keyboard traps the composer, and legacy and both native
clients scroll the page on a phone too. `page.tsx` explains `md:flex-none` and `min-h-0`, both
measured.

**The thread stack is `flex: 1 0 auto`, and the basis is what matters.** `flex-1 shrink-0` looked
equivalent and was not: a `0%` basis made the stack exactly as tall as the viewport, and
`overflow-hidden` clipped the rest. A 3696px thread sat in a 740px box and the wheel did nothing.
An `auto` basis starts from the content.

**The composer sits between the post and its replies**, not pinned to the bottom.

**The replies are render-windowed inside `RepliesSection`**, with a memoised row. The window moves
its span every time a reply crosses the viewport edge. From the top of the page that move
re-rendered the post's own card and the composer; down here it re-renders only the rows whose
height changed.

### 6.1 Replies

- **Two levels only.** Answers go to the top-level reply. Child replies load lazily
  (`enabled: open`), and *Load more* under a thread is a button, not a sentinel.
- **The reply box renders for a guest**, and the press is the gate. When the reader may not reply,
  the box is replaced by the *Who can reply?* panel. Six audiences. When the field is absent the
  default is **followers**, measured on 18 of 20 posts. `'everyone'` only ever means "the field was
  absent".
- `mayReply` adds iOS's followers shortcut (`channel.is_followed`) on top of `can_reply`. The
  paid-users half of that shortcut is not ported, because it would need `membership` (a cycle).
- **Answering your own comment is free.**
- Enter sends, with an `isComposing` guard for Vietnamese and CJK input. The character limit is the
  remote console's (500 when unconfigured).
- **Sending is charge → upload → create** (`useCreateReply`). Uploads are sequential. A picture that
  fails to upload is **dropped** and the reply is still sent.
- **The reply menu has Delete only**, for the reply's author or the post's owner. There is no reply
  report: the reply report endpoints are not built.

### 6.2 SEO — [`lib/post-seo.ts`](../src/features/post/lib/post-seo.ts)

- **Posts are `noindex, follow`.** Spaces are the only pages Tevi wants ranking. A post page is
  server-rendered for the first paint and for link-preview scrapers.
- **The title is legacy's format**, `${snippet} - Name (@slug) | Tevi`, set as `absolute` so the root
  template does not append `· Tevi`. Snippets are cut at code points, never inside an emoji. A gated
  post's description is the "Exclusive content…" sentence, not its text.
- **The canonical path** is the *path* of `shareable_url`, else `/@{slug}/post/{code}`. A request on a
  different spelling is redirected to it with `permanentRedirect`. Because every document streams
  (see the soft-404 note in `CLAUDE.md`), that redirect arrives as a meta refresh, not a 308.
- **`mayRenderForCrawler`** is: not deleted, not NSFW, not in an NSFW space. A post that fails it gets
  a generic, `noindex, nofollow` title, and its body is withheld from the server render.
- **A missing post is not `notFound()`.** That would be a soft 404 anyway. The page renders a "no
  longer available" notice, which is the honest answer for a post deleted after the link was shared.
- `resolvePostFetchStatus`: 404 → gone, 422 → restricted, anything else → unavailable.

---

## 7. The composer, and why it has a host

**The dialog is mounted once, by a host in `app/`**
([`post-composer-host.tsx`](../src/app/post-composer-host.tsx), in `session-providers.tsx`). Two
reasons:

- it has several openers: the rail's `+` and the tab bar's FAB (**both** in the DOM, one per
  breakpoint), the *What's new?* bar at the top of home and of the owner's Posts tab
  (`WhatsNewBar` in `features/channel`, because it reads `useMyChannel`), and a collection's
  *Create post*. Mounting the dialog beside each would mean several dialogs fighting over focus;
- the author's identity, Premium state, upload benefits and membership tiers come from features
  that `post` may not import.

An opener writes to `composer-store` (`isOpen`, plus a preset of collection ids when opened from a
collection). `reply-dialog-host.tsx` is the same arrangement for the reply popup, whose store holds
the **post**, not an id. A visit that opens neither costs one store subscription each.

[`post-composer-dialog.tsx`](../src/features/post/components/post-composer-dialog.tsx):

- A sheet from the bottom at content height (a deliberate departure from legacy's full screen).
- **The draft is component state and is reset on close.** Closing is refused while a publish is
  pending.
- One picker for both kinds. A video wins, and the button is hidden once a clip is attached (iOS).
- Six stacked dialogs (four settings, preview, trimmer). `post-composer-dialogs.tsx` explains why they
  are popups rather than screens inside the sheet.
- **The trimmer** is `shared/components/video-trimmer`, dynamically imported because it brings a
  24 MB ffmpeg WASM build. It is hidden below `md` as **a proxy for capability**, not for layout. A
  trim is a stream copy, so it keeps the codec, the poster and the dimensions.
- **Preview** builds the post through `normalizePost` with `is_owner: false`, so the author sees what
  a reader sees. The NSFW cover is not applied.

**Limits** (`postDraftProblem`, [`lib/post-draft.ts`](../src/features/post/lib/post-draft.ts)):

- empty, or over the console's `characterLimit`;
- more than 10 images;
- video duration, size and long-edge resolution;
- a price below the floor or above the cap.

The duration and size ceilings come from the Premium benefit `enhanced-storage-upload`
(`uploadLimitsFromBenefits`, free vs premium columns, minutes converted to seconds). The resolution
ceiling comes from remote config `video.resolution_max`. The price floor is `minimum_price_tvs` from
the permission grant, and the cap is `STAR_PRICE_MAX = 1e6`.

**Publishing** (`useCreatePost`): images → video → cover → body → `add-collections`.

- **A failed image upload is fatal** (a divergence from legacy).
- **A failed filing into collections is swallowed** (B110). The post exists, and that matters more.
- The cover is sent only for a paid video post.

**The body** (`buildPostBody`) follows the table at the top of `post-draft.ts`, which records every
place it differs from legacy and why:

- `text`, never `html_text`;
- `video: { id }`;
- `lang` is the reader's two-letter locale;
- an empty paywall publishes as `EVERYONE` (`isPaywalled`);
- no `paid_interaction`;
- no `hidden_links`;
- `viewer` upper-case.

---

## 8. Bookmarks and collections

### 8.1 First: the pinned post

Not a bookmark, but the other way a post is lifted out of its list. A space's thread list asks for
`pinned: 0`, and the pinned post comes from a **separate** request, `pinned: 1`
(`channelApi.getPinnedThreads`, `usePinnedThreads`). `ChannelThreadList` draws it above the list
under a thumbtack and *Pinned* heading, with no top padding on the card, which is legacy's
`PostPinned`. The card itself draws **no** pin marker: the heading is the marker.

- Excluding the pin from the list without fetching it was how a pinned post used to vanish from its
  own space.
- Any write from either block refetches **both**: pinning moves a post between them and pushes the
  previous pin back into the list.
- The tab waits for both requests before it draws, so a pin landing late cannot push the list down.
- Posts tab only. The media grid does not lift a pin out, as in legacy.

### 8.2 Bookmarks and collections

**`/bookmarks`** ([`bookmark-list.tsx`](../src/features/post/components/bookmark-list.tsx)):
render-windowed (`minimum: 10`). *Clear all* is a button in the bar that reads the same query. The
page is `noindex, nofollow`. `usePostBookmark` does not invalidate `postKeys.bookmarks`; the list
relies on the card's `onChanged` refetch.

**Collections:**

- Owner screen `/@{slug}/collections`. `useCollectionOwnership` answers `owner | viewer | unknown`.
  A visitor sees "not yours", because the `v1` list is account-scoped.
- **A collection reads `v1` for its owner and `v3` for a visitor.** `unknown` asks nothing until
  ownership is known (`use-collection-posts.test.tsx`).
- The owner's menu: Edit (rename, and remove posts on *Done*), Create post (opens the composer with
  this collection preset), Add posts, Delete.
- At most 10 collections; a name of at most 25 characters.
- `SpaceCollectionsRow` on the space page gates a guest at the press. `CollectionScreenHeader` is not
  `PageBackBar`, because navigation imports post.
- Legacy's `add-all-posts/` is not ported.

---

## 9. Deliberate divergences from legacy

There are some four hundred "legacy" mentions in the feature; these are the ones that change what
a reader or the backend sees.

- `html_text` is never rendered. The card draws `text`, `whitespace-pre-wrap`, unclamped.
- A failed image upload fails the publish.
- An empty paywall publishes as `EVERYONE`. The create body carries no `paid_interaction` and sends
  the reader's `lang`.
- No price chips on the action row.
- Autoplay: a connection veto instead of Wi-Fi only, and a 60s cap instead of 180.
- Video aspect from Android's table; a single image goes in the gallery row.
- An NSFW tile in the media grid navigates to the post.
- Membership opens a page, not a modal. A guest still sees the reply box.
- Zero counts are drawn; timestamps are absolute and 24-hour.
- The composer is a bottom sheet; *Edit video* is hidden below `md`.
- The quote in the reply popup is not interactive.
- The `PAID_USERS` audience label is split into unlock and join, as on iOS.
- A deleted reply leaves a tombstone row.

---

## 10. Backend questions

| | About | Still open |
| --- | --- | --- |
| **B105** | the post payload | can `price` be 0; is `viewer` a closed set; is `need_unlock_package` post-scoped by design; `_insights` currency; the `promote` fields; the mini-app trio |
| **B106** | bookmark `success` | can it be `false` on a 2xx; is it always present |
| **B107** | the paid-interaction charge | is `quantity` the cost; are the product UUIDs the same across environments; who reverses a half-finished charge; is `EC0001` stable |
| **B108** | post report | is an empty `description` accepted; are reason ids `POST_`-prefixed; is a device-wide reason cache acceptable |
| **B109** | replies | `lang`, `html_text`, the image ceiling, what a delete leaves, how fast `can_reply` moves, a closed `reply_allowed_user` set, `can_reply: false` with no reason, who may delete, the upload path (→ B104), `reply_allowed_link` |
| **B110** | creating a post | `video.thumbnail`, `paid_interaction`, an empty paywall, `hidden_links`, `html_text`, `lang`, `codec: null` on `video/upload-url/` |

Related: **B11** (closed, reply ownership), **B13** (the `next` cursor's host), **B75** (report reason
types), **B81** (`nsfw_settings` is replaced, not merged), **B97** (minting a share link), **B104**
(the upload key), **B113** (sharing a post into a DM, see [`MESSAGE.md`](MESSAGE.md)).

B109's `lang` bullet still says the client sends `'en'`. It no longer does (B110 #6); the entry
should be updated.

---

## 11. Not built, and known issues

**Not built:**

- Editing a post (`canEdit: false`).
- Quoting a post: the draft has `quotedPostId`, and the control is disabled behind a flag.
- The *Send message* button on a post (disabled).
- Reporting a reply.
- An HLS engine.
- The quote's inline video in the reply popup.
- The mini-app banner on the post page: `PostDetailView` passes no `onOpenMiniApp`, so the banner is
  not drawn there.
- Post JSON-LD. `PostLockPanel` carries a `tevi-paywall` class that an Article schema's
  `cssSelector` would point at, and `buildPostHeadline` is exported, but the page emits no
  structured data, so both are orphans today.

**Known issues**, found while writing this document and not yet fixed:

- **Feed and slider clips may not play outside Safari.** `PostVideoTile`
  (`post-card.tsx`) and `PostSlider` set `src` from `videoSrc()`, which prefers the HLS manifest,
  without the lightbox's `canPlayType` fallback to the mp4. A browser with no native HLS would be
  handed a manifest it cannot play. Check in Chrome and Firefox. The fix is to share the
  lightbox's source choice.
- **`postReportApi.reportPost` does not pass `accountId`**, so a report filed during an account
  switch can go out under the new account.
- **Stale comments** that now contradict the code:
  - `post-api.ts` (header) says reply reactions, reply deletion, child replies and the bookmark list
    are absent. All four exist.
  - `use-post-replies.ts` says "a reply is a post". `reply-types.ts` exists to say it is not.
  - `use-post-bookmark.ts` says the bookmark list "is not ported".
  - `post-actions.tsx`:
    - says Comment navigates; it opens the popup;
    - says both "zero is drawn" and "a zero renders nothing";
    - still mentions the Star cost chip.
  - `post-media-lightbox.tsx` says there is no paging between posts. `PostSlider` does it.
  - `post-settings-panel.tsx` and `post-collection-picker.tsx` say "this app's dialog draws one
    layer". `post-composer-dialogs.tsx` refutes that.
  - `reply-row.tsx` says the Reply button is missing. `ReplyThread` exists.
  - `post-composer-dialog.tsx`'s preset note implies the draft survives close. `onOpenChange` resets
    it.
  - `video-file.ts` refers to `post-video.ts`, which does not exist.
  - `post-access.ts` says "the composer, which does not exist yet".

---

## 12. Tests that pin the rules

All under `src/features/post/`.

| File | Pins |
| --- | --- |
| `api/types.test.ts` | bad fields degrade; `normalizePosts` drops rows; the badge is an object; one quoted level |
| `lib/post-access.test.ts` | gate, locked vs purchased, the display order |
| `lib/post-intent.test.ts` | the four intents; `PAID_USERS` case-insensitive; paywall before reply restriction; price on purchase and choose only |
| `lib/who-can-reply.test.ts`, `lib/reply-access.test.ts`, `lib/reply-draft.test.ts` | six audiences and the absent default; `isOwnReply` (B11) and the four exemptions; images-only replies allowed |
| `lib/post-draft.test.ts` | draft defaults, every problem, long-edge resolution, the `buildPostBody` divergence table |
| `lib/post-preview.test.ts` | media and caption withheld, blurred cover, `is_owner: false`, a playable clip |
| `lib/post-seo.test.ts`, `lib/post-link.test.ts` | title format, code points, gated description, canonical from the path; path-only links, tombstone and disabled → `null` |
| `lib/post-media.test.ts`, `lib/video-autoplay.test.ts`, `lib/upload-limits.test.ts`, `lib/post-format.test.ts` | ratio spellings and media kind; the 60s bound, the veto, the thirds; minutes → seconds; absolute 24-hour time |
| `hooks/use-post-reaction.test.tsx` | optimism, the account at the press, rollback, count floor of 0, double press, charge before react, short of Star |
| `hooks/use-reply-reaction.test.tsx`, `hooks/use-create-reply.test.tsx` | reply endpoints and crediting `post_channel`; charge then write, indexed upload keys, a dropped picture, a guest |
| `hooks/use-post-bookmark.test.tsx` | confirm-then-flip, body vs path ids, `success: false` |
| `hooks/use-post-slider.test.tsx` | the media lists, the anchor post, clamp and close |
| `hooks/use-collection-posts.test.tsx` | owner vs visitor endpoints; `unknown` asks nothing |
| `components/post-detail-view.test.tsx` | a delete refetches the post and the replies |
| `components/post-image-gallery.test.tsx`, `components/post-media-tile.test.tsx` | duplicate URLs, a single image in the row; the media tile's paths (lightbox vs hand-up, guest, unlock, NSFW → page, modifier keys) |
| `components/bookmark-list.test.tsx`, `store/composer-store.test.ts` | windowing; the preset lifecycle |

---

## 13. Working on it

- **`/dev/post`** is a catalogue grouped by what the card decides: identity, body, paywall, sensitive,
  interaction, menu, attachments, navigation. Writes are **real**, against the API with the
  signed-in account. Fixtures (`prod-1`, …) are built to make a purchase fail, which exercises the
  [`API_ERRORS.md`](API_ERRORS.md) path. `onShare` and `onOpenMiniApp` are stubbed. Every fixture goes
  through `normalizePost`. The harness found the two-videos autoplay bug and the disabled Comment on
  every post with no `shareable_url`.
- **Adding a field:** add it to the schema with a `.catch()`. If it is viewer-relative, it is one
  more reason no key here may be shared.
- **Adding a paid action:** charge, then act; do nothing when there is no channel to credit; block a
  double press with a ref; never retry. Credit `post_channel`.
- **Adding a list that shows posts:** own the viewer (`onOpenMedia`), the share sheet (`onShare`) and
  the refetch (`onChanged`). Render-window it with `useRenderWindow`, and memoise the row with stable
  callbacks, as `home-post-feed.tsx` and `channel-thread-list.tsx` do.
