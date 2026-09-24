#!/usr/bin/env node
/**
 * Guards against a bare `<a href>` pointing at an **internal route**.
 *
 * ## Why this is a script and not a review note
 *
 * A bare anchor to a route in this app is a full document load: the root layout, the providers, and
 * with them `SessionProviders`' whole bootstrap — a device fingerprint, `/me`, permissions, balance,
 * my-channel — are torn down and rebuilt to arrive at a page the router could have swapped in place.
 *
 * It is invisible. The markup is right, the destination is right, the page looks identical, every
 * test passes and `tsc` is happy; the only tell is a network panel or a provider re-bootstrapping.
 * It shipped twice in this repo before anybody saw it, in `features/channel`'s Live surfaces and
 * again in `features/event` — the second time by copying the first, because reading the neighbours
 * is how this codebase is meant to be written and the neighbours were wrong.
 *
 * `next/link` renders a real `<a>`, so everything an anchor is chosen *for* survives: middle-click,
 * open-in-new-tab, the destination in the status bar, and being announced as a link. There is no
 * trade-off to weigh — which is exactly why the mistake is easy. The decision that gets debated is
 * "anchor or `<button onClick={router.push}>`", and `<a>` wins it; the second question, `<a>` or
 * `<Link>`, never gets asked.
 *
 * ## What counts as internal, and what is deliberately allowed
 *
 * Allowed, because they are not app navigation:
 * - `target="_blank"`, and anything whose href is an absolute URL or a `mailto:` / `tel:` scheme
 * - a `#fragment` (same-page), which is `features/legal`'s table of contents
 * - `download`, which is `features/brand-assets`' asset links
 * - an anchor carrying an `onClick` that handles the press itself — the drawer's rows call
 *   `useDrawerNavigate`, which `preventDefault`s and pushes, so the `href` is only the middle-click
 *   fallback and is correct as written
 *
 * Flagged: everything else — a literal `/path`, or a variable/expression href, which is where all
 * six real cases lived (`href={href}`, `href={item.href}`, `href={channelHref}`).
 *
 * A variable href cannot be resolved statically, so this errs toward flagging: the false positive is
 * one `// internal-link-ok:` comment on a line that genuinely leaves the app, and the false negative
 * is the bug above shipping again.
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const files = execSync(
    "grep -rl --include='*.tsx' -E '<a[ >]' src 2>/dev/null || true",
    { encoding: 'utf8' },
)
    .trim()
    .split('\n')
    .filter(Boolean)
    .filter((f) => !f.includes('.test.'))

/** The opening tag plus enough of what follows to carry its attributes. */
const ATTR_LOOKAHEAD = 8

const problems = []

for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n')

    lines.forEach((line, index) => {
        // A JSX anchor: `<a`, or base-ui's `render={<a`. Never a doc comment — those talk *about*
        // anchors constantly in this repo, and matching them would bury the real hits.
        if (/^\s*\*/.test(line)) return
        /*
         * ⚠ `$` in that class, and it is the whole check. This read `/<a[\s>]/`, which requires a
         * character *after* the tag name — so `<a` alone at the end of a line, which is how every
         * multi-attribute anchor in this repo is written, matched nothing. The guard passed a
         * deliberately reintroduced bug and would have shipped believing itself green. Caught by
         * testing that it fails, which is the only assertion a guard script actually has.
         */
        if (!/<a(?:[\s>]|$)/.test(line)) return

        const attrs = lines.slice(index, index + ATTR_LOOKAHEAD).join(' ')
        const href = attrs.match(/href=(?:"([^"]*)"|\{([^}]*)\})/)
        if (!href) return

        const value = href[1] ?? href[2] ?? ''

        /*
         * The escape hatch is looked for **on both sides** of the tag. A `<Button render={<a …/>}`
         * has nowhere to put a comment inside itself, so the marker lands on the lines above — which
         * an attribute-only lookahead cannot see. Found that by writing the first marker and
         * watching the check still fail.
         */
        const scope = lines.slice(Math.max(0, index - ATTR_LOOKAHEAD), index + ATTR_LOOKAHEAD)
        if (scope.some((l) => /\/\/\s*internal-link-ok/.test(l))) return
        if (/target=["{]?_blank|\bdownload\b/.test(attrs)) return
        // The press is handled in JS; the href is the middle-click fallback.
        if (/onClick=/.test(attrs)) return
        // Absolute, scheme-relative, a scheme of its own, or a same-page fragment.
        if (/^(https?:|mailto:|tel:|\/\/|#)/.test(value.replace(/^[`'"]/, ''))) return
        if (/^\{?`?#/.test(value)) return

        problems.push(`${file}:${index + 1}  href=${href[0].slice(5, 60)}`)
    })
}

if (problems.length) {
    console.error(
        'Bare <a> on what looks like an internal route — use `next/link`.\n' +
            'It renders the same <a> (middle-click, new tab, status bar, announced as a link) and\n' +
            'navigates client-side instead of reloading the app. If the href really leaves the app,\n' +
            'add `// internal-link-ok:` with the reason.\n',
    )
    console.error(problems.join('\n'))
    process.exit(1)
}

console.log(`OK — ${files.length} files scanned, no bare internal <a href>.`)
