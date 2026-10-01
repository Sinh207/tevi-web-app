# Open questions for the API team

Contract questions the web client is currently guessing at, in priority order —
**B11–B28 channel**, **B29–B33 earnings**, **B34–B39 wallet**, **B40–B42 permission**,
**B57–B60 dashboard analytics** (see the headings below). **Auth is fully answered** and
lives in [Closed](#closed) — apart from **B92** (passcode management), **B94** (acquisition /
affiliate attribution) and **B95** (TikTok PKCE); **B88** closed with the auth contract, which
showed the sign-in half was never a question. What auth has instead of open
questions is a list of endpoints nobody has built yet — see
[Auth surface not ported](#auth-surface-not-ported) at the foot.
Each says what the client assumes today, and what changes if the answer differs — so an
answer can be acted on without re-deriving the context.

Questions the backend has **closed** are no longer written out here — they are one line each in
**[Closed](#closed)** at the foot, with where the answer is encoded. The reasoning lives at the
call site the answer shaped.

---

## B90 — which write endpoints guarantee a stable error `code`, and what is the spelling of the message? · **answered for `auth`; still open for the other four services**

The web client has changed its rule for failed writes: a `POST` / `PUT` / `PATCH` / `DELETE` refused
with a **4xx** now shows **the message the body carried**, and falls back to a translated string of
ours only when there is no message ([`API_ERRORS.md`](API_ERRORS.md)). That was the right call —
`CHN0006` ("You can't change username of verified space") is not vague, it is *actionable*, and the
generic "Could not save that change, please try again" that used to cover it was actively wrong.

It also means the API's wording is now on screen for readers in **nine languages**, so two things
that were cosmetic became contracts.

**1. Which write endpoints guarantee a stable `code`?** The client prefers a code over a sentence
wherever one exists, because a code can be translated and a sentence cannot: it maps
`{ code: 'email_already_in_use' }` → `password_error_email_in_use` and shows Vietnamese to a
Vietnamese reader. Exactly **one** such mapping exists today, so almost every refusal currently
shows English regardless of locale.

Please say, per write endpoint (or per service, if it is uniform):

- Is there a `code` on 4xx refusals, and is its **value** stable across releases — i.e. may the
  client switch on it?
- Is the set closed, or may new codes appear? (Unknown codes fall back to the sentence, so a new one
  is safe — but only if we know that is the design.)
- Are the codes documented anywhere, or read off responses? `CHN0006`, `PM0003`, `EC0001` and
  `email_already_in_use` are four different spelling conventions found in four different payloads,
  which suggests four services and no shared registry.

Every answered endpoint converts one English sentence into nine translated locales. That is the whole
value of the question.

**2. Which key carries the message?** Four spellings are live, and the client reads all four in this
order because none of them is documented as *the* one:

```
body.message  →  body.data.message  →  body.detail  →  body.error
```

`detail` is DRF's default and billy sends it; `message` is what the `{ success, code, data, message }`
envelope sends; `data.message` shows up nested inside that envelope; `error` appears on
`v1/connect/*`. **Is one of these authoritative going forward?** The failure mode of guessing is
silent — a response whose message the client does not find shows the generic fallback with nothing
logged and no test failing.

**3. Two statuses where the client deliberately ignores your message**, so you know it will not be
seen and can move anything important out of them:

- **5xx** — never shown. Nobody phrases a server fault for a user, and it is where stack fragments
  live. If a 5xx currently carries a sentence that a reader *should* see (a maintenance window, a
  provider outage), it needs to be a 4xx or 503-with-a-code to reach the screen.
- **429** — never shown; the client uses `Retry-After` and its own translated sentence, because a
  throttle is often answered by the proxy rather than by you. Same note: if the API itself
  distinguishes kinds of rate limit, that has to be a `code`.
- **403** — never shown either; `features/permission` owns that vocabulary and a grant name is not
  reader-facing.

**What changes if the answers differ:** the message-key order and the status filter are one function,
`apiErrorText` in `shared/lib/api/error-message.ts`, with a unit test per case. Code mappings are one
record per feature (`SEND_CODE_ERROR_KEYS` is the pattern). So all of this is cheap to correct — what
is not cheap is *not knowing*, because every gap shows up as English in eight locales.

### ✅ Answered for one service: `auth` publishes a closed, documented code table

The auth contract answers all three questions for `${W_API}/auth` — and it is the service this
client argues with most, so it is a good half to have.

- **The codes are stable, enumerated and reader-actionable**, with the client's own response spelled
  out per code (`no_auth_token` → sign-in screen, `suspended` → appeal screen, `AU006` → mint a new
  link). Two conventions coexist and both are real: prose codes (`validation_error`, `suspended`,
  `2fa_passcode_incorrect`) and `AU0xx` for the two-factor family. **Branch on `code`, never on
  `message`** is stated as the contract's own instruction, which is what this question was asking
  permission for.
- **The message key is `message`, at the top level** — alongside `code`, in
  `{ success: false, message, code }`. So the first spelling in the chain above is the right one for
  this service, and `errors.ts` already reads `code` from the top level.
- **One documented exception, and this client already handles it**:
  `POST v1/me/validate-display-name/` answers a *different* error shape —
  `{ success, message: "validation_error", errors: [{ input, error, code }] }`. That is the
  `errors[0].error` spelling `use-create-channel.ts` reads and that `CLAUDE.md` calls out as one of
  the two reasons the field union cannot be narrowed. Confirmed, not a legacy quirk.
- **Two statuses carry no `code` at all**, which is worth knowing because both look like faults and
  neither is one: **499** `{ success: false, message: "request canceled" }` — the *client* aborted,
  so it must never be reported as a failure — and **504** `{ … "request deadline exceeded" }`, which
  is a retry-with-backoff. `ApiError.isCanceled` covers the locally-aborted case; a 499 arriving
  from the *server* is not something this client distinguishes today, and on a write it would be
  reported as a generic failure for a request that may or may not have landed.

**Still open: the other four services.** `CHN0006`, `PM0003` and `EC0001` are three more spelling
conventions from three more services (channel, payment, e-commerce), and billy's `detail` is a
fourth message key. The auth table does not speak for any of them, so the question above stands
unchanged for `core`, `billy`, `payment` and `premium` — and the answer wanted is the same one:
a table like auth's, per service.

---

## B88 — `two_fa_passcode: true` on `/me`: what does `user-login/login/` do for that account? · **answered: nothing — the factor is per-action, not per-session**

> **Narrowed to sign-in.** This question used to cover both places the flag matters. The
> **withdrawal** half is now built, recovery included, and needs nothing from the backend:
> `two_fa_passcode` gates a passcode step before `payout-request/`, and *Forgot passcode?* runs the
> three-call chain `recover/` → `reset/verify-otp/` → `reset/` in the same dialog
> (`TwoStepVerificationDialog` + `useTwoFaFlow`). A probe settled the contract — all four routes are
> live, POST-only, behind the bearer, answering `401 no_auth_token` unauthenticated. What remains
> below is the **sign-in** half only, which is still blocked on an answer. The refusal vocabulary of
> the *write* is B91.

Found in a live `/me` body, not asked for in advance:

```jsonc
{ "id": 2533836474, "email": "…", "two_fa_passcode": true, "email_verified": true, … }
```

So an account can have a second factor, and **this client knows nothing about one**. `runSignIn`
treats every `v1/user-login/login/` response as a minted session: `TokenResponse` is read for
`access_token`, the account is stored, `/me` is fetched and `auth:signed-in` fires. There is no
branch for "correct password, now prove the second factor", and no screen to render one.

**What was needed, in the order it would have been built:**

1. **What does `login/` answer when `two_fa_passcode` is true?** A 4xx with a code, a 200 carrying a
   challenge instead of a token, or a token regardless (the factor being enforced somewhere else
   entirely)? Each is a different amount of work, and only the last one is none.
2. **If it is a challenge, what redeems it?** `verify-otp/` with a new `purpose`, or its own
   endpoint?
3. **Is the factor TOTP or a passcode the account set?**

### ✅ Answered: it is the third option, and the work is none

`POST v1/user-login/login/` has **no second-factor branch**. It answers the same token pair for
every account, and its documented refusals are `400 validation_error` (bad credentials) and
`401 suspended`. There is no challenge, no `sid` correlator, nothing for the sign-in screen to
render — which retires questions 2 and 3 along with it.

**The factor is enforced per *action*, not per session**, and the contract shows it directly:
`POST v1/sessions/:id/logout/` and `POST v1/me/deactivate/` both take an optional `{ passcode }` and
answer **`422 2fa_passcode_required`** when the account has one and the body omitted it. That is
exactly the shape `features/payout` already builds against for a withdrawal (B91), so the pattern is
the service's, not one screen's — and it is the reason a passcode never needed to reach sign-in.

**What this changes in the client: nothing, deliberately.** The path that looked dangerous — a login
response with no `access_token`, stored as a broken account and reported as "Incorrect email or
password" — cannot happen, because that response does not exist. The urgency question ("is 2FA
backoffice-only, or can any user turn it on?") is moot for sign-in; it stays relevant only to how
many accounts meet a passcode step in front of a withdrawal.

⚠ **The one sign-in refusal that *was* being mis-worded is `401 suspended`**, and it had nothing to
do with 2FA. `toSignInErrorKey` collapsed 400 and 401 onto `auth_invalid_credentials`, so a
suspended account was told its password was wrong — a password that is right, and that no reset can
make work. `code === 'suspended'` is now lifted out of that collapse onto `auth_account_suspended`,
knowingly trading a little enumeration for the one sentence the person can act on: the backend
publishes both a `code` for this state and an appeal endpoint to answer it, so it is meant to be
surfaced. **`GET`/`POST v1/appeal/` are still unported** — the sentence names support rather than
offering the form. That is the follow-up, and it is a screen rather than a question.

Two things about the recovery chain that the backend may want to confirm, neither blocking:

- ~~**`recover/` takes no body and the client is never told the destination.**~~ **Answered: it
  returns the address.** So the step names the inbox — *"…sent to creator@tevi.com"* — instead of
  legacy's generic "your recovery email address", which leaves an account with two addresses checking
  the wrong one and pressing Resend at a code that already arrived. Parsed by `recoveryEmailOf` in
  `two-fa-api.ts`, which reads three spellings (`recovery_email`, `email`, either nested under `data`)
  because none is in a schema, requires an `@` and ≤254 chars, and falls back to the generic sentence
  on any miss. It is **display only** — nothing is authorised or addressed on it.
  Still open, and smaller: **if an account has no recovery email on file**, `recover/` is the only
  thing that knows, and the client shows its own "couldn't send" line rather than the backend's
  sentence — so *why* it failed is invisible. A `code` on that 4xx would let us say "you have no
  recovery email set" instead of a generic failure.
- ~~**The emailed OTP's lifetime is unstated.**~~ **Answered: it is the 30 seconds.** The resend gate
  and the code's lifetime are the same number, so `CODE_TTL_SECONDS` in `use-two-fa-flow.ts` drives
  both — `ForgotPasswordFlow`'s arrangement, and for its reason: two numbers would only create a
  window where neither works. Past zero the boxes are disabled and the step says `auth_otp_expired`
  ("tap resend to get a new one") rather than sending digits the server has already dropped — a
  refusal there is indistinguishable from a mistyped code, so somebody would sit re-reading digits
  that were right. ⚠ Note this is **half** `ForgotPasswordFlow`'s 60: that is the password-reset OTP
  on a different endpoint, whose own answer is B7. Do not fold the two constants together.

Two smaller unknowns from the same body, neither blocking:

- **`email_verified`** — is a sign-in refused for an unverified address, or is the flag only for
  display? Nothing reads it today, and neither does `is_suspended`, though the contract says both
  are among the three flags to read on every app open (`two_fa_passcode` is the third, and is the
  only one this client reads). `is_suspended` is the more actionable of the two: a session can go
  suspended *after* sign-in, and today nothing on the website would say so — the account simply
  starts failing writes. *Is `/me` the intended signal for that, or does a live suspension arrive on
  the user room?* Both would want the same screen, which is the appeal form above.
- **`verify-email/` returns a new token pair.** Not read anywhere yet, but worth recording before
  the screen is built: `POST v1/verify-email/` answers `{ access_token, refresh_token, … }` rather
  than the `{}` every other OTP step returns, because verifying the address changes the claims. A
  client that ignores the body keeps a token whose claims are stale. `verify-email-request/` and
  `verify-email/` are both unported.
- **`country` / `language`** — `/me` states both. Locale is currently resolved from the `tevi.locale`
  cookie then `Accept-Language` (`shared/i18n`), and `defaultCountry` comes from Remote Config and is
  nullable by design. Should a signed-in account's own `country` / `language` outrank either? Doing
  it without an answer would silently change the language under people who set it in the browser.

---

## B92 — two-step-verification **management**: mostly answered by the auth contract · **one bullet left**

`/settings/two-step-verification` is built. When it was written, `two-fa/` was in no schema and
nothing in either app had ever called four of its endpoints, so the payloads were read off legacy's
JSDoc and the mobile app's copy. The **auth API contract** has since settled almost all of it, and
what it corrected is worth recording — three of the four corrections were things the client had
already shipped, and two of them could not have been found by probing:

| was | is | how it was caught |
|---|---|---|
| `DELETE two-fa/passcode/` with **no body** (legacy sends none) | takes **`{ passcode }`** | contract |
| the setup OTP from `user-login/send-otp/ { purpose: 'verify' }` | **`POST v1/recovery-email/verify/`** — a different family | contract |
| *Change recovery email* via `PATCH two-fa/passcode/ { passcode, recovery_email }` | **`PATCH v1/recovery-email/ { recovery_email, otp }`** | a live `400`: `{ code: "validation_error", message: "Passcode must be 6 digits" }` — that route wants `new_passcode` |
| then via `POST two-fa/passcode/` (reusing setup as an upsert) | never possible — **`422 AU001`** for an account that already has a passcode | contract |
| `GET two-fa/passcode/` → 404 when unset; address comparable | **`422 AU002`** when unset; the address comes back **masked** (`u**r@gmail.com`) | contract |

The masking mattered twice: a read-back that compared the stored address against what the reader
typed would have failed on **every** success, and the field must never be pre-filled from the record
or the reader submits the asterisks. Both are now stated at `twoFaApi.getPasscode`.

Also confirmed and encoded: `2fa_passcode_incorrect` on `verify/` and `PATCH`, `AU005` on `recover/`
for an account with no recovery email, and `recover/`'s masked `{ recovery_email }` — which the UI
already prints so the reader knows which inbox to open.

**What is still open:**

**1. `PATCH v1/recovery-email/` answers `422 AU004` when a recovery email is already set — so which
call changes one?** ⚠ This is the blocker. The contract documents that route as *confirm and save*,
while the app offers **Change recovery email** to accounts that plainly have one, and no other route
exists: twenty-odd candidates probed signed and without a bearer (so a 404 is a real absence, and
`GET two-fa/passcode/`'s 401 proves the probe distinguishes) all answer 404 —
`two-fa/recovery-email/`, `two-fa/passcode/recovery-email/`, `…/update-recovery-email/`,
`…/change-recovery-email/`, `…/set-recovery-email/`, `…/recovery-email/verify/`,
`v1/me/recovery-email/`, `v1/user-login/recovery-email/` and the rest.

So either **AU004 is narrower than it reads** (it fires only when the address is unconfirmed, say),
or there is a route the contract does not list, or changing one is not supported and the screen
should be removed. The client ships the `PATCH` and shows the API's own sentence on a 4xx
(`API_ERRORS.md`), so today a wrong guess is a legible error rather than a false confirmation — but
it is a screen that cannot work until this is answered.

~~**2. Is the passcode 4 digits or 6?**~~ **Answered: six.** The contract's examples all say
`"1234"` and are illustrative — the live gateway refuses a shorter one (`"Passcode must be 6
digits"`), legacy hard-codes 6 in five places and every comp draws six boxes. `PASSCODE_LENGTH` says
so at its declaration, including the warning not to "fix" it to match the examples.

**Encoded since:** `AU005` on `recover/` now has its own sentence (`toTwoFaRecoverErrorKey` →
`auth_two_fa_no_recovery_email`). It was listed above as "confirmed and encoded" while only the
first half was true — the mapper returned the generic "couldn't send the recovery email, please try
again", which offers a retry for the one refusal on that step that no retry can fix. It is the only
`code` this client branches on in the two-factor family; `2fa_passcode_incorrect` stays folded into
`toPasscodeErrorKey`'s every-4xx rule on purpose, since that request carries a passcode and nothing
else for the server to object to.

**Also worth a `code`:** does `POST two-fa/passcode/` refuse a **weak** passcode (sequential digits,
repeats)? The client reads a 4xx on that call as being about the emailed code — the only field on the
request with a lifetime, and the only one the reader can act on from that step — so a refusal about
the passcode would be worded wrongly. A `code` settles it (`toTwoFaCreateErrorKey`), and it is the
same request B90 makes generally.

---

# Channel / space — B12 onwards

Raised while building `features/channel` (the `/@{slug}` page). Legacy reference is
`../tevi-web-app`: `containers/channel/`, `models/channel.js`, `services/seo.js`.

---

## B12 — `media_type` on the threads endpoints: what values, and how is it repeated?

Legacy builds a repeated bare key by hand (`media_type=IMAGE&media_type=VIDEO`); axios 1.x
would serialise an array as `media_type[]=image`, so the client sets
`paramsSerializer: { indexes: null }` to match legacy's wire format.

**If the server wants brackets or a comma-joined list instead:** the media tab returns
*unfiltered* results and **looks like it works** — the grid fills with posts, just the wrong
set. That is the failure mode worth naming: no error, no empty state, only wrong content.

**Answered for the values, 2026-09-28 — measured on staging, `my-channel/threads/`:**

| query | result |
|---|---|
| no `media_type` | 200 |
| `media_type=IMAGE&media_type=VIDEO` | 200, images and videos only |
| `media_type=IMAGE` | 200, images only |
| `media_type=image` / `video` / `image&…video` / `image,video` | **500** — `runtime error: invalid memory address or nil pointer dereference` |

The values are **upper case** — legacy's `TYPE_POST_IMAGE_SLIDE.IMAGE` / `.VIDEO`, which is what
it actually sends; this entry used to quote it in lower case, and the client copied that. The
repeated bare key is confirmed. Still open, for the backend: an unknown value should be a **400**,
not a panic — the lower-case spelling took down the Media tab on every space and said only
"Internal Server Error".

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

## B22 — `identification/submissions/`: what is the closed set of `status` values? · **answered; one half left, and it is the *write***

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

### ✅ Answered by the auth contract — and the guessed logic survived intact

The vocabulary is **`pending` · `approved` · `rejected`**, lowercase, and the filter proves the set
is closed: the list takes `?status=pending,rejected`, comma-separated. Three of the six statuses
this client guessed at do not exist, and none of the three that mattered was missing — `normalize()`
upper-cases before it compares, so `pending` matches `PENDING` and `approved` matches `APPROVED`,
and `rejected` falls through to `unverified`, which is where it belongs. **Nothing in
`identity-state.ts` had to change.** The closed list stays as it is: it costs nothing, and the six
spellings are what protect the screen if Sumsub's own vocabulary ever reaches it unrespelled.

The row is also wider than this client modelled:
`{ level, status, submitted_at, approved_at, rejected_at, rejected_reason, data }`, with the three
timestamps in **epoch seconds**. `api/types.ts` declared `created_at` / `updated_at` as ISO strings —
**two fields the endpoint has never sent**. Nothing read them, so nothing broke; they are gone.
`rejected_reason` is the one worth having later: it is the only thing that can say *why* a
submission failed, and the screen currently sends people back through Sumsub without it.

**Pagination: yes, and it was a real (if quiet) bug.** Every list endpoint on the auth service takes
`?page=&page_size=`, defaults to **50** and caps at **500**. This call read `results` and ignored
`next`, so an account with 50+ submissions whose approval had scrolled off the first page would be
told to verify again. Fixed by asking for the documented maximum in one request
(`identification-api.ts`) rather than by following `next`, which would be a paging loop for a list
that is a handful of rows for every real account. Pinned by a test, because the failure is silent —
nothing throws, the screen just shows the intro.

**Still open, and it is the one that can 400: the level's casing on the *write*.** The contract
writes every level lowercase — `{ "level": "level_2" }` to `sumsub/request/`, and
`identification/levels/` returning `{ "id": "level_1" }`. Legacy sends `LEVEL_2` and is in
production, so that is what this client sends. Reading is safe either way (`normalize()`), but the
write can only be one of them. *Which does `sumsub/request/` accept — and does it accept both?* Do
not flip `IDENTITY_LEVEL` on the contract's examples alone; a wrongly-cased level is plausibly a 400
on the one button that starts verification.

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

**Partially answered (2026-08-26), for one of the three endpoints.** A live response from
`billy/v5/billing/payout-request/` carries `count`, `next` and `previous`:

```json
{ "count": 3, "next": null, "previous": null, "results": [ … ] }
```

So `features/payout` reads `next` and pays none of the cost described above. The question stands for
the two **ledger** endpoints (`v5/billing/transactions/` and the Star ledger), which have not been seen
to send it — *is the envelope available there too, or is it specific to payout-request?* If it is
available, both ledger hooks drop their `results.length === page_size` inference and one wasted request
per exact-multiple total goes with it.

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

## B43 — `GET billy/v1/gifting/direct-donate/{slug}/` for a space with no offer: 404, or 200 with nothing?

Roughly half of all spaces take no donations, so this is the **common** response rather than an edge,
and the two answers are handled by different code.

The client assumes **404** and swallows it: `donationApi.getOffer` catches that one status and
resolves `null`, which makes the query succeed, raises no toast, and lets both surfaces render
nothing. Every other status is left to reject, deliberately — a 500 means the offer's existence is
*unknown*, and answering `null` there would silently hide a Donate button the creator is watching.

If the endpoint instead answers `200` with `{}`, `null` or `{ "data": null }`, the client already
copes: `normalizeDirectDonate` returns `null` for a body that is not an object. What breaks is only
the reverse — a `200` carrying a **partial** offer (say, `prices: []`) would parse as a real offer
with no price and be gated out by `hasStarPrice` instead of by the parse, which is the same outcome
by accident rather than by rule.

---

## B44 — `prices[]`: is `TVS` guaranteed, and is `amount` a string or a number? · **decides whether a button appears**

Legacy selects both lines with `findIndex` over `amount_currency` and calls `parseFloat` on `amount`,
which is evidence that neither the order nor the type is fixed. This client does the same and
upper-cases the currency on the way in, because legacy `.toUpperCase()`s it at every comparison.

Two things follow from the answer:

- **If a Star line can be absent**, a cash-only offer exists and the client is right to render no
  button for it today (the Stripe path is not built — see `features/donation/index.ts`). If `TVS` is
  always present, `hasStarPrice` is dead weight and the gate can go.
- **If `amount` can be `0`** — a "pay what you want" offer, say — the client currently treats that as
  a missing price and falls back to `100`, because a unit of zero divides by zero in the
  quantity/amount arithmetic. A real zero-priced offer needs a different form, not a different
  default.

---

## B45 — `POST direct-donate/{slug}/`: is `tvs_amount` the total, and is it idempotent? · **it debits a balance**

The client sends `{ tvs_amount, message }` where `tvs_amount` is the **total Star** (quantity × unit
price), following legacy — which computes `amountStar` and never sends a quantity at all. If the
backend expects the *count*, every donation is currently overcharged by a factor of the unit price;
if it expects the total and we sent the count, every one is undercharged. There is no response field
that would reveal which, so this is checked by reading legacy rather than by observation.

Idempotency matters separately: `apiClient` never retries this POST (writes are replayed only with
`{ retry: true }`), so a 502 arriving after the debit landed leaves the reader unsure and the client
silent. If the endpoint deduplicates on something, the flag can be turned on and a network blip stops
being a lost donation.

Also: what does a **success** body carry? The client ignores it and invalidates `donationKeys.all`
instead. If it answers the updated offer, that refetch is avoidable.

---

## B46 — `button_text` and `thank_you_msg`: creator-authored text, or keys?

Both are rendered **verbatim and untranslated**, on the reading that they are what the creator typed —
the same narrow exception `signInErrorText` documents in `features/auth`.

Legacy disagrees with itself here. Its About-tab card prints `button_text` raw, while its dialog runs
it through `useHelper.handleKey`, which searches the entire English bundle for a string equal to it
and uses the matching **key**. That silently mistranslates any creator who typed the word "Donate"
and does nothing for everyone else, so it is not ported. If these fields really are keys from a fixed
set, the client should be given the set.

`thank_you_msg` has a second half to it: legacy renders it through `dangerouslySetInnerHTML`, i.e.
every creator's profile field is script injection into every visitor's page. This client renders it as
text. **Is the field HTML by contract?** If it is, it needs a sanitiser and a stated allow-list, not a
raw insert; if it is plain text, legacy has an XSS hole that should be closed there too.

---

## B47 — is there one endpoint that can say *what kind of code* this is? · **removes a round trip and a double-spend risk**

`/redeem-gift-code` has one field and no way to know which service owns what is typed into it. So the
client offers the code to **both**: `premium/v1/redeem/` first, then `billy/v1/gifting/redeem/`, stopping
at the first that accepts it (`features/gift-code/lib/redeem-sequence.ts`).

Legacy `await`s both on every press, unconditionally — it redeems a Premium code and then posts the
*same code* to the gifting service, arranging not to show the refusal. That is only safe while neither
service accepts the other's codes. **Is that guaranteed?** If it is not, one press can spend a code
twice today.

**What would help, in order:** an endpoint that classifies a code without consuming it, or a single
redeem endpoint that fans out server-side. Either removes the extra round trip on the common case (a
Star gift, which currently pays for a rejected Premium call first) and makes the ordering question moot.

**If the answer differs:** `giftCodeApi.redeem` and the sequence module — the sequencing is deliberately
in one pure function so this is a small change.

---

## B48 — `POST billy/v1/gifting/redeem/`: what is the closed set of `object.type`, and is `star_quantity` a number?

**Assumed today**, from legacy's `res.data.data.object`:

```jsonc
{ "object": { "type": "star_gift", "data": { "star_quantity": 500 } } }
```

- `type` is compared **case-insensitively** against `STAR_GIFT`; legacy compares against the lower-case
  spelling, which is the only evidence either way.
- `star_quantity` is read as a number **or** a decimal string, because every other amount on the billing
  service is a string and the two come from one service.
- Anything else that parses is a redemption this client cannot itemise, and shows "your code has been
  redeemed" rather than an error — the code *was* spent (`RedeemOutcome.other`).
- A 200 with **no** `object` is treated as a refusal, as legacy treats it. *Is that shape ever a success?*

**What the closed set is** decides whether the result panel can name what arrived. If gift packages,
exclusive products or currency top-ups can come back here, each is a panel the client could show
instead of the generic line.

**If the answer differs:** `features/gift-code/api/types.ts` plus its test, which pins every shape.

---

## B49 — `POST premium/v1/redeem/`: does the response carry the grant? · **saves a second request on every Premium code**

Legacy reads **nothing** out of this body — it checks that the body is truthy, then fetches
`premium/v1/user/info/` for `expires_at` and renders the result from that. This client does the same,
because inventing a duration from an undocumented field would be a claim about how long somebody's gift
lasts.

**If the response already carries `expires_at`** (or the number of months granted), the client can drop
the follow-up request entirely — that is one round trip on the screen's success path, and it removes the
window where the panel has to render skeletons.

Two more, both about what the reader is told:

- **What status does an already-redeemed code return, and is it distinguishable from an unknown one?**
  Both currently produce the same sentence, *"The code entered is not valid."* — "this code has already
  been used" is a materially different thing to be told, and the client would show it if it could tell.
- **Is a redemption idempotent?** Neither redeem call is retried (`apiClient` replays a POST only with
  `{ retry: true }`), on the assumption that it is not.

**If the answer differs:** `usePremiumInfo` disappears or narrows; the "already used" case adds one key.

---

## B50 — are gift codes case-insensitive, and is there a canonical format?

The field is sent **trimmed and otherwise untouched** (`normalizeCode`): no upper-casing, no stripping of
dashes or internal spaces. Trimming is safe because codes arrive by copy-paste; case-folding is not,
because a case-sensitive backend would turn a valid code into a rejection that reads like "already used".

`MIN_CODE_LENGTH` is **6**, which is legacy's floor and a courtesy — it stops the two requests above
firing on a stray keystroke. It is not a format claim, and nothing in the client rejects a code the
server might have accepted.

**Is there a real grammar** (length, alphabet, a dash pattern)? If there is, the field can validate before
spending a round trip, mask as the reader types, and — the useful part — say *which* part is wrong.

---

# Membership (subscriber side) — B51–B53, and B60

`billy/v3/subscription/my-subscriptions/`, read by `features/membership`. The creator's side of the
same service (`my-packages/`, `my-channel-subscriptions/`, `benefits/`) has no client yet, so nothing
below is about it.

## B51 — does a row carry both prices, or is the ×100 rate the client's to know? · **the client hardcodes a platform number**

A row carries **one** figure and **one** currency: `package_price` plus `package_price_currency`, which
is `TVS` or `USD`. The design draws **both** units — the Star figure with the gold mark, and the cash
equivalent under it — so one of the two is always derived, and the client derives it by multiplying or
dividing by **100** (`STAR_PER_USD` in `lib/membership-price.ts`). Legacy does the same with a bare
`× 100` at the call site.

That constant is a *platform* fact living in client code, which is exactly what
`shared/lib/remote-config` exists for. Two ways out, and either removes it:

- **`prices[]` on the nested `package` already carries a line per currency** (see B44 for its shape).
  If the line matching `package_price_currency` and the other line are both guaranteed present, the
  client can read the pair instead of computing it, and a rate change stops being a deploy.
- Otherwise the rate belongs in `WEB_CONFIG` beside the other prices and limits.

Until then, a rate change silently mis-states every membership price on the screen, in the direction
nobody notices: the figure stays plausible.

## B52 — `q` and `payment_method`: what does the search match, and what is the closed set? · **shapes two controls**

`GET my-subscriptions/?status&payment_method&q&page&page_size` is the whole surface this screen uses.
Both filters are sent as legacy sends them, and both are guesses about the contract:

- **`q`** — the client sends the trimmed term with **no minimum length**, debounced 400ms, and calls the
  result "no memberships matched". Legacy imposes a three-character floor, which makes the field
  unusable for CJK display names and silently shows the *unfiltered* list below the floor. What does
  the backend actually match — the creator's display name, the handle, the package name, all three? If
  it only matches one of them, the empty-state copy is wrong about what was searched.
- **`payment_method`** — the client offers `star` and `card` plus "All" (the parameter omitted), and can
  *label* `vip_pass`, which legacy grants but whose filter tab is commented out. **What is the closed
  set?** A value that ships without the client knowing becomes a row labelled by
  `prettifyPaymentMethod` — readable, untranslated — and a membership the filter can never isolate.

Also: is `status` restricted to `active` / `expired`, and is omitting it "both"? The client never omits
it, so a third value would silently be invisible under both tabs.

## B53 — is a cancelled membership still `active`, and does `end_date` mean the same in both? · **decides what the row promises**

The row's date line changes *meaning* on `canceled_at`: with it absent, `end_date` is printed as **Next
charge**; with it present, as **Expiry date**. That is legacy's branch and it is the one error on this
screen that costs a support ticket in either direction — telling somebody they are about to be billed
when they cancelled, or the reverse.

What the client assumes, and would like confirmed:

- A cancelled-but-not-yet-expired membership stays in `status: active` and appears under the Active
  tab. If it moves to `expired` at cancellation rather than at term end, the Active tab is hiding
  memberships the reader still has access to.
- `end_date` is the end of the **current paid term** in both statuses — i.e. the same field means "when
  you will next be charged" and "the last day you have access", and `canceled_at` is the only thing
  that distinguishes them.
- `canceled_at` is *presence-as-fact*. The client never prints it; if it can be set and then unset by
  `undo-cancel/`, presence is enough. If a cancellation is instead recorded permanently and undone by
  some other field, this branch is wrong for every reactivated membership.

---

## B54 — `POST balance/transfer-star/`: how many receivers may one call carry? · **the client shows a cap it does not enforce**

Legacy prints `{n}/10 receivers added` on its bulk review screen and enforces **nothing** — a CSV with
forty usable rows is sent as forty. So `10` is a number the client has always displayed and never held
anybody to, and this client does the same rather than inventing enforcement (`MAX_RECEIVERS` in
`features/star-transfer/lib/transfer-rules.ts`).

What is needed:

- Is there a per-request limit at all, and is it 10?
- What does exceeding it answer with — a 400 naming the limit, or a partial success?
- Is the write **atomic across rows**? If row 30 of 40 fails, are the first 29 debited? The receipt
  prints the records the response carries, so a partial success renders honestly today — but only if
  the response lists the ones that landed rather than 400-ing the lot.

If there is a cap, the review screen blocks on it instead of merely counting, which is one line.

---

## B55 — what does `POST balance/transfer-star/` answer with, and is it idempotent? · **it debits a balance**

The client sends an **array** — `[{ user_id, amount, description }]` — as legacy does, and parses the
response as the **created transfer records**: `normalizeTransfers` reads `id`, `amount`, `fee`,
`created_at` and `user` off each element, and the receipt prints them.

**One half of this is now answered, the hard way: the response does *not* carry `user`.** This note used
to end "if the response does not carry a `user`, the receipt still renders (the row goes unnamed) but
loses the faces, so it is worth confirming" — it does not, and the consequence was worse than losing a
face. `PartyCard` fell back to printing the *transfer ID* in the **Tevi ID** column and `—` for the
username, so the last screen of a money flow — the one somebody keeps, screenshots or saves as a PDF —
said nothing about who had been paid.

Legacy zips the response against its *request* by index (`res.data.data.map((item, idx) => ({ ...item,
user: listReceiver[idx]?.user }))`). This client refused that zip on the grounds that it guesses the
response preserves request order, and read each record's own `user` instead. Legacy was right about the
gap and wrong about the safety: `withKnownParties` now does the same positional fill **with the guard
legacy lacks** — the server's own `user` wins wherever it sends one, and a length mismatch (a row
dropped for having no timestamp) skips the merge entirely rather than shifting every receiver onto the
wrong amount.

Still open on this half: whether `user` is omitted deliberately (a slimmer write response) or by
oversight, and whether the array order is contractual. The client no longer depends on the second
question for the *identity* of a row — only for aligning two lists it built itself in the same closure —
but a documented order would let the merge stop being length-gated.

Idempotency matters separately: `apiClient` never retries this POST (writes are replayed only with
`{ retry: true }`), so a 502 arriving after the debit landed leaves the reader unsure and the client
silent. If the endpoint deduplicates on something, the flag can be turned on and a network blip stops
being a lost transfer. Same question as B45 about donations, and the same reason it cannot be assumed.

Also: **is there a fee?** The form and both review screens print `0`, which is legacy's hard-coded
figure. The receipt prints the record's own `fee`, so a fee that exists would show up *after* the
transfer rather than before it. If one is ever charged, the client needs a quote — or the rule.

---

## B56 — `transfer-star/template/validation/`: what is `errors`, and what does the template contain? · **decides what a reader is told about a bad row**

The client posts the CSV as `multipart/form-data` and reads back one row per line:
`{ user, amount, errors }`. It tests `Object.keys(errors).length` — an **object keyed by field name**,
which is what legacy tests too — and uses only the *count* of bad rows
(`star_transfer_invalid_rows`). Nothing reads the messages inside, because a per-field sentence the
backend wrote in one language cannot be put in front of a reader in nine.

What is needed:

- The shape of `errors`: `{ field: string }`, `{ field: string[] }`, or a code we could translate? A
  **code** per failure (`user_not_found`, `amount_too_low`, `self_transfer`) is what would let the
  review screen say *which* lines were dropped and why, which is the one improvement this screen is
  waiting on.
- Does the response preserve the file's row order? The client keeps whatever order it gets, first
  appearance winning, so a reader can check the list against their spreadsheet.
- What columns does `template/` actually ship, and is the header row localised? The instructions on
  the upload screen name "Receiver IDs" and "Amount of star" from legacy's copy; if the template's
  columns are named differently the two disagree in front of the reader.
- Is a row whose Tevi ID is the **sender** rejected by the backend, or accepted? The client drops it
  either way (`planTransfers`), and counts it among the invalid rows.

---

## B57 — `channel/stats/`: what is the closed set of metric `name`s, and is `display` always formatted? · **shapes every label and every figure on the dashboard**

The dashboard prints the headline figures **verbatim** — `display` and `prev_display` straight onto the
tab — because the server knows the account's currency and its decimal digits and the client does not
(the same gap `features/earnings` documents: there is no wallet in this app yet). It formats only the
chart's own numbers, from `points[].amount` plus `currency_display` and `is_integer`
(`features/analytics/lib/format.ts`).

What is needed:

- The closed set of `name`. `METRIC_LABEL_KEYS` in `lib/metric-labels.ts` carries the twelve legacy
  knows about; anything else falls back to the payload's English `description`, so a new metric ships
  untranslated rather than missing. A list would close that gap and let the union become a type.
- Is `display` **always** present and always formatted? A tab whose `display` is empty prints an em
  dash today, on the grounds that "the backend sent no figure" is not the same as "this earned
  nothing". If it can be absent for a metric that *does* have points, the client should sum them
  instead — but that needs the currency, which is the first half of this question.
- Is `currency_display` ever a code (`USD`) rather than a symbol (`$`)? It is prepended verbatim, so a
  code would render as `USD1.2K`.
- Are `from_date_ts` / `to_date_ts` **inclusive** at both ends? The client sends local midnight and
  local 23:59:59.999 and labels the range as inclusive of both days
  (`analytics_range_subtitle`). If the upper bound is exclusive, every range is a day short and the
  caption is wrong rather than the figures.

---

## B58 — is `prev_points` positionally aligned with `points`? · **decides what "the previous period" means on the chart**

The chart pairs the two series **by index** — bucket *n* of this period against bucket *n* of the
previous one — which is what makes "the same day last month" comparable, and what legacy's transformer
does (`prevPoints?.[index]?.amount || 0`).

What is needed:

- Are the two arrays the same length, and does index *n* mean the same offset into each window? A
  shorter `prev_points` currently reads as `0` for the missing tail, which draws a comparison line
  falling off a cliff at the end of the plot.
- Are `prev_points[].date` the **previous** window's dates? Nothing reads them today (the axis is
  labelled from `points`), so if they are echoes of the current window that is fine — but the tooltip
  would want them the moment it names the date it is comparing against.
- Is `last_duration_compare_percent` computed from the same pairing, or from the two totals? The
  tooltip computes its own per-bucket percentage (`pointChangePercent`) and the tab prints the
  backend's; if the two definitions differ they will disagree on screen at some point.

---

## B59 — `POST config/user_config/metric/{id}/`: is `position` 0-based, and is it idempotent? · **it rearranges a screen the reader configured**

The client sends `{ position, is_selected: true }` with `position` taken from the **tab index it was
pressed on**, so slots are 0-based, and it never sends `is_selected: false` — a slot always shows
something, so removing a metric means putting another in its place
(`analyticsApi.selectMetric`).

What is needed:

- Is `position` 0-based or 1-based? A one-off means every swap lands in the neighbouring slot, which
  looks like a UI bug and is silent.
- What happens to the metric that *was* in that slot — is it dropped automatically, or does it now
  share the position? The client only offers metrics that are not already on screen, so it never
  creates a duplicate deliberately; it also refetches both lists afterwards rather than assuming.
- Is the write idempotent? `apiClient` never replays a POST (writes need `{ retry: true }`), so a 502
  after the write landed leaves the client silent. Same question as B45 and B55, same reason.

---

## B60 — `channel/top-earning-content/`: does a row identify the content it names? · **decides whether the list can be pressed**

The rows carry `thumbnail`, `title`, `tag`, `display` and `time` — and **nothing that identifies the
post or stream**. So the list is text: `TopEarningCard` renders no links, because a row that looks
pressable and goes nowhere is worse than one that does not.

What is needed:

- Is there a `post_code` / `event_code` / `id` available? One field turns each row into a link to the
  content, which is the obvious next step from "this earned the most".
- What is the closed set of `tag`, and is it **translated**? It is printed verbatim in a badge today,
  so an English `Live` appears on an Arabic dashboard. A code would let it be translated like every
  other label on the screen.
- Is the list capped, or does it grow with the range? The client renders whatever arrives with no
  limit and no pagination, matching legacy. A 90-day range that returns 200 rows would make this the
  longest card on the page.

## B61 — is `channel` nullable, and does `count` respect `payment_method` / `q`? · **fixed a tab that lied**

Both halves came out of one defect: the Expired tab read **`Expired (15)` over an empty panel**.

**`channel` is nullable.** The client was dropping rows that carried no `channel`, so the server's
`count` said 15 and the rendered list said nothing. Legacy anticipates the `null` (`packageInfo?.channel
|| null`, with an empty name rendered for it), which is why this is believed rather than merely
possible — and it is presumably an expired membership whose space was unpublished or deleted. Those
rows are now kept and render as "Unknown creator" with the price, the date and the payment method
intact.

**What is still unconfirmed** is whether that is the *whole* story:

- Is `channel` genuinely nullable, or was it dropped from these payloads for another reason
  (permissions, a deleted account, a soft-deleted space)? If a space can come back, the row should
  probably name it rather than saying "Unknown creator" forever.
- Does `count` respect the query? `results` is filtered by `status`, `payment_method` and `q` — the
  screen depends on that. If `count` is computed over the *unfiltered* set, a filtered tab prints a
  total that contradicts the list beneath it. The client now clamps a settled-empty list's label to
  `0` so the two cannot disagree on screen, but that is a plaster: with `count` correct the clamp is
  dead code, and with it wrong every partially-filtered tab is still off by the rows the filter
  removed.

There is a client-side guard either way — a page whose rows all fail to parse now renders as a
**failure** rather than as an empty list (`isUnreadable` in `useMyMemberships`), because the three
empty states all blame the reader and none of them was true here.

---

---

## B62 — `POST checkout/v3/checkout/*`: is it deduplicated, and may it be retried? · **it charges a card**

The client **never** retries any of the four checkout endpoints: `apiClient` replays a `POST` only
with `{ retry: true }`, and no call in `features/payment/api/checkout-api.ts` passes it. So a 502 on
the way back leaves the reader looking at a failure that may have created an intent.

Legacy has the opposite default and it is worth stating plainly: `models/api.js:155` wraps **every
non-GET** request in `retryRequest`, which retries on any 5xx, any network error and a 429, up to
`MAX_RETRY_ATTEMPTS`, with no idempotency key anywhere. A bad minute on the network is a second
charge.

What is needed:

- Does the endpoint deduplicate on anything — an order reference, a client-supplied key? If it
  accepts an `Idempotency-Key` (Stripe's own mechanism, which the backend is presumably already
  using against Stripe), the client can turn retries on for exactly these paths and a blip stops
  being a lost purchase.
- If it does not, is a duplicate intent harmless (an unconfirmed PaymentIntent expires) or does it
  reserve something?

---

## B63 — `checkout/v3/checkout/`: is a Star purchase really priced from `quantity` alone? · **decides what every Star purchase costs**

Legacy sends `{ payment_method, quantity, success_url, fail_url, timezone }` and **never sends the
package id** (`providers/balance/hooks/useGetStar.js`). `quantity` is the package's `amount`, i.e. the
Star count. This client copies that exactly, because there is nothing in the response that would
reveal a mistake.

If the backend prices from its own package table keyed by that count, fine. But then:

- What happens to a count that matches **no** package — is it rejected, or priced pro-rata at some
  rate the client cannot see?
- What happens to `bonus_amount`? The client shows "+100 bonus" on the tile from the catalogue
  payload; nothing in the request references it, so the bonus is presumably applied server-side from
  the same table. If it is not, the tile is advertising Star that will not arrive.
- Is there a package **id** the request should carry instead? One field would remove the whole class
  of question, and the catalogue already returns one.

---

## B64 — `{ action, action_data }`: is the action set closed, and is its case fixed? · **decides whether a payment can be completed at all**

Four values are known from legacy: `STRIPE`, `REDIRECT`, `CODA`, `NOW_PAYMENT`. `parseCheckoutAction`
parses exactly those and **fails closed** — anything else becomes `unsupported`, which the UI reports
as "this payment method is not available here" rather than mounting an empty Elements form.

- Is the set closed, and is a new gateway announced before it ships? A value this client does not know
  is a dialog the reader cannot finish, so a gateway enabled server-side needs a client release.
- Is the case fixed? Legacy `.toUpperCase()`s it at every read, which is the only evidence available
  that it might not be; the client upper-cases too.
- Is `action_data` guaranteed to carry the field its action implies (`clientSecret` for `STRIPE`,
  `redirectURL` for `REDIRECT`, `txnId` for `CODA`)? A `STRIPE` action without a secret is currently
  treated as a backend fault and reported as unsupported.
- `NOW_PAYMENT`'s payload is not modelled — what are its fields?

---

## B65 — `PM0003`: how long can settling take, and is there a webhook? · **decides how long a screen says "processing"**

`payment/v3/stripe/callback/` answers a non-2xx carrying `PM0003` while the payment is received but
not settled. Legacy polls it every 2 s **forever** from three different files, none of which clears
its interval on unmount. This client polls on a finite backoff — 2 s ×5, 4 s ×5, 8 s ×3, ≈54 s
(`lib/settle-poll.ts`) — and then shows "still processing" with a link to the ledger, which is *not*
a failure state.

- What is the realistic upper bound? If a bank transfer can sit in `PM0003` for minutes, the copy
  should say so; if it is always seconds, the schedule can be shorter and tighter.
- **Is there a socket event when it settles?** The user room already carries `balanceChange`. A
  settlement signal would let the client stop polling entirely — a signal to re-ask, per the socket
  rule in CLAUDE.md, not a payload to trust.
- Does the endpoint distinguish "not settled yet" from "unknown intent"? Both look like `PM0003` to
  the client today, so a mistyped secret would poll for a minute before saying "still processing".

---

## B66 — `DELETE my-payment-methods/{id}/`: who promotes the next default? · **partly answered**

**Answered: it is `204`.** So legacy's `res?.status === 200` check
(`components/stripe/hook.js`) reports a successful delete as an error, and its other call site
(`containers/cardManagement/hook`, `=== 204`) is the correct one. This client reads **neither** — any
non-2xx rejects at the client, so reaching the next line is the success condition, and a `204` has no
body to read. Nothing to change here; recorded so nobody re-derives it from legacy's two answers.

Still open, and the first one has a behavioural consequence today:

- If the deleted card was the **default**, does the backend promote another one? The client promotes
  the first survivor itself (`use-saved-cards.ts`), written to be harmless either way — `set-as-default/`
  on a row that is already default is a no-op — but if the backend does it too, that is a redundant
  write on every default deletion, and if it does not and we ever removed ours, the account is left
  with saved cards and no default.
- Is there a rule against deleting the **last** card? Legacy refuses client-side (`if (allCards.length
  <= 1) return`) with no message at all — a button that does nothing. This client sends the request
  and will print whatever the backend says, so if the rule exists it needs an error code.

---

## B69 — `type` on the settle response: what is the closed set? · **decides which sentence a purchase gets**

`payment/v3/stripe/callback/` answers `{ type }` on success, and it is the only thing that knows what
was bought. The client now chooses its success copy from it (`features/payment/lib/purchase-kind.ts`):

| wire | copy |
|---|---|
| `subscription` | "You're now a member of this Space" — no further offer |
| `direct_donation`, `crowdfunding_donation` | "Thank you" — no further offer |
| **anything else** | "Payment successful", **plus** a Get-more-Star button |

Those three strings are legacy's (`dialogs/checkoutSuccess`, `dialogs/checkoutFailed`); the fall-through
is legacy's own `default` branch, which is also where a **Star** purchase lands — legacy never
enumerates a type for it.

What is needed:

- **The closed set**, and specifically what a Star top-up answers. If it has its own string, the
  fall-through stops being load-bearing and an unknown type can get neutral copy instead of a Star
  offer.
- Is `type` guaranteed on a 2xx? The client treats a missing one as the Star case.
- Is the case fixed? Read lower-cased here, because nothing states it.
- Do gift-Premium and Premium have their own types? Both are `REDIRECT` flows today, so they settle
  through `redirect-callback/` — whose body is assumed to carry the same field.

Until it is answered the fall-through is deliberate: the cost of it being wrong is a "Get more Star"
button on a purchase that was not Star, which is a mild wrong-foot rather than a money error. The
alternative — neutral copy for anything unrecognised — drops the offer from the one flow that most
needs it, on a guess about a string nobody has enumerated either way.

---

## B70 — the settle body: `charge_status`, the gateway band, and that second `data` · **read from a live response**

A real 2xx from `payment/v3/stripe/callback/` — **as it comes off the wire, with no envelope**:

```json
{ "code": "5767679921",
  "payment": { "id": "01a0…", "payment_method": { "id": "gw.stripe", "fee_flat_amount": "0.60",
                 "fee_percent_rate": "25.00", "currency": null, "min_payment_amount": "0.00",
                 "max_payment_amount": null },
               "gateway": "gw.stripe", "amount": "1.38", "amount_currency": "USD",
               "charge_status": "CHARGED" },
  "type": "direct_donation", "data": null }
```

It settled three guesses and raised four questions.

**Settled:** `fee_*` are decimal strings; `currency` really is `null` on a live card gateway (so
`gatewayTotal`'s USD branch is the normal case, not a defensive one); and the client's total arithmetic
**is** the backend's — `0.62 + 25% + 0.60` rounds to the `1.38` it charged, pinned in
`gateway-fee.test.ts`.

**Open:**

- **`charge_status`** — what is the closed set, and can a **2xx** carry something other than `CHARGED`?
  The client ignores the field: a 2xx is the verdict and `PM0003` is "not yet". Requiring `CHARGED`
  would mean guessing the rest of the vocabulary, and reporting a failure on a payment that went
  through is much worse than ignoring a field.
- **`min_payment_amount` / `max_payment_amount`** — is the band in **USD**, and is it against the
  package price or the charged total (price + fee)? The client compares the **price** and treats `0` /
  `null` as "no limit" (`gatewayAccepts`), and now disables Continue with a reason rather than letting
  the press become a 400. If the band is really against the total, a package right at the ceiling is
  refused a step later than it should be.
- **`data`** — always `null` so far. If it ever carries the purchase detail (which package, how many
  Star), the success dialog could name it instead of speaking generally.
- ⚠ **This endpoint does not use the envelope, and that broke a real payment.** Every other `paymee`
  response wraps its payload in `{ data }` — legacy reads `res.data.data` for checkout,
  payment-methods and packages — but both callbacks are read as **`res.data.type`**, flat. The client
  unwraps by *origin*, so this body was "unwrapped" into its own `data` field, `null`: a donation that
  had been charged came back with no `type`, and the success dialog printed the **Star** copy ("your
  balance has been updated") with a Get-more button under it. Fixed by opting the two callbacks out
  (`enveloped: false` in `checkout-api.ts`), pinned at three layers.

  **The ask:** is the flat body deliberate for the callbacks, or an inconsistency you would rather
  fix? Either answer is workable — the parser reads `type` at the top level *or* through one envelope
  — but if any other endpoint answers flat **and** carries a `data` field of its own, we would rather
  know than find it the same way. (`{ success: … }` and `{ site_key, challenge_id }` bodies are safe:
  no `data` key, so nothing to collide.)

---

## B72 — `my-subscriptions/` answers **304 after a membership is created** · **the client showed a purchase that had not happened**

Observed, not theorised. A card membership goes `subscribe/` → Stripe → settle; the reader lands back
on the space page; the client refetches `v3/subscription/my-subscriptions/?status=active&channel_id=…`
with the `If-None-Match` it stored a moment earlier, and the backend answers **304**.

`apiClient` then does what it is built to do — replays the cached body as a 200 — and that body says
the account holds no membership. So the space's action row went on offering **Become a member** to
somebody who had just paid, and only a reload cleared it.

The representation changed and the validator did not, which nothing on this side can distinguish from
a genuine "nothing changed".

**What the client does about it:** the *purchase* drops the stored validator —
`forgetMyMembershipsCache(accountId)` before the invalidation, on `payment:succeeded` and on the two
Star writes — and every ordinary read of the list stays a conditional GET. Scoped to the moment,
not to the endpoint: making the endpoint unconditional was the first attempt and it inverted the
tradeoff, paying a full body forever to be right for the few seconds after a purchase.

Two things this leaves open:

- Does this endpoint compute its ETag from the response, from the request, or is there a cache in
  front of it? If the validator moves when a subscription is created, the eviction can go.

  **Measured, 2026-09-03, and it narrows the question rather than closing it.** Against
  `wapi.tevi.dev` with a real anonymous bearer and a valid `?verify=`, two endpoints on two services
  — `core/v3/channel/categories/` and `billy/v5/billing/payout/countries/` — each answered `200` with
  a weak `ETag`, and the immediate conditional replay answered a true `304` with an empty body. The
  validator tracks the **response**: three different paths whose bodies were the same 401 carried the
  *same* `ETag`, a 404 body carried a different one, and the two 200s carried one each. That is the
  signature of Django's content-hash middleware, applied service-wide.

  So if the platform flips a field, the body changes, the hash changes, and the client is sent a
  `200` — which is what makes `cache: { persist: true }` safe for the endpoints that opt into it.

  What it does **not** explain is B72 itself. If the hash is computed from the response everywhere,
  then a `304` whose body *had* changed cannot come from the derivation — it has to come from
  something serving an older response, i.e. **the third option: a cache in front of the endpoint**.
  `my-subscriptions/` was not itself probed (it needs an account that holds a membership), so this is
  a narrowing, not a verdict. **The ask is now specific:** is there a proxy or a per-view cache in
  front of `billy/v3/subscription/*`, and what invalidates it?
- **The same question for `billy/v3/subscription/*` generally**, and for any endpoint whose content
  changes as a side effect of a *different* endpoint's write. That is the shape that breaks a
  conditional GET; `cancel/` and `undo-cancel/` are the same shape and are evicted for the same
  reason, and this is unlikely to be the only family in the API.

**And it was not the only family.** Three more endpoints have since been found on the same shape, all
three reached by the **`premium_info` socket frame** — a purchase that settles on the *backend* and
tells the client through a signal, so every body it touched changed as a side effect of a write this
client never made:

| endpoint | what the stale body claims | who was showing it |
|---|---|---|
| `premium/v1/user/info/` | no expiry, or the previous one | `/premium`'s receipt line |
| `core/v3/channel/my-channel/` | **`is_premium: false`** | the drawer's gold card, the avatar ring and crown, `/premium`'s hero and plan grid |
| `permission/v3/channel/permission/` | the grants held before the purchase | every feature Premium unlocks — and gates **fail closed**, so it stays hidden |

The first was found while building `/premium` and evicted then (`forgetPremiumInfoCache`). The other
two were missed for the reason that makes this whole family dangerous: **the obvious test passes**.
"the frame caused a second request" is true either way, so the assertion has to be that the validator
was dropped *and* that it was dropped **first** — `invalidateQueries` starts the request
synchronously, so evicting afterwards drops a record the request has already read.
`my-channel-provider.test.tsx` and `permission-provider.test.tsx` now pin both, and both were
mutation-checked by reverting the handler to a bare `refresh()`.

So the open question widens: **which bodies change on a `premium_info`?** The client now evicts three
and cannot know whether that is the set. Anything else derived from the account's Premium state and
read over a conditional GET has the same hole, and it shows up as a paying reader being offered what
they have already bought.

---


## B74 — a live event says `restricted_platforms: ["Website"]` · **should the website advertise it at all?**

Found in the real `channel.lives[]` payload, on a stream that is currently on air.

Legacy reads this field in exactly one place — `containers/event/hook/index.js` — and the event page
turns it into a `<PlatformRestricted />` screen: the web will not play the stream. Nothing filters
on it anywhere else, so its own home feed lists a card for a stream the website then refuses to
show, and this client's Posts-tab card does the same by matching that behaviour.

**Answered by product for this client: it is about playback.** The card stays, and the press now
explains instead of navigating — `ChannelLiveRestrictedDialog`, with legacy's own copy, the branded
QR, and an "Open in Tevi App" link to `public_url`. So the reader is told at the press rather than
one page later, which is where legacy leaves them.

Still worth confirming with the backend, because the client cannot see it: is `restricted_platforms`
ever used for **distribution** rather than playback — a stream that should not be *listed* on the web
at all? If so the card should not be drawn, and neither should legacy's home feed's.

Related, from the same payload: `visibility` is a real field (`"public"` on this row). Is
`channel.lives[]` already filtered to what a visitor may see, or does it carry `unlisted` and
members-only rows that a public channel page would then disclose? The card reads no such flag today.

---

## B75 — the report-reason list: is `type` a **closed set**, and is it shared across surfaces?

Asked after reading the real payload, which is better than legacy suggested:

```json
{ "results": [ { "type": "CHANNEL_SEXUAL_CONTENT", "text": "Sexual content" }, … ] }
```

There **is** a stable id. Nine rows today: sexual content, scam, gambling, violent, abusive,
bullying, dangerous acts, child abuse, other. `type` is what gets filed (legacy posts `content?.type`
and never the prose), and this client also uses it to translate — `channel_report_reason_*` per id,
with `text` as the fallback for an id that ships after this build.

That leaves two questions the payload cannot answer:

1. **Is the set closed and stable?** If a `type` is ever renamed rather than added, every client's
   copy for it silently reverts to the English `text`. An added one is handled; a renamed one is not
   detectable.
2. **Is the list shared with the other surfaces?** `…/post/contents/`, `…/comment/contents/` and the
   livestream one exist in legacy. If they return the same ids with a different prefix
   (`POST_SEXUAL_CONTENT`), the translation keys should be prefix-stripped once rather than ported
   per surface — which is what `reasonLabelKey` already does.

Worth recording either way: legacy translates this list by loading the **entire English resource
bundle** into the client and finding the key whose value is byte-identical to the row's `text`. It
falls back to English the moment anyone edits an English string, and does so silently.

Also confirmed while wiring this: the endpoint is on **`core`**, not on the `report` service. Legacy
ships an `apiReport` model based at `${W_API}/report` and its report model does not use it — the real
path is `core/v1/report/report/…`. The obvious base answers `404 {"detail":"Not Found"}`.

## B76 — does `GET my-channel/blocks/` accept `q`, and what does it match? · **a field that may filter nothing**

The blocked-accounts screen now has a search field, and it is a **server** search:
`GET v3/channel/my-channel/blocks/?q=&page=&page_size=` — sent as
`useBlockedAccounts` settles it (trimmed, debounced 400ms, no character floor), the term is in
the TanStack key so each search is its own cache entry, and the empty term is omitted rather
than sent as `q=`.

Every part of that is a guess, because **neither shipped client has ever sent it**: legacy's
screen has no search at all, so there is no precedent to copy the way B52 could copy the
memberships list's. Three things the client cannot find out for itself:

1. **Is `q` read on this endpoint?** An unknown query param is silently ignored by DRF, so the
   failure mode is not an error — it is a field that types, spins and returns the whole list.
   Which reads as the search matching everything, and is indistinguishable from a term that
   really does.
2. **What does it match — the blocked account's display name, its handle, or both?** The
   empty-state copy commits to both ("Try a different name or handle."), which is the same
   sentence the memberships screen uses and the same open question (B52). If it matches only
   one, the copy is wrong about what was searched.
3. **Does `count` respect `q`?** The count is a live region for screen readers on this screen
   rather than visible text, so an unfiltered total under a filtered list is quieter here than
   the tab label that made this a bug on `/my-membership` — but it is the same bug.

If the answer is "not supported", the honest fallbacks are a client-side filter over the loaded
pages (wrong on a paginated list — a name on page four is missing until the reader scrolls to
it) or dropping the field. Worth asking before either.

---

## B77 — `my-channel/follow-requests/`: which id, which verbs, and what does a row carry? · **two irreversible buttons per row**

The follow-requests screen is ported (`/follow-requests`), and it takes four endpoints on trust
from legacy's `ChannelModel` — nothing else in either app touches them:

```
GET    v3/channel/my-channel/follow-requests/?page=&page_size=
POST   v3/channel/my-channel/follow-requests/{id}/accept/
DELETE v3/channel/my-channel/follow-requests/{id}/
POST   v3/channel/my-channel/follow-requests/accept-all/
DELETE v3/channel/my-channel/follow-requests/decline-all/
```

Four things the client cannot find out for itself, in the order they hurt:

1. **Is `{id}` the request's id or the requester's?** This client sends `row.id` — the request
   record — because that is what legacy sends, and the row also carries `user.id` beside it.
   Both are plausible strings, so picking wrong is a 404 that reads like a backend fault. B23 is
   the same question about `my-channel/blocks/`, where the two shipped clients disagree; nobody
   has confirmed which shape this endpoint wants.
2. **Is declining really a DELETE on the row, with no `decline/` verb?** Legacy has no
   `…/decline/`, and the asymmetry (POST to accept, DELETE to decline) is odd enough to be worth
   confirming rather than inferring. If a `decline/` verb exists, DELETE may mean something else
   — "forget this request" versus "refuse it" — and the difference is whether the person can ask
   again.
3. **Does the row carry `created_at`?** The screen prints "Requested …" where it is present and
   drops the line where it is not, so a payload without it degrades silently to legacy's two-line
   row. Legacy never displays a date, so its presence is a guess.
4. **Are the accept/decline calls idempotent, and is either retried by the backend?**
   `apiClient` retries only idempotent methods, so the single accept (a POST) is **not** replayed
   — a 502 that arrives after the write landed would otherwise let a second accept through. If
   accepting twice is a no-op, this could opt in with `{ retry: true }`.

One more, smaller: **does `count` on the list respect anything?** The drawer's badge is that
number, fetched as `page_size=1` — legacy's own trick, since there is no count-only route. If
`count` is the page's length rather than the total on some paginator, the badge silently reads 1
for a queue of forty.

---

## B78 — the whole of `GET search/v3/channel/` is a guess · **the only screen for finding a creator**

`/search` is ported, and it is the first thing in this app to touch the **search service** at all:
`${W_API}/search`, not `/core`. One endpoint, and legacy's `SearchModel.searchChannel` is the only
evidence either client has for any of it:

```
GET search/v3/channel/?q=&page=&page_size=20
```

Legacy reads exactly four fields off a row (`images.thumb`, `name`, `slug`, `is_nsfw`, plus
`verified_tick_badge.image`) and infers the end of the list from a short page — it never looks at
`next` and never looks at `count`. That is not a contract; it is the subset one screen happened to
render. Five things the client cannot find out for itself:

1. **What does `q` match?** Display name, handle, both, the bio? The empty-state copy commits to
   "Try a different name or handle", the same sentence B52 and B76 are open about. If it matches
   only one of the two, the copy is wrong about what was searched — and if it matches the *bio*, a
   result whose name and handle both look unrelated reads as a broken search rather than a
   relevance hit.
2. **Is there a minimum term length?** The client sends whatever was typed, with no floor, because
   a floor is unusable for the CJK locales this app ships (a space's name is frequently one or two
   characters — see `useChannelSearch`). If the service silently returns nothing under three
   characters, every Korean and Chinese search looks like it matched nothing.
3. **Does the payload carry `next` and `count`?** `nextSearchCursor` prefers `next` and falls back
   to legacy's short-page rule, so the list terminates either way. `count` is different: it is the
   `role="status"` announcement a screen-reader user gets when the results change, and the client
   falls back to `results.length` — which on page one of a long list announces "20 results" for a
   match of four hundred.
4. **Is it account-aware?** The bearer is sent (this is W_API), and the query key is scoped per
   account on the assumption that it might matter. The case that decides it: **does a space this
   account has blocked appear in its own search results?** If it does, the blocked-accounts screen
   and the search screen disagree with each other, and the fix is server-side — a client filter
   would need the whole block list loaded before it could hide a row.
5. **Is `is_nsfw` reliable here?** The row draws the sensitive mark from it. `features/nsfw` gates
   the *space*, so a missing flag is a cosmetic loss rather than an exposure — but a search result
   list is exactly where somebody would want the warning before they press.

Separately, and smaller: the **Following grid** on the same screen sends `q` to
`core/v3/channel/followed-channels/`, which legacy also does (`getFollowedChannels(page, size, q)`).
Same question 1 applies to that endpoint, and the two need not agree with each other — a term that
matches a handle globally and a display name locally would populate the grid and the list from
different rules, with nothing on screen to explain it.

---

## B79 — the notification inbox: which id, and **in which language** does the copy arrive? · **every word on the screen is the server's**

`/notification` is ported and takes seven routes on trust from legacy's `NotificationModel` —
nothing else in either app touches the notification service:

```
GET  notification/v1/inbox/messages/?page=&page_size=[&read=false]
POST notification/v1/inbox/messages/read/        { message_ids: [id] }
POST notification/v1/inbox/messages/unread/      { message_ids: [id] }
POST notification/v1/inbox/messages/archive/     { message_ids: [id] }
POST notification/v1/inbox/messages/read-all/    (no body)
GET  notification/v1/inbox-types/
POST notification/v1/inbox-setting/              [{ id, active }]
```

Four things the client cannot find out for itself, worst first:

1. **In which language are `content.title` and `content.body`?** This is the one that decides
   whether the screen is translated at all. The client sends **no `Accept-Language`** on any
   request (checked: neither `shared/lib/api/client.ts` nor legacy's `models/api.js` sets one) and
   the inbox takes no locale parameter, so the service has nothing to localise *by* — the sentences
   presumably arrive in whatever language the notification was minted in.

   Legacy's answer is a reverse lookup: `useHelper.handleKey` scans the **English** resource bundle
   for a key whose value equals the incoming sentence, then translates that key. It is O(bundle) per
   row, it fails silently to the English string, and the keys it looks for
   (`push_notification_w2_*`, catalogued in `constants/messageTemplates.js`) **do not exist in this
   repo at all**. It is not ported: this client renders the server's sentence as sent.

   What would fix it, in order of preference: (a) the endpoint accepts `lang` (or honours
   `Accept-Language`) and returns localised copy; (b) each row carries a **key plus its
   interpolation values** — `{ key: 'donation_payment', params: { amount: '$5' } }` — and the client
   translates. (b) is strictly better, since it also localises a notification retroactively when the
   reader changes language. The same question covers `inbox-types`' `metadata.title` /
   `metadata.description`, which are sentences on the filter sheet.

2. **Is the row's id `id` or `message_id`?** Every action posts it inside `message_ids`, so getting
   it wrong is two dead controls per row. Legacy keys its rows `notification.id ||
   notification.message_id` while sending only `notification.id` — which means it renders rows whose
   buttons cannot work, and that fallback is the only evidence `message_id` ever appears. This client
   reads both, prefers `id`, and **drops a row that has neither** rather than rendering controls that
   would 400.

3. **Is `category` a closed set, and is `content.payload.type` scoped to it?** The press rule
   branches on `creator_activity | post | money | system` and on `common | transaction |
   mcn_invitation` inside them (`lib/inbox-link.ts`). Both are modelled as **open strings** with a
   default arm, so a kind that ships after this build renders and opens its own `clickable_url`
   instead of being dropped. If the sets are closed, they can become enums and the default arm can
   become an assertion; if they are not, the arm is load-bearing and should stay.

4. **Is `archive/` reversible, and is `count` the total?** There is no `unarchive/` in legacy and no
   screen listing archived notifications, so the client treats archive as a delete and confirms it.
   And the unread dot is `count` from a `page_size=1` request — legacy's own trick, since there is no
   count-only route — so if `count` is the page's length rather than the total, the dot is right but
   a numeral built on it would read 1 for an inbox of forty. Same sub-question as B77's.

One more, smaller: **`POST inbox-setting/` takes a bare array, and its flag is spelled `active`
while the read side spells the same thing `turn_on`.** Both are legacy's, verified at both call
sites, and neither is obviously intentional. If the write accepts `turn_on` too, the asymmetry can
go; `toInboxSettings` is the single place that translates it today.

---

## B80 — `POST v1/device-links/`: the nesting, the lifetime, and what the socket sends · **nesting answered; the socket frame is still a guess**

Three things this client currently infers from legacy's `components/auth/btnQR`, none of which is
written down anywhere. This is the only flow where a **credential arrives over a websocket**, so a
wrong guess here does not degrade a screen — it either fails to sign anybody in or leaves a usable
token on screen longer than it should be.

1. ~~**Why is the token nested?**~~ **✅ Answered: deliberate, and there is more inside it.**
   `payload` is the whole link record — `token`, the three device fields the call sent back as the
   server stored them, and **`ip` / `location` as the server saw them**. So the extra level is not
   an artefact of the envelope; it is the record, and `ws_channel` is the one field beside it.

   That `ip` removed a request. `useQrSignIn` was fetching `/api/client-ip` **in parallel** with the
   mint, purely to print an address in the QR text — our own route handler's reading of the same
   headers, a second round trip for a second-hand answer to a question the response in hand had
   already settled. It now reads `link.payload.ip`, which is also the better value: it is what the
   *auth service* saw, and the auth service is what the phone is approving a session against. Same
   display-only caveat as `/api/client-ip` — both come from headers the caller can set, so nothing
   may be authorised, priced or hidden on either.

2. **How long does the token live, and is it single-use?** ⚠ **Half-answered: there is an expiry,
   and its code is `422 AU006`** ("device link expired — mint a new one"), returned by
   `device-links/:token/accept/`. *How long* is still unstated, and the panel still shows a code
   **indefinitely**: it has an error code to recognise but no duration to count down to, and the
   expiry is only observable on the phone's side, where this client is not. So a silently-dead QR
   is still indistinguishable from one nobody has scanned. *What is the TTL?* — one number, and the
   panel can expire the code and offer a refresh.

   The rest of the assumption holds and is unchanged: one token per open panel, minted when the QR
   step opens, discarded when it closes, never reused (a code that has been on screen may have been
   photographed).

3. **What exactly does `device_link_success` carry?** Read as a normal token response —
   `access_token`, `refresh_token`, `expires_in` — and passed straight into the account store via
   `signInWithQrSession`, exactly as legacy's `initData` does. A frame without `access_token` is
   ignored. *Is `user` ever included?* The client does not need it (it fetches `/me`), but if it is
   absent from the socket frame and present on the HTTP sign-ins, that asymmetry is worth knowing
   before someone "simplifies" the two paths together.

A fourth, about the room rather than the payload: legacy connects `${DOORMAN}/device` with **no
bearer** and this client does the same, so the only thing protecting the exchange is `ws_channel`
being unguessable. *Is it a random id per link, and does the server drop a room once its link is
consumed?* If a channel id is ever derived from the device id, the socket becomes joinable by
anybody who knows the device — see `shared/lib/socket/device-room.ts`.

## B81 — the three `nsfw_settings` flags: who honours which, and is the object replaced? · **the app writes settings only the app reads**

`/app/privacy-settings` (the mobile app's privacy screen, ported from legacy's
`containers/app/privacySettings`) writes three flags — `show_sensitive`, `blur_media`,
`nsfw_search` — and the web consumes exactly **one** of them: `features/nsfw` gates on
`show_sensitive` and nothing reads the other two. So the client is writing a contract it cannot
check.

1. **Is `nsfw_search` enforced server-side?** The name suggests the *server* filters
   `search/v3/channel/` by it, in which case the web already honours it by accident and no client
   work is needed. If it is a client-side hint instead, the search screen is currently ignoring a
   setting the account has expressed — and the fix belongs in `features/search`, not here.

2. **Is `blur_media` a client concern only?** Presumed yes: media arrives the same either way and
   the app blurs it locally. If so, the web owes it a reader on post and space media once those
   screens exist; the flag is written now because the app reads it and legacy wrote it.

3. **Does the write replace the whole object?** The client assumes it does, and sends all three
   keys on every change (`accountNsfwSettings` exists for that reason) — legacy does the same.
   *If the endpoint merges instead*, sending the siblings is harmless; if it replaces, a caller
   that sends one key clears the rest, which is a data-loss bug the current shape avoids by never
   sending a partial object. Worth stating either way, because the endpoint answers with the whole
   user and nothing in the response distinguishes the two behaviours.

4. **Is the object ever absent?** `accountNsfwSettings` returns `{}` for a missing or non-object
   value, so a switch never renders as on because the field was not there. *Is it always present
   on `/me` for a real account, and is it present on an anonymous one?* The screen is signed-in
   only, so the answer changes nothing today.

## B82 — mini apps: the app token's lifetime, whether the deposit reports insufficient funds, and which envelope shipped apps speak · **the web player pays real money on a third party's word**

`features/mini-app` is the **third** implementation of the mini-app bridge (iOS, Android, now web),
and the two native ones are the reference. Three things this client currently infers, each with a
visible consequence.

1. **`GET developer/api/v1/user/auth-token/?app_id=` — how long does the token live, and is it
   single-use?** Assumed today: neither. The token is fetched through `queryClient.fetchQuery` with a
   **30-second `staleTime`**, which is a *deduplication window* — two `getInfo` calls in flight
   together collapse into one request — and deliberately not a cache lifetime, because there is no
   stated expiry to cache against. A repeat `getInfo` a minute later asks the service again.
   *If the token has a TTL*, the client should cache for it and stop asking; **if it is single-use**,
   the 30-second window is a bug: the second app to call `getInfo` inside it would be handed a token
   the first one already spent. Nothing in the response says which.

2. **`POST v1/billing/game/deposit/` — does it answer `422 EC0001` for insufficient Star, like
   `v1/ecom/purchase/` does?** The purchase path relies on that pair and is correct by construction:
   the **backend** decides affordability, the client offers a top-up when told no. The deposit path
   cannot, so it checks `hasEnoughStars` **locally first** — against a balance that can be 60
   seconds old, which means a reader with just enough Star can be told to buy more. *If the deposit
   endpoint reports the same code, the local check comes out* and both paths become "attempt it, let
   the server say no", which is the only version that cannot be wrong. See
   `INSUFFICIENT_STARS_CODE` in `features/mini-app/api/mini-app-api.ts`.

3. **Which message envelope do shipped mini apps actually use?** This one is not a question for the
   API team so much as for whoever owns the SDK, and it is the sharpest of the three because legacy
   contains **both halves of a mismatch**:
   - legacy's web host reads `{ action, options }` (options a JSON *string*) and replies
     `{ action, call, userInfo }`;
   - legacy's own SDK (`public/sdk/miniapp-sdk.js`), on its browser code path, posts
     `{ eventType, eventData }` and **ignores** any message without an `eventType`.

   So an SDK-based mini app and legacy's web player cannot hear each other in either direction, and
   there is no way to tell from the host which one a given app was built against. This client
   therefore accepts both and replies in whichever envelope the frame last used
   (`features/mini-app/lib/protocol.ts`). That is correct but it is compensation for an ambiguity
   somebody should close: *which is the supported envelope, and is the SDK's browser path in use by
   any shipped app?* If the answer is "one of them", the other can be dropped from the parser.

   The same file records a second, smaller divergence in the same area: on a failure legacy's host
   sends `{ response: false }` while the contract document says `call: '<error>'`. Both are emitted
   here, because an app branches on whichever its own SDK reads and dropping the one it reads is a
   silent hang. *Which is the documented shape?*

A fourth, about the platform rather than an endpoint: `channel.mini_app_url` is set per creator and
points at whatever host its publisher uses, so the web has **no origin allow-list to write** — the
CSP's `frame-src` therefore ships as `https:` by default, narrowable per environment via
`NEXT_PUBLIC_MINIAPP_FRAME_ORIGINS` (`shared/config/csp.ts`). *Is there, or could there be, a known
set of mini-app hosts per environment?* If mini apps are only ever published under a Tevi-controlled
domain, that wildcard becomes two entries and the widest line in the policy goes away.

## B83 — the Tevi Coin bonus on a transaction: which service owns it, and can the ledger carry it? · **the detail sheet is missing a figure legacy shows** · *ANSWERED 2026-08-26, built*

`shared/components/ledger-detail-dialog.tsx` reproduces `web-app`'s transaction-detail sheet — status
strip, amount, transaction id, type, time — with **one block left out**: the Tevi Coin bonus.

Legacy builds it from a *second* service. Its ledger fetches a page of `billy/v5/billing/transactions/`,
then calls `DAppWalletModel.getTransactions(<comma-joined billy ids>)` and joins the two on
`billy_tx_id`; a row with a match gets `transaction.bonus`, and the sheet then shows
`+{{amount}}` in Tevi Coin plus a link into the Tevi Coin mini app
(`containers/myWallet/components/common/transactionItem/{index,transactionDetails/content}.js`).

Three things this client would need before it can show the same figure:

1. **Which service, and at which path?** The rewrite has no `dappWallet` model — the legacy one is
   `models/dappWallet.js`, a `GET v1/t/transactions/` on a dApp base URL that is **not** `W_API`,
   taking one param `billy_tx_id` whose value is the page's ids `.join(',')`
   (`transactionHistory/hooks/useTransactionHistory.js:48`). *Is that service still the owner of this
   figure, and is the lookup still one comma-joined `billy_tx_id`?* A second request per page is the
   cost legacy pays; if the bonus can instead ride on the billy row (a `bonus` object, or a
   `tevi_coin_amount`), the join disappears and so does the extra request.

   ⚠ Its response is read as `res.data.data.results` — **double-wrapped**: the `{ data }` envelope
   *and* a DRF page inside it. That matters for the port because envelope unwrapping is scoped to
   `W_API` (`unwrap.ts`), and this origin is not it — so a model for this service has to pass
   `unwrapEnvelope: true` and then still reach into `results`. See the `server-client.ts` note in
   CLAUDE.md, where the same trap bit the in-cluster origin.

2. **Is the bonus per-transaction or per-payout?** Legacy joins per row, which reads as per
   transaction, but the copy it ships — *"In addition to the revenue you earn, Tevi will reward you a
   random bonus in Tevi Coin"* — describes a reward on **revenue**. If it only ever attaches to
   `platform_earning`, the client can ask for it on those rows only rather than for every page.

3. **What does the link go to?** Legacy hard-codes `${BASE_URL}/@TeviCoin` and, on a phone, hands it
   to `useDynamicLink().redirectToApp()` instead. In this app that destination is a **mini app**
   (`features/mini-app`), which opens through `useMiniApp().open()` with a vetted config — so what is
   needed is the app's `id` and `url`, not a channel slug. *Is there a stable mini-app id for Tevi
   Coin?*

## Answered — what shipped, and what the payload settled

A live payload and the product answer to (3) arrived 2026-08-26, and the block is built. What each
question turned out to be:

1. **The service is `${W_API}/dapp-wallet`** — a *path on W_API*, not a separate host, which the
   earlier draft of this entry had wrong. So the bearer is sent and the `{ data }` envelope is
   unwrapped by the ordinary rules; no `unwrapEnvelope` flag and no exception anywhere.
   `GET v1/t/transactions/?billy_tx_id=<ids joined by commas>`, answering `{ results: [...] }` with
   **no `count` and no `next`** — a lookup, not a list.
2. **Per transaction**, joined on `dapp.billy_tx_id === billyRow.id` — and **the request must carry one
   page of ids, not the accumulated set.** That distinction is the whole entry.

   `web-app` hands `getTransactionTxIds(results)` *only the rows that just arrived*
   (`transactionHistory/hooks/useTransactionHistory.js`), so each request carries exactly one page. This
   client first sent the accumulated set — page two asking about forty ids, page three sixty — and on a
   real ledger the lookup then answers with nothing. Two screenshots of the **same account** settled it:
   legacy drew `Bonus: +0.1` on both Live Revenue rows and `+10` on Revenue from Post; this drew none.

   It is now `useQueries`, one query per page, which sends what legacy sends and additionally gives each
   page its own cache entry — so a refetch of page one replaces page one's answer instead of appending
   to a pile, and a dropped page takes its bonuses with it. Pinned by an e2e case asserting on the
   outgoing query strings: no request may carry more than one page of ids, and no request may mix ids
   from two pages.

   **Two earlier readings of this were wrong and are worth recording**, because both were confident:

   - I first reported the join key as unresolvable, on the grounds that two live captures shared no ids.
     They were captures of different ledger windows; the ids were never going to line up.
   - I then reported it as *probably* mismatched captures, since this client and legacy run the same
     join. Same code, yes — but not the same **request shape**, which is exactly where the fault was.

   The lesson for the next one of these: when this client and legacy agree on the join and disagree on
   the screen, compare what goes *out*, not what the payloads contain.

3. **The link opens the mini app by navigating to the space.** `/@TeviCoin`, which is legacy's own
   URL — and in this app the space *is* the app: `useAutoOpenMiniApp` opens it on arrival. That also
   keeps `features/my-wallet` inside its boundary, since `channelApi` is deliberately not exported and
   a `MiniAppConfig` can only be built from a channel payload. Legacy's two forks (a QR dialog on
   desktop, a `redirectToApp()` deep link on a phone) are **not** ported: both hand off to the native
   app, and this app hosts mini apps itself.

**Two wire traps, both silent, both pinned by tests in `api/tevi-coin-api.test.ts`:**

- `amount` is a **string** (`"10"`).
- `created_at` is epoch **seconds with a fraction** (`1756959786.734602`) — while billy's `created_at`
  on the very rows this joins to is epoch **milliseconds**. Read one as the other and the date is 1970
  or the year 57000, and nothing throws.

## The display rule — answered 2026-08-28, and it fixed two live faults

*Show a bonus when `status === 'success'` **and** `amount > 0`; withhold it otherwise.* Given verbatim
by the product side, and deliberately **not** an enumeration of the other statuses — the client does not
need the vocabulary to apply the rule, and a list of values nobody has confirmed is a list that rots.

It lives in **one** function, `isDisplayableBonus` (`hooks/use-ledger-bonuses.ts`), which both surfaces
go through — the row via `use-wallet-ledger.ts`, the sheet via `use-wallet-entry-detail.ts` — so the two
cannot drift into different opinions about when a bonus exists.

Two faults it corrected, both of which had shipped and neither of which threw:

- **A non-`success` row printed its figure anyway.** On a `pending` bonus that tells a creator they hold
  Star they do not hold yet — the client saying something untrue about money.
- **`amount: "0"` rendered as `+0`.** It parses fine and is not `null`, so the earlier check let it
  through. A zero bonus is the *absence* of a bonus, and the absence of a line is how to say that.

Pinned by `hooks/use-ledger-bonuses.test.ts` (seven cases, including that neither condition carries the
other) and by two e2e cases asserting the withheld row keeps its single-line trailing — a withheld bonus
that still stacked the column would change every ordinary row's height for no visible reason.

## Noted from the same payload — `status` on a ledger row, which nothing surfaces

The live capture shows `status` on every row, and one of them is a payout reading **`in_progress`** with
`released_at: null`. The client ignores the field entirely: the detail sheet's header is the fixed string
*"Transaction completed successfully on"*.

`web-app` does exactly the same — the string is hard-coded there too, and `transaction.status` is read
nowhere in its ledger (only `withdrawDetail`, a different screen). So this is **parity, not a port
bug**, which is why it has not been changed unilaterally.

It is still the app telling a creator that a withdrawal completed while it is in progress. The shape of
a fix is small — the sheet's header keyed on `status` rather than fixed — but it needs two things from
the product side: the **closed set of `status` values** for this endpoint, and the **copy** for each one
worth distinguishing. Until then, pinned as a fact about today in
`features/balance/api/types.test.ts` ("does not surface the row status, matching legacy").

## Open — the one request per page, and what is still needed to remove it

**Answered "yes"** on 2026-08-28: the bonus *can* ride on the billy row. That removes the second lookup
entirely — `api/tevi-coin-api.ts`, `hooks/use-ledger-bonuses.ts` and the join all go, along with one
request per twenty rows scrolled.

**Closed by the payload, 2026-08-28.** A live capture of `billy/v5/billing/transactions/` arrived, and
**no row carries the field** — no `bonus`, no `tevi_coin_amount`, not even a `billy_tx_id`. So the answer
was about what the service *can* do, not what it sends today. The lookup stays, and
`features/balance/api/types.test.ts` asserts the absence: it will fail, loudly and in the right place, on
the day the field appears.

**What is still needed to remove the lookup**, unchanged:

1. **The field's name and shape** on `billy/v5/billing/transactions/` — a `bonus` object (and then which
   keys), or a flat `tevi_coin_amount`? And in which unit, since the dApp payload states `TEVI`
   explicitly and a bare number on a billy row would not.
2. **A payload that has it.** Every capture this client has been given shows billy rows *without* it, so
   the field is either not deployed yet or not on the rows we were shown. Building against a name with
   no payload behind it is how a screen ships reading `undefined` and rendering nothing — silently, since
   a missing bonus and a withheld one look identical.

Until then the lookup stays. It is correct, its failure costs only the figure, and swapping it out is a
deletion rather than a rewrite whenever the field turns up: keep `isDisplayableBonus`, point it at the
billy row, drop the rest.

## B84 — `payout_method.config.form`: is the backoffice-authored field list the whole contract? · **the setup form is drawn from the payload, not from code** · *answered by the payload itself*

`features/payout` reads two things off a method that this client did not enumerate, and both come from
the backoffice rather than from a spec:

- **`payout_method.config.form`** — an array of `{ field, display_name }`. This is the backend
  *describing its own form*: which account fields a method collects, and what to label them. So
  `payout-detail-rows.tsx` renders the withdraw account by walking that array instead of matching on a
  method name it would have to keep in step with the backoffice.
- **`payout_method.type` / the method slug** — `api/types.ts` parses it `looseObject` and carries it
  whole, because the enumerable list is whatever the backoffice has switched on today.

**This question is largely self-answering, and that is the finding.** A field list that arrives *with*
the method is a stronger contract than a list in `docs/`: it cannot be stale, and a method added after
this client shipped still draws correctly. Two things it does **not** answer, both of which the client
currently guesses:

1. **Is `form` ordered, and is it complete?** The client renders it in array order and prints nothing
   for a field the detail payload has no value for. If the array is a display order the backoffice
   controls, that is correct as-is; if it is incidental, a method with four fields may read in a
   different order than the app that collected them.
2. **Is `display_name` localised, or is it English?** It is printed verbatim — there is no key to
   translate it against. On a Vietnamese payout method the app therefore shows whatever the backoffice
   typed. If these are ever to be translated, the payload needs a stable `field` vocabulary the client
   can key off instead (it already has `field`, so this is a question about whether that set is fixed).

**What changes if the answers differ:** nothing structural. An unordered `form` means adding a sort by
a known field vocabulary; a localisable `display_name` means keying off `field` and treating
`display_name` as the fallback. Both are edits inside `payout-detail-rows.tsx`.

## B85 — the tier payload, the renewal term, and the shape `priceInfo` is sent in · **the app's card checkout draws a header, states a term, and asks the host to charge**

`/app/[channelSlug]/membership/[packageId]` is the screen the **native app opens to take a card** for
a membership tier. It is addressed at one package, so it reads
`GET billy/v3/subscription/channel/{slug}/packages/{packageId}/` — legacy's own
`SubscriptionModel.getPackageInfo`, over plain HTTP, because the tier is public and this screen has
no bearer (the native host owns the session and mints the intent over the JS bridge). Three things
this client is guessing at — the first two about the payload, the third about the bridge.

> **A live `subscribe/` response has since settled two of the surrounding unknowns.** It is
> transcribed in `features/payment/lib/checkout-action.test.ts`; the two findings are at the bottom of
> this entry, under *What the live payload answered*.

1. **Does the tier carry its `channel`?** `my-subscriptions/` puts `channel` beside `package`, so the
   shape exists in this service. Whether the single-package endpoint repeats it is unknown, and
   legacy is no evidence either way: its webview fetches `core`'s `channels/{slug}/` **separately**
   for the creator's name, avatar and verified mark, which is one extra round trip on a checkout
   screen if the field was there all along.

   Handled today rather than guessed at: the field is read **when present**, and the screen otherwise
   fetches the public profile itself (`core/v3/channel/channels/{slug}/`, `api/creator-api.ts`) —
   which is what legacy does from the same screen. So this is no longer load-bearing; the header names
   the creator either way.

   What the answer still buys is **one request**. *If the tier payload always carries `channel`*, that
   second query can be deleted outright. *If it never does*, the field comes out of
   `membershipPackageSchema` and the fetch stops being conditional. Either way it is a line, not a
   redesign — which is the point of having asked before wiring the header to a guess.

2. **Is a card membership charged every 30 days?** The screen prints
   *"You will be charged $5.63 every 30 days until you cancel"* — legacy's sentence, and legacy's
   hard-coded number. **Nothing in the payload states a period.** `prices[]` carries an amount and a
   currency and no interval; `my-subscriptions/` carries an `end_date` but that is a date, not a
   term, and this screen has no subscription yet to read one from.

   So a tier billed annually, weekly, or on any other cycle would be described wrongly on the last
   screen before the card is charged — the most expensive place in the app to be wrong about money.
   *Does `packages/{id}/` carry an interval (or could it), and is 30 days the only cycle billy
   supports?* If there is a field, `cashOffer` reads it and the sentence is derived; if 30 days is the
   only cycle, this becomes a documented constant rather than a guess.

3. **What shape does `TeviJS.membershipCheckout` want `priceInfo` in?** This one is for the **app
   team**, not the API team. Legacy passes `packageInfo.prices[index]` straight off the wire, so the
   host receives `amount` as the string `"5.00"` and `amount_currency` in whatever case the payload
   used. This client parses the payload before it reaches the bridge, so it sends `amount` as a
   **number** and the currency **upper-cased**.

   If the host does `parseFloat` and a case-insensitive compare, both work and this is nothing. If it
   does string work on `amount`, or matches `"usd"` exactly, the parsed row is a different message.
   *Is the host reading these fields at all, or only `id`?* — because if it is only the id, the whole
   object is ceremony and can be narrowed. `cashOffer` carries the row so there is exactly one place
   to change.

### What the live payload answered

```json
{ "payment": { "amount": "1.38", "amount_currency": "USD", "charge_status": "PENDING",
               "payment_method": { "id": "gw.stripe", "fee_flat_amount": "0.60",
                                   "fee_percent_rate": "25.00", … } },
  "action": "STRIPE", "action_data": { "clientSecret": "pi_…" } }
```

**1. The hard-coded fee is confirmed correct.** `1.38` on a `$1.00` tier is exactly
`1.00 + round((0.059 × 1 + 0.30) / 0.941)`. So **B71**'s answer — *mirror the legacy web app* — is not
just a policy, it is what billy actually computes. `membershipFee` agrees with the server to the cent.

**2. And the client no longer has to rely on that.** The same envelope carries `payment.amount`, which
*is* the PaymentIntent's figure, so the webview checkout now **reads** it (`parseChargedAmount`) and
prints the fee as `total − price`. That removes B71's accepted risk outright: the day the rate is
renegotiated, the screen follows the server instead of being quietly wrong by a few cents with no
request whose answer would say so.

⚠ **`payment_method.fee_percent_rate` / `fee_flat_amount` are a near-miss, not the coefficients.**
`25.00` and `0.60` on a `$1.00` tier would give `$1.85`; the charge was `$1.38`. Those are the payment
*method's* own configuration, used on other paths. They look exactly like the fields somebody would
reach for, which is why this is written down.

Still open: the **renewal term** (#2 above) — the payload states an amount and a currency and no
interval, so *"every 30 days"* is still legacy's sentence with legacy's number.

---

## B86 — `conversion-packages`: `labels` comes and goes between requests · **the badge moves between visits**

`/get-star` badges the package the backoffice recommends. The payload carries it:

```json
{ "id": 189, "amount": 500, "price": "5.00", "labels": ["Most popular"] }
```

Measured against `wapi.tevi.dev` in one browser session, same anonymous visitor, minutes apart:

| Request | `labels` on the 500 row |
|---|---|
| First load of `/get-star` in a fresh context | `["Most popular"]` |
| `/get-star` after visiting `/my-star` and `/` first | **absent on every row** |

Same eight packages, same order, same prices — only the labels differ. The client falls back to the
first tile when nothing is tagged (`recommendedIndex`), so the badge **moves from the 500 tile to the
300 tile between two visits by the same person**. That reads as the recommendation changing, on a
screen where the thing under the badge is a price.

**What the client assumes today:** `labels` is authoritative when present and absent means "no
recommendation"; the first row tagged `most popular` (case- and space-insensitive) wins; the badge's
*words* are ours (`payment_most_popular`), because the payload's are English and the app ships in nine
languages.

**Questions:**

1. Is `labels` **per-account or per-session** (a personalised catalogue), or is its absence a caching
   artefact? The two requests differed only in whether an anonymous session had already been minted.
2. Is `"Most popular"` a stable machine value, or **display copy** the backoffice can retype? If it is
   copy, the client needs a flag or a slug — matching an English sentence is a badge that vanishes the
   day somebody writes "Most Popular!".
3. Can more than one row be tagged, and if so which wins? The client takes the first; two badges would
   be two recommendations.

**What changes if the answer differs:** if `labels` is display copy, `RECOMMENDED_LABEL` in
`features/payment/lib/star-packages.ts` becomes a real field and this stops being a string match. If
absence is a caching artefact, the fallback to index 0 should be dropped rather than kept — it is
currently the only thing standing between an unlabelled response and no badge at all.

## B87 — `GET checkout/v3/checkout/`: the status vocabulary, and whether the collection really lists · **a receipt screen that must not guess**

`/get-star`'s **Transaction history** lists this account's Star purchases. Legacy reads them from the
same path it posts a checkout to:

```
GET checkout/v3/checkout/?page=1&page_size=10
→ { data: { count, results: [ {
      id, top_up_quantity, status, created_at,
      payment: { amount, amount_currency,
                 payment_method: { id, name, images: [...] } } } ] } }
```

**What the client assumes today:** `GET` on that path is the collection (`POST` starts one); `results`
+ `count` is the envelope, and `count` is authoritative for paging; `payment` and `payment_method` may
each be `null`; `top_up_quantity` is Star **before** any bonus; `payment.amount` is what was charged,
in `payment.amount_currency`, and is printed **as it arrived** — the row is a receipt, so nothing
re-derives it through `gatewayTotal`.

**Questions:**

1. **What is the full `status` vocabulary?** Legacy prints the wire value with its first letter
   capitalised, which is how `PROCESSING_3DS` reaches a screen as "Processing 3ds" — untranslatable
   by construction, since the tokens are English. `lib/transaction-status.ts` maps what legacy's own
   flows imply into `settled | pending | failed` and **fails unknown values to `pending`**: of the
   three guesses only that one is honest, since `settled` would tell somebody their money arrived
   when it may not have and `failed` would report a refusal that may have gone through. The list is
   in that file; every value missing from it currently renders as *Processing*.
2. **Does the list include failed and pending attempts, or only settled ones?** The whole reason this
   screen exists rather than a link to `/my-star` is that a top-up which failed or is still pending
   has **no ledger entry** — it is exactly the row somebody opens this to find. If the collection is
   filtered to successes, the two lists are redundant and this one should be dropped.
3. **Is `count` the total across all pages?** Paging stops on it. If it is a page count instead, the
   list stops after ten rows. The fallback when the field is absent is the short-page rule
   `use-star-ledger.ts` uses.
4. **Is `payment_method.images` ordered?** The row draws `images[0]`, as legacy does. A card gateway
   ships two (Mastercard *and* Visa), so "first" decides which scheme the reader sees — the same
   question B70 raises for the gateway list, which now draws up to three.

**What changes if the answers differ:** a confirmed vocabulary turns `STATUSES` from a defensive map
into an exhaustive one and lets the unknown branch become a real "unrecognised" state rather than
*Processing*. A success-only collection removes this screen.

---

## B89 — `POST payout-configs/`: the `payout_detail` spelling per method · **four fields the setup form fills in on legacy's word alone**

`/my-wallet/setup-payouts` posts a method-specific bag (`payout_detail`) whose keys the published
schema declares as `additionalProperties: {}` — so the wire spelling comes from **reading legacy's
eight form components**, not from a contract. `lib/payout-method-form.ts` reproduces each one and
marks every oddity at the line it happens on. Four of them are guesses this client cannot resolve on
its own, and all four are on the screen that decides where somebody's money is sent.

1. **`config.form[].choices` is not in the schema.** `PayoutMethodConfigForm` publishes
   `{ field, display_name }`, and the live payload carries a third key: `choices`, an array of
   `{ id, name, logo }`. It is not decoration — USDT's `network` and Bank Transfer's `bank` are
   *picked from it*, and a method whose `choices` stop arriving becomes a form with an unfillable
   field. The client parses it optionally and degrades such a field to free text
   (`api/config-types.ts`). **Please publish it**, so it is a contract rather than an observation.
   B84 is the same payload's other half.
2. **Payoneer receives the same address three times.** Legacy posts
   `{ email, holder_name, phone_number: email, email_phone_number: email }` — one value in three
   keys. Reproduced verbatim, because a payload the backend has accepted for years is better evidence
   than a guess about which key it reads. **Which key is authoritative?** If it is `email`, the other
   two should stop being sent; if it is `email_phone_number`, the *Zelle* bug below is worse than it
   looks.
3. **Zelle's contact was being posted empty, and this client diverges.** Legacy's Zelle form collects
   `email_phone_number` and then posts `email: formData?.email` — a key its own form never sets — into
   all three contact keys, so the value is `''`. That saves a Zelle destination with **no way to pay
   it**. This client posts the typed value in the same three keys Payoneer uses. **Two questions:** is
   that the payload you want, and are there existing Zelle configs in the database with empty contact
   fields that need repairing? (Legacy has shipped this for as long as the form has existed.)
4. **`bank` on a non-US bank transfer is always the empty string.** The picker lists
   `config.form`'s `bank` choices, legacy stores the chosen choice's **name** in `bank_name`, and
   posts `bank: ''` because nothing ever writes it. Reproduced, empty string included. **Should `bank`
   carry the choice's `id`?** If so this is a one-line change; if the field is vestigial it should
   leave the payload.

5. **`is_active: false` on `payout-methods/`, and what it means.** A live `?countryCode=VN` answers
   `count: 5` with one of the two Bank Transfer rows flagged inactive. Legacy never reads the flag, so
   production renders all five; this client filtered them out for one afternoon and the only symptom
   was a screen that showed four rows against a count of five. The filter is gone (parity with
   legacy). **Is an inactive method selectable?** If `POST payout-configs/` rejects it, the list should
   not carry it at all — that is a backend fix, not a client one, because a client that hides rows on
   an unverified flag hides real payout options too. If it *is* selectable, the flag means something
   else and the client should keep ignoring it.

6. **What unit is `daily_limit_remainder` in?** It arrives as a bare decimal string with no unit
   beside it, and `daily_limit` sits on the method next to *both* `currency` and `exchange_rate` — so
   it could be the settlement currency or the TEVI figure the platform meters in. The row prints it
   **unlabelled**, which is what legacy does; labelling it `VND` when it is dollars is off by a factor
   of 25,000, in the reassuring direction. One word from the backend turns it into a labelled figure.

**Two more, smaller.** The USDT address check is legacy's `/^0x[a-fA-F0-9]{40}$/`. The *networks* come
from the backend, so the day a non-EVM one is offered (TRON's `T…` base58) the client will reject a
valid address. **Is there a per-network format** — and, more importantly, **does the backend reject an
address that does not belong to the chosen network?** Nothing recovers a USDT transfer sent on the
wrong chain, which is why this client stopped preselecting the first network (legacy preselects ERC20;
see `initialPayoutFormValues`) and now makes the reader choose.

**What changes if the answers differ:** every one of these is an edit inside
`lib/payout-method-form.ts` — the payload spelling lives in one function (`payoutDetailBody`) with a
unit test per method, which is what makes them cheap to correct.

---

## B91 — `POST payout-request/`: what does it answer when the **passcode** is missing or wrong? · **the withdrawal's 2FA refusal is guessed**

The withdrawal takes a `passcode` (legacy sends it; the OpenAPI schema documents only the other four
fields), and the client now collects one whenever `/me` says `two_fa_passcode: true`. So the happy
path is covered. What is not covered is the refusal, and the schema documents **no 4xx on this
endpoint at all** — it lists `201` and nothing else.

**Two questions:**

1. **What `code` comes back for a missing or wrong passcode?** `PASSCODE_CODES` in
   `features/payout/lib/payout-request-errors.ts` guesses seven spellings (`passcode_required`,
   `invalid_passcode`, `two_fa_required`, …). One real value replaces all seven.
2. **Does the endpoint verify the passcode itself, or only that one was presented?** The client calls
   `two-fa/passcode/verify/` first and then attaches the same string, which is legacy's sequence. If
   the write verifies it too, the pre-check is a courtesy (it lets the reader be told "wrong code"
   without a withdrawal attempt) and can stay. If the write does **not**, then the pre-check is the
   only enforcement the client can see — and that is worth knowing out loud, because it would mean
   the `passcode` field is decoration.

**Why the guess is safe meanwhile, and where it is not.** An unmatched code falls through to
`unknown`, which shows the backend's own sentence — so a wrong guess costs the *improvement*, never
the fallback. The set is deliberately narrow for the opposite reason: a code like `forbidden` in
there would put a passcode prompt in front of unrelated refusals. It is the **frequency** that is
unknowable from here — this branch only fires when `/me` was stale (2FA switched on in the mobile app
after the page loaded), and if that is common the guess being wrong is a group of creators back to
one generic sentence.

**What changes if the answers differ:** one `Set` and one unit-test case
(`payout-request-errors.test.ts`, five cases for this branch today).

---

## B93 — the `premium` service: **answered by a captured payload**, and one question left · **`/premium` no longer guesses its own DTOs**

`features/premium` reads three endpoints and posts to a fourth, and the service publishes no schema
(`premium/docs/schema/` is a 404) — so the first version of `api/types.ts` was inferred from legacy's
call sites. A captured `v1/benefits/` and `v1/packages/?platform=web` then settled most of it, and
**corrected four fields the inference had wrong**. Each of the four failed silently, which is the
reason this entry stays here rather than being deleted:

| inferred | actually | what it cost until the payload arrived |
|---|---|---|
| a detail row's label is `name` | **`title`** | every comparison row drew with no label |
| everything returned is live | **`is_active`** | a deactivated package was still sellable |
| the array order is the order | **`sort_order`** | the backoffice's arrangement was the server's to lose |
| `price` is USD by convention | **`currency: "USD"`** | a localised price would have been converted twice |

**Answered — the image host.** `benefit.icon` and `benefit.banner` are served from
`tevi-cdn.tevi.dev`, and one benefit's banner from `tevi-cdn.tevi.app`. Both were **already** in
`images.remotePatterns`, so the `unoptimized` both images carried — taken because an unlisted host
makes `next/image` *throw* in development and answer 400 in production, i.e. it costs the list
rather than the picture — is gone. Two observed URLs are pinned in
`shared/config/image-hosts.test.ts`, which is what that file is for.

**Answered — the currency.** `currency` is on the wire (`"USD"` in all three packages), beside a
`country: null`. `usePremiumPrice` converts **only** when it says USD and prints anything else
unconverted, so per-market pricing cannot silently multiply a localised figure by an exchange rate.

**Answered — `product_id`.** It is a real Stripe **Price** id (`price_1Shsht…`), which is what the
checkout wants as `price_id`. The wire name and the meaning differ, the DTO keeps the wire name, and
`lib/plans.ts` is the one place that knows.

### What is still open — **one question, and it is narrower than it looked**

**Is `duration_days` a closed set?** Per endpoint, legacy's answer is yes, and it hard-codes a
*different* set for each:

| screen | endpoint | set |
|---|---|---|
| `containers/premium` | `v1/packages/?platform=web` | `{ WEEKLY: 7, MONTHLY: 30, YEARLY: 365 }` |
| `containers/giftPremium` | `v1/gift-packages/` | `{ THREE_MONTHS: 90, SIX_MONTHS: 180, ONE_YEAR: 365 }` |

So 90 and 180 **are** real `duration_days` values on this service — just not on the subscription
endpoint. That is worth knowing before anyone widens `PLAN_DURATION_DAYS`: the set is closed per
endpoint rather than per service, and `lib/plans.ts` covering 7/30/365 for `v1/packages/` is right.
The unbuilt gift screen gets its own three.

Legacy matches by number and drops anything else — the same as this client. It never labels a cadence
from `package.name`, either: `name` is read in exactly one place (`useGiftPremium.js:152`, passed into
the gift's checkout body), never for a card's heading. So the earlier note here that "a fourth cadence
is at least labellable from `name`" was a thing that *could* be done, not a thing the product does.

**What is left is only this:** is the web subscription set closed at three, or should the client be
ready for a fourth? Today a 90-day web package would ship as a row nobody sees.

### Withdrawn — `expires_at` for a cancelled subscription

This asked for a `status` / `cancel_at_period_end` flag, so the hero could avoid promising a renewal
against a date that might be an ending. **The premise was the client's mistake, not a gap in the
contract.**

The sentence came from `tevi_premium_w2_next_billing_starts_s`, a Crowdin string **legacy's web app
never renders** — `next_billing` has zero hits in its source, and the string belongs to the mobile
app. Legacy's own web vocabulary for this field is **Valid until**: its redeem receipt is the one
place it prints `expires_at`, as Duration / Active from / Valid until. That is true whichever state
the subscription is in, so the screen now says it and needs no flag to be correct
(`premium-hero.tsx`). The unused key is deleted rather than left in nine locales.

**What changes if the answer differs:** `PLAN_DURATION_DAYS` in `lib/plans.ts` and its test — the
cards, the grid and the copy keys are all derived from it (`PLAN_ORDER`, `PLAN_COPY`), so a fourth
cadence is that constant plus four translation keys.

---

---

## B94 — the **acquisition block**: is `click_id` the only way a web signup is credited? · **the app hands out referral links and reports none of them**

Every login endpoint in the auth contract takes an optional acquisition block beside the device
one — `click_id`, `anonymous_id_web`, `campaign`, `session_id`, `platform` and the five `utm_*` —
and the contract states the credit is resolved **server-side from `click_id`** ("đừng gửi id người
share"). **This client sends none of them**, on any path: `withDevice()` adds the four device
fields and nothing else, and `click_id` / `utm_*` / `anonymous_id_web` appear nowhere in `src/`.

That is not a modelling gap, it is a missing capture. `features/affiliate` **issues referral
links** (`ProgramJoinedStep` prints one for the creator to copy), so the app is distributing links
whose web conversions it then never reports. Legacy treats this as a first-class concern: a
303-line `utils/acquisition.js` plus two tracking providers, which read the tokens off the URL at
**landing**, persist them (signup happens on a later pageview whose URL is clean), send them with
the signup, and then mark the touch **consumed**.

**What is actually being asked, in the order it blocks work:**

1. **Is `click_id` the only attribution path on web, or does the redirect service also set a
   server-side cookie?** If a cookie carries it, there is nothing to build and this closes. If not,
   every web signup from a share link is currently unattributed.
2. **Is `anonymous_id_web` required for the *credit*, or only for merging a person across web and
   app?** It is PostHog's `distinct_id`, and **this app has no PostHog** — no analytics stack at
   all, deliberately (see `GetAppButton`, `END_RAIL_OPEN_ITEMS.md`). So `click_id` and `utm_*` are
   portable and that one is not. If the credit needs it, the answer is a different design, not a
   smaller one.
3. ⚠ **What is one touch worth in a multi-account browser?** This is the question legacy cannot
   answer, and it is why the port is not mechanical. Legacy is one account per browser and marks a
   touch consumed when a real (non-anonymous) session is created — a fix for a **double-credit**
   regression it documents: land on a share link → sign up as A → log out → sign up as B without
   reopening the link → B still sent A's `click_id`, and the promoter was credited twice. **This
   app holds up to ten accounts and the switcher is two taps from every screen**, so "sign up as a
   second account" is not an edge case here, it is a feature. Does a touch credit the first account
   only, every account created while it is live, or something time-boxed?

**Why it has not been built on a guess:** a *partial* port is worse than none. Capturing and sending
without the consumed-marking is exactly the double-credit legacy hit, and it costs promoters' money
rather than a screen. The capture-persist-send-consume chain is small (one `shared/lib/` module and
a hook into the sign-in paths); the semantics in question 3 are what it has to be built against.

---

## B99 — **Gift Premium**: the gift catalogue, the receiver, and the message that is not there · **`/gift-premium` guesses three things a charge depends on**

`/gift-premium` buys Premium for somebody else: `premium/v1/gift-packages/?platform=web` for the
table, `core`/`search` for the recipient, and `checkout/v3/checkout/gift-premium/` for the charge.
Two of those had never been called by anything in this repo, and the third is called with a field
this client has to **derive**. Everything below is what the code assumes today.

**1. `v1/gift-packages/` is assumed to answer the same shape as `v1/packages/`.**
`normalizePremiumPackages` parses both, so a gift row needs `product_id`, `price`, `duration_days`
and `is_active` under those names. Legacy reads `data.data.packages` and nothing else, so its call
site is no evidence about the rest. **If the shape differs, the screen renders nothing and says the
catalogue is empty** — a successful request with no sellable row, which is deliberately not an error
state, so the failure is a silent blank offer.

**2. `duration_days` is assumed to be 90 / 180 / 365.** Legacy matches on exactly those three
(`DURATION_DAYS` in `useGiftPremium`) and this is a port of that. A fourth cadence is dropped rather
than drawn with an invented heading (`lib/gift-plans.ts`), which is the safe direction — but it means
a catalogue that quietly moves to 30/90/180 renders one card.

**3. `receiver_user_id` is the space's `owner_id`, fetched separately.** Neither list this screen
draws from is contracted to carry it: `followedChannelSchema` says in writing that it does not, and
the search payload is a projection. So `giftRecipientApi.resolveReceiverId` reads
`core/v3/channel/channels/{slug}/` for that one field, exactly as legacy's checkout handler does one
line before it charges. **Two questions here.** Is the `owner_id` on a channel profile the same
identifier space `checkout/gift-premium/` prices against (B11 says it matches `/me`'s `id`, which is
suggestive and not the same claim)? And is there a cheaper way to ask — a `receiver` field on the
search payload, or a checkout that accepts a slug?

**4. Where do "-35% off billed" and "-10% off billed" come from?** — *answered, and the answer was
that they are wrong. Now: is there a real field?*

Legacy types both into the JSX (`packageYearly`, `packageSixMonths`). This client first replaced them
with arithmetic, and the live prices refute that:

| plan | price | per day | per month |
|---|---|---|---|
| 3 months (90d) | $24.99 | 0.2777 | $8.33 |
| 6 months (180d) | $49.99 | 0.2777 | $8.33 |
| 12 months (365d) | $99.99 | 0.2740 | $8.22 |

The widest gap between any two is **1.4%**, and that is only the year being 365 days rather than 360.
There is no inter-tier discount to derive.

**Then the origin of `-35%` turned up.** It is `/premium`'s number: that screen's annual plan is
**$77.92 against 12 × $9.99 monthly = $119.88**, which is exactly 35%. It was copy-pasted onto a gift
card that costs **$99.99**, where the real saving against the monthly subscription is **17%** — so
the chip overstated the discount by roughly two-to-one, on the one surface of this app that takes
money on somebody else's behalf. (17% is also the saving on *all three* gift tiers, because they are
one rate, so no percentage distinguishes the cards even computed correctly.)

The client therefore prints **no percentage at all**. Each card shows the total it charges and the
**per-month equivalent** under it — derived from the figure directly above, checkable by eye, and the
unit that makes 3/6/12 comparable. `lib/gift-plans.ts` carries the finding; a test pins that the
catalogue is one rate, so a percentage cannot come back without a source.

**What is still open:** is there a discount field on a gift package this client should read? If the
product wants a "-N%" chip, the baseline has to come from the backend — deriving it needs the monthly
subscription price, which is a *different catalogue* (`v1/packages/`) and a comparison this screen
never shows.

**5. Does `checkout/gift-premium/` refuse a recipient who already has Premium, and how?****5. Does `checkout/gift-premium/` refuse a recipient who already has Premium, and how?** Legacy
special-cases **HTTP 422** into its own "This user already has Tevi Premium" dialog. This client does
not hard-code that sentence — the backend's own `message` reaches the screen through
`CheckoutStatusDialog` ([`API_ERRORS.md`](API_ERRORS.md)) — which is better *provided the 422 body
carries a sentence written for a reader*. If it carries a bare code, the reader gets our generic
"something went wrong" for the one refusal that has an obvious next step ("pick somebody else").

**6. Is the gift *message* real?** Legacy has a `MessageGiftPremium` component, a `message` state, a
100-character limit and a toast for exceeding it — and **renders none of it**: `components/info`
never mounts the component, and `checkoutGiftPremium`'s payload has no such field. Its own strings
say "Only @x will see your message", and a chat message *is* what the mobile app's push copy
implies (`push_notification_w2_sent_you_a_gift_premium`). So: is there a field the web should send,
or is this a mobile-only capability whose web UI was abandoned half-built? Nothing is ported until
this is answered — a control the backend cannot receive is worse than no control.

**7. Is there any way to read back a gift that has just settled?** There is none today, which is
why the success screen is rebuilt from a `?gift_token=` this client mints into its own success URL
(`lib/gift-token.ts`) — legacy's mechanism, kept because there is no alternative. It is a **display**
value and the code says so at length: it is attacker-supplied on the return leg, so it carries no
image URL, its handle is pattern-checked, and it expires after a day. A `GET` for "the last gift this
account sent" would retire all three of those precautions.

---

## B95 — `connect/tiktok/`: is `code_verifier` required, and who mints the challenge? · **a login button that may already be broken**

The contract gives `POST v1/connect/tiktok/` as `{ code, redirect_uri, code_verifier }` — an
authorization-code flow **with PKCE**. This client sends `{ code, state, redirect_uri }` and **no
`code_verifier`**, because `beginOAuthRedirect` never mints a `code_challenge`:
`onTiktok` sends `client_key`, `response_type` and `scope` only (`auth-method-buttons.tsx`).

The two halves are at least *consistent* — no challenge out, no verifier back — so this is correct
if the backend's TikTok app authenticates the exchange with a client secret and treats PKCE as
optional. It is broken if TikTok is registered such that PKCE is mandatory, in which case the
authorize call is refused before the user ever returns.

- **Does `connect/tiktok/` require `code_verifier`, or is it optional?**
- If required: the client must add `code_challenge` + `code_challenge_method=S256` to the authorize
  redirect and persist the verifier beside the `state` it already keeps in `sessionStorage` — a
  small change to `oauth-redirect.ts`, but one that **must not** be made speculatively: sending a
  challenge without the backend forwarding the verifier breaks a flow that may work today.

Deliberately not changed for that reason. LINE is the same shape and is not in doubt — the contract
lists `state` for it, which this client sends. The other seven providers match the contract as sent
(`facebook` carries an extra `id_token` and `google` an `id_token` holding this app's OAuth client
id, which is **B3**, answered: the contract, not legacy's mistake).

---

## B96 — the **NSFW appeal**: mostly **answered by a captured payload** · **one field left, and it is a video's duration**

Appealing a space's NSFW label ships in the iOS and Android apps and **nowhere in legacy web**. The
sequence and the four paths came from the team; the bodies were guessed for a day and then settled
by a real `nsfw-posts/` response. What that response changed:

```
GET    core/v3/channel/my-channel/nsfw-appeal/latest/   → 200 with data ⇒ already appealed
GET    core/v3/channel/my-channel/nsfw-posts/?limit=10  → the flagged queue
DELETE core/v1/posts/{id}/                              → one row of it
POST   core/v3/channel/my-channel/nsfw-appeal/          → file it, once the queue is empty
```

- ~~**Does `nsfw-posts/` carry a DRF `count`?**~~ **Answered: no.** The envelope is
  `{ next, previous, results }`. So the Submit button is decided by the **page coming back empty**,
  with `next` as the cross-check — which is what the client already did, and deliberately: requiring
  a `count` would have left the button permanently dead. An empty first page really does mean an
  empty queue, because the refetch after the last delete returns the next row if there is one.
- ~~**What is a flagged post's shape?**~~ **Answered.** It is the ordinary post DTO. The caption is
  **`text`** (not `content` — the client's guessed union had `text` last, so it worked by luck);
  `created_at` is **epoch milliseconds**; pictures are `images: [{ h, w, uri }]` with a separate
  `cover_image`, and the row draws **`cover_image.uri`** because on a sensitive post that is the
  **blurred derivative** (`imge.tevi.app/unsafe/filters:blur(80)/…`) while `images[0]` is the
  original. The two counters the comps draw are `reaction_count` (Tevi's reaction *is* a star) and
  `reply_count`; the leading mark is access, from `price` and `viewer` (`EVERYONE` vs `STARGAZERS`).
- ⚠ **The queue is stale after a `DELETE`, in two independent ways.** First it answered **304 Not
  Modified** with an unchanged `W/"…"` validator, and `apiClient` replays a 304 as the cached body.
  With the validator dropped it then answered a fresh **200 that still contained the deleted post** —
  so the list is **cached server-side** as well. Either one alone puts the deleted row back on screen
  with Submit stuck disabled and no error anywhere. Two questions, and the second is the load-bearing
  one: *is the list's ETag recomputed when a member is deleted?* and *how long is `nsfw-posts/`
  cached, and is it invalidated by `DELETE v1/posts/{id}/` at all?* The client no longer asks — a
  delete is spliced out of the cache and the id is remembered so no later read can resurrect it —
  but every other client that trusts this endpoint after a write will see the same thing.
- ⚠ **Still open: how a video states its length.** Every row in the captured payload has
  `video: null`, and the comps draw `12:02` over a video thumbnail. `formatDuration` and its test are
  written and unused — wiring it is one line once the field is named. Today a video row shows the
  play badge with no time.
- **`latest/` when nothing has been filed** — a 404 is assumed to be the normal answer, as it
  documentedly is for `GET v1/appeal/` (the suspension appeal, in the table below). The client turns
  404 *and* an empty 200 body into "no appeal on file"; every other status still throws. If this
  endpoint instead answers `200 {}` for a *pending* appeal, the owner would be offered a second one —
  the one failure here that costs a human a duplicate case to close.
- **Does `POST nsfw-appeal/` deduplicate?** It is not retried (`apiClient` replays a POST only with
  `{ retry: true }`), because a 502 arriving after the appeal landed would file a second one. Confirm
  and the retry can be turned on.

Two product facts come from the comps rather than from an endpoint: **"3-5 business days"** is stated
in the client, and the result is promised as a *message* — which implies the inbox, i.e. an
`inbox_change` on the user room. Nothing subscribes to it for this.

Encoded in `features/nsfw/api/nsfw-appeal-api.ts`, `hooks/use-nsfw-appeal.ts`, `lib/format.ts`.

---

## B97 — the **link service**: is `share_channel` closed, and is a mint idempotent? · **the share sheet's attribution is guessed per channel**

The share sheet mints a link **per channel** so that "shares by Telegram" is a real figure. Two
endpoints, and which one runs is decided by whether the caller can name the content:

```
POST shortlink/api/v1/links      { original_url, content_type, content_id, creator_id?, source_screen?, share_channel }
POST shortlink/api/v1/shorten/   { original_url }                     ← no context, no channel
                                 both answer { url_shortener, share_id? }
```

- ⚠ **Is `share_channel` a closed enum, and what is in it?** The client sends `copy_link`,
  `direct_link` (the QR step), `telegram`, `facebook`, `twitter` and `email` — legacy's values, and
  three of them do not match the button: **X posts as `twitter`**, the QR code posts as
  `direct_link`, and Tevi's own DM posts as `internal`. If the enum has since grown a `whatsapp` or a
  `messenger`, two rows this client omits become one line each (`features/share/lib/share-channels.ts`
  says what else each is waiting on — a glyph and a Meta app id respectively). If it is **not**
  validated, the risk is the other way: a typo mints a working link and files the press under a
  channel no report groups by, with nothing failing.
- ⚠ **Is a mint idempotent per (content, channel)?** The client caches one link per
  (account, content, channel) for 30 minutes and never re-asks, so two presses of Telegram are one
  request. If the service instead mints a fresh `share_id` per call, the cache is hiding a fan-out
  every other client is doing — and if it *is* idempotent, the cache can be dropped and the retry
  turned on (the POST is deliberately not retried today, because a 502 arriving after the mint landed
  would duplicate the `share_link_created_v2` event rather than the link).
- **Must `original_url` contain `/@{handle}`, and what is the refusal?** Legacy's comment says the
  URL has to carry the handle and that a context-less share 422s, which is why the second endpoint
  exists at all. The client never sends a partial context — `spaceShareContext` answers `null` rather
  than a body with `content_id: undefined`, which is what legacy builds — so the 422 should be
  unreachable. Confirming the code and message would let the fallback be chosen on the *answer*
  instead of on the client's own guess about which endpoint applies.
- **Does `v1/shorten/` emit anything?** If not, every share from a surface that cannot name its
  content is invisible in the analytics, and the fix is a `content_type` for it rather than anything
  in this client. Worth knowing before somebody reads the channel breakdown as a total.
- **What is `source_screen`'s vocabulary?** Free text as far as this client can tell; it sends
  `'space'` and legacy also sends `'post'`. If it is validated, the list is needed before a second
  surface opens the sheet.
- **What resolves `share_id`?** The pretty URL is `tevi.com/{creator}/s/{id}`, so the id is parsed and
  carried even though nothing in this client reads it yet. If that route is what records the *click*
  (as opposed to the share), a screen that wants to show a link's performance needs the read endpoint
  named.

Encoded in `features/share/api/share-link-api.ts`, `lib/share-channels.ts`, `hooks/use-share-link.ts`.

---

## B98 — the **MCN partnership**: what is in `mcn`, and what does `media-space/` answer? · **`/mcn-partnership` renders four guessed fields**

`/mcn-partnership` is built and reads two services. The commercial half comes from `my-channel/`'s
`mcn` block; the presentational half from the organization record on a **different base**. **B100** is
the other end of the same relationship — the invitation that creates the partnership this screen
renders — and the fractions-vs-percentages question below applies to both:

```
GET  core/v3/channel/my-channel/          → { …, mcn: { name, is_owner, creator_rate, mcn_revenue_rate, identifier?, joined_at? } }
GET  business/v1/organization/media-space/{identifier}/   → { id, slug, description, images: { thumb, cover }, message_url, verified_tick_badge }
GET  core/v3/organization/leave/          → { expected_departure_at } | 404
POST core/v3/organization/leave/          → { expected_departure_at }
DELETE core/v3/organization/leave/        → 204
```

Nobody in this repo has an account under an MCN, so none of the first two has been seen on the wire —
the shapes are read out of legacy's `containers/mcnPartnership/hook` and its `@models/businessOrganization`,
which is the only description of either that exists (`/business` publishes no OpenAPI document: `schema/`
404s).

- ⚠ **Is `mcn.identifier` the organization id `media-space/` takes, and what type is it?** Legacy passes
  it straight through with no coercion, so it never had to decide. The client normalises string and
  number alike and treats an **absent** one as "we cannot ask" — the card then renders with initials and
  no contact link rather than requesting `media-space//`. If the field is spelled differently (`org_id`,
  `organization_id`) the whole second half of the screen is silently blank, with nothing failing.
- ⚠ **Is `mcn.joined_at` sent, and in what units?** It is the `Since …` line. `created_at` on the same
  service is **epoch milliseconds as a JSON number**, which is what made a whole column of dates render
  empty once (see `nullableTimestamp`), so this client accepts seconds, milliseconds and ISO alike. If
  the field is not sent at all the line is dropped — which is correct behaviour and still worth knowing,
  because legacy prints nothing there either and may simply never have had it.
- ⚠ **What is `message_url`?** Legacy maps it to a contact link, opens it in a new tab, and falls back
  to a `website` field this endpoint does not send (dead code, not reproduced). If it is a **Tevi**
  address — a thread with the network — the link should be an in-app `next/link` rather than
  `target="_blank"`, and the client is currently doing the wrong thing for the common case. It is
  parsed and refused unless `http(s)`, so a `javascript:` value cannot execute; that is a guard, not an
  answer.
- **Are `creator_rate` / `mcn_revenue_rate` percentages, and can either be null?** Rendered as
  `{rate}%`, and **`null` prints an em dash rather than 0** — a rate the backend did not send is not a
  0% split, and this is the screen a creator reads their contract off. Legacy's `|| 0` cannot tell the
  two apart. If they are fractions (0.7) rather than percentages (70), every partnership on the
  platform is displayed at 70/30 as 0.7%/0.3%.
- **What does `POST leave/` answer when a departure is already scheduled?** The client cannot get
  there — the action is offered only once `GET` has answered `null` (`canRequestLeave`) — so the code
  is unused rather than unhandled. Worth having if the answer is a specific 4xx, because the API's own
  message would then be the right thing to show.
- **Does the 48 hours come from anywhere?** It is hard-coded in both apps' copy and in nothing else. If
  the window is configurable per network, the sentence is wrong for whoever is not on 48.

Encoded in `features/channel/api/organization-api.ts`, `api/types.ts` (`mcn`),
`hooks/use-mcn-partnership.ts`, `lib/mcn-partnership-state.ts`.

## B100 — the **MCN invitation**: the payload, the expiry window, and the two numbers in the letter · **`/invitation/verify` counts down to a deadline it invented**

`/invitation/verify` is built. One token off an email, one read, one write:

```
GET   core/v1/organization/invitations/{invite_token}/           → { organization: { id, name }, created_at, mcn_revenue_rate }
POST  core/v1/organization/invitations/{invite_token}/?action=accept|reject   → 2xx
```

Nobody in this repo has ever received one, so the payload has not been seen on the wire — the shape is
read out of legacy's `containers/invitation/components/content`, which accesses exactly three fields
and is the only description that exists (`core/schema/` is signature-gated, so there is no OpenAPI
document to check). Sibling of **B98**, which covers the partnership the *accepted* invitation creates.

- ⚠ **How long is a link good for?** The payload carries `created_at` and **no expiry**, so both apps
  compute the deadline as `created_at + 72h` and legacy prints the remainder **inside the Agree
  button's label**. That is a live timer counting down to a moment this client made up: if the real
  window is 48 hours it reads 24 hours high for the whole of the second day. The client's countdown is
  deliberately **informational and does not gate the buttons** (`canAnswerInvitation`) — the server is
  the authority on expiry — so a wrong constant costs a wrong *number*, never a wrong outcome. Best
  answer is a field: `expires_at` on the payload and the constant is deleted.
- ⚠ **"within 3 days" and "at least 60 days" — where do those come from?** Nowhere. Both are literals
  in legacy's JSX and are now literals in this client's `Trans` values. The first at least agrees with
  the 72-hour countdown beside it; the **60** does not appear anywhere else in either app, and it is a
  commitment stated to a creator on the screen where they agree to it. If the lock-in is configurable
  per network, or is 30 days, this letter is a promise the platform does not keep.
- ⚠ **Is `mcn_revenue_rate` a percentage, and can it be null?** Legacy `parseFloat`s it, so it arrives
  as a **string**; the client accepts both spellings. Rendered as two figures — the network's rate and
  `100 −` it. **`null` withholds both** rather than printing 0: legacy's `parseFloat(x) || 0` renders
  **Creator Rate 100% · MCN Rate 0%** for a payload missing the field, which is a commercial term
  nobody agreed printed as fact. Out-of-range values are refused for the same reason (140 would print a
  creator share of −40%). Same fractions-vs-percentages question as B98.
- ⚠ **What does a spent or expired token answer?** The client treats **404 and 410 as data** — the
  expired-link wall — and rethrows everything else into an error state with a Retry. 410 is a guess at
  "this token was already redeemed"; if that case comes back as a **200 with a status field**, or as a
  4xx with a `code`, the wall is right for the wrong reason and the reason is worth having (the code
  would map to a translated key ahead of the API sentence — see `docs/API_ERRORS.md` §3).
- ⚠ **Is `action` really a query parameter?** Legacy sends `ApiModel.post(path, {}, { action })`, whose
  third argument is params, so the body is `{}` and the verb rides on the URL. Reproduced exactly.
  Unusual enough for a state-changing call that it is worth confirming rather than inferring — a body
  `{ action }` would be the conventional shape and legacy's own code is the only evidence either way.
- **Does `POST` answer anything a screen should read?** The client reads nothing and navigates to `/`
  (legacy's destination). If the response carries the created partnership, an accept could land on
  `/mcn-partnership` with the terms already in cache instead of a home page that has to re-read
  `my-channel/`.
- **Is there a way to *list* pending invitations?** No endpoint is known, so this screen is reachable
  only from the emailed link — there is no inbox row, no drawer entry and no way back to it once the
  mail is lost. Legacy is the same.

Encoded in `features/channel/api/invitation-api.ts`, `lib/invitation-state.ts`,
`hooks/use-mcn-invitation.ts`.

---

## B101 — the **MCN manager invitation**: a second invitation nobody has described · **`/mcn-user-invitation/verify` guesses the payload and states two terms as fact**

Sibling of **B100**, and please answer them together — they are two screens, two endpoints and two
emails that a reader cannot tell apart from the outside. This is the one that invites somebody to be
a **manager** of a network rather than one of its creators:

```
GET   core/v1/organization/user-invitations/{token}/                       → { organization: { id, name }, created_at }
POST  core/v1/organization/user-invitations/{token}/?action=accept|reject  → 2xx
```

Nobody in this repo has ever received one, so the payload has not been seen on the wire — the shape is
read out of legacy's `containers/mcnUserInvitation/components/content`, which accesses exactly two
fields, and `core/schema/` is signature-gated so there is no OpenAPI document to check. Everything in
B100's list about the two calls' *mechanics* applies here unchanged (404/410 read as data, `action` as
a query parameter, nothing read out of the `POST` body); what follows is only what differs.

- ⚠ **The two invitations disagree on the query-parameter name, and the client cannot normalise it.**
  The creator link carries `?invite_token=`, this one carries `?token=`. Both spellings are in mail
  already sent, so both are reproduced exactly — and a token redeemed against the *other* endpoint
  404s, which this client renders as *the invitation link has expired*: a live invitation reported
  dead. If the two can ever be served by one endpoint, say so and one of these screens goes away.
  Until then, please do not change either spelling.
- ⚠ **"this invitation link will expire in 72 hours" — is that the real window?** The payload carries
  `created_at` and **no expiry**, exactly as B100's does. This screen at least does not count down:
  legacy states the window as a flat sentence and so does this client, so a wrong constant is a wrong
  sentence rather than a live timer lying by the second. Best answer is still a field — `expires_at`,
  and `USER_INVITATION_WINDOW_HOURS` is deleted.
- ⚠ **The two bullets are the terms somebody is agreeing to, and neither is in any payload.** Legacy
  hard-codes *"Cannot join other MCN as a Creator"* and *"Can manage this MCN user according to their
  group permission"*, and this client quotes both verbatim rather than paraphrasing them. The first is
  a **restriction on the reader's own account** stated on the screen where they accept it; if it is not
  true — or is conditional, or is per-network — this letter is a promise the platform does not keep.
  The second names a *group permission* that no endpoint this client calls has ever mentioned.
- ⚠ **What does accepting change about `/me` and `my-channel/`?** Unknown, so the client evicts
  `my-channel/` (query **and** ETag record) after either answer and navigates to `/`. That is a
  deliberate over-reach: one conditional GET on a screen that is leaving anyway, taken because the
  alternative — assuming nothing changed — is the assumption that was wrong on `my-channel/`,
  `premium-info/` and `my-subscriptions/`. If a manager role surfaces in the `mcn` block, in
  `features/permission`'s grants, or nowhere at all, say which and the eviction narrows to it.
- ⚠ **Is a manager a creator?** The first bullet implies the roles are exclusive, which would mean this
  endpoint can refuse an account that is already in an MCN as a creator — and that refusal is the one
  case worth a stable `code` (**B90**), because "you are already managed by a network as a creator" is
  a sentence the client could translate. Today it shows the API's own message in English.
- **Is there a way to *list* pending manager invitations?** No endpoint is known, so this screen is
  reachable only from the emailed link — no inbox row, no drawer entry, and no way back once the mail
  is lost. Legacy is the same, and B100 asks the same for the creator half.
- **Does anything distinguish the two mails?** If both templates ever point at one path with a role in
  the query string, that is the fix worth making — one screen, one parameter, and the mis-redeem
  failure above stops existing.

Encoded in `features/channel/api/user-invitation-api.ts`, `lib/user-invitation-state.ts`,
`hooks/use-mcn-user-invitation.ts`.

---

## B102 — the **monetization hub**: is `income_usd` a 30-day figure, and is there a per-method state? · **`/monetization` prints a window the payload never states, over a list nothing can switch on**

`/monetization` is legacy's hub, ported. It owns no endpoint: the headline figure is `income_usd`
from `GET /analytics/v2/channel/{slug}/stats/` (the same call the channel page makes), the balance is
`balance/`, and the four methods are a hard-coded array. Three things about that are guesses.

**1. The window.** The caption under the figure reads *"Estimated revenue in the last 30 days"* —
legacy interpolates a literal `30` (`.replace('[%s]', 30)`) into a sentence describing a field the
stats payload states no period for. `income_usd` sits beside `follower_count`, `member_count` and
`post_count`, none of which is windowed, which makes **lifetime** the more natural reading of the
group. If it is lifetime, then every creator on Tevi has been shown a sentence that understates
nothing and overstates the recency of everything — a figure of `$4,400` read as *this month* when it
is *since I started*. The client cannot tell the two apart from the payload.

- **If it is 30 days:** nothing changes. `REVENUE_WINDOW_DAYS` in
  `features/monetization/lib/methods.ts` already says so in one place.
- **If it is lifetime:** the copy is wrong in nine locales and the fix is a string, not a query —
  but somebody has to say which.
- **If it is configurable:** the window belongs in the payload (`income_window_days`), and the
  caption should interpolate it rather than a constant.

**2. Is there a per-method state?** Legacy's `useHub.js` carries, verbatim:

```js
// TODO: Replace with real API data
const INITIAL_METHODS = [
    { key: 'membership', isSetup: true },
    { key: 'donation', isSetup: false },
    …
]
```

…and nothing reads `isSetup` — `MethodItem` renders every row identically. So the heading *"ACTIVE
monetization methods"* is currently a claim the screen cannot back: it lists four methods whether or
not the creator has switched any of them on. If an endpoint exists that says which are configured,
the rows want a trailing state and the heading becomes true; if none does, the heading is the string
to change. This client ships the list unconditionally, which is legacy's behaviour, and
`lib/methods.ts` is where the field would land.

**3. Does `income_usd` reach a non-owner?** This is **B18** asked from the other side. The hub reads
the reader's *own* slug so it is safe as written, but B18's answer decides whether the field may be
rendered server-side, and therefore whether this screen's first paint can carry a number.

Encoded in `features/monetization/lib/methods.ts` (`REVENUE_WINDOW_DAYS`, and the note on why the
list is a constant), `hooks/use-monetization-hub.ts`.

---

## B103 — the **creator's membership tier**: five endpoints nobody has described · **`/monetization/membership` guesses a payload, two field spellings and a fee**

`/monetization/membership` is legacy's creator dashboard, ported. It reads and writes
`billy/v3/subscription/my-packages/` and reads `billy/v3/subscription/my-channel-subscriptions/`,
and none of those five calls is in a schema this client has seen. Everything below is legacy's shape,
kept verbatim because it is the only contract available.

**1. `sharable_url`, with one `e` missing.** Legacy reads exactly that key off a package and the
Share action has nothing to offer without it. It is kept verbatim — a wire key is not a word — but
if the API also serves `shareable_url`, or renames it, Share silently becomes a dead row rather
than an error.

**2. The `prices` array has two different types for the same field.** Legacy posts Star as a
**number** and USD as a **string**:

```json
{ "prices": [{ "amount": 1000, "amount_currency": "TVS" },
             { "amount": "10", "amount_currency": "USD" }] }
```

Pinned in `lib/membership-tier.test.ts` precisely because it reads like a bug, so the next reader's
instinct is to tidy it — and a tidied write that the backend rejects surfaces as a save button that
does nothing. Is either spelling required? Is the order?

**3. Is `description: ''` the same as omitting it?** Legacy omits the key when the field is blank, so
this client does too. If they differ, a creator who clears their description does not clear it.

**4. Can a creator have more than one tier?** `my-packages/` is a paginated list, legacy asks for 100
and renders `results[0]`. The whole screen is built for exactly one tier. If a second is possible,
this is a list screen and not a detail one.

**5. Is the 15% system fee served anywhere?** The setup form states *"Revenues from Membership will
be deducted 15% as System Fee"* with the number hard-coded, as legacy hard-codes it. It is **not**
`features/membership`'s `membership-fee.ts` (5.9% + $0.30) — that is the *buyer's* card processing
fee and this is the *seller's* revenue share, two numbers about two sides of one charge. A creator
reading a stale rate is being told the wrong thing about their own income.

**6. Does `my-channel-subscriptions/` carry `next`?** The list infers the end from a short page, the
same assumption **B38** records for billy's other paginated endpoints. And `user=` is the search
parameter's name (legacy's), which reads like an id filter and is a free-text query.

**7. `package_price` versus the tier's current price.** The client renders the per-member figure on
the assumption that a member who joined at an older price keeps paying it until renewal. If billy
instead rewrites `package_price` when the tier changes, the "you cannot edit a tier while members
are paying" gate is unnecessary — and if it does not, that gate is load-bearing and should be
enforced server-side too, since it is a billing change.

Encoded in `features/monetization/api/types.ts`, `api/membership-api.ts`, `lib/membership-tier.ts`
and its test, `hooks/use-membership-tier-form.ts`.

---

## B104 — the **creator's donation offer**: mostly **answered by the schema**, and four questions left · **one of which is a `date_range` legacy has been sending wrong**

Unusually for this file, most of this one is already answered. billy publishes the four endpoints
`/monetization/donation` uses — `https://api.tevi.dev/billy/docs/schema/v4/?format=json`, donation
half byte-identical in `v5` — and reading it settled four things legacy gets wrong or leaves open.
Those are recorded here as **findings**, not questions; the four real questions follow.

### Answered by the schema, and acted on

**`date_range` is `1m | 30d | 60d | 7d | thisMonth`.** Legacy sends **`this_month`**, a value in no
enum, on both `summary/` and `donations/`, every time a creator picks *This month* — so DRF answers
the default or a 400, and either way the choice does nothing. This client sends `thisMonth`
(`DONATION_RANGES`, pinned in `lib/donation-setting.test.ts`). Worth checking whether the same
spelling is wrong in the mobile apps.

**`name` is `maxLength: 50` and `thank_you_msg` is `maxLength: 500`.** Legacy enforces neither and
lets billy refuse the write, which surfaces as a save button that fails with nothing pointing at the
field. Both are enforced in the form.

**`icon` and `button_text` are closed enums** (`pizza | coffee | book | rose`, `Donate | Tip`).
Legacy indexes art by `icon` with no guard; this client falls back rather than rendering nothing.

**`GET summary/` is mis-annotated** as returning `ResponseMyDonationSetting`, which it plainly does
not — legacy reads `unique_supporter_count` off it and so does this client. A drf-spectacular
annotation bug rather than a contract question, but it means the summary's *real* shape is still
unwritten anywhere: question 2 below.

### Still open

**1. How does `donations/` page?** It answers a DRF envelope (`count`, `next`, `previous`,
`results`) and documents **one** query parameter, `date_range`. So there are no paging parameters to
send, and legacy sends none — it renders `results` whole. A creator with more supporters than one
page therefore sees the first page and has no way to reach the rest, in both clients. Are `page` /
`page_size` accepted? What is the default page size? The client already reads `count`, so answering
this is a small change here and a real one for anybody with an audience.

**2. What else is on `summary/`?** `unique_supporter_count` is the only field either client reads,
and it is read on legacy's word. Is there a total amount, a period comparison, a donation count? The
overview prints one figure above a list and the design has room for more.

**3. Does a donation row's `user` carry `channel_slug` and `channel_verified_tick_badge`?** The
schema's `User` is `{ id, display_name, avatar }` and legacy's row reads both of the others off it.
Both are modelled optional here, so a row that carries a slug is a link to `/@slug` and a row that
does not is a plain name — but if they are always present this is a link that sometimes silently
is not one, and if they are never present the whole supporters list is unpressable.

**4. What is the `payout_status` vocabulary?** `readOnly` free text, no enum. Legacy maps
`success → done` and keeps `refunded` and `pending`, painting anything else as the **raw wire value
in grey** — so a backend that starts sending `on_hold` puts that string on a creator's dashboard.
This client renders no badge at all for a value it has no word for, which is honest but silent. The
full list would let the three become four.

### Two fields nobody writes, and one endpoint nobody calls

`allow_monthly_donation` and `allow_post_donation` are real booleans on the setting that **no
client sets** — not legacy's form, not this one. Are they live? `GET metadata/` is declared in
legacy's `DonationModel`, called from nowhere, and has no response body in the schema.

`DELETE setting/` exists and legacy wraps it (`handleDeleteSetting`) without ever calling it — the
settings menu has two rows. Not ported, since *Activate Donation* is already the off switch; noted
here because the endpoint's existence will read as an omission otherwise.

Encoded in `features/monetization/api/donation-types.ts`, `api/donation-api.ts`,
`lib/donation-setting.ts` and its test.

---

---

## Auth surface not ported

Not questions — the contract answers all of these — but endpoints the auth service publishes and
this client has no caller for. Recorded here so the next person to want one does not re-derive its
shape, and so that "unported" is never mistaken for "unspecified". Ordered by how much a reader
misses them.

| Endpoint(s) | What it is, and the trap in it |
|---|---|
| `GET v1/appeal/` · `POST v1/appeal/` | The screen a `401 suspended` is supposed to open. `toSignInErrorKey` now names the state (`auth_account_suspended`) but can only point at support. ⚠ `GET` answers **404 when nothing is pending**, which is the *normal* state, not an error. |
| `GET v1/sessions/` · `POST v1/sessions/:id/logout/` · `POST v1/sessions/logout-others/` | Signed-in devices, and signing one (or all others) out. Paginated. ⚠ The per-session logout takes `{ passcode }` when the account has one, `422 2fa_passcode_required` without it — the same per-action pattern as a withdrawal. Note this app sends `device_name: 'web'` and stuffs the UA into `os`, so *other* clients already list this browser as "web": worth fixing whenever the screen is built. |
| `POST v1/verify-email-request/` · `POST v1/verify-email/` | Verifying the account's primary address. ⚠ `verify-email/` **answers a new token pair**, unlike every other OTP step — the address is in the claims, so a client that ignores the body keeps a stale token. |
| `GET v1/me/display-name-validation-rule/` | Built, and the only one on this list with a caller: `useDisplayNameRules` applies the published regexes locally so an obviously-invalid name is rejected without a round trip. Listed because it can only ever *reject* — `validate-display-name/` is still the gate. |
| `GET v1/identification/status/` | `{ level, verified_at }` in one call. ⚠ **Not a replacement for `submissions/`**: it cannot express *pending*, which is one of the three states the KYC screen renders. Useful as a cheap "is this account verified" for a surface that does not need the middle state. |
| `GET v1/identification/levels/` · `POST …/request/` · `POST …/submissions/` · `POST …/generate-upload-url/` | The **self-submit** KYC path, an alternative to SumSub: `request/` for a `sid`, upload via `generate-upload-url/` (PUT to `upload_url`, then put **`serve_url`** in `proof` — not the upload URL), then `submissions/`. Nothing here is built; the app is SumSub-only. |
| `POST v1/me/deactivate/` | Self-service account deactivation. Takes `{ reason, passcode }`, passcode required when 2FA is on. |
| `POST v1/oauth2/pkce/authorize/` · `POST v1/oauth2/pkce/token/` | Opening a session on another device from an already-signed-in one, without a token crossing a URL. ⚠ Anonymous accounts are refused (`403 permission_denied`). Overlaps with QR sign-in in purpose and is a different mechanism — do not fold them. |
| `GET v1/users/:user_id/` | Public profile by the **numeric alias**, not the UUID. |
| `GET v1/jwks/` · `GET /auth/ping/` | Infrastructure. `jwks/` publishes only the *active* key, so it cannot verify every token in circulation — not a client concern either way. |
| `POST v1/turnstile/` | Explicit token verification. This client sends `X-Turnstile-*` headers on the four endpoints that read them (B2) and never calls this. |
| `POST v1/zendesk/token-request/` · `POST v1/zendesk-token/` | Zendesk SSO, two steps. |

---

## B105 — the **post payload**: nine viewer-relative fields, and a price that can be `0` · **`features/post` parses six fields nothing documents**

`core/v1/posts/…` is the widest payload in the product and no schema covers it. `api/types.ts`
transcribes legacy's spellings; these are the ones the card's behaviour actually turns on.

1. **Can a gated post carry `price: 0`?** `postUnlockPrice` refuses it — a confirmation reading
   "unlock for 0" is a charge nobody agreed to — so such a post shows a bare *Unlock* pill and its
   press falls through to whatever `postIntent` found. If `0` is real and means *free*, the post
   should not be gated at all and the answer is a backend fix, not a client one. If it is a
   placeholder for "not set", confirm and we keep refusing.
2. **Is `viewer` a closed set?** The client tests exactly one value — `'STARGAZERS'` — because that
   is the only one legacy tests. `isLocked` therefore reads *"gated **and** the backend says
   STARGAZERS **and** `need_unlock_package`"*, and any other value means **unlocked**. A new value
   meaning *still locked* opens every paywalled post to everybody. What else can it be?
3. **`need_unlock_package` describes the post, not the reader** — it stays `true` after a purchase.
   Confirmed by the payload that produced the `POST_PURCHASED` fixture. Please confirm it is
   intentional and not a bug being relied on, because the client now depends on it.
4. **`_insights` is author-only.** Modelled as `{ post_total_revenue }` and nullable; the card hides
   the strip at `0`. Is the figure in **USD** or in the account's own earnings currency? It is
   currently multiplied by the reader's exchange rate, which assumes USD.
5. **`channel.promote`** — `{ referral_url, app_name, app_icon_url }`. Only `referral_url` is treated
   as required. Are the other two guaranteed when `promote` is present?
6. **`channel.has_mini_app` / `mini_app_url` / `mini_app_id`** — the client requires all three
   together (legacy's own gate). Can the flag ever be `true` with either of the others absent, and
   if so what should the banner do?

Encoded in: `features/post/api/types.ts`, `lib/post-access.ts`, `lib/post-intent.ts`.

---

## B106 — the bookmark `success` flag: can a 2xx mean "did not land"? · **the client treats a 2xx without it as a failure**

`POST v1/posts/bookmark/` answers `201`, `DELETE v1/posts/{id}/bookmark/` answers `200`, and legacy
flips its local state only when the body *also* carries `success: true`. Ported as-is, which is why
bookmarking is confirm-then-flip where reacting is optimistic.

Two questions, and the second is the one that costs something:

- **Can `success` be `false` on a 2xx at all?** If not, the flag is decoration and the control can
  flip optimistically like the reaction does.
- **Is the flag guaranteed present?** The client treats an **absent** flag as a yes, deliberately —
  the strict reading (`success === true`) would turn every bookmark into a silent failure the day the
  backend stopped sending it, and nobody would notice until users did.

Also: the two halves disagree about where the id goes — **body** on the add (`{ post_id }`), **path**
on the delete. Confirmed as intentional (the add endpoint is the same one that *lists* bookmarks, so
the path is spoken for), but worth stating so nobody "tidies" them into one shape.

Encoded in: `features/post/api/post-api.ts`, `hooks/use-post-bookmark.ts`.

---

## B107 — the **paid-interaction charge**: what `quantity` means, whether the ids are stable, and who reverses a half-finished charge · **money moves on three guesses**

A space can charge Star to react or to comment. The client now takes that Star — before this it drew
the price and charged nothing, so readers interacted free on spaces that sell interaction.

The charge is `POST billy/v1/ecom/purchase/` with legacy's body verbatim:

```json
{ "product_id": "…", "price_id": "…", "quantity": 5, "metadata": { "beneficial_channel_id": "…" } }
```

1. **`quantity` carries the price, not a count.** Legacy passes `paidInteractionStarCost` into that
   slot (`handlePurchase(channelId, type, cost)`). Transcribed rather than corrected, because a
   reading of "quantity means how many" would send `1` and charge the wrong amount. Which is it?
2. **Are the catalogue ids environment-independent?** `REACT_POST` and `COMMENT_POST` are hard-coded
   UUID pairs from legacy's `constants/productType.js`; there is no endpoint that lists them. If
   staging and production mint different ids this breaks as a `422`, not as a type error.
3. **Is there a reversal when the second request fails?** The client charges **first** and reacts
   second, bailing out if the charge fails — legacy's ordering, and the only one that cannot react
   for free. But a charge that succeeds followed by a reaction that fails leaves Star spent on
   nothing, and no client can refund it. Does the backend reverse it, or should the two be one call?
4. **Does `422 EC0001` mean "not enough Star" here too?** The client branches on it (the same code
   `features/mini-app` uses on this endpoint) to offer a top-up rather than a failure toast. Confirm
   the code is stable for this product, since the alternative is a reader told "it failed" when the
   fix was one tap away.

Encoded in: `features/post/api/post-api.ts` (`INTERACTION_PRODUCTS`, `chargeInteraction`),
`hooks/use-post-reaction.ts`, `hooks/use-post-unlock.ts`.

---

## B108 — the **post report** body: is `description` optional, and are the reason ids prefixed? · **two report calls in one product disagree**

`POST core/v1/report/report/posts/{id}/`.

- **`description`**: legacy **omits the key** when the note is empty on the *post* endpoint and
  **always sends it** on the *channel* one. The client sends it unconditionally on both, on the
  grounds that an empty string is a valid "no note" and one product should not have two shapes for
  one field. Confirm the post endpoint accepts `""`.
- **The reason ids**: `GET …/post/contents/` is assumed to return `POST_`-prefixed types, mirroring
  the channel list's `CHANNEL_`. The prefix is stripped to build the copy key
  (`post_report_reason_*`), with the backend's own `text` behind it — so a wrong guess costs English
  labels, not a broken list. What are the real ids?
- The list is cached **device-wide** (`shared: true`, 24h): it is assumed not to vary by bearer.
  Correct?

Encoded in: `features/post/api/post-report-api.ts`.

---

## B109 — **replies**: mostly **answered by a live payload**, and five questions left · **one of which had the reply list printing "0 replies" on every post**

`core/v1/posts/{id}/replies/` and `core/v1/posts/replies/{id}/…`. The web client now reads, writes,
reacts to and deletes replies from the post-detail page. Like **B104**, most of this one is already
settled — not by a schema but by **reading a real response** off `wapi.tevi.dev` (a signed GET, one
post with five replies and one nested thread). Those are recorded here as findings; the questions
follow.

### Answered by the payload, and acted on

**A reply is not a post, and this client believed it was.** The two DTOs share ten fields and then
diverge: a reply's author is **`owner_channel`** (plus `owner`, the *user*), the space it sits in is
**`post_channel`**, and it carries **`post_id`** / **`parent_id`**, **`from_post_owner`** and
**`from_subscriber`**. It has **no** `channel`, `is_owner`, `shareable_url`, `product_id`,
`required_packages`, `viewer`, `need_unlock_package`, `detected_nsfw`, `marked_nsfw`,
`reply_allowed`, `can_reply`, `playback`, `cover_image` or `quoted_post`. Parsed as posts — which is
what the detail page did — every row rendered with **no author, no avatar and no name**, plus a
share button, a bookmark button and a *Block* row that could never work. The measured shape is
`features/post/api/reply-types.ts`.

**The replies envelope carries no `count`.** It is `{ next, previous, results }` — cursor
pagination. The client read `count ?? 0` and printed **"0 replies"** over every populated list; the
heading now uses the parent post's own `reply_count`.

**Reacting to a reply is a different endpoint.** `v1/posts/replies/{id}/reaction/` and
`…/reaction-delete/`, not the post pair — a reply's id sent to `v1/posts/{id}/reaction/` is a 404,
which is what the reply rows were doing.

**A reply is priced by `post_channel`, not by its author's space.** Both carry
`paid_interaction_enabled` / `paid_interaction_cost`, and they are different channels whenever the
reply is not by the post's owner. Crediting the wrong one pays whoever wrote the comment.

**`lang` comes back on every row**, echoing what the write sent.

**`reply_allowed_user` is always present, and there is no "everyone".** 20 consecutive posts carried
it — 18 `FOLLOWERS`, 2 `PAID_USERS` — and the iOS enum has the same six cases with no open value,
defaulting an unparseable one to `.followers`. So followers-only is the product's default, not an
opt-in restriction. `reply_allowed_link` is a real boolean on the wire (`true` on every row), which
settles the field this client had typed as text.

### Still open

`POST core/v1/posts/{id}/replies/`. Three parts of the body are still transcribed from legacy rather
than known.

- **`lang`.** Legacy hard-codes **`'en'`** on every comment, from all nine of its locales, and this
  client does the same. What does the field do — is it the language of the text (in which case
  legacy has been mislabelling every non-English reply ever written, and the client should send the
  reader's locale), or something else entirely? If it is the former, what is the accepted set — BCP
  47 tags (`zh-TW`), or the eight-ish codes the UI switcher uses? Sending the wrong one is a 400 on
  every reply from a non-English reader, which is why nothing has been changed on a guess.
- **`html_text`.** Legacy shortens every URL in the text and splices `<a>` tags back in, sending
  `html_text` **instead of** `text`. This client sends plain `text` only: it never renders
  `html_text` (creator-authored markup, no sanitiser — `post-card.tsx` states the refusal), so a
  reply sent that way is one it cannot display. Is `html_text` required for anything server-side —
  link previews, moderation, the mobile apps' rendering — or is `text` alone a complete reply?
- **The image ceiling.** Ten, taken from legacy's own error string (`'Maximum 10 images allowed per
  comment'`) rather than from any documented limit. The client refuses an eleventh before it
  uploads. What does the endpoint actually enforce, and does it enforce a **size** or a count?

Four smaller ones while the endpoints are open:

- **What does `DELETE v1/posts/replies/{id}/` leave behind?** A post's delete keeps the row and
  flips `deleted`, and a reply carries the same flag — but this was not measured. The client
  invalidates and re-reads rather than splicing the row out, which is correct either way;
  `ReplyRow` draws a tombstone if one comes back.
- **Does `can_reply` move as soon as the reader qualifies?** The iOS client evidently does not think
  so: its `isGrantedReplyPermission` computes the two satisfiable audiences from **client** state
  (`channel.isFollowed`, `isSubscribed`) and consults `can_reply` only for the four that cannot be
  satisfied. The web client now matches it on the **followers** half — `channel.is_followed` is on
  the post payload, so a reader who has just followed gets the box rather than a panel telling them
  to follow — and stays on `can_reply` for the **members** half, because `my-subscriptions/` lives in
  `features/membership` and the dependency runs membership → channel → post, so reading it from the
  post feature would close a barrel cycle. iOS fires a second request
  (`fetchMySubscriptions(channelId:)`) for exactly that value. Two things would let both clients stop
  second-guessing: say whether `can_reply` is immediate, and if it is not, whether the post payload
  could carry the members half the way it already carries `is_followed`.
- **Is `reply_allowed_user` closed at six values?** The client now reads all six of legacy's
  (`FOLLOWERS`, `PAID_USERS`, `FOLLOWINGS`, `VERIFIED_SPACES`, `MENTIONED_SPACES`, `NONE`) and puts a
  sentence on screen for each. A seventh would fall through to "no restriction named", so the reader
  is told nothing rather than something invented — but they are also not told the truth. Is the set
  fixed, and is there a `code` or an id to switch on rather than these strings?
- **What does `can_reply: false` with no `reply_allowed_user` mean?** It is reachable — a block, a
  rate limit, something else — and the client deliberately draws no panel for it, since an empty one
  says less than none. If there is a reason worth showing, what carries it?
- **Who may delete a reply?** The client offers it to the reply's author **and** to the owner of
  the post, both derived from ids since the payload states neither. Legacy renders the row for the
  same two. Does the endpoint enforce that, or something wider?
- The reply's images are uploaded through `v3/upload/generate-gcs-upload-url/` with a
  **client-chosen key**, not through legacy's `v1/posts/image/upload-url/` (which names the object
  itself). That is **B104**'s question, and the answer decides this too.
- `reply_allowed_link` is read as a **boolean**. Legacy writes it as `reply_allowed_link || false`,
  so that is the assumption; the client treats an **absent** field as "links allowed" rather than
  refusing, since refusing wrongly stops every reply on every post. Is it a boolean, and is it
  always present on the post payload?

Not a question, but the thing this unblocks: **reporting a reply**
(`v1/report/report/reply/contents/` + `v1/report/report/replies/{id}/`) is the one control the reply
row deliberately does not draw yet — the reason-collecting dialog is built around the *post* pair,
and the row it replaced was submitting a reply's id to the post endpoint.

Encoded in: `features/post/api/reply-types.ts`, `features/post/api/post-api.ts` (`createReply`,
`getReplies`, `getChildReplies`, the three reply writes), `features/post/lib/reply-access.ts`,
`features/post/lib/reply-draft.ts`, `features/post/hooks/use-create-reply.ts`,
`features/post/hooks/use-reply-reaction.ts`.

---

## B110 — **creating a post**: the two shipped clients build the same request six ways apart · **the web client had to pick one of each**

`POST core/v3/channel/my-channel/threads/`. Legacy web's `useCreatePost` and iOS's `PostLocal.swift`
fill the same form and disagree on six fields. This client reads both and picks per field
(`features/post/lib/post-draft.ts` carries the table); four of the six are safe either way, two are
not. Please settle these.

**1. `video`.** Legacy web sends `{ id, thumbnail: <the thumbnail **upload** URL> }` — a signed,
expiring link to a bucket write, stored on the post. iOS sends `{ id }`. This client follows iOS: a
poster the backend already received needs no URL handed back, and an expiring write URL is a field
that is wrong the moment anything reads it. Is `thumbnail` used at all, and if so, what does it
expect — a serve URL, or nothing?

**2. `paid_interaction`.** Legacy web sends `{ is_enabled, star_cost }` on every create. iOS has the
line **commented out**, so its posts presumably inherit the channel's setting. Both cannot be right:
either the field is per-post and iOS is silently publishing with the channel default, or it is
ignored on create and legacy web has been sending it for nothing. Which?

**3. An empty paywall.** A post with `viewer: 'stargazers'`, no `required_packages` and no `price`
reaches nobody — not the public, and no member, because it names no tier. iOS rewrites the audience
to `everyone` before sending; legacy web sends it as-is. This client follows iOS. Does the backend
reject that shape, or store it?

**4. `hidden_links`.** iOS sends it on every create; legacy web has no such field and no UI for it.
What is it, and does anything break by omitting it?

**5. `html_text` vs `text`.** Legacy web sends **only** `html_text` for every post, converting
newlines to `<br/>` even when there is no link. This client sends `text` — it renders no
creator-authored markup (see B109's note on replies), and iOS's own parser falls back to `text` when
`html_text` is absent, so plain text displays everywhere. Confirm nothing server-side (link
previews, search indexing, moderation) depends on `html_text` being present.

**6. `lang`.** Answered by iOS as far as the *shape* goes — it sends the current locale's two-letter
code, so the field takes one from a shipped client daily. This client now does the same and B109's
question narrows to what the field actually drives, and what happens to `zh-CN` vs `zh-TW`, which
both narrow to `zh`.

One more, from the upload side: **`v1/posts/video/upload-url/`** answers
`{ id, upload_url, thumbnail_upload_url }` and takes `codec` as a **required, nullable** parameter.
A browser can measure a clip's duration and dimensions without naming its codec, so this client
sends `null` there, as legacy does. Is `null` genuinely accepted, or does it degrade the transcode?

Encoded in: `features/post/lib/post-draft.ts` (`buildPostBody`, `postLang`),
`features/post/api/post-api.ts` (`createPost`), `shared/lib/api/upload-api.ts` (`uploadPostVideo`).

---

## B111 — **the conversation list** (`messenger/v2/rpc/…`): no schema, read field by field from legacy · **six guesses behind one screen**

`/messages` reads `get_recent_conversations` and `search_conversation`, and writes `mark_seen_all`
and `flush_conversation`. None of them is in a schema; every field name is the one legacy's
`containers/directMessage` reads, and `features/message/api/types.ts` parses each defensively. What
the client assumes, and what changes if it is wrong:

**1. Paging.** The client replays the **query string** of `next_url` against
`get_recent_conversations` and ignores its path — legacy's `new URL(origin + next_url).search`. A
`next_url` with no query is treated as the last page. Is `next_url` always a relative path whose
query is the complete next request (cursor, `limit`, `filter`)? If the cursor lives in the path, the
list stops after page one.

**2. `count`.** Read as the folder's total, and used for the Unread tab's badge via a separate
`limit=1&filter=UNREAD` request. Is `count` present on `filter=UNREAD`, and is it the number of
*conversations* with something unread (not of messages)? If it is absent the badge falls back to 0
or 1.

**3. Timestamps.** `latest_message.created_at` goes into `new Date()` in legacy, while
`recipient.last_online_at` is divided by 1000 — i.e. milliseconds. The client accepts ISO, epoch
seconds or epoch ms for both. Which is each, really?

**4. `recipient.active`.** Missing is treated as **inactive** (legacy's `active || false`): the row
shows "Tevi user", no avatar and no link. Is the field always sent? If not, every conversation
would render anonymised.

**5. `flush_conversation`.** Legacy sends `both_members=false` as a **query parameter** with an empty
body (its `post(uri, params, data)` puts the object in `params`), and the client does the same. Is
the query the intended place, and does the conversation come back into this account's list when the
other side writes again?

**6. The socket frames.** `new_message`, `update_message`, `deleted_message`, `seen_message` and
`update_conversation` are used as signals only — the list refetches. `change_chat_action` is read:
`{ conversation_id, action: 'NONE' | 'TYPING' | 'UPLOADING_PHOTO' }`. Does a typing sender repeat
`TYPING` while typing (the client expires an indicator after 6s without one), and is a frame
delivered for the reader's own typing in another tab?

Encoded in: `features/message/api/types.ts`, `features/message/api/message-api.ts`,
`features/message/lib/conversation-page.ts` (`cursorFromNextUrl`),
`features/message/hooks/use-chat-actions.ts`.

---

## B112 — **the conversation** (`messenger/v2/rpc/…` messages): the chat room is built on legacy's reads of six endpoints · **no schema for any of them**

`/@{slug}/messages` opens the conversation with `start_conversation_with`, pages `get_messages`,
and writes through `send_message`, `edit_message`, `delete_message`, `send_chat_action` and
`set_message_callback_data`. Field names are legacy's (`useChatRoom.js`, `itemMessage/*`), parsed
defensively in `features/message/api/types.ts`. What the client assumes:

**1. `start_conversation_with` refuses with the same codes as `can_start_conversation_with`.** Legacy
calls `can_start` first and then `start`, and reads `422 { code: 'C001' | 'C002' }` from both. This
client calls `start` alone and reads the gate from its 422. Is `start`'s refusal guaranteed to carry
the code? If not, the follow and member walls never show — the room errors instead.

**2. `start_conversation_with` is safe to call on every visit.** It is the screen's read, so it runs
on each open (and again after a follow). Does it only ever return the existing conversation for the
same member, never create a second?

**3. `get_messages` pages backwards.** Page one is the latest `limit`, and `next_url`'s query leads
into the past. Within a page the order is not relied on — the client sorts by `created_at`. Confirm
the direction; if `next_url` leads forward, older history never loads.

**4. `send_message` and `edit_message` answer with the full message** (id, `created_at`, `sender`,
`reply_message` for a reply). Legacy follows every send with `get_message/{id}`; this client uses the
send's own response. If it is partial, a sent bubble lacks its time or its quote until the next read.

**5. `delete_message`'s `both` is a query parameter** with an empty body, as legacy sends it. Is a
"for everyone" delete delivered to the other side as `deleted_message` with `message_id`?

**6. The frames name ids.** `new_message` / `update_message` carry `{ conversation_id, id }` and the
client re-reads `get_message/{id}`; `seen_message` carries `{ conversation_id }` and the client
re-reads the newest page for the ticks. Legacy writes the frames' own payloads instead. Is
`get_message/{id}` readable by both members immediately after the frame?

**7. A photo message is `send_message` then `upload_images/{id}/{n}/`.** `send_message` with
`msg_type: 'IMAGE'` and `number_of_media: N` creates the message; each photo is then a multipart
`POST` with field **`image`**, `n` the 0-based index doubling as the dedup number. All three clients
agree on that; they disagree on the trailing slash (the apps send it, legacy does not) — this client
sends it. What does the other side see between the two steps: an `IMAGE` message with no photos,
or nothing until the last upload? And does `n` really dedupe, i.e. is a retried upload a replace?

**8. Mute is `update_conversation_config/{id}` with `{ muted }`.** Android's body, the one a shipped
client sends. Legacy's (never rendered) menu wraps it — `{ config: { muted } }`. If the service
reads the wrapper, the toggle answers 200 and changes nothing.

**9. `stats.last_read_message_id`** is where iOS anchors "Unread messages"; without it the divider
falls back to `stats.unread_messages`. **`attachments[]`** (iOS) carries the Premium gift as
`{ type: 'TEVI_PREMIUM_GIFT', preview_data: { product_name } }`, while Android and legacy read the
same gift out of a `tevi://TEVI_PREMIUM_GIFT?product_name=…` text — both are read. **`recipient.is_bot`**
hides the attach button, as on iOS.

Encoded in: `features/message/api/message-api.ts` (`openConversation`, `getMessages`,
`sendMessage`, `uploadPhoto`, `setMuted`, `deleteMessage`), `features/message/hooks/use-thread.ts`,
`features/message/hooks/use-composer.ts`, `features/message/lib/message-thread.ts`,
`features/message/lib/message-link.ts`.

---

## B113 — **sharing into a DM** (`send_message` from the share sheet): the three shipped clients send three different messages · **the web client had to pick one**

"Send in message" fans out one `POST messenger/v2/rpc/send_message` per picked conversation on every
client — body `{ conversation_id, input_text, msg_type: "TEXT" }` — and agrees on nothing else:

| | Legacy web | iOS | Android | **This client** |
|---|---|---|---|---|
| Link sent | minted, `share_channel=internal` | **raw** `shareable_url`, nothing minted | minted, `internal` (`source_screen=copy_link`) | minted, `internal`; raw URL if the mint fails |
| Body | `text + "\n" + link` | `link + "\n\n" + text` | `text + " " + link` | `text + "\n" + link` |
| `parser` | (none) | (none) | `HTML` — each URL first wrapped via `external-shorten/` | `PLAIN` |
| Typed-text limit | none | 1,000 | 64 | `directMessage.limitCharacters` (remote config) |
| Recipients offered | `get_recent_conversations` + `search_conversation`; search drops inactive | same two endpoints; nothing dropped | the local cache (≤100), searched in memory | the two endpoints; inactive **and blocked** dropped |
| Partial failure | closes, toasts who failed; all-failed keeps them selected | closes before the requests finish, first error only | first HTTP error aborts the batch, no dismiss | legacy web's |

Questions:

1. **Should a DM share mint a link at all?** If `share_link_created_v2` on `internal` is what
   "shares by channel" counts, iOS's DM shares are missing from it today. If a raw URL is preferred
   (it is what the message card unfurls from), every client should stop minting.
2. **Is there one canonical body?** The bubble turns a link into a card wherever it sits, so the order
   only changes what a reader sees first; but Android's `HTML` parser renders a different message from
   the same share. Which `parser` should a share use?
3. **What is the server's limit on `input_text`?** The client counts only the typed part against the
   chat's limit; a link pushed over it would come back as a 4xx, whose message is shown.

Encoded in: `features/message/hooks/use-share-in-message.ts` (`shareMessageText`, the fan-out),
`features/share/lib/share-channels.ts` (`DIRECT_MESSAGE_WIRE`), `features/share/hooks/use-share-link.ts`
(`messageLink`).

---

## Closed

Answered and acted on. Kept as one line so the `Bnn` references in the code still resolve; the
reasoning is at the call site named.

| # | Question | Answer | Encoded in |
|---|---|---|---|
| B1 | Does `/me` echo `anonymous`? | **Yes** — `GET v1/me/` restates `anonymous: true`. The fold stays anyway: its other caller is the `POST v1/me/` write, whose body is not covered by that answer | `features/auth/lib/account-fold.ts` (`mergeAccountUser`) |
| B2 | Which endpoints read the Turnstile headers? | Exactly the four the client already scopes them to — `v1/token/`, `v1/connect/<provider>/`, `v1/user-login/login/`, `v1/user-login/verify-otp/`. Legacy's model-wide default was wrong, and spending a single-use token elsewhere is what makes challenges loop | `CHALLENGEABLE` in `features/auth/api/auth-api.ts` |
| B3 | What is `id_token` on `connect/<provider>/`? | It **is** used — send exactly what legacy sends. So Google's `id_token` carrying this app's OAuth **client id** is the contract, not legacy's mistake; do not "correct" it to a real ID token | `features/auth/components/google-sign-in-button.tsx` |
| B4 | What does `logout` revoke? | The bearer it is presented, and nothing else — so an expired token revokes nothing, and removing an account must refresh its token first | `authApi.logout(accountId)`, `forgetAccount` |
| B5 | Is `device_id` required on `/me`? | No — only the token-minting endpoints need it, so bootstrap publishes a cached id and lets FingerprintJS settle behind the first `/me` | `primeDeviceInfo` |
| B6 | Is an HMAC v2 planned? | **No.** `?verify=` stays `pathname + unixSeconds`, so the string is stable — and it stays a bot speed bump, never described as an integrity control | `shared/lib/api/interceptors/sign.ts` |
| B7 | The credential endpoints' payload: `username`, `sid`, `purpose` | `username` is the tagged `{ kind, value }` pair, and **`kind` is `email` \| `phone_number`** — this client declared `phone` and never noticed, because every call site sends `email`; the value is **server-normalised** (Gmail dots stripped, `googlemail`→`gmail`), so one inbox is one account and no screen may promise otherwise. **`sid` is required** on every step after the send; `purpose` is a closed **`reset` \| `verify`** (`setup` is not real, and `setup-credentials/` carries no `purpose`), and `verify` **requires a bearer** — `422 auth_required` without one. ⚠ the new password is **`new_password`** on `reset-password/` and **`password`** on `setup-credentials/` — sending `password` to both, as this client did, 400s every reset after the code is spent. Two more, both corrected in the client: `verify-otp/` answers **`{}` and does not spend the code** (it was typed `TokenResponse`, on the theory that verifying is a way in — it is not), and `GET user-login/` answers **`200 { email: "", phone_number: "" }`** for an account with no credentials, not a 404, so presence is truthiness. `send-otp/` is rate-limited **3 per 30s** → `429 rate_limit_exceeded` | `features/auth/api/auth-api.ts` + its test (`OtpPurpose`, the two disagreeing signatures), `use-user-login.ts` |
| B9 | Can you register with an email and password on web? | **No** — there is no register endpoint and none is planned. `/signup` is social-only and finished as it stands; an account is created implicitly on a first social sign-in | `app/(web)/signup/`, `features/auth/components/auth-method-buttons.tsx` |
| B10 | Does the channel endpoint answer 200 unauthenticated? | Moot — SSR reads the in-cluster service directly, no bearer involved. Leaves an infra question (cluster DNS), not a contract one | `api/server-client.ts` (`unwrapEnvelope`), `shared/config/server-env.ts` |
| B11 | Is `channel.owner_id` the same identifier space as `/me`'s `id`? | **Yes** — so ownership is decided synchronously off the public payload, no request and no frame of wrong buttons. ⚠ `/me` sends `id` as a **number**, the channel DTO normalises `owner_id` to a string, so the compare is `String(userId) === owner_id` | `features/channel/hooks/use-channel-ownership.ts` |
| B19 | Does `/me` carry the user's own channel slug? | **No.** Ownership keeps its second rule — compare `slug` against `MyChannelProvider` — and `/my-space` still costs the `my-channel/` read | `use-channel-ownership.ts`, `MyChannelProvider` |
| B21 | Does `/me` expose Premium? | **No**, and it carries no `avatar_video` either. So an account's animated avatar reads `useMyChannel().isPremium`; a surface holding only a stored `/me` body (the account switcher) can never animate | `shared/lib/avatar-source.ts`, `features/navigation` |
| B67 | Is the saved-card cap enforced server-side? | No — the client sets it; the backend enforces nothing. Reopens if one ever appears, with an error code | `features/payment/api/payment-methods-api.ts` (`MAX_SAVED_CARDS`) |
| B68 | Are Premium codes and gift codes the same namespace? | No — offer the code to both services; a **2xx** from either is the redemption, whatever the body | `features/gift-code/lib/redeem-sequence.ts` |
| B71 | Is there a membership fee endpoint, and is 5.9% + $0.30 still the rate? | No endpoint; mirror the legacy web app. Confirmed to the cent by a live `subscribe/` payload (see B85) — and the webview now reads `payment.amount` rather than relying on it | `features/membership/lib/membership-fee.ts` + its test |
| B73 | Is `description` optional on `POST balance/transfer-star/`? | Required, and may be empty. `errors[].index` is positional against the request array | `TransferRequest`, `use-single-transfer.test.tsx` |
| B74a | What does `channel.lives[]` carry? | The whole event DTO with its channel nested — incl. `started_at`, `price`/`required_packages`/`purchased`, `shareable_url`, `public_url` | `features/channel/api/types.ts`, `lib/live-access.ts` |
