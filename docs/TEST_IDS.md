# Test ids

We stamp `data-testid` on anything a test would address. **How QC automates it — which tool, which
language, how they seed a session — is theirs to decide.** Our job is that the attribute is there, is
stable, and is findable.

Generated list of everything that exists: [`../testids/CATALOG.md`](../testids/CATALOG.md)
(`pnpm testids` regenerates it; `pnpm lint:testids` fails if it has drifted).

---

## 1. Why an attribute and not a class or the text

**Nine locales.** Eight in the switcher — `en, vi, id, fil, zh-TW, zh-CN, ko, ms` — plus `ar`, which
is also RTL. Anything located by visible text is nine locators, eight of which nobody wrote.

The failure is already in this repo: `e2e/get-star.spec.ts` finds the pay button with
`getByRole('button', { name: /^Pay / })`, which matches nothing the moment the locale cookie says
`vi`. A copy change must stay a translation task.

Classes are Tailwind and move whenever a designer touches a token. `data-slot` is worse than it
looks: three production code paths *select* on it (`segmented-control.tsx`'s keyboard nav,
`app-side.tsx`'s outside-press, `metric-tabs.tsx`), so it is behaviour, not a label.

---

## 2. The grammar

```
data-testid = <scope> "-" <element> [ "-" <part> ]
```

- `<scope>` — a feature directory (`payment`, `auth`, `channel`) or a route segment, declared in
  [`../src/shared/lib/testid-surfaces.ts`](../src/shared/lib/testid-surfaces.ts). It is what tells
  anyone reading the id which screen it is on, which is why it is mandatory.
- `<element>` — one to three kebab tokens naming the thing on screen.
- `<part>` — a sub-slot of a composite, from the closed `TestIdPart` union in
  [`../src/shared/lib/test-id.ts`](../src/shared/lib/test-id.ts).

Lowercase, ASCII, single `-`. One separator means segments can be joined mechanically.

`pnpm lint:testids` enforces all of it, including that `src/shared/ui/**` never *authors* an id — a
primitive thirty screens render cannot belong to one screen, so it receives an id and passes it on.

---

## 3. Four rules

### One id per human action, on the element a human presses

Where a row is the pressable thing, the id belongs to the row and the radio inside it carries none.
Never on a layout wrapper — otherwise clicking it means walking up the DOM.

### Never interpolate a value into an id

```tsx
// yes
<ListRow data-testid="payment-saved-card-row" data-card-id={card.id} />

// no
<ListRow data-testid={`payment-saved-card-row-${card.id}`} />
```

So `[data-testid='payment-saved-card-row']` always returns the whole set, and one row is
`[data-testid='payment-saved-card-row'][data-card-id='…']`. Three reasons, the second decisive:

1. A prefix match is ambiguous — `…-row-1` also matches `…-row-12`.
2. **Our identities contain `-` and some are user-chosen.** `channel.slug` is a username somebody
   picked, Stripe ids are `pm_…`, others are UUIDs. Concatenating one into a selector string breaks
   on a slug containing `'` or `]`; in a quoted attribute value it is just data.
3. It keeps the generated list enumerable, so a rename shows up as a diff.

Companion attribute names are a closed list in `test-id.ts`. `data-index` only where position
genuinely *is* the identity (the six OTP boxes, carousel dots) — never in a list that can reorder.

### State goes in its own attribute, never in the id

`payment-get-star-pay` is that button whether it is enabled, disabled, or mid-charge. An id that
encoded state could only be *found* while it held that state, so asserting the negative would mean
catching "not found" — which cannot tell "not selected" from "renamed" from "not rendered yet".

Every DS primitive already publishes its state, so there is nothing to add:

| Read this | Where |
|---|---|
| `aria-checked` | `Toggle`, pick-one rows (`role="radio"`) |
| `aria-selected` + `data-selected` | segmented control items, sticky tabs |
| `:checked` on the native input | checkbox, radio |
| `aria-invalid`, plus the presence of `…-error` | text fields |
| `aria-expanded` | menu / filter / date-field triggers |
| `disabled` / `aria-disabled` | buttons, toggles, list rows |
| `aria-busy` | every skeleton root, buttons mid-request |
| `data-status`, `data-type` | alerts |
| `data-open` | the account drawer |
| `data-day` + `data-selected` / `data-disabled` / `data-today` | calendar cells |

If a state is not published yet, publish it as `aria-*` — accessibility work that pays twice —
rather than encoding it in an id. The linter rejects an id whose last segment is a state word.

### Derive sub-parts; never add a second `*TestId` prop

One id on a composite yields several elements:

```
data-testid="auth-email"  on a TextField
  auth-email              the <input>          ← type into this, in both layout arms
  auth-email-field        the wrapper
  auth-email-label        the <label>
  auth-email-message      the reserved message line
  auth-email-error        present ⇔ invalid; its text is the message
  auth-email-hint         the standing help, when there is no error
  auth-email-affix / -prefix / -suffix   when there is an adornment
```

Four `*TestId` props would be four things a caller forgets silently — a missing testid is neither a
type error nor a visual defect. `subTestId(testId, 'confirm')` cannot be forgotten. The full
derivation table per component is at the bottom of `testids/CATALOG.md`.

---

## 4. What not to tag

> Tag an element only if a test would **address** it: something a user acts on (button, link, input,
> option, toggle, menu item), something a test **reads a value out of** (a figure, a status, a name,
> a count), or the container that scopes those. Nothing else.

Falls out of that with no list needed: layout wrappers, every `<Icon>` and `<path>`, spinners and
loaders, decorative art, anything already `aria-hidden`, and `sr-only` text.

Three cases worth stating because they are not obvious:

- **Skeletons: `aria-busy="true"` on the root is the loading contract**, and all 16 carry it, plus
  one `{scope}-loading` testid on that same root and nothing inside. Sixteen attributes instead of
  ~120, and a driver waits for that id to *disappear* rather than sleeping.
- **A third-party iframe or redirect** (Stripe Elements, Google GSI, Turnstile, Sumsub, a mini-app
  frame, an OAuth popup) gets the id on **our container**, never a target inside. Automation cannot
  reach in, and an id that promises otherwise is a false lead.
- **A disabled-pending-route control still gets tagged.** "This is disabled" is an assertion, and an
  untagged dead control is indistinguishable from a regression.

---

## 5. Two traps that decide how we *name* things

### Four navigation shells are in the DOM at once

On `/` for a signed-in visitor:

| Surface | Prefix | Why it is still in the DOM |
|---|---|---|
| Desktop rail, 9 entries | `navigation-navbar-*` | `hidden md:flex` — CSS-hidden, not unmounted |
| Mobile top bar, 5 entries | `navigation-top-bar-*` | `md:hidden` |
| Mobile tab bar, 5 entries | `navigation-tab-bar-*` | `md:hidden` |
| Account drawer, 23 rows | `navigation-menu-*` | **mounted on every route**, parked `inert` |
| End rail | `navigation-end-rail-*` | `hidden min-[1292px]:flex` |

"Notifications" therefore exists four times in one document. **Never reuse a leaf name across two
shells** — a `findElement`-style lookup takes the first match in document order, and `inert` hides
the drawer from the accessibility tree but not from a query.

Anything CSS-hidden at some widths also carries `data-viewport="md-up|md-down|sm-up|xl-up"`, so the
intent is machine-readable instead of surfacing as an "element not interactable" error.

### Some things portal, and three remount by design

Dialogs and menus render into `document.body`, so a popup is **not** a descendant of its trigger.
And three subtrees are torn down deliberately — the password form on every step, the Turnstile panel
on every challenge, the Stripe panel on every checkout secret. A cached element handle there going
stale is correct behaviour, not a flake.

---

## 6. A missing id may mean "not granted"

`features/permission` gates whole rows and screens on per-account grants and **fails closed**: an
account without the grant renders *nothing*. `star-transfer` and `payout-agency` are the two that
bite. So "element not found" there is a test-account question, not a missing id.

---

## 7. Tooling

```bash
pnpm lint:testids   # grammar + drift; part of the pre-PR gate and CI
pnpm testids        # regenerate testids/ after adding ids — commit it
```

The reasoning behind each rule lives next to the code that enforces it:
[`test-id.ts`](../src/shared/lib/test-id.ts) for the grammar and the companion list,
[`testid-surfaces.ts`](../src/shared/lib/testid-surfaces.ts) for the scopes,
[`check-testids.mjs`](../scripts/check-testids.mjs) for the lint rules.
