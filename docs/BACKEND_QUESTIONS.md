# Open questions for the API team

Contract questions the web client is currently guessing at, in priority order —
**B1–B9 auth**, **B11–B28 channel**, **B29–B33 earnings**, **B34–B39 wallet**,
**B40–B42 permission** (see the headings below).
Each says what the client assumes today, and what changes if the answer differs — so an
answer can be acted on without re-deriving the context.

Answered questions stay here, struck through, with the answer. They are the reason a
piece of code looks the way it does.

---

## B7 — the credential endpoints' payload · **blocks email sign-in**

What is the exact request shape of `v1/user-login/{login,send-otp,verify-otp,reset-password,setup-credentials}/`,
and what are the semantics of `sid` and `purpose`?

**Assumed today** (ported from legacy `containers/loginWithEmail`):

```jsonc
// login
{ "username": { "kind": "email" | "phone", "value": "…" }, "password": "…", /* + device */ }
// send-otp  →  { "sid": "…" }
{ "username": { … }, "purpose": "reset" | "verify" }
// verify-otp / reset-password / setup-credentials
{ "username": { … }, "otp": "…", "sid": "…", /* … */ }
// change-password — no username, no sid: the bearer says who, the current password authorises
{ "current_password": "…", "new_password": "…" }
```

**`purpose` — what legacy actually sends**, having now read both flows end to end:
`reset` from the forgot-password screens (`containers/loginWithEmail`), and **`verify`** from
the settings flow that adds a first password (`containers/settingPassword` →
`useConnectEmail` and `components/verifyCode`), including on the `verify-otp` that precedes
`setup-credentials`. The value `setup` this document previously listed appears **nowhere in
legacy** — it was inferred from the endpoint name. `OtpPurpose` still declares it so the
guess stays visible, but nothing sends it. *Is `setup` a real value, and is `verify` the
right purpose to pair with `setup-credentials`?*

**Why it blocks.** The client shipped `{ email, password }` for a while, which the API
does not recognise — email sign-in could not have worked. The shape above is inferred
from legacy, not confirmed. `sid` in particular: if it is not required, the forgot-password
screens are simpler; if it is, they must thread it from `send-otp` through to the end.

**If the answer differs:** `features/auth/api/auth-api.ts` plus its test, which pins every
payload — the test goes red rather than failing silently at runtime.

---

## B9 — is there any way to register with an email and password?

`/signup` offers social providers only, because nothing else is possible: there is no
register endpoint anywhere in the API surface. `v1/user-login/setup-credentials/` looks
like the candidate but is a **settings** flow — legacy calls it from
`containers/settingPassword`, behind a bearer, to add a password to an account that
already exists. Legacy's own signup page is social-only for the same reason
(`containers/signup`), and an account is created implicitly on a first social sign-in.

So: **is email registration meant to exist on web?** If yes it needs an endpoint, and
probably an OTP pair mirroring the reset flow (`send-otp` with a `signup` purpose, then
something that creates the account). If no, `/signup` is finished as it stands and this
question can be closed.

Worth noting either way: a visitor with no third-party account currently cannot create a
Tevi account on the web at all.

---

## B2 — which endpoints read the Turnstile headers

Which endpoints actually read `X-Turnstile-Token` / `X-Turnstile-Challenge`? Legacy put
them on the whole auth model's default headers.

**Assumed today:** only the four that can answer 406 — `v1/token/`, `v1/connect/<provider>/`,
`v1/user-login/login/`, `v1/user-login/verify-otp/`.

**Why it matters.** A Turnstile token is single-use. Sending it on every credentialed
request let an unrelated background query spend it before the parked sign-in could replay,
which the user experiences as an endless loop of challenges. The current scoping is a
strict *subset* of legacy behaviour, so it cannot regress — but if another endpoint needs
them, it needs `CHALLENGEABLE` adding.

---

## B1 — does `/me` echo `anonymous`?

Does `v1/me/` return `anonymous: true` for a Firebase-anonymous session?

**Assumed today:** it may or may not. `mergeAccountUser` preserves the stored flag when the
response omits it, and `signInWithAnonymous` sets it locally at mint time, so the client is
correct either way. Confirming only tells us whether this was a live bug or hardening.

**Why it mattered.** Three separate consumers read that flag off the stored user
(`isAuthenticated`, `purgeAnonymousAccounts`, and the dead-account handler). Losing it
promoted a guest to "signed in", which let guarded actions through and redirected them off
`/login` — making real sign-in unreachable.

---

## B3 — what is `id_token` on `connect/google`?

Legacy sends `{ access_token: <GSI credential>, id_token: <GSI clientId> }`. The second is
this app's **OAuth client id, not a token**. Is it validated, ignored, or is legacy simply
wrong and nobody noticed?

**Assumed today:** exact legacy parity, with a comment saying so at the call site.

---

## B6 — is an HMAC v2 planned?

`?verify=` currently signs `pathname + unixSeconds` only — not the method, query, body or
host — and `NEXT_PUBLIC_SIGN_SECRET` is inlined into the client bundle by design. So it is
a bot speed bump, **not an integrity control**, and nothing about it should be described as
one. Is a scheme that covers more planned?

**If yes:** it has to ship behind a flag and land on both sides together — changing the
signed string in place 4xxs every signed request until the backend catches up.

---

# Channel / space — B11 onwards

Raised while building `features/channel` (the `/@{slug}` page). Legacy reference is
`../tevi-web-app`: `containers/channel/`, `models/channel.js`, `services/seo.js`.

---

## B11 — is `channel.owner_id` the same identifier space as `/me`'s `id`? · **shapes ownership**

`useChannelOwnership` decides "is this my channel" synchronously from
`channel.owner_id === currentUser.id`, which costs **zero requests** and avoids a frame of
wrong buttons. Evidence that it is a *user* id: legacy posts it as `{ user_id }` to
`my-channel/blocks/`, and sends it as `receiver_user_id` when gifting premium.

**If not:** ownership falls back to legacy's rule — fetch `my-channel/` and compare slugs —
so every signed-in visitor pays one request and one placeholder frame on every channel page.

---

## B12 — `media_type` on the threads endpoints: what values, and how is it repeated?

Legacy builds a repeated bare key by hand (`media_type=image&media_type=video`); axios 1.x
would serialise an array as `media_type[]=image`, so the client sets
`paramsSerializer: { indexes: null }` to match legacy's wire format.

**If the server wants brackets or a comma-joined list instead:** the media tab returns
*unfiltered* results and **looks like it works** — the grid fills with posts, just the wrong
set. That is the failure mode worth naming: no error, no empty state, only wrong content.

---

## B13 — can a list response's `next` carry an internal hostname, and can it change the *path*?

The client reads only `new URL(next).search` and re-issues it against W_API
(`paramsFromNextUrl`), because a DRF-built absolute URL can carry cluster DNS that resolves
nowhere from a browser — and because an absolute URL that is not an exact `origins.ts` match
silently receives no bearer, no device id and no signature, then 401s. Legacy does the same.

**If `next` ever repoints the path** rather than just advancing the cursor, the client would
silently page the wrong endpoint. Confirm the path is stable.

---

## B14 — `POST channels/{slug}/follow/` on a **protected** channel: followed, or requested?

The optimistic update sets `follow_requested: true` and leaves `is_followed` false for a
protected space, because showing "Following" for a body the visitor still cannot see is
worse than showing "Requested".

**If the endpoint auto-approves:** the button reads "Requested" until the invalidation lands.

---

## B15 — `follow/` doubles as mute/unmute. Is a bare `{}` idempotent?

The same endpoint takes `{ notification: boolean }` to change notification preference on an
existing follow. The client treats `{}` as "follow" and `{ notification }` as "write a
preference".

**If `{}` toggles** rather than being idempotent, a double-tap unfollows.

---

## B16 — is `privacy` guaranteed lowercase, and what is the closed enum?

Legacy `.toLowerCase()`s it at six call sites, which implies it is not. The client
normalises, and treats an **unrecognised** value as `'protected'` — fail closed, so a space
whose visibility could not be parsed is never exposed.

---

## B17 — for an unauthenticated caller, are the viewer-relative flags omitted or `false`?

`is_followed`, `follow_requested`, `blocking_channel`, `blocked_user`,
`notification_settings`. The client defaults them to `false` either way.

**Why it matters:** it decides whether "not followed" and "not known yet" are
distinguishable, which is what the action row's placeholder turns on.

---

## B18 — `GET /analytics/v2/channel/{slug}/stats/`: public or authenticated? · **two answers needed**

**Security:** is `income_usd` omitted for a non-owner, or returned and expected to be hidden
client-side? The client only renders it when `show_income && isOwner`, but returning a
creator's income to any caller is a **data leak, not a display bug** — it must not be in an
anonymous response at all.

**Layout:** stats are a different microservice, so the server render (which reads the
channel from the internal `/core` service) cannot fetch them in the same pass. If the
endpoint is public we fetch it server-side too and the numbers are in the first paint; if it
is authenticated, an anonymous visitor gets a placeholder that fills in later — a layout
shift directly under the avatar. So the answer changes the header's markup, not just a flag.

**Correction to what the client does:** an earlier note here said income renders only when
`show_income && isOwner`. The `isOwner` half was wrong and is gone — `show_income` is the
creator's opt-in to *publish* the number, so requiring ownership meant nobody but them ever
saw it and the toggle did nothing. Legacy uses `show_income && income_usd > 0` in both its
trees. Which makes the access question sharper, not softer: if `income_usd` reaches an
anonymous caller while `show_income` is false, the client no longer has a second gate to
hide behind.

---

## B19 — does `/me` carry the user's own channel slug?

**If yes:** both ownership and `/my-space` become zero-request, and `my-channel/` is only
needed for privacy / mcn / tier.

---

## B20 — what are the exact slug rules?

Allowed charset, min/max length, case sensitivity, whether `.` `_` `-` may lead or trail,
whether an all-numeric slug is legal.

Feeds two things: `isIndexableChannel` (legacy noindexes a numeric slug) and the client-side
validation that runs **before** any fetch. **Assumed today:** `/^[a-zA-Z0-9._-]{3,30}$/`,
case-insensitive with a canonical spelling — which is why the page 308s `/@Ada` → `/@ada`.

*Lower priority while the URL keeps its `@`*: the `/@*` namespace is disjoint from every
static route, so an odd slug can only affect its own page. It becomes **blocking** the day
the `@` is dropped, because then a slug like `settings` shadows a real route.

---

## B21 — does `/me` expose whether the account has Premium, and under what field name?

Animated avatars are a **Premium-only** feature — legacy gates the `<video>` on
`isPremium && avatar_video?.playback?.url` — and `<AnimatedAvatar>` is used in the nav rail,
the tab bar and the menu drawer, all of which render the *account*, not a channel. For a
channel we already have `channel.is_premium`; for an account, `AccountUser` is an open
record and nothing narrows this field. Legacy reads it from `myChannel.is_premium`.

**If `/me` does not carry it:** the shell must wait on `useMyChannel()` before an animated
avatar can play. Acceptable — it degrades to the static image, not to a placeholder — but it
is a request the shell would otherwise not make.

## B22 — `identification/submissions/`: what is the closed set of `status` values?

The KYC screen (`features/identification`) branches on one thing — is this account's
`LEVEL_2` submission approved, still being reviewed, or finished and failed? The endpoint
answers with Sumsub-derived rows, and the only value legacy ever compares against is
`APPROVED` (`containers/identification/components/content/index.js`); everything else falls
through to "show the intro again".

What the client assumes today (`lib/identity-state.ts`):

- `APPROVED` ⇒ verified, and an approval anywhere in the list outranks a later submission.
- `PENDING` · `PROCESSING` · `SUBMITTED` · `QUEUED` · `AWAITING_REVIEW` · `ON_HOLD` ⇒ waiting.
- **anything else, including values we have never seen, ⇒ unverified**, which shows the
  intro and lets the person start again.

**If the real vocabulary differs:** a *waiting* status we do not list is the harmless
direction — the person is offered the flow again and Sumsub shows them its own status
screen. The costly direction is a **terminal** status that happens to be spelled like one of
the six above (`ON_HOLD` for a permanent hold, say): that strands someone on "Waiting for
approval!" with no way off the screen. Hence the closed list and the unverified default.

Two smaller unknowns in the same payload:

- Is `level` guaranteed uppercase? The client upper-cases before comparing, because legacy
  does (`submission.level?.toUpperCase()`) — which suggests it has seen both.
- Is the list paginated in practice? The client reads `results` and ignores `next`. An
  account with more than one page of submissions would have its oldest rows dropped, and
  since approval outranks everything, a first-page-only read can only ever *under*-report
  verification.

---

## B23 — `DELETE my-channel/blocks/{id}/`: is `{id}` the block record or the user? · **two clients disagree**

`POST my-channel/blocks/` takes `{ user_id }`, so the *create* side is unambiguous. The
delete side is not, and the two shipped clients send different things:

| caller | sends | evidence |
|---|---|---|
| `useChannelActions` (the `/@{slug}` page's Unblock) | `channel.owner_id` — a **user** id | written against `blockUser`'s parameter, by symmetry |
| `useBlockedAccounts` (`/settings/blocked-accounts`) | the list row's `id` — the **block record** | legacy's own blocked-accounts screen does this (`containers/blockedAccountsSettings/hook`), and the row carries `user.id` separately |

They cannot both be right, so **one of the two screens is currently broken** and it fails as
a 404 that reads like a backend fault rather than a client one.

What the client assumes today: the list screen follows legacy, because legacy's list screen
is the one that has been in production. The channel page is left as it was rather than
"fixed" to match on a guess — see the note on `channelApi.unblockUser`, whose parameter is
named `blockOrUserId` precisely so neither call site reads as authoritative.

**If it is the block record id:** the channel page cannot unblock at all from what it has —
`Channel` carries no block id — and it needs either a `block_id` on the channel payload or a
`DELETE …/blocks/?user_id=` form. That is the answer with a code change attached.

**If it is the user id:** the list screen changes one character (`entry.id` → `entry.user.id`)
and `normalizeBlockedAccounts`'s "drop rows with no `id`" filter should move to `user.id`.

Two smaller unknowns in the same payload, both currently guessed:

- **Is there a `next`?** Legacy ignores it and infers the end from a short page, which is
  evidence the key may be absent. `nextBlockedCursor` handles all three cases (a string, an
  explicit `null`, absent) rather than picking one — see `lib/blocked-accounts-page.ts`.
- **Is `created_at` on the block?** The row renders "Blocked on …" from it and simply drops
  the line when it is missing, so a wrong answer costs a line of context and nothing else.

---

## B24 — `POST my-channel/privacy/`: what does the 24-hour rate limit answer with, and what does a success body carry?

`/settings/space-visibility` is the only screen in the app whose write is **rate-limited by
product rule** — one visibility change per 24 hours — and the client currently guesses at both
halves of that exchange.

**The refusal.** The client treats **429** as the rate limit and says so in its own words
(`space_visibility_rate_limited`); everything else gets the generic `settings_update_failed`.
Legacy does not distinguish at all — it prints `response.data.message` verbatim, which is why it
happens to say something useful and why it is no evidence of the status. That the case is real is
not in doubt: legacy ships a translated string for exactly it
(`space_visibility_w2_you_can_change_your_channel_pr`).

- If the answer is **400**, the person is told to "try again" for a change that cannot succeed
  for a day — the one piece of advice this screen must not give.
- If the limit is reported as a **200 that silently does nothing**, it is worse: the write is
  optimistic, so the radio stays where they put it and the setting has not moved.
  `useUpdatePrivacy` would then have to detect it from the body rather than the status.

**The success body.** The client reads one field, `privacy`, and patches it onto the cached
channel — never folds the whole body (`parseAckPrivacy` says why). Two things worth knowing:

- Is it `{ privacy }` or the whole channel? If it is the channel, this should fold it the way
  `useUpdateMe` folds `/me` and save the `channelKeys.detail` refetch.
- Can the acknowledged value ever *differ* from the requested one — a clamped transition? The
  client already writes the acknowledgement rather than the request, so it would show the truth.
  The question is whether that path exists or is dead code.

Related, and the one that would change the UI rather than the error handling: **is there a way to
ask when the next change is allowed?** A remaining-time field would turn "find out by trying"
into something the screen can state up front, which is what the standing note
(`space_visibility_note_24h`) is currently standing in for.

---

## B25 — `PATCH my-channel/`: is a partial body honoured, and does it answer with the channel?

The edit-profile form sends a **diff** — only the fields that changed (`buildChannelPatch`) — and
reads the response as the updated channel (`useSaveProfile` writes it straight into
`channelKeys.myChannel`). Legacy does both, so this is its behaviour rather than an invention, but
neither half is documented and each fails in a different direction.

- **If an omitted field is treated as "clear it"** rather than "leave it", a save that only fixed a
  typo in the bio would wipe the space's categories and social links. This is the one that would be
  catastrophic and silent, since the form re-seeds itself from the response and would look correct.
- **If the response is an acknowledgement rather than the channel**, `normalizeChannel` returns
  `null`, the client falls back to invalidating the query and everything still works — one extra
  request. That path is already written; it is the cost, not a bug.

Two specifics the client is currently guessing at:

- `images` is sent **whole** (thumb + cover + `avatar_video`) whenever any one of them changed,
  because the endpoint appears to replace the object rather than merge into it. If it merges,
  sending the trio is harmless; if it replaces and the client sent only one key, the other two are
  cleared. The client takes the safe side of that; confirmation would let it send less.
- `avatar_video: null` is how the client **removes** a looping avatar (it is what legacy sends when
  a still replaces a clip). If `null` means "unchanged" to this endpoint, removal is impossible and
  needs its own route.

## B26 — the username rules, and what `check-slug/` actually answers · **shapes a rate-limited field**

`POST v3/channel/check-slug/` is treated as: 2xx ⇒ available, 4xx ⇒ not, and the 4xx body's
`message` is shown to the person verbatim (`useSlugCheck`, one of only two places in this app where
a backend sentence reaches the screen). Legacy relies on the same shape.

What is unknown, and what each answer changes:

- **Is a *taken* username a 4xx, or a 200 with a flag?** A 200 would make every name look
  available — and this field is rate-limited to one change a week, so the person would spend that
  week's allowance discovering the truth.
- **Is the rejection reason machine-readable** (`errors: [{ code }]`) as `validate-display-name/`'s
  is? If so the sentences become ours and translated, and the "backend words on screen" exception
  goes away.
- **Does it 429?** A per-keystroke-pause check is a request per second of typing at worst. The
  client debounces at 1000ms and aborts in flight, which should be enough, but if there is a limit
  the debounce should be tuned to it rather than guessed.
- **Is the seven-day limit exactly seven days, and is it enforced server-side?** The copy says
  seven (legacy's number). The client does not gate on it at all — it lets the save fail — so a
  wrong number here is only wrong copy. See also B20, which asks for the character rules.

## B27 — is there a size or duration limit on the animated avatar, and who enforces it?

The client refuses a clip over **10 seconds** or **50 MB** before uploading (`media-validation.ts`),
both numbers taken from legacy's own validation. Legacy's *dialog copy* says 20 MB, its *code* says
50, and the two have presumably drifted — which is exactly why this needs an answer rather than a
choice between them.

It matters more than a limit usually would, because the client-side trimmer is **not ported**: a
long clip is refused with "trim it first, or upload from the Tevi app" instead of being trimmed in
the browser. If the real limit is shorter than 10s, people are being told to upload something that
will be rejected after the upload; if it is longer, we are refusing files the backend would accept.

Related: `v4/animated-avatar/` transcodes, so `serve_url` is a playback URL rather than the object
that was written. Is there a state between upload and playable — and if so, what does the channel
carry in the meantime? The client writes `avatar_video` immediately and assumes it plays.

---

## B28 — the two error shapes of `PATCH my-channel/`, and what the `code`s mean

A failed save comes back in **two** different shapes, and the client had to learn the second one
from a bug report rather than from a contract.

```json
{ "errors": [{ "input": "slug", "error": "…" }] }                          // per-field
{ "message": "You can't change username of verified space. Please contact support.",
  "code": "CHN0006", "success": false }                                     // whole-request
```

`parseChannelFieldErrors` reads the first; the second parsed to `{}` and fell through to the
client's generic "try again" line — advice that cannot work for `CHN0006`, since the rule is
permanent until support intervenes. `parseApiMessage` now shows the body's sentence on the form.

What is needed:

- **Is the split predictable?** Per-field for value problems, whole-request for rules about the
  account or the space? If so, the client can stop treating the second as a fallback.
- **Is there a list of `code`s?** `CHN0006` plainly concerns the username, but one observed code is
  not a mapping. With a list, this stops being a raw sentence on screen and becomes a translated
  message per code — and the ones that name a field can be shown *under* that field instead of
  above the form. Without one, guessing risks painting a rejection under the wrong input.
- **Can the client know in advance?** A verified space cannot change its username at all, so the
  ideal is a disabled field with the reason, not a rejected save. Is `verified_tick_badge` the same
  "verified" this rule means, or is there a separate flag? Today the client does not gate it,
  because guessing would lock the field for people who can in fact change it.

Related: `useSlugCheck` posts to `check-slug/` on a debounce — does **that** endpoint know about the
verified rule, or does it answer "available" for a username the save will then refuse? Right now the
form can say "Available" and still fail, which is the worst of both.

---

## B29 — the earnings report's currency: is `total` / `revenue` USD? · **shapes every figure on the screen**

`report/v1/channel/revenue/daily/` and `…/daily/detail/` answer with bare numbers and no currency
field:

```json
[{ "id": "…", "date": 1739923200000, "total": 128.4 }]
{ "details": [{ "category": "membership", "revenue": 42.0 }] }
```

Legacy never asks what unit that is. It multiplies by `exchangeRate` from the balance context and
formats in the creator's selected wallet currency — which is only correct if the wire value is the
**base** currency the exchange rate is quoted against, and that is an assumption nowhere in the
code, only in the arithmetic.

**Update — the wallet has landed and the earnings report still pins USD, deliberately.**
`features/balance` now owns a currency switcher and a real `exchange/v1/exchange-rate/`, so the
missing ingredient legacy used is available. It is **not** wired into `formatEarningsAmount`, and
that is a decision rather than an oversight: applying a rate to a figure whose unit is unknown does
not make it correct, it makes it *confidently* wrong. Today the report reads `$128.40`, which is
wrong only if the answer below is "not USD"; converted, it would be wrong by the rate as well
whenever the base assumption fails. One unknown beats two.

So this question now has a **one-line fix waiting on it** — thread `useCurrency`'s rate and currency
into `features/earnings/lib/format.ts` — and nothing else blocking it.

If the endpoint actually answers in the creator's *own* currency, or in minor units (cents), every
number on that screen is wrong by a factor or by a symbol regardless.

What is needed:

- **What currency are these numbers in?** If it varies by creator, the payload needs to say so per
  row — a report is read months later, and a currency the client infers from today's profile is
  wrong for last quarter's rows.
- **Major or minor units?** `128.4` reads as dollars, but a backend that stores cents and divides
  on the way out is a different contract from one that stores decimals.
- **Is `total` the sum of the day's `details`?** The screen presents it that way — the split is
  drawn as a decomposition of the header. If deductions land only on `total`, the rows visibly do
  not add up and the subtitle ("after all fees") is on the wrong number.

---

## B30 — `date` and `date_ts`: milliseconds, and what is the day boundary? · **two answers needed**

**The unit.** Legacy is internally inconsistent and the client had to pick a reading. It sends
`to_date_ts: Date.now()` (ms), passes `date_ts: item.date` straight through, and compares the URL
segment as `Math.floor(item.date / 1000) === Number(dateTs)` — which is only coherent if `date` is
**milliseconds** and the `[dateTs]` URL is **seconds**. That is what `normalizeEarningsDays` and
`parseEarningsDateParam` encode, with a guard that promotes a seconds-looking value rather than
rendering every row as January 1970. Please confirm both halves; the URL half is load-bearing
because the mobile apps build those links.

**The boundary.** A row is a daily bucket, so it has a timezone even though nothing in the payload
mentions one. `formatEarningsDate` pins `UTC`, on the reading that the bucket starts at UTC
midnight. If the backend buckets in a different zone — the platform's, or the creator's — then a
creator's "Monday" on this screen is not the Monday they streamed on, and the amounts are attached
to the wrong labels. Legacy formats in the reader's local zone, which is wrong under *every*
answer.

---

## B31 — `category` on `revenue/daily/detail/`: what is the closed set?

The client ships nine, from legacy's `REVENUE_CATEGORIES`: `direct_donation`, `interaction`,
`interactive_live`, `membership`, `live_stream`, `post`, `live_guest`, `commission`, `other`.

Nothing says that is the whole list, and the screen is a breakdown of a total — so a category the
client does not know about is money that disappears between the header and the rows. Legacy drops
it silently; `earningsCategoryRows` folds it into `other` instead, which keeps the arithmetic
honest but labels it vaguely.

What is needed: the closed set, and whether it can grow without a front-end release. If it can, an
optional display name on the row would let a new category render properly instead of as "Other" —
the same shape as `social-links/supported-platforms/`, which is server-driven for exactly this
reason.

---

## B32 — how far back does `revenue/daily/` go, and will it paginate?

The client asks with `to_date_ts` and no lower bound, no `limit` and no `offset` — legacy's call,
verbatim — and renders every row it gets. Two things follow that nobody has checked:

- **A creator two years in.** If the endpoint answers with every day since the space was created,
  that is ~700 rows in one response and ~700 cards in one list. There is no virtualisation on this
  screen and no reason to add it while the answer is unknown.
- **If it ever starts paginating**, an unversioned switch to `{ results, next }` would empty the
  screen. `normalizeEarningsDays` already accepts `results` for that reason, but a cursor would
  still need real handling — the infinite-query shape `/settings/blocked-accounts` uses.

Is there a server-side cap today? Is a date range or a page size supported?

---

## B33 — can a day's figures change after they are reported?

The section subtitle says "These are your final earnings after all fees", which the client takes at
face value: the daily list and each day's split are cached under the query client's default 60s
`staleTime` and nothing re-fetches them on focus.

If a day can still move — a late chargeback, a refund, a settlement correction — then "final" is
the wrong word and a creator who screenshotted the screen has a number that no longer matches their
wallet. Two sub-questions: **how long** is a day provisional for, and **is there a flag on the row**
saying so? A provisional row wants a different treatment from a settled one, and today they are
drawn identically because the payload gives the client nothing to tell them apart.

---

# Wallet / balance — B34 onwards

Raised while building `features/balance` (`/my-star` and `/my-wallet`). Legacy reference is
`../tevi-web-app`: `models/{billing,exchange}.js`, `providers/balance/`, `containers/myWallet/`.

The service is `billy` at `v5`, and everything on it is derived from the bearer — no account id, no
channel, no slug on any request.

---

## B34 — what is `config` on `billing/balance/`, and does anything need it?

The response is `{ balances: [...], config: {...} }`. Legacy fetches it, stores it as
`balanceConfigs`, and **no UI reads it** — `grep` finds no consumer at all. This client drops it on
the floor (`normalizeBalance` takes `balances` and nothing else).

Two possibilities and they want opposite actions: it is dead weight on a request made on every page
that mounts the shell, in which case it could stop being sent; or it carries something a wallet
should be honouring (limits? a feature gate? a minimum withdrawal?) that has silently never been
applied on web. Legacy shipping without reading it is not evidence it is unimportant, only that
nobody noticed.

---

## B35 — at a zero balance, is the entry omitted or sent as `0`? · **fixes a stale-figure bug**

`balances` is an array of `{ amount, amount_currency }` and the client looks each currency up by
code. What happens when an account has never had any Star?

**Assumed today:** an absent entry reads as `0` — the honest reading of "the backend did not mention
it", and the same number either way if the entry is sent as `0`.

**Why it matters more than it looks.** Legacy only writes its state when `balances.length > 0`, so a
genuinely empty response leaves the *previous* value on screen. Combined with its single global
balance (one context, not keyed per account), an account switch into a brand-new account shows the
**old account's figures**. The fix here is the account-scoped query key plus this default; the
question is only whether the empty case is reachable at all.

Related: is `amount` ever a **string**? The client accepts both because legacy `parseFloat`s the Star
one and passes the `TEVI` one through untouched, which suggests it has seen at least one of them
arrive as text.

---

## B36 — the closed set of transaction `type`, and is it really two vocabularies?

The client ships legacy's sixteen slugs, split across the two ledgers exactly as
`FILTER_TYPE.getAll()` splits them:

- **`tvs-transactions/`**: `adjustment` `bonus` `consumption` `conversion` `refund` `reward`
  `top_up` `transfer_inbound` `transfer_outbound` `system_deduction`
- **`transactions/`**: `adjustment` `bonus` `charge` `commission` `conversion` `payout`
  `payout_failure` `platform_earning` `refund` `reward` `system_deduction`

Three things follow that nobody has confirmed:

- **Is the split real?** A filter offered on the wrong ledger is a filter that can only ever return
  nothing, and an empty list reads as "no activity" rather than as a bad filter. `lib/transaction-types.ts`
  encodes the split and `isTransactionFilter` refuses a cross-ledger slug.
- **Can the set grow without a front-end release?** An unknown type is **kept** and rendered from its
  `description` (legacy drops it, which makes money vanish from a ledger — the one thing not to do to
  one), but it cannot be filtered and its label is the backend's sentence rather than translated
  copy. An optional display name on the row would fix that the way
  `social-links/supported-platforms/` already does. Same shape as **B31**.
- **Is `type` case-stable?** The client lower-cases it, because legacy compares it against
  upper-case constants in one place (`EARNING_TYPES`) and lower-case slugs in another (the filter),
  so both spellings are in play.

---

## B37 — `created_at` on a transaction: what is the wire format? · **cheap to answer, silent when wrong**

The client accepts **three** shapes — an ISO 8601 string, epoch seconds, and epoch milliseconds —
because legacy never pinned one: it hands the value straight to `date-fns`, which takes all three, so
the contract was never forced to be a single thing.

Accepting all three costs one function and removes the failure mode: a seconds feed read as
milliseconds renders every row as **January 1970** while the amounts stay correct, which looks like a
formatting bug rather than a unit bug. One guard is worth naming — a bare numeric *string* is read as
an epoch, not passed to `Date.parse`, because `Date.parse('1739923200')` is the **year** 1739923200
in V8.

Also: **is the field guaranteed present?** A row with no readable timestamp is dropped, because it
cannot be labelled, cannot be grouped by month, and has nothing to be except an amount on no
particular day.

---

## B38 — do the ledger endpoints carry a `count` or a `next`? · **shapes the infinite list**

Both paginate with `?page&page_size`, and the client infers "there is more" from
`results.length === page_size` — legacy's own rule (`hasMore = results.length === page_size`).

That inference has one visible cost: a ledger whose total is an exact multiple of 20 shows a loading
spinner for one extra request that comes back empty. Accepted, because the alternative failure is
worse — stopping early on a full last page silently hides rows from a ledger.

A `count`, or a `next`, would replace the guess with a fact. If pagination ever changes shape
unversioned, `normalizeTransactions` already accepts the array bare or under `results`, but a cursor
would need real handling (the shape `/settings/blocked-accounts` uses).

---

## B39 — `payout/free-first-transaction-fee/`: what does it answer once the fee is used?

The client reads one field, `is_free`, and **defaults to `false`** — so the green "your first payout
is free" banner on `/my-wallet` appears only when the backend has actually said so, never because
the request failed or the shape moved. Telling somebody a withdrawal is free when it is not is the
one error on that screen that costs them money.

What is unknown: is it `{ is_free: false }` after the fee is spent, a 404, or an empty body? All
three land on the same banner-hidden state here, so this is confirmation rather than a blocker — but
it becomes one when the withdraw flow lands, because the quote will need to know whether to zero the
fee, and that is arithmetic rather than a banner.

---

## B40 — what is the full set of grants `channel/permission/` can return? · **shapes every gate**

The client knows **two**, because two is all legacy reads: `transfer_star.allowed` and
`fiat_agency.{is_active,name,payout_method}`. The payload is parsed with `looseObject` so an unknown
grant survives and can be gated with `rawGrant(...)` without a schema change — but that only helps
for a grant somebody already knows exists.

What is needed is the list, and for each entry **which field means yes**. The two known grants
already spell it differently (`allowed` vs `is_active`), so this is not a naming quibble: a client
that guesses `allowed` on a grant that uses `enabled` reads `undefined`, which is falsy, which
silently hides a feature from every account that has it. `features/permission/lib/capabilities.ts` is
the one place that mapping lives; each answer is one line there.

Also: is a *denied* grant omitted, or present-and-false? The client assumes omitted (an ordinary
creator's response is `{}`) and treats both identically, so either answer works — but only because
"absent means denied" is the rule. If absence ever means "inherit a default", that rule is wrong.

And the status code for an account with **no** permission record at all: `200 {}`, or **404**? The
client assumes 200, so a 404 currently reads as a transport failure and a gated screen offers an
ordinary creator a retry that cannot succeed. It is left that way deliberately rather than mapped to
"denied", because mapping it would also hide a mistyped path or a moved service behind the same
silent "nobody has any grants" — see the note on `permissionApi.getChannelPermission`. A one-word
answer here closes it.

---

## B41 — do these grants depend on Premium, or on anything that changes mid-session?

The client caches them for 5 minutes and re-reads them on the `premium_info` socket frame, on the
assumption that entitlements *can* be premium-derived — buying Premium in one tab should not require a
reload to stop being told you cannot do something.

If grants are purely backoffice state (granted by an operator, never by a purchase), that refetch is a
wasted request on a rare frame and can go. If they *are* premium-derived, the 5-minute `staleTime` is
the thing to revisit, and a dedicated event would be better than inferring it from `premium_info`.

There is no socket event for a permission change today. Is one possible? A grant being switched on
currently reaches the reader on their next cold load.

---

## B42 — `fiat_agency.payout_method` vs `payout/agency-info/`: which is authoritative?

Both answer with the agency's payout methods and their fees, and legacy reads the permission payload
to seed its settings form and then *immediately* re-fetches `agency-info/` over the top
(`containers/payout/components/payoutSettings`) — which is only sensible if the two can disagree.

The client treats the permission copy as a **snapshot for gating and first paint**, and anything about
to be written back as belonging to `agency-info/`. Confirmation would let the payout screen drop one
of the two requests; a contradiction would mean the permission payload should stop carrying
configuration at all, and this feature would keep only `is_active`.

---

## Answered

### ~~B4 — what does `logout` revoke?~~ → **the bearer it is presented, and nothing else**

Consequences, both now encoded in the client:

- A logout is only ever *self*-revocation; one account can never sign another out.
- An **expired** bearer therefore revokes nothing — it 401s and the session survives. So
  removing an account requires refreshing its token *first*, from its own refresh token,
  while the record still exists. Legacy's switch-account dialog presents the stored token
  as-is and swallows the result, so it silently leaves sessions running.

See `authApi.logout(accountId)` and `forgetAccount`.

### ~~B10 — does the channel endpoint answer 200 unauthenticated?~~ → **moot: SSR reads the internal service**

The server render does not go through the public gateway at all. It calls the in-cluster
service directly — `http://tevi-channel/tevi-channel/v3/channel/channels/{slug}` — exactly as
legacy's `services/seo.js` does, so no bearer is involved and the "no SSR bearer by
construction" problem never arises.

Two consequences now encoded in the client, both easy to get wrong:

- The internal origin does not match `NEXT_PUBLIC_W_API_DOMAIN`, so `isApiUrl` is false for
  it. HMAC signing is therefore skipped — **correct**, `?verify=` is a gateway speed bump.
  But envelope unwrapping is gated by the *same* predicate, and the internal service *does*
  wrap in `{ data }` (legacy unwraps it by hand). Hence the explicit `unwrapEnvelope` option
  on `createServerApiModel`.
- It leaves an *infrastructure* question, not a contract one: cluster DNS only resolves when
  the app runs in the cluster. Legacy ships a `Dockerfile` + `helm-values`; this repo has
  neither yet. If it is deployed somewhere else, this question comes back.

### ~~B5 — is `device_id` required on `/me`?~~ → **no; only the token-minting endpoints need it**

So bootstrap publishes a cached device id synchronously and lets FingerprintJS settle in
the background instead of putting its dynamic-import → load → get chain in front of the
first `/me`. Minting paths still await it. See `primeDeviceInfo`.
