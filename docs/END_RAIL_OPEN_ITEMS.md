# End rail — what is not finished

The desktop **end rail** (`features/navigation/components/end-rail/`, plus `features/campaign/`) is
the port of legacy's `components/layouts/common/trending`. The rail itself is done. This is
everything around it that is not — in the order it should be picked up. **R1, R3, R5 and R8 are
answered**; their entries stay, struck through, with the decision.

Each item says **what is true today** and **what changes when it is resolved**, so it can be acted
on without re-deriving the context. Same posture as
[`BACKEND_QUESTIONS.md`](BACKEND_QUESTIONS.md): resolved items stay here with the answer, because
they are why a piece of code looks the way it does.

**Quick reference** — ~~[R1 the 1280 gate](#r1)~~ · [R2 verifying against a real account](#r2) ·
~~[R3 affiliate modal](#r3)~~ · [R4 `/premium`](#r4) · ~~[R5 phone glyph](#r5)~~ ·
[R6 Lucky Wheel art](#r6) · [R7 desktop comp](#r7) · ~~[R8 spend animation](#r8)~~ ·
[R9 translations](#r9) · [Decisions to revisit](#decisions-worth-revisiting) ·
[Traps](#traps-that-already-cost-time)

---

## ~~R1 — the rail is hidden on a 1280px laptop~~ · **answered: kept** {#r1}

> **Decided — keep 1292.** The rail starts at 1366; a 1280 laptop does not get it. Legacy's 612
> column width outranks reaching 12 more pixels of viewport, and both alternatives below bought that
> reach by shrinking something legacy sized deliberately.
>
> The reasoning is now also at the token in `globals.css`, because that is where someone will be
> standing when they decide the 12px looks like a bug worth fixing.

`AppEndRail` gates itself on `min-[1292px]`, which is `2 × --end-rail-anchor`:

```
306   half the 612 content column
+ 22   gutter between column and rail
+ 318  --end-rail-width
= 646  --end-rail-anchor        →  the rail needs 2 × 646 = 1292
```

**1280 is a very common viewport** — a 13" MacBook Air at its default scaling — and it is 12px
short. Those users get no rail at all.

Legacy has the same 646, with no gate: below 1292 its rail slides off the right edge and puts a
horizontal scrollbar on the page. So legacy *shows* something at 1280; this port shows nothing.
That is a better failure, but it is still a regression in reach.

Three ways out, all one number in `globals.css`:

| Option | Change | Result |
|---|---|---|
| Keep it | — | Rail from 1366 up. 1280 laptops never see it. |
| Narrow the gutter | 22 → 16 ⇒ anchor 640 | Fits 1280 exactly, with zero slack. |
| Narrow the rail | 318 → 306 ⇒ anchor 634 | Fits 1280 with 12px to spare. Departs from legacy's column width. |

**Still true after the decision**: `END_RAIL_MIN_WIDTH` in `end-rail/use-rail-visible.ts` is the
same doubled number as the CSS gate and has to move with it. Nothing enforces the pair — the gate is
a Tailwind variant and the constant is JS, so neither can read the other. Getting them out of step
does not break a screen; it makes the campaign query fire in a band where the rail is hidden.

---

## R2 — none of the campaign path has run against a real account · **do before merge** {#r2}

`useCampaigns` is `enabled: isAuthenticated`, and **every browser session used to build and verify
this was anonymous**. So `GET dapp-campaign/v1/campaigns/` has never actually been called.

What that leaves unverified:

- **The response shape.** It was derived from legacy's `hooks/useCampaign.js`, not observed. The
  parser (`features/campaign/api/types.ts`) drops a row it cannot read and keeps the rest — which
  is the right behaviour, and it means a shape mismatch shows up as **a banner that silently never
  appears**, with no error anywhere.
- **The three campaign cards with real content**: `shortlink`, `logo`, `total_reward_in_usdt`,
  `user_joined`, `milestone_details.{title,subtitle}`.
- **`resolveCampaignText`** (`features/campaign/lib/campaign-text.ts`) — it reverse-looks-up a
  translation key by matching the English string the API sent. Whether the strings the backend
  actually sends match any key's value is unknown; unmatched copy falls through as English, which
  is a silent partial failure rather than a visible one.
- **`PremiumBanner` hiding for an `is_premium` account.**
- **The Star figure in the pill.** Only ever seen as `—`.

Needs one staging account with an active campaign of each type. Roughly a session's work, and it is
the largest gap in the whole port.

**It is now two surfaces, not one.** `features/channel`'s `ChannelCampaignBanners` renders Grow Your
Fans and Affiliate on the creator's own space **below 1292**, where there is no rail — legacy's slot,
and the only place a phone can reach them. Same cards, same query, so everything above is unverified
there too, in the band most creators actually use.

The two are mutually exclusive by `useRailVisible`, which has a verification consequence worth
stating: **seeing a campaign on a wide window says nothing about the phone, and seeing nothing on a
wide window says nothing at all** — at that width the channel strip is *meant* to render nothing.
Check the rail there, and the channel strip under 1292.

---

## ~~R3 — the affiliate modal is not built~~ · **answered: built** {#r3}

> **Built** — `features/affiliate`, one dialog with three screens (list → detail → joined) on the
> `raffi` service, plus the switch and leave confirmations. `AffiliateEntry` composes it with the
> banner; the rail renders that.
>
> Four things went differently from legacy, each deliberate:
>
> - **No bottom sheet.** Legacy's `ResponsiveModal` is a dialog from 900px and a full-height drawer
>   below. The only trigger is the end-rail card, which needs 1292px, so the mobile branch is
>   unreachable — building a sheet the app has no primitive for, for a viewport that cannot reach the
>   trigger, is work with no user at the end of it. The day a mobile surface opens this, that sheet is
>   the change.
> - **Copy, not share.** Legacy opens its share sheet (8 channels, a DM picker, per-channel link
>   minting). That sheet is not ported, and this app's rule is that invoking one from inside an
>   overlay means two overlays fighting over focus — three here, since the trigger is in a dialog. So
>   the referral link goes to the clipboard with a toast, and the error branch carries the URL so it
>   can still be selected by hand.
> - **No link shortener.** Legacy mints a short link (`v1/shorten/`) for the referral URL and falls
>   back to the long one when it fails. The pill truncates either way, so the fallback is what ships.
> - **`campaignKeys.list` is invalidated on every write**, which is what that export was reserved for
>   — `user_joined` on the banner is a *different service's* copy of the same fact, and legacy patches
>   it by hand (`updateCampaignAffiliate`).
>
> **The dependency runs one way: affiliate → campaign.** Wiring the dialog from the banner's side
> would make the two barrels import each other, and ESM answers a cycle with a half-initialised
> module — an `undefined is not a function` at render time, not a build error. `AffiliateEntry` is
> the joint that keeps the edge one-directional.
>
> Verified against fixtures at **`/dev/affiliate`** — the real dialog on seeded reads, since a live
> account with an active campaign is not reachable on a dev machine. R2 still covers the wire.

What follows is the case as it stood before the dialog was built.

`AffiliateBanner` rendered with correct state — offered, joined, reward — but the card was inert: no
link, no `onClick`.

Legacy's modal is 2,269 lines over ~20 files with its own provider, context and five hooks, running
on the `raffi` service:

```
raffi/v1/campaigns/current   ·  campaigns/stats  ·  campaigns/join  ·  campaigns/leave
raffi/v1/programs/           ·  programs/{id}/   ·  programs/{id}/estimate/
```

That is a larger piece of work than this entire rail, so it belongs in its own `features/affiliate`.

**When it lands**: the card becomes the trigger and nothing else here changes. Join and leave must
invalidate `campaignKeys.list` — already exported from `features/campaign` for exactly that — rather
than patching state by hand the way legacy's `updateCampaignAffiliate` does.

`ProgramCard` rendered the joined/not-joined pill **not** `aria-hidden` while the card was inert,
because the pill was then the only place the state was stated. Now that the card is a control its own
accessible name covers it, so the banner passes `as="button"` and lets `actionDecorative` return to
its default — the two are set together, in one ternary, so they cannot drift apart.

---

## R4 — `/premium` does not exist {#r4}

`PremiumBanner`'s CTA points at `/premium`, which is not a route. **Agreed deliberately**: the card
needs no edit on the day that route lands, and until then the button reaches the app's 404. The
alternative — a disabled button — trades a wrong destination for a dead control, which is worse in a
promo card.

`TODO` marker is at `end-rail/premium-banner.tsx`.

---

## ~~R5 — the design system has no phone glyph~~ · **answered: hand-made mark** {#r5}

> **Decided — draw it.** Parity with legacy's control won over waiting on the sprite, so legacy's
> phone path is copied verbatim into `end-rail/phone-mark.tsx` and `qr-code` is gone.
>
> It is a **plain component, not an `Icon`**. Getting it in through `Icon` would mean editing
> `design-system/tevi-icons.svg` — the upstream import — so a hand-drawn path would arrive claiming
> the same provenance as 4,451 Figma-asserted nodes, and the next design-system sync would either
> clobber it or carry it forward as design's work. As a component it sits with
> `provider-marks.tsx` and `store-badge.tsx`, where a reader can tell which shapes came from the
> design system and which did not.
>
> Two changes from legacy: `fill="currentColor"` instead of a baked `#141414`, so it survives dark
> mode, and `aria-hidden` because the button already says "Get App".
>
> **The ask on design stands.** If a phone glyph ships, delete that file and go back to `Icon` —
> that is the intended end state, and the file says so.

Legacy draws a **phone** on the Get App control. All 554 base glyphs in the sprite were read: there
is no phone, mobile, handset or smartphone. `qr-code` shipped first, chosen over
`download-arrow-down`, `download-bracket`, `download-square-simple` and `grid-square` — all five
rendered in the real pill before deciding — and was then replaced by the hand-made mark above.

For the record, the sprite subsets by usage (`scripts/build-icon-sprite.mjs`), so adding a glyph
upstream costs nothing in the bundle — which is why the ask is cheap to grant and the hand-made mark
is meant to be temporary.

---

## R6 — Lucky Wheel's dialog art is not ported {#r6}

Legacy wraps its Lucky Wheel promo in a full-bleed orange gradient with three raster wheel images and
headline text at `fontWeight: 900`, italic, under an eight-shadow white outline.

**Not ported, and not by oversight**: the DS type scale is 25 styles topping out at 700, CLAUDE.md
forbids setting `font-size`/`font-weight` by hand, and the app does not load a Black weight of Inter.
Reproducing it means going around the design system for one dialog.

The campaign's **copy** survives — it is what tells a creator what the wheel is — and the card opens
the shared `GetAppDialog`. The art needs a designer, not a closer approximation. See
`shared/components/get-app-dialog.tsx`.

---

## R7 — the pill was never checked against the desktop comp {#r7}

The implementation plan said to read `My Star - Desktop.dc.html` in the Claude Design project
`87e00715-ad01-43ad-9a23-20469b60276d` before building the pill, since it is the only desktop comp
that exists and the pill probably appears in it. **That step was skipped.**

What was done instead: composed from DS parts (the way `AppTopBar` does) and matched legacy's
measurements exactly — pill 48 tall, padding `4 8 4 12`, outer gap 8, inner gaps 4, star 20,
Get App glyph 24, divider 24, avatar 40, all verified in the browser.

So the geometry is legacy-accurate but **not comp-verified**. This is a verification debt, not a
finished item.

---

## ~~R8 — no spend animation~~ · **answered: built** {#r8}

> **Built** — `StarChangeFlash` (`features/balance`), in **both** Star pills: the desktop end rail's and
> the mobile top bar's. Driven by the realtime `balance_change` frame, which is the only place the
> *size* of a change can be known: by the time the refetched figure lands, the old one is gone.
>
> The delta travels on the **event bus** (`balance:star-changed`), not in `BalanceValue`. It is not the
> balance and must never be accumulated into one — frames only arrive while the tab holds the socket.
> On the bus it has no lifetime to manage: delivered, drawn, gone. This is also the documented
> exception to "a socket frame is a signal, never a source" — the payload is read for the flash and
> thrown away for the figure.
>
> Four things legacy gets wrong here, all avoided:
>
> - **Two clocks.** Legacy's CSS runs 4s while the state that mounts it clears at 2s, so half has never
>   played. Here the animation's own `animationend` is the only clock, so nothing can drift.
> - **No `key`.** A second spend inside the window re-renders the same node, and CSS does not restart a
>   running animation — legacy freezes on the first amount. Keyed on a per-event sequence number.
> - **A top-up is silent.** Legacy's guard is `amount <= 0`, and a credit's delta is negative in its
>   arithmetic. Both directions flash here, in different tones. *This is a behaviour change, not a bug
>   fix* — say so if it should stay debit-only.
> - **Nothing announced.** Legacy's is pure decoration; this carries a `role="status"` sentence.
>
> **Reduced motion collapses the duration to 1ms rather than removing the animation.** With
> `motion-reduce:animate-none` — what every other motion constant uses — there is no `animationend`, so
> the flash would sit over the balance for the rest of the session. Found by measuring, not by reading.
>
> Verified in a browser at **`/dev/star-flash`** (the bus is emitted by hand; the flash is otherwise
> unreachable without a real account *and* a live frame): 2s travel 20→60px with opacity 1→0, element
> gone by 2.5s, immediate under reduced motion, and a rapid double showing the second amount.

## R9 — 25 keys are English-only {#r9}

Every `rail_*` and `campaign_*` key exists in `en/translation.json` and in **none** of the other
eight locales, so they fall back to English per `FALLBACK_LNG`. That is the designed behaviour, not a
bug — but it does mean the rail is untranslated for eight of nine audiences.

`resources.test.ts` enforces English being a superset, so adding the keys to any locale is safe and
partial coverage is fine.

---

## Decisions worth revisiting

- **The rail is absent on the six wide documents** — privacy, terms, safety, community guidelines,
  moderation, brand assets. The reason is geometry, not category: `LEGAL_CONTAINER` is 1080 and
  `BRAND_CONTAINER` is 900, so the rail would be drawn on top of the text at any window between the
  gate and roughly 1760. Legacy hides it on the same set, via a pathname blocklist; here it is a
  route group (`(main)/(rail)/`). To show it there, the anchor has to widen or those columns narrow.
- **`campaignReward` treats `0` as "no reward"**, so a campaign advertising `$0.00` renders no reward
  line. Legacy does the same, by accident; here it is deliberate and stated.
- **The pill's shadow is the DS `--elevation-md`**, not legacy's `0 2px 10px rgba(0,0,0,.1)`. Token
  ramp over a hand-picked value, and it flips with the theme.
- **The rail has no skeleton.** Campaign cards appear after their fetch. Legacy is the same, and the
  rail is `position: fixed`, so nothing in the page moves.
- **`Get App` drops AppsFlyer entirely.** Legacy branches on a UA sniff: phone → OneLink, desktop →
  QR. The rail needs a 1292px window, so the phone branch was unreachable code holding up
  AppsFlyer, remote config and `react-device-detect`. If a mobile surface ever needs the deep link,
  that chain comes back — it is not gone because it was wrong, it is gone because nothing here could
  reach it. Store URLs are hardcoded in `shared/components/get-app-dialog.tsx`; legacy reads them
  from remote config.

---

## Traps that already cost time

Environment behaviour, not code — but each one fails **silently**, so it is worth knowing before the
next person debugs a component that is fine.

1. **A new `@theme` token in `globals.css` does not reach the browser until the dev server is
   restarted.** HMR and `touch` are both insufficient; every pre-existing token in the same block
   still resolves, so it reads as tree-shaking. A declaration referencing the missing variable is
   dropped, which meant a `fixed` rail quietly rendering at its static position. Confirm with:
   ```bash
   CSS=$(curl -s http://localhost:3000/ | grep -o '/_next/static/[^"]*\.css' | head -1)
   curl -s "http://localhost:3000$CSS" | grep -o -- '--your-token:[^;]*;'
   ```
2. **`calc()` in a Tailwind arbitrary value needs its spaces written as underscores** —
   `end-[calc(50vw_-_var(--x))]`. `calc(50vw-var(--x))` is invalid CSS and is dropped, which looks
   exactly like trap 1.
3. **A newly referenced icon renders blank until the dev server restarts** — the sprite is subset at
   startup, not per HMR.
4. **Moving a route directory leaves `tsc` failing on stale generated route types.** `rm -rf
   .next/types` and restart.
5. **A hand-written `@keyframes` added to `globals.css` needs `rm -rf .next`, not just a restart** —
   and the symptom is a lie. Tailwind rescans `src/**` on every start, so the `animate-[…]` *utility*
   appears and the element really does get `animation-name: tevi-…`; the `@keyframes` block itself
   comes from processing `globals.css`, which stays cached. The animation therefore silently does
   nothing, and anything hanging off `animationend` never fires. Confirm with:
   ```bash
   CSS=$(curl -s http://localhost:3000/ | grep -o '/_next/static/[^"]*\.css' | head -1)
   curl -s "http://localhost:3000$CSS" | grep -c '@keyframes tevi-your-name'
   ```
