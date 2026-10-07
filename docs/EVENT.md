# The event page — what is built, what is deliberate, and what the player brings

`/@{slug}/event/{code}` — one live broadcast, as a page. This document holds the reasoning that has
no room at a call site: the two divergences from `web-app` that were chosen rather than inherited,
and the list of legacy behaviour that is **not** here, each with why and where it goes.

## The three screens, in legacy's own vocabulary

The event area is **not** two screens, and calling it two is what this document used to do. Legacy's
own directory layout settles it — `containers/event/layouts/` holds `detailsLayout/` and
`studioLayout/` side by side, and `components/` holds `creator/` beside `viewer/`:

| | legacy | here | state |
|---|---|---|---|
| **My event** | `components/creator/` | `EventHostScreen` + `/report` | built |
| **Live details** | `components/viewer/…/details/` | `EventScreen`'s viewer branch | built |
| **Live studio** | `components/viewer/…/liveView/` (113 files, 12,529 lines) | `EventStudioScreen` | **shell + refusals built; the player is not** |

The distinction matters because the studio's states were for a while described here as "ported".
They were not: `platform-restricted`, `locked` and `off-air` were **re-homed** onto Live details as
renderings of the watch panel. That was the right call for a client with no player — but it is a
different claim from having built the screen, and §6 is where the screen itself is now tracked.

Read it before changing anything under `src/features/event/`, and before "restoring" something from
legacy that looks missing.

---

## 1. Two pages behind one URL

`useEventOwnership` decides which. The bar, the column and the surfaces are shared — they are the
*page*; only the content below the bar differs. The age gate is **not** shared: it is the viewer's,
and only the studio's (§2a).

**A viewer:**

```
bar          back · "Live details"                    EventTopBar
─────────────────────────────────────────────────────────────────────
details      banner + access badge                    EventBanner
             status chip · title · schedule            EventDetailsCard
             share                                     EventActions
host         "Hosted by" → the space                  EventHostCard
watch        what this reader can do about it          EventWatchPanel  ← lib/watch-state.ts
description  what the creator wrote                   EventDescriptionCard
```

**The host** — a revenue report, in legacy's order (`creator/components/details`):

```
Live event               status · thumbnail · title · when it started   EventHostInfoCard
Revenue summary   →      live + interactive accordions                  EventRevenueSummary
                         links to /report                                eventReportPath()
Maintenance fee details  the rate, and how many periods were charged     EventMaintenanceFeeCard
Live analytics           live id · type · start · peak CCU · durations   EventLiveAnalyticsCard
New members              +N, when there is a summary                     EventNewMembersCard
Description              what the creator wrote
Total revenue            sticky at the foot                              EventTotalRevenueCard
```

Two things in that order look like mistakes and are not: **Description sits between the analytics
and the total**, and **Total revenue is last and sticky** — it is the figure the report exists to
produce, so it stays on screen while the reader scrolls the rows that justify it.

The host's data is three endpoints on **three services** (`api/event-report-api.ts` has the table
and the warning about which of the money services answers what), read as **two parallel queries**
plus one per order tab. Legacy awaits the first two in sequence behind a single `isLoading`, so a
failure of either hides the other's data.

A host gets **no watch panel, no access badge, no paywall and no share row** — they cannot buy a
ticket to their own broadcast. The one thing they lose relative to legacy is the *Edit* / *Get QR
code* / *Cancel* menu, which legacy hangs off the **Live tab's** row rather than this page;
`features/channel`'s `ChannelEventMenu` already ports it there.

### Report details is a **third** screen, at its own URL

`/@{slug}/event/{code}/report` — every ticket, gift and interactive game bought during the broadcast,
in three tabs with a name filter.

Legacy opens it in a `ResponsiveModal`: a popup on a desktop, a full-page sheet on a phone. Both were
approximating a page, and this port started as a dialog at every width. The content is a scrollable
table of up to fifty rows with its own tab state and its own search — a screen's worth of interaction
to put behind an overlay. As a route it gets the browser's own **back**, survives a refresh, and has
a `loading.tsx` instead of a spinner inside a popup; it also drops the two things the popup forced, a
`max-h-[85dvh]` cap and an internal scrollport.

Owner-only, and the client decides only **what to render**: all three endpoints answer for the bearer
about an event the bearer must own, so a stranger who forced them gets a 403. A non-host is
`replace`d to the event page rather than shown a wall — there is a real page for them one level up.
`noindex, nofollow`, and deliberately not disallowed in `robots.ts` (a disallowed URL is never
fetched, so the directive is never read).

⚠ `liveAccess`'s `purchased`-after-membership ordering matters on **both** branches — a host's own
stream comes back `purchased: true`, and the wrong order blanked the badge on it.

One endpoint feeds all of it — `GET core/v4/public/events/{code}/` — read twice: once on the server
with no bearer (metadata, the JSON-LD, the first paint) and once in the browser as the reader
(`purchased`, `need_unlock_package`). The second is the only one anything may be authorised from;
`api/event-server-api.ts` says why at length.

The **access rule** lives at the feature root in `access.ts`, imports nothing, and is read by
`features/channel` as well — the space's Live tab card, the Live-now strip and the Following row all
draw the same badge. Two copies of a rule that decides whether somebody is asked for money is the
failure that arrangement prevents; its own doc records the bug the divergence produces, which is a
price tag printed over a free stream.

**The watch panel is one pure decision plus six renderings.** `lib/watch-state.ts` owns the order and
states why each step is where it is. Legacy has the same six as early returns inside a component,
where the *order* is the behaviour and nothing writes it down.

---

## 2. Three deliberate divergences from `web-app`

Everywhere else this feature is a port: the copy, the geometry, the status vocabulary and the
purchase confirmation are all legacy's. Two things are not, and both were chosen for a stated
reason rather than drifted into.

### 2a. The age gate is asked in front of the player, and nowhere else

Legacy raises *Age-Restricted Content* **inside its live view only** — `LiveView`, rendered for
`matchUpMd && isLive`, with its `isEnded` branch ahead of the age check. Below `md`, and on any
status but live, legacy shows the details page and asks nothing. This port does the same:
`useAgeGate` is `required` only for an 18+ stream that is live **and** in the studio, and
`EventAgeGate` is drawn in one place — centred in `EventStudioShell`, so no preview is spent, no
stream requested and no room joined before the reader agrees.

This was once a deliberate divergence — the gate *was* the page, on every status, on the argument
that the banner and the description are the material and gating the player alone protects nothing.
It was narrowed to live streams first, and then out of Live details altogether, because of what it
did on a phone: *Yes, I'm over 18*, then *"Live isn't available on mobile web"*. A confirmation that
unlocks nothing is not a gate, it is a step. If the poster ever does need withholding, that is a
product decision to make for the details page as a whole — not a side-effect of the player's gate.

**It is not `features/nsfw`, and the two must not be merged.** That feature answers a question about
a **space** — `channel.is_nsfw` *and* the account's `nsfw_settings.show_sensitive`, both of which
have to hold, which is why it has two faces and offers to change a setting. This answers a question
about **one broadcast**: a creator flagged it, no account setting overrides it, and agreeing to
Friday's 18+ stream is not agreeing to Saturday's family one. Different question, different consent
key, different store (`shared/lib/age-consent.ts` vs `nsfw-consent.ts`).

Two things about that store are worth knowing before touching it:

- **A guest may confirm, and their answer is not persisted.** An 18+ stream reached from a shared
  link must not become a sign-in wall, and legacy does not put one there either. Legacy *does* write
  the answer — to `` `${currentUser?.id}_age_restricted_confirmed_list` ``, which for a signed-out
  visitor is the literal key `undefined_age_restricted_confirmed_list`: a bucket every guest on that
  device inherits, so one person's confirmation silently answers for the next.
- **`AuthProvider.forgetAccount` erases it**, which is the whole reason the store is in `shared/`
  rather than in this feature — `features/auth` may not import `features/event`. Adding a new kind of
  per-account device state means adding its teardown there; miss it and nothing fails, the data
  simply stays.

### 2b. The paywall is offered even though this client cannot play the stream

A reader who unlocks here can watch in the app, so the purchase is not a sale of nothing — and
withholding it would take the creator's revenue off the whole web surface. What it must not do is
*imply* a web player: on success the panel becomes `watchable`, which says "watch in the app" and
hands over the QR.

The alternative — hide the price until the player ships — was rejected because the page would then
advertise a members-only stream with no way in.

Three guards make it honest rather than merely profitable, and all three are fail-**closed**:

- **No `product_id`, no button.** Legacy renders it anyway and posts `{ product_id: undefined }`.
- **No price above zero, no button.** Legacy's missing-price payload produces *Purchase access only
  0*.
- **The status is re-read immediately before the charge**, and a stream that has stopped is not
  charged for. Legacy does this too — and then closes the dialog silently, which reads as a broken
  button.

---

### 2c. Legacy's `Exclusive` / `Free` chip is not drawn

Recorded at `EventDetailsCard` and, until now, nowhere else — which is exactly how a section titled
*"Two deliberate divergences"* came to list a page that had three.

The chip sits on legacy's status row and is redundant three ways over: the access badge on the
banner **directly above** already names the gate and its price, `EventWatchPanel` below states it a
third time, and the chip's own condition is `isExclusive` — the tangled predicate
`@features/event/access` exists to replace, and which reads `true` for an ordinary free stream whose
payload omits `price`. Three labels for one fact, one of them wrong.

---

## 3. Not built, in the order a reader misses it

Nothing below is stubbed. A screen nothing can raise is worse than a missing one, which is why the
states legacy renders from data this client never fetches have no branch at all
(`lib/watch-state.ts` names them).

### R1 · The player, and everything inside a live room — **the big one**

Legacy's live session is ~12,000 lines across ~120 files, and none of it has an analogue here:

| | legacy | what it needs |
|---|---|---|
| video | `@byteplus/veplayer` + `v4/live/event/{code}/playback/` | a player SDK, not in `package.json` |
| co-hosts / seats | `agora-rtc-sdk-ng`, 5- and 8-seat portrait/landscape layouts, `v4/live/event/{code}/layout/` | Agora, and the layout vocabulary |
| chat | socket room, paid chat, pinned messages, muting, emoji picker | a **third** socket room (`CLAUDE.md`'s primitive 3) |
| gifts | `svgaplayerweb` animations, top contributors | **built** — see *Gifts* below |
| the sustained fee | 1 Star per 5 minutes, Premium exempt, remote-config driven | `useChargeStar`, and a Premium check |
| the free preview | `live/v1/streaming-events/{code}/preview/`, 3 previews per device per event, a 10s countdown | the streaming service, and a per-device counter |
| interactive games, product packages, invitations | `postMessage` mini-app surfaces inside the room | `features/mini-app`, already built, plus the room |

Three of legacy's states are **unknowable** to this client until parts of that land, and are therefore
absent by design: **geo-restricted** (code `E003`, from the *preview* endpoint), **kicked out** and
**banned from the channel** (both socket frames inside a session). **B114** asks whether the public
event endpoint can express the first on its own; if it can, the branch is small and
`lib/watch-state.ts` is where it goes.

### R2 · Report

A flag button beside Share, opening the **channel** report form. Not ported, and the reason is a
boundary rather than a product call: the form is `features/channel`'s `ChannelReportDialog`, it takes
a full `Channel` (44 fields; this payload sends a six-field projection), and reaching it would pull
the entire channel feature — profile, tabs, settings — into this page's bundle for one control.

The fix is on that side: the dialog wants a narrower barrel and a **target descriptor**, the shape
`MembershipTarget` and `DonationTarget` already have. Do that and the button is four lines here.

### R3 · Auto-follow — **built**

`ChannelAutoFollow` is exported and mounted on both screens, as legacy mounts `AutoFollowChannel`
on both: at the page's foot on Live details (`EventDetailsAutoFollow`), and 100px up the stage in
the studio (`placement="stage"`), where the gift banners lift to `bottom: 100px` to clear it for a
non-follower — legacy's `is_followed ? 12 : 100`. Both wait for `isViewerKnown`, because the space
body is seeded anonymously and says `is_followed: false` for everybody until the account's lands.

### R4 · The recommended-lives rail on the ended screen — **built**

`EventEndedRail` replaces the ended card when the reader follows channels that are live now, as
legacy's `ended/content` does: a 900px block, the headline in a rule, the lives, *Back to home*. A
scrolling row (`docs/DESIGN_SYSTEM.md` §10), not a carousel — legacy's Swiper at 3.5 slides is
several small items visible, not one per viewport. `useFollowedLives` gained `expanded` and
`enabled`, so the studio asks for the list only once the stream is off air.

### R5 · The rest of the channel top bar inside the studio

**Partly built** — see §6. `EventStudioChannelBar` draws the avatar, the name, the verified mark and
the follower count, and the whole plate is a link to the space (legacy's is not, and the studio
covers the site's own navigation, so it has to be).

What is missing is the three **controls**: Follow, Premium/Membership and the overflow menu. Follow
is the near one and it is blocked on something outside this feature — `features/channel` has no
follow *mutation* yet, only the follow-**requests** admin screens, so there is nothing to call. The
other two belong with R1: they are the room's chrome rather than the page's.

---

## 4. Built, with rough edges

### The host's report

Three things worth knowing about behaviour that **is** built:

- **Order lists do not paginate.** `page_size: 50`, no *load more* — legacy's own behaviour, and it
  has no design for more. A host with more than fifty ticket buyers on one broadcast sees the first
  fifty in both clients. The `count` the endpoint returns is deliberately unread.
- **Every figure is pinned to USD.** The payload carries a `currency` this client does not read, and
  legacy prints `$` throughout. `features/earnings` is in the same position and it is **B29**; when
  that is answered both become callers of `shared/lib/money.ts` rather than staying pinned.
- **"1 Star / 1 minutes"** is what the rate row prints when remote config says `1`. The string is
  legacy's (`[%s] Star / [%s] minutes`) and the plural is not handled in either client. Left at
  parity rather than fixed: pluralising it properly means `_one`/`_other` on three strings across
  nine locales — six forms in `ar` — for a value that is `5` in production and `1` only in the dev
  console. If it is fixed, the two explainer sentences have to move with it or the screen disagrees
  with its own help text.


## 5. Traps

- **`thumborSquareUrl` is transitively server-only** (it reads `serverEnv()`), and it looks like a
  pure string builder. Importing it into a client component compiles, type-checks, and then fails at
  dev-server time with a `server-only` trace three modules deep. It exists for the two sinks the
  image optimiser cannot serve — a PWA manifest icon and an `apple-touch-icon`. An avatar in a card
  is not one of them; use `next/image`. `event-host-card.tsx` carries the note.
- **`window.location.origin` must not be read during render.** The page is server-rendered, so a
  URL derived from it is `null` on the server and real in the browser — which put `disabled` on the
  Share button in the HTML and off after hydration, and React threw the server's markup away.
  Nothing else looked wrong. `event-actions.tsx` splits the decision (`canShare`, from payload
  fields both sides have) from the URL (built at the press).
- **The schedule is formatted in the reader's zone and declares the mismatch.** A start time is an
  appointment, so it cannot be pinned to UTC the way `formatJoinedDate` is — and this page is
  server-rendered, so the zone differs by construction. `EventSchedule` marks the element
  `suppressHydrationWarning` and pairs the text with a machine-readable `<time dateTime>`. Do not
  "fix" it by pinning a zone. The **description meta** is the opposite case and *is* pinned, and
  labelled `UTC`, because a scraper has no zone.
- **`Event` JSON-LD must not publish `price: 0` for an unknown price.** That is the machine-readable
  form of the "Unlock for 0 ⭐" bug, and this one is eligible for a rich result. `offers` is omitted
  entirely unless the price is known and the stream is not members-only.
- **`normalizeEvent` returning `null` means "this is not an event"**, never "one field was odd".
  Only `code` and `channel.slug` are required; everything else fails soft. The caller turns `null`
  into a 404, so a soft failure here would show somebody a broken-link page for a stream with no
  banner.
- **A 404 and a failed request are different screens.** `eventApi.getEvent` *rejects* on 404 rather
  than resolving to `null` so the two cannot be conflated. This URL ends up on posters; telling
  somebody their link is broken because a service blinked is a lie with a long tail.
- **⚠ Internal links are `next/link`. This feature shipped with bare `<a>` and it reloaded the app.**
  Five of them: *Revenue summary* → `/report`, the host card, an order row, the off-air *Back to …*
  and the age gate's decline. Each press was a full document load, so the root layout, the providers
  and `SessionProviders`' entire bootstrap — device fingerprint, `/me`, permissions, balance,
  my-channel — were torn down and rebuilt, for a route whose parent segment was already mounted.
  Measured on the host-card link, before and after: **1 full document load → 0**.
  What makes it easy to get wrong is that the reasoning *behind* the anchor is correct and written
  down — a link beats a `<button onClick={router.push}>` because it is middle-clickable, opens in a
  new tab, shows its target and reads as a link. `next/link` renders a real `<a>` and keeps all four,
  so there was never a trade-off; the bare element was just the wrong one. Bare `<a>` stays only
  where the destination genuinely leaves the app — `EventAppHandoff`'s deep link and store link.

- **A host whose own stream is `LIVE` gets a screen, not the report.** Legacy's creator branch is
  one thing at every status (`creator/index.js` renders `<Details/>` unconditionally), which is right
  afterwards — the report is a record — and answers the wrong question while the stream is running.
  A creator opening their own live event on a laptop wants to know whether they can see it, talk to
  the room or end it from there; the page said nothing, and a silent page reads as a broken one. So
  `EventHostLiveScreen` replaces the whole host branch while `isLive`, saying plainly that live video
  is not supported on the web and handing off to the app through the **viewer's** `EventAppHandoff`
  (the QR encodes the stream, so an installed app lands on the broadcast, not a store listing).
  It took four shapes, and the last constraint is the one that settled it: **the page must not
  scroll.** A card *above* the figures came first — overruled, because a page whose first block says
  "you cannot do anything here" and whose remaining five are a dashboard gives two answers to one
  question. Then a single centred wall, which threw away a payload carrying the banner, title,
  schedule and description, so a healthy broadcast rendered like an error state. Then the viewer's
  full page with one block swapped — right editorially, 1313px tall against a 900px window.
  It is now **two blocks**: legacy's own creator masthead (`EventHostInfoCard` — status chip, 123×64
  thumbnail, title, start time, **141px**) over the notice. The viewer's details card is 569 and
  cannot fit; the masthead shows the same banner art and the same facts in a quarter of the height,
  and draws no access pill at all — so the question of whether a creator might be shown *Unlock for
  250 ⭐* over their own banner does not arise. (`EventBanner`/`EventDetailsCard` took a
  `showAccess` prop for that and it stands, unused here: `liveAccess` already withholds the pill on
  `purchased`, but that is a backend flag standing between a creator and a price tag on their own
  broadcast.)
  **Share moves to the bar** on this state (`EventTopBar`'s new `actions` slot — `PageBackBar`'s note
  names that slot as the place for exactly this kind of control). The viewer's page keeps its own
  inside `EventDetailsCard` and must not grow a second, so the slot is filled by state, never
  unconditionally. It is a separate component rather than four inline lines because of the trap
  `EventActions` records: `window.location.origin` read during render is `null` on the server and a
  URL in the browser, which flipped `disabled` between the two and made React throw the server's
  markup away.
  ⚠ **Below `max-height: 819px` the masthead is hidden and the notice stands alone** — the stated
  fallback, done in CSS rather than by measuring `innerHeight`, which the server cannot know and
  which would flash on first paint. Measured across nine viewports: 900 / 844 / 820 draw both and
  fit; 800 / 768 / 700 / 667 drop the masthead and fit. The notice card takes `flex-1`, so it fills
  whatever is left rather than leaving page colour under it on a tall window. The floor is
  **650px** — set by the hand-off block (a 160px QR on its plate, the caption, the store pair), and
  measured unchanged when the panel's 48px icon disc was removed, which is why that removal is
  recorded as editorial rather than as fitting. No phone in portrait is
  under 667, so nothing this app is drawn on reaches it; chasing the last 50 would mean shrinking a
  QR shared with the viewer's six watch states.
  The cost is the running total mid-stream — the figures return the moment the stream ends, and
  `/report` stays reachable by URL.
  `isLive`, not `=== 'LIVE'`: `isOffAir` groups **`PAUSED` with `ENDED`** (legacy's own `isEnded`), so
  a paused stream gets the report and no hand-off. It is **not** a `isWall` case: §6's single-panel
  branch is for a block that *replaces* the page's content, and this is four cards in the column like
  any other page state with content in it.

- **The handle in the URL is decoration, and is collapsed onto the event's own.** An event is
  addressed by its `code`, which is globally unique, so `/@anything/event/{code}` renders the same
  page — and after a rename every poster, QR code and forwarded link still carries the old handle.
  Both routes redirect to `event.channel.slug`, **compared exactly**: casing is part of the spelling,
  and the canonical one is the creator's own (`channel-slug.ts` records that legacy redirects
  `/@noraazima` *to* `/@Noraazima`). The comparison shipped as `toLowerCase()` on both sides, which
  meant the commonest divergence — casing — was the one case the redirect let through.
  The server cannot do all of it: there is no event to compare on the `unavailable` path, and no
  server render at all on a client-side navigation. `useCanonicalEventSlug` carries those two as a
  **`history.replaceState`** — a URL edit, not a navigation. `router.replace` shipped there first and
  was wrong: `@handle` is a *dynamic segment*, so it refetched the RSC payload and re-ran the route's
  server component — a second `v4/public/events/{code}/` — to arrive at the page already on screen,
  when nothing in the render depends on the handle. `useChannelTab` states the same rule for the same
  reason. The loop guard moves with it: with no navigation the prop never changes, so what stops a
  second write is the effect's dependency list, and every dependency has to stay a primitive or a
  module-level function.
  It matters beyond tidiness on `/report`, where the URL's handle is read back out
  to build the back destination and the non-host bounce — a stale handle there sends a host to a
  space page that does not resolve.
- **⚠ That redirect is not a 308 on the wire.** Same cause as the soft 404 below: the document
  streams, so `permanentRedirect` cannot set a status either and Next emits a
  `<meta http-equiv="refresh" content="0;url=…">` inside a **200**. Measured — a browser does land on
  the canonical URL, so the correction works; what is lost is the machine-readable half, since a meta
  refresh is weaker than a 308 and not every proxy or unfurler follows it. `alternates.canonical`
  carries more of the duplicate-folding weight than the redirect does. `[slug]/page.tsx`'s
  `canonicalChannelRedirect` is subject to exactly the same thing.
- **The `notFound()` on this route is a soft 404** — 200 with the not-found body. Not this route's
  doing: every route in this app is dynamically rendered because the root layout awaits `cookies()`
  and `headers()`. `(main)/[slug]/page.tsx` carries the measurement and the two ways out, neither
  free. Which is also why `generateMetadata` returns **no `robots`** on that path.
- **A sticky card must not reserve space for a bar this route does not draw.** `EventTotalRevenueCard`
  shipped with legacy's `bottom: 56px`, which clears legacy's persistent bottom navigation. This app
  shows the tab bar **only on the four tab destinations** — an event page is not one — so 56 was a
  gap under the card on every phone, and it would have been the wrong number anyway: the reserve here
  is **84** (48 + 4 + 32 home indicator), not 56. It is `env(safe-area-inset-bottom)` now, which is
  the inset that genuinely is needed when no bar is there. Read `tab-bar-shell.tsx` before hard-coding
  any bottom offset.
- **`docs/DESIGN_SYSTEM.md` §6 applies per screen, and the two event screens are opposite branches.**
  This feature got both wrong in opposite directions, and neither was visible at the width it was
  built at.

  | | branch | plane | block |
  |---|---|---|---|
  | event page (viewer + host) | multi-block | page colour, every width | `EVENT_CARD` — painted every width |
  | `/report` | single panel | `EVENT_SCREEN` — surface below `md` | `EVENT_PANEL` — card from `md` |

  The event page had the *single-panel* treatment: `EVENT_SCREEN` painted the whole phone viewport
  `--background-surface` while the cards painted only from `md`, so on a phone **every card measured
  `transparent` on a `#fff` plane** — four blocks with no fill, no border and no rule between them,
  separated by 16px of the same white. `/report` had the opposite: no card at all, so from `md` the
  rows sat on the page colour with a surface-coloured sticky header floating over them.

  `/my-wallet` makes exactly this distinction one feature over and says so in the same words — its
  `MY_WALLET_SCREEN` is for `transaction-history` and *"the rule applies here and deliberately not one
  level up"*. Read that constant before painting a plane.
- **Legacy's card padding is `12px 24px`, not 24 all round.** `EVENT_PADDING` was `p-3 md:p-6`, so
  every card body carried twice the vertical air legacy gives it — and a report of six stacked cards
  multiplies that six times, which is most of what "the UI feels loose" was. The card *header* was
  already `py-3`, so the two halves of one card disagreed and neither looked wrong alone. Measured,
  not noticed.
- **`--background-subtle` is `--background-surface` in Dark.** The revenue accordion's tinted header
  bar used it, so in dark mode it had **no tint at all** — header and body were one undifferentiated
  block (`#18181b` on `#18181b`). `--background-segment` differs from surface in both modes
  (`#edeeef` / `#1e1e20`) and is what the DS uses for a segmented track. `MY_WALLET_SCREEN` carries
  the same warning about the same token; it is worth grepping for.
- **A sticky card needs its shadow at every width.** `EventTotalRevenueCard` had `md:shadow-none`, so
  on a desktop the rows it floats over were cut off against a hard border — clipped content rather
  than a pinned total.
- **A wall is a single block, so §6 switches the plane under it.** With content the event page is
  *multi-block* — four cards on the page colour. A wall replaces all four with **one** block, and §6
  is explicit: *"the state sits on the same surface as the content it replaces. Floating on
  `--background` while the list it stands in for is a card reads as a page that failed, not one with
  nothing in it."* Both walls shipped floating. They take `EVENT_PANEL` now, and `EventScreen`
  switches `EVENT_SCREEN` on by state — the shape `MCN_PARTNERSHIP_SCREEN` and `MY_SPACE_SCREEN`
  already have, both of which exist for exactly this.
- **A glyph is the minimum for a state nobody has drawn — these are drawn.** The 500 wall used a 24px
  `exclamation-circle`; the app already ships legacy's own failure illustration
  (`ERROR_ART.failed`, what `app/error.tsx` draws) and the 404 wall now ships legacy's
  `images/not-found.svg` rasterised. `ChannelEmptyState` says the quiet part: a glyph is *"the honest
  minimum for a state nobody has drawn"*. ⚠ `tone` goes with the glyph — it colours a mark and does
  nothing once there is art, so leaving it set is a flag that reads as load-bearing and is not.
- **A failed *fetch* is not a failed *route*, and only one of them may replace the page.** The 500
  state was `ErrorScreen` — the app's full-bleed frame with its own `<main>` and backdrop, which is
  built for `app/error.tsx` and `app/not-found.tsx`, where there is no page left. Here the route
  rendered fine: the bar is right, the URL is right, one request failed. Replacing everything took
  away the back button and the page's identity, so a reader could not tell which event they were
  looking at and had to use the browser to leave. It is a block inside the column now
  (`EventErrorState`, on `ChannelEmptyState`), growing to fill so it centres. **Not found** still
  replaces the page, deliberately — to match the route boundary that answers the same thing on the
  server.
- **`app/not-found.tsx` is for a URL that matches no route — a route that exists answers for itself.**
  `notFound()` renders the nearest `not-found.tsx` **up the tree**, and the nearest one above the
  event route is `[slug]/not-found.tsx` — the *channel's*. So a dead event link rendered **"Uh-oh!
  This Space isn't available"**, with the space illustration and a *Discover Creators* button, about
  a space that exists and whose page is one level up. Nothing failed: a 404-shaped screen appeared
  and the copy was about the wrong noun. `[code]/not-found.tsx` is the fix, and it covers `report/`
  below it.
- **⚠ `initialData: null` is a *value*, and it made a 500 read as a missing event.** `useEvent`
  seeded `initialData` whenever `initialEvent !== undefined`, so a failed server render seeded
  `null` — and TanStack goes straight to `status: 'success'` with `data === null`. A failing refetch
  on a query that already has data does **not** flip the status to `'error'`; it stays successful.
  So `isSuccess && data === null` was true, `notFound` was true, and an outage rendered *"404 – Live
  Not Found"* — the exact conflation the `notFound`/`isError` split exists to prevent. Seed only
  when there is something to seed.
- **A money headline must not be a nullable number.** `formatRevenue(null)` answers `$0`, which is
  right for a *line* inside a bill that arrived and catastrophic for the **total**: while the billing
  request was in flight, and for as long as it stayed failed, the sticky card told the creator in the
  page's largest number that they had earned **$0**. Two states a `number | null` cannot carry, both
  rendered as money. `TotalState` is the union that fixes it, and `use-event-report.test.tsx` pins
  it — a browser cannot show you this, because it looks exactly like a broadcast that made nothing.
- **The whole report had no error state.** Legacy has none either: a 500 from billing falls into the
  same `<Nodata/>` branch as a stream that earned nothing, so a failed request reads as "you made no
  money". This port reproduced that, and the hook even computed `isBillError` / `isSummaryError` and
  `refetch` that **nothing consumed**. `EventCardState` is the split — one layout, `empty` vs
  `error`, the second with a retry — which is `ChannelError`'s own reasoning applied to a card slot.
  Exported flags with no reader are the smell worth grepping for.
- **Two unlabelled timestamps on one screen.** The masthead preferred `started_at` while *Live
  analytics* prints `start_at` under *Start time*, so a broadcast that began twenty minutes late
  showed the host two different times and no way to tell which was which. The masthead is `start_at`
  now (legacy's choice); the JSON-LD still prefers `started_at`, and that is not a contradiction —
  its reader is a machine asking *when did this happen*, with no second field beside it.
- **A computed `weight` on `<Icon>` is invisible to `pnpm icons`.** The sprite subset is built by
  scanning **literal** `name`/`weight` pairs, so `weight={failed ? 'filled' : undefined}` put
  `exclamation-circle--filled` nowhere in the sprite. Nothing catches it: `icon-names.ts` types the
  weight as available (it exists upstream), `typecheck` passes, `sprite.test.ts` passes, and the
  symptom is a correctly-sized **empty box**. A ternary in `name` is fine — that one the scanner
  does follow. Caught in a screenshot.
- **A dialog must bring its own dismiss.** The DS draws none, so `docs/DESIGN_SYSTEM.md` §7 is not
  optional — `EventInfoDialog` shipped without one on the reasoning that Escape and an overlay press
  both close it. They do, for a keyboard and a mouse; a touch reader has neither. Caught by looking
  at a screenshot.
- **`Number('')` is `0`.** `toAmount` returned `0` for a blank `net_amount` instead of `null`,
  which is the difference between "this half earned nothing" and "this half did not report" —
  indistinguishable in today's output and exactly the kind of thing that bites the next caller.
  Caught by a test, not by reading the code.
- **`/dev/event` is the only way to see most of this.** Six mutually-exclusive watch states, the age
  gate, the skeleton, both failure screens, **and the whole host report** — which is behind an owner
  session on an event that has already aired, so its *No data* branches and its MCN-commission row
  have never been visible any other way. One scroll, with the payload that produces each printed
  beside it. It 404s in production.

---

## 6. Live studio — the shell is built, the player is not

The third screen. Legacy swaps to it **at runtime on the same URL**, which is the fact the whole
design follows from: `containers/event/layouts/index.js` chooses `LiveLayout` over `DetailsLayout`
when the viewport is over `md` and the stream is on air (or came off it within five minutes), and
the address bar never changes.

### What it is

```
┌──────────────────────────────────────────────────────────────┐
│ (←) ( ◍ Ada Lovelace · 116.2K followers )   ( ★ 8,734 · Get App ) │
│                                                              │
│  blurred banner        ┌─────────────┐        blurred banner │
│  · blur(20px)          │  510px of   │        · under a 60%  │
│  · scale(1.1)          │  sharp art  │          black scrim  │
│                        │  + a 390px  │                       │
│                        │  notice     │                       │
│                        └─────────────┘                       │
└──────────────────────────────────────────────────────────────┘
```

| piece | file |
|---|---|
| the entry predicate | `lib/studio.ts` → `isStudioEligible` |
| viewport + the expiring window | `hooks/use-live-studio.ts` |
| the stage and its surfaces | `lib/studio.ts` → `EVENT_STUDIO_*` |
| back · channel · balance/Get App | `components/event-studio-chrome.tsx` |
| the stage itself | `components/event-studio-screen.tsx` |
| every refusal on it | `EventWatchPanel` with `surface="studio"` |

### Four decisions worth not re-litigating

**A `fixed` overlay, not a route.** One URL is legacy's, and a second address would mean a
`redirect` between them on every status change plus the App Router tearing down
`SessionProviders`' whole bootstrap to cross from one to the other. `z-40`, the mini-app player's
slot — 50 is taken by the dialogs this screen raises, and a stage over its own unlock dialog is a
failure nobody sees until they try to pay.

**§6 of the design system does not apply, and the exception is written down twice.** The studio's
ground is a camera frame under a scrim; it has no theme, so the chrome's ink is a literal
`text-white` on `bg-black/20`. The **notice card on it is a surface and does take tokens** — which
is the one place this port improves on the comps rather than matching them: legacy hardcodes
`#FFFFFF` with `#141414` ink, i.e. a white dialog with black text in Dark mode.

**One set of refusal panels, two plates.** `EventPanelShell` grew a `surface` prop rather than the
studio growing its own copies. Legacy has the copies and they have already drifted — its two
platform-restricted screens say *"Back to home"* and *"Return to home"* for the identical action,
and only one of them offers *Open in Tevi App* at all.

**The age gate stays on Live details.** `EventScreen` raises it before the studio mounts, so an 18+
stream is confirmed on the page and the studio opens behind the answer. Legacy's gate sits over the
video stage, which means it draws the creator's own art — blurred, but theirs — behind the question
asking whether the reader should be seeing it.

### What reaches the stage today, and what is held back

Built: **off-air**, **platform-restricted**, **locked** (priced, members-only, or both). Those are
legacy's `ended`, `platformRestricted` and `eventIsLocked`, and they are the reason the screen is
worth having before the player: a refusal reads better with the creator, the balance and the route
into the app all in frame.

⚠ **`watchable` was excluded and no longer is**, and this is worth reading before adding another
gate like it. While the stage had no player, routing a watchable stream into it replaced a page
carrying the banner, the title, the host and the description with a black field offering the app
— strictly less than the reader had. So one `!==` in `EventScreen` sent every watchable broadcast
to the details page.

The player landed and that clause did not move. The symptom was *"why can't I watch the live?"*,
and the answer was three separate blocks stacked on each other:

1. the `watchable` exclusion, which never let the studio open for a playable stream;
2. `liveApi.getPlayback` having **no caller** — only the preview was wired, and only on `locked`,
   so even reaching the stage would have found nothing to play;
3. `NEXT_PUBLIC_LIVE_CDN_ORIGINS` unset, so the CSP blocked the fetch — and the origin is only
   discoverable *by watching a live stream*, which the first two prevented.

All three are fixed. `useLiveStream` is the `watchable` counterpart to `useLivePreview` (no quota,
no countdown, no blur), and the CSP now falls back to `https:` **in development only** so the loop
in (3) has a way in; production still fails closed.

If the studio ever cannot play something again, the fallback belongs **inside** the stage — which
already renders the app hand-off for a transport it does not support — and not in the gate that
decides which screen the reader is on.

`geoRestricted` and `kickout` have no branch for the reason §3 gives: nothing can raise them yet.

### The player — the CDN half is in

```
liveTransport(playback, publishers)
  publishers ≤ 1 && a playlist  → 'cdn'  BytePlus VePlayer          ← built
  live_channel                  → 'rtc'  Agora, as an audience      ← not built
  neither                       → 'none' the app hand-off
```

**Built:** the free preview end to end — `live/v1/streaming-events/{code}/preview/` →
`core/v4/live/event/{code}/layout/` → a muted, blurred FLV/HLS pull inside **the session's own
layout** (chat column and tray, every action opening the paywall — `lib/exclusive-phase.ts`), ten
seconds a look and three looks per device per event (`shared/lib/preview-quota.ts`), with *Unlock* on
the countdown so the stream can be bought mid-preview. No room is joined during it.

**Also built:** the Agora path — join as an `audience` at `level: 1`, subscribe per co-host, play
each track into its own seat — and all eighteen seat arrangements, as a table
(`lib/seat-layout.ts`) rather than eighteen components.

**One seat grid serves both transports**, because the mount node is the contract: every tile
renders `player-{publisher.id}`, and whichever driver is in play fills the boxes. That is legacy's
arrangement too (`LayoutProvider` wraps `Seats`, both branches render `{children}`) and it is what
keeps the name plate, the mic state and the host mark written once.

Four things about it that are not obvious:

- **The quota is checked before the call and spent on its success.** The backend counts the *call*,
  so `retry: false` + `refetchOnMount: false` + `refetchOnWindowFocus: false` +
  `staleTime: Infinity` on that query are load-bearing, not tuning — each one is a way a single
  look becomes four. It is also the one piece of per-device state `forgetAccount` deliberately
  does **not** drop: clear it on sign-out and the limit is a formality.
- **Four env vars, all inlined into the client bundle**, which is the vendors' model rather than a
  choice: the BytePlus licence is domain-locked (`*.tevi.dev` / `*.tevi.com`, valid to 2027-01-16)
  and Agora's real authorisation is the per-viewer `viewer_token` the backend mints. Same category
  as `NEXT_PUBLIC_SIGN_SECRET` — public by construction, not to be called a secret. ⚠ The dev
  licence names `*.tevi.dev`, so playback can refuse on `localhost` with everything set correctly.
- **`NEXT_PUBLIC_LIVE_CDN_ORIGINS` has to be filled or nothing plays.** HTTP-FLV and HLS are
  fetched with XHR before anything reaches a `<video>`, so the CDN needs `connect-src` — and its
  origin is only in the API payload, so it cannot be known at build time. Unset, the directive
  contributes nothing and playback is blocked. That is deliberate: the alternative is `https:` on
  the one directive that decides where an injected script may send what it has read. **B117** asks
  the backend to name the origins.
- **No Agora beauty extension.** Legacy imports `agora-extension-beauty-effect`, registers it and
  creates a processor it never attaches to anything — a processor beautifies a track *you publish*,
  and this client is audience-only. A whole extra SDK on every live room to build an unread object.
- **The SDK is imported inside the effect**, not by `next/dynamic` at module scope. It touches
  `document` at import time (legacy hits this and wraps its layout `ssr: false`), and doing it in
  the effect means every refusal state, every narrow viewport and every ended broadcast downloads
  none of it. `@byteplus/veplayer/live`, not the package root — the live-only bundle.

### The live room — the wire is in, the sidebar is not

`${DOORMAN}/event`, the app's **third** socket room (`CLAUDE.md` primitive 3). Same gateway and
same `path: '/doorman/'` as the user room, so nothing new had to be allowed through the CSP.

**Built:** the transport (`shared/lib/socket/live-room.ts`), its client, `use-live-room.ts`, and
the chat message model (`lib/live-message.ts`). Seventeen channels and five commands, all
enumerated — collected from every `.on()` and `.emit()` in legacy's `liveSession` tree, because
this namespace has no schema either.

⚠ **`kickout` and `ban` arrive here.** Those are the two refusals §3 lists as unknowable to this
client, and the reason they were unknowable is that this room had not been ported. They now have a
producer; `watch-state.ts` can grow the branches once the sidebar has somewhere to show them.

#### ⚠ Declared is not consumed — which half of the room is actually wired

Listing a channel costs one `socket.on` that dispatches to an empty handler set, and `live-room.ts`
argues at length that this is the right trade: an unlisted frame is silently dropped, which is how a
feature gets built twice. The cost is that *declared* reads as *done*, and it did — for a while
`useLiveChat` was the only caller of `subscribe` in the whole feature.

| consumed | by |
|---|---|
| `msg` · `pinned_message` · `attendance` · `ccu` · `top_stars` · `block_chat` · `unblock_chat` | `use-live-chat.ts` |
| `data_change` · `lock` | `use-live-event-sync.ts` — invalidate `eventKeys`, never write the frame |

Still without a consumer, and each waiting on the thing that would show it:

- **`kickout` · `ban` · `block_user`** — the three refusals the room alone can raise. Legacy shows a
  screen for the first, and for `ban` a five-second toast then `router.push('/')`. The comps have
  the frame (`User xem live bị kickout/block/muted`); `watch-state.ts` has the note. **Next.**
- **`live_status` · `layout` · `publishers_change` · `publisher_state_change` · `invitation`** — all
  five are the player's, and there is no player.

Four things about it:

- **`join_event` fires on every `connect`, not once.** socket.io reconnects transparently and the
  server's room membership does not survive it — so joining only on the first connect leaves a
  socket that reports itself connected and delivers no chat, no CCU and no kickout. Legacy joins
  from an effect keyed on the socket *instance*, which is the same object across a reconnect, so
  it joins once and never again.
- **`leave_event` before the socket closes.** The room keeps a concurrent-viewer count; a socket
  that simply drops leaves the reader counted until the server times them out — and that number is
  one its creator is watching.
- **Commands are promises that reject.** Legacy writes `if (res?.err_code === 0)` at every call
  site and no `else` at any of them, so a refused `get_message_history` is an empty chat, forever,
  in a room that is otherwise working. There is also a 10s timeout, because socket.io *buffers* an
  emit made while disconnected: without one, a command across a dropped connection waits for ever.
- **The chat transcript is the one place a frame is the source.** `get_message_history` is a socket
  command, not an endpoint, so there is no HTTP copy to fall back to. Everything else in this room
  obeys the ordinary rule — `data_change` invalidates `eventKeys`, it does not write the payload.

Two readings in the message parser are legacy bugs rather than ports. Its `msg` switch branches on
`type === 'cmd'` with a `default:` that prints everything else as a comment — so a frame typed
`command`, or `CMD`, or anything added later, renders `/give_gift` into the transcript as though a
viewer had typed it; the leading slash is what the payload actually distinguishes on. And inside
the `cmd` branch there is no `else`, so a command this client does not know is dropped silently,
which looks like a chat that skipped a beat.

### The chat column

390px down the trailing edge (legacy's `DRAWER_WIDTH`), open only while something is playing —
the socket and the column appear and disappear together, so there is never an empty panel beside
a paywall. The stage column is `mx-auto` **inside the row**, so the stream stays centred in what
is left rather than centred on the viewport with the chat over it.

Five decisions:

- **Scroll is pinned to the bottom only when the reader already was there**, measured against the
  *previous* scroll position with 24px of slack. An unconditional `scrollTop = scrollHeight` is
  what makes a live chat yank the page away from somebody reading back.
- **The head count is absent until a frame arrives, never `0`** — zero is a real number and reads
  as an empty room while the figure is simply still on its way.
- **The list is capped at 300 lines.** A three-hour broadcast is thousands of rows, each with an
  avatar; legacy has no cap.
- **The history is re-asked on every connect and *replaces*** — a reconnect is a new membership,
  so asking once (legacy) leaves a permanent hole where the wifi blinked, and appending would
  duplicate everything on screen.
- **A refused history is not an empty chat.** Whatever is on screen stays and live frames
  accumulate; legacy blanks it for as long as the reader stays.
- **Arrivals are a queue, one at a time.** This replaced the toast on screen with the newest, so in
  a room anybody was actually joining only the *last* arrival of a burst was ever announced. Legacy
  queues them; the queue is additionally **capped**, because a door-opening wave is otherwise
  twenty-five minutes of toasts naming readers who have already left.
- **A 403 from `post_message` is a mute.** `block_chat` only reaches somebody already in the room,
  so a reader muted before they arrived learned nothing and kept sending messages the room refused
  one generic failure at a time. Legacy reads the ack's `err_code` for exactly this.
- **The column outlives the stream.** `isPlaying` alone unmounted it the instant playback stopped,
  which takes the conversation away at the moment the broadcast ends. A reader who *watched* it stop
  keeps the column in its Ended state; one who arrives after the fact never had a column at all.
  The transcript is kept, which is the single departure from `Type=Ended` — the frame hides every
  row because its Ended column is one somebody arrives at.

#### ⚠ Reading the comps: the mistake that cost two revisions

The column was built twice from the **wrong layers** of `Right menu` on Figma's `↳ View Live`
page, and both times it looked finished.

`Right menu` carries a leftover `Header` group — a 16px `Live chat` title, a `settings` gear and
a 1px `#666` rule — with all three set `visible: false` by an earlier revision. Reading the frame
without filtering on visibility drew all three, and pushed the *live* header (`Viewer` · a
viewer-count pill · a 40px round `Panel Contract` disc) into a second row beneath them. The result
was a title the design does not have, a gear wired to nothing, a divider that had been deleted,
and a 56px header spread over 100.

The same omission hid how much was missing. The `Chat` **component set has twelve variants** and
`Header` has five more; the column had four and five respectively. What was absent:

| comps | what it is | now |
|---|---|---|
| `Chat/Type7` | `16 new comments` — for a reader scrolled away from the bottom | built, pinned in `event-studio-chat.test.tsx` |
| `Chat/Alert mute` | the muted float: `#FB3748` at a tenth, a triangle, 12/Regular | built |
| `Chat/System`, `System host`, `Paid view live` | Tevi's own voice — a 24px disc, 14/Medium `#FFA914` | built |
| `Chat/Type11` | the muted line *in the transcript*, `#D00416` | the float is what the room raises; this tone is `ChatSystemLine tone="denied"` |
| `Badge/Member`, `Badge/Host` | the gradient `MEM` chip and the black `Host` chip | built |
| `Header/No data` | the empty leaderboard — 134×74 and a line | built |
| `Header/Active=True` | the board expanded, 200 → 356 | built, as a CSS `max-height` |
| `Badge/Lvl Badge`, `Badge/User Badge` | gifted level | **not built** — no frame carries a level (B117) |
| `Chat/Unlock level` | "Send a Gift to activate your gifted level" | **not built** — and it is `visible: false` in the set, so the design had already withdrawn it |
| `Header/Colapse` | the 303×72 folded strip | built, as `EventStudioChatStrip` |
| `Right menu/Type=collapse` | the folded column, a `#000000@0.20` pill | built — the stage owns `isChatOpen` |
| `Right menu/Type=Ended` | no header, no composer, a disabled *Live broadcast has ended* pill | built, behind `hasEnded` |
| `Float` (5 variants) | the big-gift banner — gradient, italic `X460`, a yellow glow | **not built** — nothing in this client sends a gift yet, so no frame can raise it |

Four more the comps settled on a second reading, after the column had shipped:

- **`Title Container` has two badge slots, not one.** `MEM` goes in the **leading** one and `Host`
  in the **trailing** one — `Property 1=Default` and `Variant3` are the two halves of that, and
  `Variant2` uses neither. Both were drawn leading, in front of a name already clamped to 120px.
- **The composer has a focus edge.** `Input Container` has three variants and `Hover`/`Active`
  differ from `Inactive` by a single 1px `#B9A4E6` stroke and a send glyph lifted to `#F9F7FD`. The
  field was the one control in the column that never acknowledged the pointer.
- **The pinned message's `Host` chip needs no field.** It was skipped alongside the `@mention` on
  the grounds that `pinned_message` carries only `{ message, user_name }` — true of the mention and
  not of the chip: only a host can pin, so it states what the frame's existence already guarantees.
  It is the black `Host Badge Container` at 10/Regular, *not* the `Badge/Host` used beside a name.
- **`Badge/Type=Host` is the flat black chip with a `#FFE600` crown**, which is what is built.
  ⚠ `Title Container/Variant3` instantiates it with an orange gradient and a `key` glyph overriding
  both — the two disagree, the sprite has no `key` (`CLAUDE.md` records why), and the *set* is the
  component. Left as the set draws it; the override is a question for Brand, not a guess to make.

Three things the comps settled that had been guessed:

- **`All` and `High level user` exist and are `visible: false`.** They were reported here as absent
  from the design; they are in `Host Badges`, hidden, and absent from *legacy* — which is the claim
  that actually held. Only `Top contributing users` is drawn, and it is a **label**, not a tab.
- **The leaderboard has no Star mark.** `Star w value` carries one and it is hidden in all five
  `Top` variants — the figure stands alone, and a mark had been drawn on all three podium rows.
- **A member's row has no gradient.** Legacy paints the whole row
  `linear-gradient(90.92deg, rgba(255,0,0,.6), rgba(255,153,0,.6))`; no variant in the `Chat` set
  does, and the `MEM` badge is the entire marker. Figma wins; the divergence is stated at the call
  site.

And three fields this client read in the wrong place, each failing silently:

- **`channel_subscription_duration` is on the frame, not on `user`.** All four of legacy's reads
  are `data.channel_subscription_duration`. Having it only on the user schema meant `isMember` was
  **never true** — no `MEM` badge ever appeared, in a room where membership is what is being sold.
- **The gift picture is `gift_data.thumb`,** not `image`; every gift sentence had a hole in it.
- **`total_stars` is the room's own figure** and outranks `quantity × price`, which mis-states a
  gift that was discounted or repriced mid-broadcast.

⚠ **Paid chat costs 1 Star a line and this client does the billing** — `post_message` succeeds
first, then `billy/v1/ecom/purchase/`. The message is public before anybody is charged, and a
client that skips the second call posts free. The balance is checked *before* posting, which is
the only part of the ordering a client can get right on its own, and a failed charge is **told to
the reader** — legacy fires the purchase and discards the result, so neither side learns that no
Star moved. **B118** asks whether the server should be charging instead.

### Gifts

The gift vertical, which had nothing at any layer until now. Four pieces:

| | where | what it is |
|---|---|---|
| the catalogue | `api/gift-api.ts`, `hooks/use-gift-catalog.ts` | `GET billy/v1/gifting/product-packages/`, per space |
| the tray | `components/event-gift-tray.tsx` | the scrolling strip under the stream, plus *View more* |
| the catalogue panel | `components/event-gift-panel.tsx` | 390px, two tabs, the recipient picker |
| the banners | `components/event-gift-float.tsx` + `lib/gift-burst.ts` | what flies across the stage when somebody gives |

The write is `hooks/use-send-gift.ts`, and it is the one worth reading before changing anything
here.

**⚠ The client announces its own gift.** No server frame says a gift happened: `POST
v1/gifting/send/` charges, and then the *sender's browser* emits `post_message
{ type: 'cmd', msg: '/give_gift', … }`. That frame is what every other screen in the room is built
from — the chat sentence, the banners, and any future leaderboard. So a client that charges and
then fails to emit has taken the reader's Star and shown the room nothing; this port **awaits** the
emit and tells the sender when it fails, where legacy discards the promise. It also means nothing
in a gift frame is a record: the price and the count are the sender's own. **B119** asks whether
the server should emit instead.

**There is no `give_gift` channel, and legacy makes it look as though there is.** Its float panel
and its SVGA player both subscribe to `event:{code}:give_gift` — a name the wire never publishes.
What actually happens is that legacy's *comment list* receives an ordinary `msg` frame, tests
`msg === '/give_gift'` and re-emits it locally under that name, which makes the gift animation a
downstream consumer of the chat: unmount the comment list and gifts stop appearing. Here both
`useLiveChat` and `useGiftBursts` subscribe to `msg` independently.

**The grouping is a pure fold** (`lib/gift-burst.ts`). Legacy keeps a mutable ref, a `setTimeout`
per group, a `Set` of ids mid-exit and a counter map of animation triggers — four pieces of state
that have to agree, inside the component that draws them. The rules worth pinning are rules ("a
second rose extends the banner rather than adding one"), so they are a function with a test file.
One addition: the stack is **capped at three**, oldest-out. Legacy has no cap, so a busy broadcast
stacks a 45px banner per gifter until they cover the stream.

**Three divergences from legacy, each stated at its call site:**

- **every tile is a `<button>`.** Legacy hangs `onClick` on a `Stack` — a `div` — so the control
  that spends money is unreachable by keyboard and silent to a screen reader;
- **the catalogue keeps legacy's hover gesture, with a keyboard route added.** *View more* opens it
  on `onMouseEnter` and the **panel** closes itself on `onMouseLeave` — the port had replaced that
  with a press and was corrected. Which half lives where is the load-bearing part: nothing closes on
  leaving the *trigger*, so the pointer can cross the gap to the panel without it vanishing. The
  press toggles and Escape closes, so the same catalogue is reachable without a pointer; neither
  changes what the pointer does. Pinned in `event-gift-catalog-gesture.test.tsx`;
- **`exclusive` is parsed rather than tested for truthiness** — it is a *string* on the wire, and
  `"false"` is truthy. See **B119**.

**Two things this section used to list as missing:**

- **the SVGA animation** — built, `EventGiftAnimation`. `svgaplayerweb` 2.3.2 (legacy's version),
  imported inside the effect because it touches `window`; one play per gift, a new gift replaces the
  one playing, never the pointer. Two differences from legacy: `gift_effect` — the creator's off
  switch, which legacy never reads — is obeyed, and `prefers-reduced-motion` gets none. ⚠ The file
  is fetched with XHR, so its host must be in `connect-src`: the static CDN is, and an animation
  served from anywhere else fails closed (the banner still carries the gift). The real host could
  not be read here — the catalogue needs a bearer — so it is worth one look on a live broadcast.
- **the gift goal** — **legacy has none.** This line said it did; a search of all of
  `../tevi-web-app/src` for `goal` finds nothing, in the event tree or anywhere else. There is
  nothing to port.

### The sustained fee

Star charged every few minutes to keep watching, going to the streamer. Two halves in two places,
because `shared/` may not import a feature: `resolveSustainedFeeRule` picks the country's rule
(already ported, with its own note addressed to this file), and `lib/sustained-fee.ts` decides
whether it applies to *this* broadcast.

⚠ **The interval is armed on the shape of the charge, never on the balance.** Legacy lists
`isOutOfStar` among the dependencies of the effect that owns its `setInterval`, so crossing the
fee threshold tears the interval down and builds a new one — and a new interval restarts its
countdown from zero. Any viewer whose balance moves past the fee, which is every viewer who sends
a gift or gets charged, has their clock reset and is **never billed**. The live balance is read
from a ref inside the tick here, so the clock keeps its own schedule.

Three more things it does not copy:

- **The exclusive-only rule now charges.** Legacy checks `paid`/`member` for an exclusive live
  and then falls through to `return types.includes('free')`, so a rule listing `['paid','member']`
  — the case that check exists for — resolves to `false`. The remote-config schema recorded the
  bug before this screen existed; `lib/sustained-fee.ts` is where it stops.
- **A failed charge is reported.** Legacy's `catch (e) {}` is empty: the reader keeps watching for
  free, the streamer is not paid, neither is told.
- **The notice timers are cleared.** Legacy's two `setTimeout(…, 10000)` calls are not, so leaving
  within ten seconds is a state update on an unmounted tree.

⚠ **Premium is charged**, and that is ported rather than decided. Legacy bills everybody and only
hides the "you just paid" notice from Premium subscribers — so they pay silently. It reads like a
half-finished exemption; inventing one here would stop money reaching streamers. **B118** asks,
along with `quality` vs `quantity` on the purchase body.

### Open items on this screen

- **The SVGA host** — see *Gifts* above: unverified against a live catalogue.

Closed, and each one was on this list: pinned messages, the emoji picker, arrivals and the muted
notice (`EventStudioChat`); the seat gift score (`useSeatScores`); Follow / Premium / overflow in
the channel plate; the gift animation (`EventGiftAnimation`); the out-of-Star wall
(`EventOutOfStarDialog` — and topping up now collects the period that was missed, as legacy does);
the invitation (`EventInvitationDialog` — a hand-off to the app, since the web cannot publish a
camera); the recommended-lives rail on the ended screen (`EventEndedRail`); the auto-follow bar on
both screens (`ChannelAutoFollow`, `placement="stage"` in the studio); focus containment
(`StudioPortal` — the stage is portalled out of the shell and the shell made `inert`); and `L8`'s
`16/9.1`, which the CSS grid does not need (the note is on the table in `lib/seat-layout.ts`).

### The studio against legacy, measured

Checked at 1512×826 with a playing two-guest room, against `liveSession/components/mainView`:
chat 390 from x=1122 · the stage box `826 − 95 = 731` tall · the 95px band (`4px 8px`, gap 12) ·
the tray `87` tall and `calc(100% − 101px)` wide beside the 89px Membership tile · `P2` a
`731×731` square centred in the 1122 of stage · each seat `362` wide. Every number is legacy's.

Four things that decided it, each the fix for a way this screen was wrong:

- **Seat boxes are one ratio per family**, looked up in `seatBoxAspect`, never derived from the
  tiles: `P1` 9:16, every other portrait grid **square**, `P3` 1:2, landscape 16:9, `L2` 32:9, `L3`
  18:16. And `aspect-ratio` alone sizes nothing — `seatBoxStyle`'s `min(100cqw, 100cqh × r)` is
  what gives the box a size at all.
- **`L2` is two tiles side by side.** The table had them stacked.
- **The camera-off tile is a centred stack** — the ringed avatar, the mic as a badge *on* it, the
  name directly under it — not the camera-on layout with an avatar added.
- **The tray is a 95px row in flow**, below the stage and inside its column, so the stage shortens
  by exactly the tray and the chat never sits over it.

### The room's refusals and the page's

`useLiveRefusals` gives the three frames only the room can raise their own outcomes: `kickout` →
the studio's `EventKickedOutPanel`; `block_user` → `EventBannedState`, which **replaces the whole
page** (legacy asks it before anything else in the viewer tree, age gate included); `ban` → the
server's sentence as a toast, then home. `block_user` is not the chat's `block_chat` — legacy has
two `isBlocked`s under one name, and this port had only the chat's.

A **guest** on any broadcast gets `EventSignInPanel`: legacy routes `!isAuthenticated` to the
preview, whose fetches then never run without a `currentUser`, so what renders is the event's title,
its description and *Sign in*. A free broadcast is **not** a preview for a signed-in reader — the
schema types `price` as a non-null decimal string, so a free stream sends `"0.00"`, which makes
legacy's `isFree` true and its `isExclusive` false.

### Two things that were wrong and are worth remembering

- **The five-minute window never closed.** `isRecentlyEnded`'s boundary is inclusive, so a timer
  armed for exactly the remaining time fired at the one millisecond the predicate was still `true`,
  re-rendered, got the same answer, and armed nothing further. The reader sat on *"the broadcast
  has ended"* until they navigated. Nothing throws; the screen is simply five minutes stale.
  `use-live-studio.ts` carries the `+ 1` and the note.
- **A negative z-index hid the thing the screen is about.** The column's sharp art took `-z-10`,
  which put it behind the scrim *and* the blurred backdrop, leaving the notice floating on plain
  blur. It looks entirely plausible — the stage is dark and the card is legible; it is just missing
  the stream. Caught in a screenshot, fixed with an explicit stacking context on the column.

### Legacy bugs found while porting the player, and not reproduced

- ⚠ **Not a bug, and it was recorded here as one:** `P7` drawing six tiles. The digit in a layout
  code is an **id, not a seat count** — `P3` draws *two*, which is what settles it, and the counts
  legacy ships are `1 · 2 · 2 · 4 · 4 · 6 · 6 · 6 · 9` for both families. Reading it as a headcount
  also mis-sized the `/dev/event` gallery, which was filling each grid to the digit and therefore
  firing the more-people-than-boxes fallback on eight of eighteen — so the four main-plus-rail
  designs were never actually drawn.
- **`L6`, `L7` and `L9` skip `publishers[0]`** — they map `publishers[index + 1]`, so the **host is
  never rendered** in any of the three, and the last tile is left empty.
- **`L8` draws two people twice.** Its bottom-left pair and its right-hand rail both index
  `publishers[item + 1]`, so publishers 1 and 2 each get two tiles while 4 onwards get none.
- **`layout.spotlightUid` is camelCase in a snake_case API.** If the wire sends `spotlight_uid`,
  legacy's read has been `undefined` since it was written and the spotlight silently falls back to
  `publishers[0]` — invisible whenever the host *is* the spotlight. Both spellings are accepted
  here; **B117** asks which.
- **`videoFillMode: 'contain'` is not in the SDK's enum** (`fill | auto | fillHeight | fillWidth |
  cover`), so it has always been ignored and the player has used its default. `'auto'` is the
  member that means what it was reaching for.
- **The player is mounted by polling the DOM.** Legacy looks up `#player-{id}`, and on a miss sets
  a 100ms `setInterval` that is never cleared on the success path. The mount node belongs to the
  component here, so a ref does it — the SDK takes `el` as well as `id`.
- **`live.setLicenseConfig` is called at module scope**, so importing the file anywhere re-runs a
  promise against a global. Configured once here, awaited by later mounts.
