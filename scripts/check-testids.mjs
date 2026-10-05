/**
 * Reject `data-testid` values that break the contract QC's Selenium suite is written against.
 *
 * ```
 * pnpm lint:testids
 * ```
 *
 * ## Why a script and not a lint rule
 *
 * Biome has no rule for this, and three of the checks need more than a pattern: the scope vocabulary
 * comes from the `src/features/*` directory listing, the part vocabulary is parsed out of
 * `shared/lib/test-id.ts`, and rule 4 has to tell `data-testid={t('x')}` from `data-testid={cn(a)}`
 * from a bare identifier. `check-rtl-classes.sh` is bash because it is a stateless pattern ban; this
 * is not. The shape is deliberately the same: read-only, `file:line` per offence, `exit 1`, one line
 * on success.
 *
 * ## Why the rules are what they are
 *
 * The full argument is `docs/TEST_IDS.md`. The short version: the grammar keeps ids predictable
 * without a lookup, and rules 4, 5 and 8 keep the generated list *enumerable* — which is what makes
 * a rename show up as a diff rather than as somebody else's failing test.
 *
 * `src/app/(web)/dev/**` is skipped entirely. Those pages `notFound()` in production — which
 * `next build && next start` sets, so they are dead on staging too — and `proxy.ts` blocks the
 * namespace besides. Nothing there is reachable from a suite, so a testid there is a note to the
 * next developer rather than an interface; grading them would mean adding `dev` to the surface
 * vocabulary, i.e. putting a fake screen in the catalog to satisfy a linter.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
    lineOf,
    parseCompanions,
    parseParts,
    parseSurfaces,
    stripComments,
    testIdAttributes,
} from './lib/testids.mjs'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

/** Lowercase kebab, at least two segments, ASCII only. */
const GRAMMAR = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/

/**
 * A final segment that names a state rather than a thing.
 *
 * The most-argued-with rule, so the message explains itself: an id that encodes state is findable
 * only while it *holds* that state, which turns every negative assertion into "catch
 * NoSuchElementException" — and that exception cannot tell "not selected" from "renamed" from "not
 * rendered yet". State is published as `aria-*` / `data-*` instead, which every DS primitive already
 * does.
 */
const STATE_WORDS = new Set([
    'active',
    'inactive',
    'checked',
    'unchecked',
    'selected',
    'unselected',
    'enabled',
    'disabled',
    'open',
    'opened',
    'closed',
    'expanded',
    'collapsed',
    'visible',
    'hidden',
    'pending',
    'busy',
    'invalid',
    'valid',
    'success',
    'failed',
])

/**
 * `data-slot` values authored outside `src/shared/ui`.
 *
 * `data-slot` is a **behaviour** attribute, not the automation contract: three production code paths
 * select on it (`segmented-control.tsx`'s keyboard nav, `app-side.tsx`'s outside-press, and
 * `metric-tabs.tsx`). Allowlisting the app-authored ones keeps a caller from clobbering a primitive's
 * own slot, which is possible because `button.tsx` writes `data-slot` *before* its prop spread.
 */
const APP_DATA_SLOTS = new Set([
    'action-menu-content',
    'action-menu-item',
    'action-menu-trigger',
    'drawer-screen',
    'end-rail-pill',
    'menu-drawer',
    'menu-scrim',
    'menu-stack',
    'metric-tab',
    'program-card',
    'promo-card',
    'sumsub-container',
])

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) {
            if (name === 'node_modules' || name === '.next') continue
            walk(path, out)
        } else if (/\.tsx$/.test(name) && !/\.(test|spec)\.tsx$/.test(name)) {
            out.push(path)
        }
    }
    return out
}

/**
 * Local components that can actually *receive* a testid, by name.
 *
 * This exists because of a real bug, and it is the one check here whose absence is invisible:
 * `data-testid` on a component with a closed prop list is **dropped silently**. TSX does not
 * type-check hyphenated attribute names, so `tsc` says nothing; the id is in the source, in the
 * catalog, in the docs — and not in the DOM. Four rows shipped that way
 * (`SearchChannelRow`, `FollowingChannelRow`, `FollowingLiveRow`, `NotificationRow`) before this
 * caught them, and nothing else would have.
 *
 * A component qualifies if it spreads `...props`/`...rest`, destructures `'data-testid':`, takes a
 * `testId` prop, or intersects `TestIdProps`. Matched by name across the repo rather than by
 * resolving imports: a duplicate component name is rare, and being lenient about it is the right
 * trade for a check that would otherwise need a module graph.
 */
function receivers() {
    /** Accepts the **attribute** `data-testid` — spreads props, or destructures/intersects it. */
    const attribute = new Set()
    /** Accepts the **prop** `testId`. A different thing, and confusing the two is a silent drop. */
    const prop = new Set()
    const local = new Set()
    for (const file of walk(join(ROOT, 'src'))) {
        const src = stripComments(readFileSync(file, 'utf8'))
        for (const match of src.matchAll(
            /(?:export )?(?:function|const) ([A-Z][A-Za-z0-9]*)\s*[=(]/g,
        )) {
            local.add(match[1])
            /*
             * A bare re-export — `export const MenuTrigger = BaseMenu.Trigger` — forwards by
             * definition: there is no component here, only a name for somebody else's. It has no
             * `...props` to find, so without this it read as a closed prop list.
             */
            if (new RegExp(`\\bconst ${match[1]} = [A-Z][\\w.]*\\s*$`, 'm').test(
                src.slice(match.index, src.indexOf('\n', match.index)),
            )) {
                attribute.add(match[1])
                prop.add(match[1])
                continue
            }
            const window = src.slice(match.index, match.index + 1400)
            if (
                /\.\.\.(props|rest)\b/.test(window) ||
                /'data-testid':/.test(window) ||
                /TestIdProps/.test(window)
            ) {
                attribute.add(match[1])
            }
            /*
             * `=` as well as `,?:` — a **defaulted** destructured prop (`testId = 'post-card',`) is
             * how most components in this repo declare theirs, and it was the one spelling this
             * missed.
             *
             * It mattered because `stripComments` blanks comments **in place** to keep line numbers
             * honest, so a component whose props carry long doc comments has its `testId?: string`
             * pushed past the 1400-character window below — `PostCard` by 600 characters. The
             * destructuring sits at the very top of the function, before any of that, so matching it
             * there is what makes the window size stop mattering.
             *
             * The symptom was a false positive that reads as a real defect: "handed to <PostCard>,
             * which cannot receive it", on a component that receives it fine.
             */
            if (/\btestId\s*[,?:=]/.test(window)) prop.add(match[1])
        }
    }
    return { attribute, prop, local }
}

/** The scope vocabulary maintains itself: it is the barrel rule plus the route tree. */
function scopes() {
    const featureDir = join(ROOT, 'src/features')
    const features = readdirSync(featureDir).filter(name =>
        existsSync(join(featureDir, name, 'index.ts')),
    )
    const segments = new Set()
    for (const file of walk(join(ROOT, 'src/app'))) {
        if (!file.endsWith('/page.tsx')) continue
        for (const segment of file.slice(join(ROOT, 'src/app').length + 1).split('/')) {
            // Route groups `(web)`, dynamic segments `[slug]`, and the filename itself.
            if (/^[a-z][a-z0-9-]*$/.test(segment)) segments.add(segment)
        }
    }
    return new Set([...features, ...segments])
}

/** Parsed out of the modules rather than duplicated — one source of truth, no codegen step. */
const readTestIdModule = () => readFileSync(join(ROOT, 'src/shared/lib/test-id.ts'), 'utf8')
const parts = () => parseParts(readTestIdModule())
const companions = () => parseCompanions(readTestIdModule())
const surfaces = () =>
    new Set(
        Object.keys(parseSurfaces(readFileSync(join(ROOT, 'src/shared/lib/testid-surfaces.ts'), 'utf8'))),
    )

/**
 * Companion attributes on the same JSX element as the testid at `index`.
 *
 * **Two spellings, because a call site does not always write the attribute.** On a DOM element it is
 * `data-provider-key={key}`; on a feature component it is the prop `providerKey={key}`, and the
 * attribute is emitted inside that component. Reading only the former made the duplicate rule fire
 * on `auth-method-buttons.tsx`, where three components deliberately share one testid and are told
 * apart by exactly that prop. camelCase → `data-kebab`, then filtered against the approved list, so
 * an unrelated prop cannot masquerade as a companion.
 */
function companionsNear(src, index, approved) {
    const open = src.lastIndexOf('<', index)
    const close = src.indexOf('>', index)
    if (open === -1 || close === -1) return []
    const element = src.slice(open, close)
    const found = [
        ...element.matchAll(/(data-[a-z][a-z-]*(?:-id|-key|-code|-value|-slug|-index))=/g),
    ].map(m => m[1])
    for (const match of element.matchAll(/\b([a-z][a-zA-Z0-9]*)=/g)) {
        const attr = `data-${match[1].replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`
        if (approved.has(attr)) found.push(attr)
    }
    return [...new Set(found)]
}

function main() {
    const SCOPES = scopes()
    const RECEIVERS = receivers()
    const PARTS = parts()
    const COMPANIONS = companions()
    const SURFACES = surfaces()
    const problems = []
    let literals = 0

    for (const file of walk(join(ROOT, 'src'))) {
        // Comments first: every doc comment in this repo carries worked examples, so grading them
        // would flag the documentation that explains the rules.
        const src = stripComments(readFileSync(file, 'utf8'))
        const rel = file.slice(ROOT.length + 1)
        if (rel.startsWith('src/app/(web)/dev/')) continue
        const inSharedUi = rel.startsWith('src/shared/ui/')
        const seen = new Map()

        // ---- rule 9: data-slot outside shared/ui -------------------------------------------
        if (!inSharedUi) {
            for (const match of src.matchAll(/data-slot="([^"]+)"/g)) {
                if (!APP_DATA_SLOTS.has(match[1])) {
                    problems.push({
                        file: rel,
                        line: lineOf(src, match.index),
                        value: `data-slot="${match[1]}"`,
                        why: `\`data-slot\` outside src/shared/ui must be in the allowlist in scripts/check-testids.mjs.\n  It is a behaviour attribute that production code selects on — three call sites do — so a new\n  one is a decision, not a label. If you wanted an automation handle, that is \`data-testid\`.`,
                    })
                }
            }
        }

        // ---- data-testid values -------------------------------------------------------------
        for (const match of testIdAttributes(src)) {
            const line = lineOf(src, match.index)
            const at = { file: rel, line }
            const { literal, expression } = match

            if (expression !== undefined) {
                const expr = expression.trim()
                // rule 4: literal, bare identifier, subTestId(), testId(), or a member read of one.
                if (/`|\+/.test(expr)) {
                    problems.push({
                        ...at,
                        value: `{${expr}}`,
                        why: `a template literal or concatenation. A value must never be interpolated into an id —\n  a list item's identity goes in a companion attribute (\`data-card-id\`, \`data-option-value\`).\n  Tevi's identities contain \`-\` and some are user-chosen, so a prefix selector cannot be split\n  back out of them; it is also what keeps testids/catalog.json enumerable and diffable.`,
                    })
                    continue
                }
                const call = expr.match(/^([A-Za-z_$][\w$]*)\s*\(/)
                if (call && !['subTestId', 'testId'].includes(call[1])) {
                    problems.push({
                        ...at,
                        value: `{${expr}}`,
                        why: `a call expression inside data-testid. Only \`subTestId()\` and \`testId()\` are allowed.\n  This is the rule that keeps translated text out of ids: eight UI locales are surfaced, so an id\n  built from \`t()\` — or from \`.toLowerCase()\`, or from next year's formatter — is eight ids.`,
                    })
                    continue
                }
                if (call?.[1] === 'subTestId') {
                    const part = expr.match(/,\s*'([^']+)'\s*\)/)
                    if (part && !PARTS.has(part[1])) {
                        problems.push({
                            ...at,
                            value: `subTestId(…, '${part[1]}')`,
                            why: `'${part[1]}' is not in the TestIdPart union in src/shared/lib/test-id.ts.\n  The vocabulary is closed so nobody invents a forty-third name for "the cancel button". Add it\n  there if it is genuinely new.`,
                        })
                    }
                }
                continue
            }

            // ---- a literal ------------------------------------------------------------------
            literals++
            const value = literal

            // rule 6: shared/ui receives, never authors.
            if (inSharedUi) {
                problems.push({
                    ...at,
                    value: `"${value}"`,
                    why: `src/shared/ui/** must not author an id, only forward one it was given. A primitive that\n  thirty screens render cannot be attributed to a screen. Take the caller's \`data-testid\` and pass\n  it through — \`dialog.tsx\` and \`search-bar.tsx\` are the pattern.`,
                })
                continue
            }

            // rule 1: grammar.
            if (!GRAMMAR.test(value)) {
                problems.push({
                    ...at,
                    value: `"${value}"`,
                    why: `does not match the grammar \`{scope}-{element}[-{part}]\` — lowercase kebab, at least two\n  segments, ASCII only. \`.\` and \`:\` are CSS-significant and would need escaping inside a Java\n  string literal; non-ASCII is the fingerprint of a translated string pasted in.`,
                })
                continue
            }

            // rule 2: declared scope.
            const scope = value.split('-')[0]
            const twoWordScope = value.split('-').slice(0, 2).join('-')
            const declared = SURFACES.has(scope) || SURFACES.has(twoWordScope)
            const known = SCOPES.has(scope) || SCOPES.has(twoWordScope)
            if (!known || !declared) {
                problems.push({
                    ...at,
                    value: `"${value}"`,
                    why: !known
                        ? `\`${scope}\` is neither a directory under src/features with an index.ts, nor a route segment\n  under src/app. The scope IS the screen attribution, so it has to be one of those.`
                        : `\`${scope}\` is not declared in src/shared/lib/testid-surfaces.ts. A surface cannot come into\n  existence by somebody typing a string — add it there, with its kind, first.`,
                })
                continue
            }

            // rule 7: no state in the id.
            const last = value.split('-').at(-1)
            if (STATE_WORDS.has(last)) {
                problems.push({
                    ...at,
                    value: `"${value}"`,
                    why: `the last segment names state. State belongs in a separate attribute — \`aria-checked\`,\n  \`aria-selected\`, \`aria-expanded\`, \`disabled\`, \`data-open\` — never in the id: QC's selector must\n  not change when the user presses the thing. An id that encodes state can only be *found* while\n  it holds that state, so asserting the negative becomes catching NoSuchElementException, which\n  cannot tell "not selected" from "renamed" from "not rendered yet".`,
                })
                continue
            }

            /*
             * There is deliberately **no** rule that a `TestIdPart` may only appear last.
             *
             * It was written, and it fired on every shell entry: `navigation-tab-bar-home` has `tab`
             * in the middle because `tab-bar` is a compound noun, not the part `tab`. The same would
             * hit `search-bar`, `list-row`, `top-bar` and anything else whose name happens to
             * contain a part word. A linter that cannot tell a compound name from a sub-slot should
             * not be guessing — part *position* is a convention, documented in docs/TEST_IDS.md, and
             * `subTestId` is what actually enforces it where it matters.
             */

            /*
             * No duplicate source occurrence in one file — **unless every occurrence carries the
             * same companion attribute**, which is what disambiguates them.
             *
             * A list item is legal without any exception, because it occurs once in the source and
             * many times in the DOM; counting source occurrences is what makes the rule strict and
             * honest. The exception is for one *logical* control with several implementations:
             * `auth-method-buttons.tsx` renders the email row, the provider row and the QR row from
             * three different components, and they share `auth-provider` + `data-provider-key` on
             * purpose so a suite finds all the ways in with one selector. Requiring three names
             * there would mean the set could not be enumerated, which is the opposite of the point.
             * Without a shared companion, though, a duplicate is exactly the trap this rule is for:
             * two unrelated elements with one name, and a first-match lookup picking one at random.
             */
            const companion = companionsNear(src, match.index, COMPANIONS).find(attr =>
                COMPANIONS.has(attr),
            )
            const previous = seen.get(value)
            if (previous && !(companion && previous.companion === companion)) {
                problems.push({
                    ...at,
                    value: `"${value}"`,
                    why: `already declared in this file at line ${previous.line}${
                        companion || previous.companion
                            ? ', and the two do not share a companion attribute to tell them apart'
                            : ''
                    }. Two occurrences of one name means two elements sharing it, and a first-match\n  lookup returns whichever comes first. A list item needs no exception — it occurs once in the\n  source. One logical control with several implementations may repeat a name **only** if every\n  occurrence carries the same companion (\`data-provider-key\`, \`data-option-value\`, …).`,
                })
                continue
            }
            seen.set(value, { line, companion })

            // The silent-drop check — see `receivers()` for why this is the most valuable rule here.
            const open = src.lastIndexOf('<', match.index)
            const tag = open === -1 ? null : /^<([A-Z][A-Za-z0-9]*)/.exec(src.slice(open))?.[1]
            /*
             * Only a component **defined in this repo** is checkable. `Link` (next/link) and
             * `MenuTrigger` (a base-ui re-export) both forward to the DOM and are not defined here,
             * so flagging them was the first thing this rule got wrong — an unknown tag is assumed
             * to forward, which is what third-party primitives do.
             */
            /*
             * **The two spellings are not interchangeable**, and conflating them was this rule's
             * second bug. A component with a `testId` prop still drops a `data-testid`, because it
             * never spreads the rest of its props — so the check has to know which spelling the call
             * site used.
             */
            const spelling = src.slice(match.index, match.index + 12).startsWith('data-testid')
                ? 'attribute'
                : 'prop'
            const accepts = spelling === 'attribute' ? RECEIVERS.attribute : RECEIVERS.prop
            if (tag && RECEIVERS.local.has(tag) && !accepts.has(tag)) {
                const wanted = spelling === 'attribute' ? 'data-testid' : 'testId'
                const other = spelling === 'attribute' ? 'testId' : 'data-testid'
                const hasOther =
                    spelling === 'attribute' ? RECEIVERS.prop.has(tag) : RECEIVERS.attribute.has(tag)
                problems.push({
                    ...at,
                    value: `"${value}"`,
                    why: hasOther
                        ? `is passed to \`<${tag}>\` as \`${wanted}\`, but that component takes \`${other}\` —\n  so this one is **dropped and never reaches the DOM**. Use \`${other}\` here.`
                        : `is handed to \`<${tag}>\`, which cannot receive it — it neither spreads \`...props\` nor takes\n  a \`testId\` prop, so the attribute is **dropped and never reaches the DOM**. TSX does not\n  type-check hyphenated props, so nothing else will tell you: the id ends up in the catalog and not\n  on the page. Give \`${tag}\` a \`testId\` prop (plus a companion prop for its identity) and put the\n  attribute on the element a person actually presses.`,
                })
            }
        }

        /*
         * ---- a declared `testId` prop must actually be rendered -----------------------------
         *
         * The other half of the silent drop, and the half a call-site check cannot see: a component
         * can accept `testId`, satisfy every rule at every call site, and never put it on an
         * element. `EarningsDayRow` did exactly that for one commit — props threaded, catalog
         * updated, nothing in the DOM. Cheap to check, and invisible otherwise.
         */
        const declares = src.search(/\n\s+testId[,?:]/)
        if (declares !== -1 && !/data-testid=\{/.test(src)) {
            problems.push({
                file: rel,
                line: lineOf(src, declares) + 1,
                value: 'testId',
                why: `is accepted as a prop here but never rendered — there is no \`data-testid={…}\` anywhere in\n  this file. Every call site can be correct and the attribute still never reaches the DOM. Put it\n  on the element a person presses, and derive sub-parts with \`subTestId\`.`,
            })
        }

        // ---- companions must be declared ---------------------------------------------
        for (const match of src.matchAll(/(data-[a-z][a-z-]*(?:-id|-key|-code|-value|-slug))=/g)) {
            const attr = match[1]
            if (attr === 'data-testid' || COMPANIONS.has(attr)) continue
            problems.push({
                file: rel,
                line: lineOf(src, match.index),
                value: attr,
                why: `is not in TESTID_COMPANIONS (src/shared/lib/test-id.ts). The companion vocabulary is closed\n  so the catalog can say, per element type, which attribute carries its identity.`,
            })
        }
    }

    if (problems.length) {
        console.log('data-testid values that do not match the contract:\n')
        for (const problem of problems) {
            console.log(`${problem.file}:${problem.line}`)
            console.log(`  ${problem.value} — ${problem.why}\n`)
        }
        console.log(
            `${problems.length} problem${problems.length === 1 ? '' : 's'}. Grammar: ` +
                '{scope}-{element}[-{part}], lowercase kebab, the scope declared in ' +
                'src/shared/lib/testid-surfaces.ts. See docs/TEST_IDS.md.',
        )
        process.exitCode = 1
        return
    }

    console.log(
        `OK — ${literals} data-testid literal${literals === 1 ? '' : 's'}, ` +
            `${SURFACES.size} declared surfaces, all well-formed.`,
    )
}

main()
