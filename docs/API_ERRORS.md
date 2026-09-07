# API error messages — what a failed write is allowed to say

**The rule.** A **write** (`POST` / `PUT` / `PATCH` / `DELETE`) refused with a **4xx** shows
**the message the API sent**. Our own translated key is the **fallback**, used only when the body
carries no usable message. Not the other way round.

That is a reversal of where this repo started, and the reversal is deliberate: the backend is the
only party that knows *why* a specific write was refused — "This wallet address is already
registered", "Bank is not supported", "You can't change username of verified space" — and no key of
ours can express any of it. A generic `t('payout_method_add_failed')` in front of that message is
information destroyed, not information protected.

Four statuses are **skipped** even so — 5xx, 429, 403 and 401 — and the definition of "the API sent
a message" is narrow. Those two things are the whole doc.

---

## 1. Scope

| | Behavior |
|---|---|
| **Writes** (POST/PUT/PATCH/DELETE), **4xx** | API body message first, our key as fallback |
| **Writes**, **5xx** | **Our key only** — [§2a](#2a-why-5xx-is-skipped) |
| **Writes**, **429** | **Our key only** — [§2b](#2b-429-and-403-are-skipped-too) |
| **Writes**, **403** | **Our key only** — [§2b](#2b-429-and-403-are-skipped-too) |
| **Writes**, **401** | Neither — `client.ts` owns it (`handleDeadAccount` → `auth:session-expired`), and a 401 that *is* the endpoint's own rejection has a mapper already (`toChangePasswordErrorKey`) |
| **Reads** (GET), any failure | **Our key only.** A read failure is not something the reader did; there is no refusal to explain, and DoD §1 already requires a translated error state with a retry |
| Network failure / timeout / abort | **Our key only** (`error_network`). There is no body |

So the status filter is: **`status >= 400 && status < 500`, minus 429, 403 and 401.**

In `query-client.ts` the read/write split is available for free: `MutationCache.onError` is the
write path, `QueryCache.onError` is the read path. Gate on that, not on a method string — `ApiError`
does not carry the method, and every write in this app goes through `useMutation`.

## 2. What counts as a "message from the API"

**The body, never `error.message`.** This is the trap the whole doc exists to keep closed.
`normalizeApiError` builds `ApiError.message` as
`body.message || body.error || axiosErr.message || 'Request failed'` — so on a response with no
message the value is **axios's own English**: *"Request failed with status code 400"*, *"Network
Error"*. That string is not a message from the API; it is a library's internal wording, in nine
locales, on a screen that moves money. Reading the body instead is what makes "no message ⇒ use
ours" actually fire.

A body message is used when **all** of these hold:

- `error instanceof ApiError`, the status passes [§1](#1-scope), and `error.data` is an object;
- one of these is a string, **in this order** — and the order is not cosmetic, see
  [§5](#5-implementation):

  ```
  body.message  →  body.data.message  →  body.detail  →  body.error
  ```

**Why `data.message` is in that list:** the response interceptor unwraps the `{ data: payload }`
envelope on the **success** path only (`client.ts` — `unwrapApiEnvelope` at the fulfilled handler,
while every rejection goes straight to `normalizeApiError`). So an error body keeps its envelope, and
a message written inside it stays one level down. Nothing is going to flatten it later.

- trimmed, it is non-empty and **≤ 200 characters**. A paragraph, a JSON blob or a stack fragment is
  not a message for a person. 200 is long enough for a real sentence and short enough that a dump
  cannot masquerade as one.

Anything else ⇒ `null` ⇒ the caller's own translated key.

### 2a. Why 5xx is skipped

"You cannot do this, and here is why" is the one class of failure a server phrases **for a person**,
and it is a 4xx. A 5xx is the server saying it broke — nobody wrote that text for a user, and it is
where internal codes, upstream wording and stack fragments live (*"upstream connect error"*,
*"NullPointerException at line 42"*). A length cap can hide a long dump but not a short one, and
there is nothing actionable on the other side of it either way: the reader cannot fix a 500, so a
translated "something went wrong, try again" is strictly better than the backend's own words in
English.

This also keeps the shared helper identical to the predicates already in the tree, every one of
which is 4xx-only with a test pinning a 5xx body to `null`. Nothing has to be re-argued per feature.

### 2b. 429 and 403 are skipped too

Both are 4xx, and both are the exception rather than the rule.

- **429** — the sentence usually is not Tevi's. A throttle is answered by whatever sits in front of
  the app, so the body is as likely to be the proxy's wording as the API's. The client already reads
  the part that *is* a contract: `parseRetryAfter` on the `Retry-After` header
  (`shared/lib/api/client.ts`), which is a number we can put in a translated sentence.
  `features/auth`'s `transportErrorKey` already classifies 429 **before** any status mapping, and
  this is the same call made in one more place. **Exclude it in code, not by convention** — it is a
  4xx, so it passes the range check, and nothing else would catch it.
- **403** — this is a *capability* refusal, and `features/permission` already owns the vocabulary for
  it (`permission_not_allowed`, gates that fail closed). A 403 body is written for whoever
  administers the grant, not for the reader, and it can name the internal grant the backoffice has
  switched off. The person cannot act on it either way: nothing they type changes a permission.

401 is in the table for completeness — it never reaches a feature's `onError` as a dead session,
because the client retires the account first.

## 3. Precedence, in full

For a failed write, in order. The first one that produces something wins:

0. **Does the body name fields?** Then the sentences belong **under the inputs they are about**, and
   there is **no toast** — see [§4](#4-field-shaped-rejections-outrank-the-toast).
1. **A known `code`** → our translated key for it.
2. **The body sentence** ([§2](#2-what-counts-as-a-message-from-the-api)).
3. **Our generic key** for that operation.

**Step 1 outranks step 2 on purpose.** Where the backend documents a stable `code`, map it and
translate it — the code is the part that is a contract; the sentence is free to be reworded in a
patch, and is English in all nine locales. `SEND_CODE_ERROR_KEYS` in
`features/auth/lib/auth-error.ts` is the pattern: `{ code: 'email_already_in_use' }` →
`password_error_email_in_use`.

Only one such mapping exists today, which is why **B90** in
[`BACKEND_QUESTIONS.md`](BACKEND_QUESTIONS.md) asks which write endpoints guarantee a stable `code`.
Every answered one converts an English sentence into nine translated locales. So the API sentence is
what the app falls back *to*, not what it reaches for first — and adding a code mapping is always an
improvement against this rule, never a regression.

## 4. Field-shaped rejections outrank the toast

The most actionable thing a rejected write returns is not a sentence about the request, it is a
sentence about **one field**. `use-save-profile.ts` already has the shape right, and it is step 0
above:

```
body has `errors: [{ input, error }]`  →  setFieldErrors(…), return.  No toast.
body has only `{ message, code }`      →  one toast, per §3.
```

A toast on top of an inline field error is the same news twice, and the less useful copy of it —
it cannot point at anything. `parseChannelFieldErrors` (`features/channel/api/types.ts`) is the
reference parser: it keeps only fields the form actually has, takes the first rejection per field,
and applies the same 200-character sanity cap.

**`errors[]` has two shapes, and a shared parser must not standardise on one.** They are both in
`features/channel`:

| Row | Names the field by | Where |
|---|---|---|
| `{ input, error }` | `input` — matched against the form's own fields | `parseChannelFieldErrors` |
| `{ code, error }` | `code` — `'sensitive'` means the *avatar* was rejected by moderation | `use-create-channel.ts`'s `onError` |

The second one is why create-channel does not simply toast: a generic banner beside an untouched
avatar leaves the reader with nothing to change. And note `features/star-transfer`'s
`api/types.ts` (~line 282), where the same array is read for a *different* question and the comment
records that treating an array as "no errors" once **failed open on a money screen**. Any attempt to
unify `errors[]` parsing has to read that comment first.

**This is the failure mode the migration in [§5](#5-implementation) can introduce.** Once the API
sentence is the default inside `mutationCache.onError`, a form that leaves `meta.showErrorToast` set
gets *both* surfaces. Forms that distinguish field errors therefore opt out of `meta` entirely and
handle `onError` themselves — `use-save-profile.ts` and `use-update-privacy.ts` already say so at
the line where they don't set it. Keep it that way; do not "tidy" a `meta` back onto them.

## 5. Implementation

### The predicate exists **five** times, and the copies disagree

| Where | Reads | Status filter | Cap |
|---|---|---|---|
| `features/auth/lib/auth-error.ts` — `providerSignInErrorText` | `message \|\| error` | 4xx | 200 |
| `features/payout/lib/payout-error.ts` — `payoutErrorText` | `message \|\| error` | 4xx | 160 |
| `features/payout/lib/payout-request-errors.ts` — `backendMessage` | `message \|\| data.message \|\| detail` ← **the only one reading `detail`** | 4xx | 200 |
| `features/channel/api/types.ts` — `parseApiMessage` | `message` only | 4xx | 200 |
| `features/channel/hooks/use-create-channel.ts` — `backendMessage` | `errors[0].error \|\| message` ← **the only one reading `errors[0]` as the whole-request message** | ⚠ **none** | ⚠ **none** |

**The fifth one is the outlier and it is a live defect against this rule**, not a variation: with no
status filter it prints a **5xx** body (§2a), and with no cap it prints whatever length that body is.
It is on the create-a-space form, which is the first write a new account ever makes. Fixing it is
adopting the shared helper, with `errors[0].error` folded in as one more candidate — its own
behaviour on a 4xx with a good message does not change.

They are copies because a feature may not import another feature's internals — not because anyone
wanted four. Now that this is the *default* for every write, the home is
`shared/lib/api/error-message.ts` — `apiErrorText(error): string | null` — and all four become
callers. `shared/` may not import `features/`, and the predicate depends on nothing but `ApiError`,
so it belongs there.

**The shared helper must read the *union* of the four field lists, in the order given in
[§2](#2-what-counts-as-a-message-from-the-api), with one cap of 200.** This is the one part of the
migration that can go wrong silently. `body.detail` is DRF's spelling and billy sends it; a helper
that only reads `message || error` returns `null` for those responses, so the payout-request screen
would fall back to its generic key **forever, with nothing failing** — no exception, no test, just a
toast that stopped being specific. Dropping `data.message` loses the envelope-nested case the same
way. Widening the cap from 160 to 200 is the safe direction (payout-error is the only 160, and 200 is
what the other three already ship).

### `meta.showErrorToast`'s string changes meaning: override → fallback

Today `toastError` does `typeof meta.showErrorToast === 'string' ? meta.showErrorToast : error.message`,
which is why ~34 call sites currently discard the API's message. Making the **mutation** path read
`apiErrorText(error) ?? ourString` gives every one of them the new behavior in one edit, with no
call-site churn:

```ts
// mutationCache.onError only — queries keep their own key (§1)
const fallback = typeof meta.showErrorToast === 'string' ? meta.showErrorToast : t('error_generic')
toast.error(apiErrorText(error) ?? fallback)
```

`showErrorToast: true` on a **mutation** would mean `error.message` — the axios-fallback leak of §2
arriving through the back door — so `mutationMeta` types it as `string`, not `boolean | string`. A
write with no fallback sentence is a compile error rather than a convention someone has to remember;
`queryMeta` keeps the boolean, where `error.message` is not printed at all.

### What the one-file change does **not** reach

Only mutations that go through `meta.showErrorToast` are covered. A mutation with its own `onError`
toast keeps whatever it does today, so these three stay generic until they are edited by hand — and
each is a write where the backend's reason is the whole point:

- `features/star-transfer/hooks/use-multi-transfer.ts` — `onError: () => toast.error(t('star_transfer_error'))`
- `features/membership/hooks/holdings/use-membership-detail.ts` — cancel and renew, one each

They are not oversights to "clean up" into `meta`: a hook that must distinguish *which* failure it was
(`use-save-profile.ts`, `use-setup-payouts.ts`, `use-update-privacy.ts`) cannot use a static meta
string at all. The fix for all of them is the same — call `apiErrorText(error) ?? t('…')` — not a
sixth predicate.

## 6. Tests

`payout-error.test.ts` and `auth-error.test.ts` already pin every case the shared helper needs, and
none of them changes: a body sentence on 4xx passes; a `code`-only body is `null`; a 5xx is `null`
**however well-phrased its body is**; a network error and a non-`ApiError` are `null`. Move them
alongside the helper rather than rewriting them — the assertions are the spec.

Three cases the union in §5 adds, and they are the ones worth writing, because each is a silent
failure rather than a loud one:

- `{ detail: 'Bank is not supported' }` on a 4xx → the sentence, not `null`.
- `{ data: { message: '…' } }` on a 4xx → the sentence.
- a 429 and a 403 with a perfectly good 4xx body → `null` (§2b). Without these two, a range check
  looks correct and is not.

## 7. Related

- `shared/lib/api/errors.ts` — `normalizeApiError`, and the `message` fallback chain §2 exists to
  bypass.
- `shared/lib/api/query-client.ts` — `meta.showErrorToast`, and the mutation/query split of §1.
- [`DEFINITION_OF_DONE.md` §2](DEFINITION_OF_DONE.md#2-forms--mutations) — the checklist line.
- [`BACKEND_QUESTIONS.md`](BACKEND_QUESTIONS.md) **B90** — which write endpoints guarantee a stable
  `code`. Every answer moves an endpoint from §3 step 2 to step 1.
