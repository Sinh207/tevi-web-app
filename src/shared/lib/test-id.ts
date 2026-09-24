/**
 * The `data-testid` contract — grammar, the closed sub-part vocabulary, and the derivation helper
 * that keeps sub-ids predictable. Full spec, Selenium idioms and the trap list: `docs/TEST_IDS.md`.
 *
 * **The reason ids exist at all is the nine locales.** A selector written against visible text is
 * nine selectors, eight of which nobody wrote — `e2e/get-star.spec.ts` still locates the pay button
 * as `getByRole('button', { name: /^Pay / })`, which finds nothing the moment the locale cookie says
 * `vi`. A copy change must stay a translation task. How the ids are then driven — which tool, which
 * language — is not this repo's problem; that they are present and stable is.
 *
 * There is deliberately **no union of every id in the app**. A thousand string literals in one
 * shared module is 25 features editing one file, `shared/` becomes the registry of every feature's
 * vocabulary (the coupling the boundary rules exist to prevent, even with no `import` to show for
 * it), and the comparison to `features/permission`'s `Capability` does not transfer: that union
 * works because the wire spelling and the predicate live beside the name. A testid registry maps a
 * string to itself — there is nothing to centralise. What is typed here instead is the **grammar**
 * (so a wrong shape is a compile error) and the **part vocabulary** (so a sub-slot cannot be
 * invented). Everything else is enforced by `scripts/check-testids.mjs` and the catalog guard.
 */

/**
 * Lets a component **read** its own testid so it can derive sub-ids.
 *
 * Needed only for reading. TSX skips props-type checking for hyphenated attribute names on
 * components as well as intrinsics, which is why `<Button data-testid={…}>` already compiles
 * against a `ButtonPrimitive.Props` that never declares the key — so *passing* a testid needs no
 * type change anywhere. Destructuring `{ 'data-testid': testId, ...props }` from a type lacking
 * the key *is* an error, so this intersection goes on the handful of components that derive, and
 * nowhere else.
 */
export type TestIdProps = { 'data-testid'?: string }

/**
 * The closed set of sub-slots a composite may derive.
 *
 * Not a memorisation aid — the catalog lists each base id's parts. It exists so nobody invents a
 * forty-third name for "the cancel button", and so the guard only has to grammar-check *base* ids:
 * a part is grammatical by construction.
 */
export type TestIdPart =
    // Universal — a field's furniture, a dialog's buttons.
    | 'label'
    | 'label-data'
    | 'message'
    | 'error'
    | 'hint'
    | 'trigger'
    | 'input'
    | 'submit'
    | 'cancel'
    | 'confirm'
    | 'close'
    | 'clear'
    // Structure.
    | 'field'
    | 'affix'
    | 'prefix'
    | 'suffix'
    | 'header'
    | 'footer'
    | 'panel'
    | 'overlay'
    | 'title'
    | 'description'
    // Collections.
    | 'list'
    | 'row'
    | 'item'
    | 'option'
    | 'group'
    | 'slide'
    | 'dot'
    | 'digit'
    | 'tab'
    // Component-specific actions.
    | 'apply'
    | 'next'
    | 'prev'
    | 'copy'
    | 'remove'
    | 'reveal'
    /*
     * The button on a failed region. Forty-one of them are written as literals across the features,
     * which is what makes it a slot rather than one component's word — a composite whose base id
     * comes from its **caller** cannot write a literal, so without this it would have to borrow
     * `submit` or `confirm` and say the wrong thing. `CreatorPickerView` is the first such caller.
     */
    | 'retry'
    // The Caps Lock warning under a password field — a real assertion target, and the only way to
    // tell "wrong password" from "you typed it in capitals".
    | 'caps'
    | 'search'
    | 'calendar'
    /*
     * No `day`. Calendar cells are react-day-picker's and already carry `data-day="YYYY-MM-DD"`
     * plus their state — `calendar.tsx` explains why overriding them would break keyboard focus to
     * add an attribute that is already there. Leaving the slot in the vocabulary would invite
     * exactly the thing that comment argues against.
     */
    // The two ends of a range readout.
    | 'start'
    | 'end'
    | 'stores'
    | 'qr'
    // The two app stores. A closed pair written in this source, so they are sub-slots rather than a
    // companion value — `get-app-dialog.tsx` explains why a closed enum inlines.
    | 'ios'
    | 'android'
    // Collection states. `loading` is the one testid a skeleton file may carry, on its root.
    | 'empty'
    | 'skeleton'
    | 'sentinel'
    | 'count'
    | 'loading'

/**
 * `subTestId('channel-unpublish', 'confirm')` → `'channel-unpublish-confirm'`.
 *
 * `undefined` in, `undefined` out, so a component with no testid emits no attributes rather than
 * `data-testid="undefined-confirm"`. **Do not rely on `undefined` to *clear* an inherited id** — a
 * prop whose value is `undefined` does not cross the server→client boundary, since the flight
 * payload is JSON and JSON drops undefined-valued keys (see the `rendersLink` note in
 * `shared/ui/button.tsx`, where exactly that shipped). Absent is what is wanted here, so this is
 * safe; *overriding* a testid needs a real value.
 *
 * One prop per composite, sub-ids derived — never a second `*TestId` prop. Four props are four
 * things a caller forgets silently (a missing testid is neither a type error nor a visual defect),
 * and they would put four unrelated strings in the catalog with nothing marking them as one
 * dialog. Derivation also means a QC engineer learns the part vocabulary once and can then address
 * any sub-part of any composite without opening the catalog.
 */
export function subTestId(base: string | undefined, part: TestIdPart): string | undefined {
    return base === undefined ? undefined : `${base}-${part}`
}

/**
 * Rejects, at compile time, the three shapes `scripts/check-testids.mjs` would only catch after the
 * push: an uppercase letter, and any of ` `, `_`, `.`, `:`, `/`.
 *
 * `.` and `:` are CSS-significant, so they would have to be escaped inside a Java string literal
 * (`"[data-testid='a\\.b']"`). One separator — `-` — means an engineer can join segments
 * mechanically, and every existing name-space in this repo is already kebab (`data-slot` values,
 * `TeviIconName`, `Capability`, filenames).
 */
type Grammatical<S extends string> = S extends `${string}${' ' | '_' | '.' | ':' | '/'}${string}`
    ? never
    : S extends Lowercase<S>
      ? S
      : never

/** Optional at call sites, free where it is used. `testId('Auth-Email')` is a compile error. */
export function testId<S extends string>(id: Grammatical<S>): Grammatical<S> {
    return id
}

/**
 * The companion attributes that may carry a list item's identity, and the only ones the guard
 * accepts beside a `data-testid`.
 *
 * **Identity never goes into the id itself.** Three reasons, the second decisive:
 *
 * 1. An inline value forces a prefix selector, and `…-row-1` also prefix-matches `…-row-12`.
 * 2. Tevi's identities contain `-` themselves and some are **user-controlled** — `channel.slug` is
 *    a chosen username, Stripe ids are `pm_…`, others are UUIDs. `saved-card-row-pm_1-abc` cannot
 *    be split back by any rule, and a slug carrying `'` or `]` breaks the selector string outright.
 *    A companion value never concatenates untrusted data into a selector; it sits in a quoted
 *    attribute where the driver's own escaping handles it.
 * 3. The catalog is only enumerable this way. With values inline it could publish templates, and a
 *    template cannot be diffed line-for-line or snapshot-tested.
 *
 * So `[data-testid='x']` finds the whole set and `[data-testid='x'][data-card-id='…']` finds one —
 * the same two idioms everywhere.
 *
 * `data-index` is for genuinely positional lists only (the six OTP boxes, carousel dots, a
 * caller-built detail list). Anywhere a list can reorder or filter, positional identity is a lie.
 */
export const TESTID_COMPANIONS = [
    'data-account-id',
    'data-card-id',
    'data-channel-slug',
    'data-currency-code',
    'data-date',
    /**
     * A received donation's id — the supporters list on `/monetization/donation`, whose rows are all
     * `monetization-donation-supporter`. The sibling of `data-membership-id` below, for the other
     * creator dashboard, and separate from it because the two lists carry different objects: one row
     * is a subscription and the other is a single payment.
     */
    'data-donation-id',
    /**
     * A form field's **wire key** — `account_number`, `corp_ein`, `bank_name`.
     *
     * For a form whose fields are derived from a payload rather than written out: the payout setup
     * screen renders whatever `payout-methods/` says a method collects, so its controls share one id
     * (`payout-setup-field`) and this is what tells them apart. Not `data-option-key` — these are not
     * options — and not in the id, for the reason above: the two US bank-transfer variants share three
     * field names, and `payout-setup-field-account_number` is both unsplittable and snake_cased.
     */
    'data-field-key',
    'data-group-key',
    'data-index',
    'data-ledger-id',
    'data-locale',
    'data-membership-id',
    'data-metric-id',
    'data-option-key',
    'data-option-value',
    'data-package-id',
    'data-payout-id',
    /**
     * A post's id — today only the NSFW appeal queue, whose rows are all `nsfw-appeal-post` and
     * whose identity is the id the Delete button will send to `DELETE v1/posts/{id}/`. A uuid, so
     * it is full of `-` and could never go in the id itself.
     */
    'data-post-id',
    /**
     * Who is in a Live studio seat — the publisher's id, which is also Agora's `uid` and the
     * suffix of the mount node the video is painted into (`player-{id}`).
     *
     * Not `data-account-id`: that one is a *reader's* account on this device, and a co-host on
     * camera is somebody else entirely. Every seat in the grid is `event-studio-seat`, so this is
     * the only thing that tells two of them apart — and the id cannot go in the testid itself
     * because it is backend-issued and may contain `-`.
     */
    'data-publisher-id',
    'data-program-id',
    'data-provider-key',
    'data-row-key',
    'data-tab-id',
    'data-transfer-id',
] as const

export type TestIdCompanion = (typeof TESTID_COMPANIONS)[number]
