/**
 * Measure — and, within a budget, prune — the build caches under `.next/`.
 *
 * ```
 * pnpm cache                 # report only; never deletes anything
 * pnpm cache:clean           # prune everything it is safe to prune
 * pnpm cache:preflight       # what `pnpm dev` runs: prune only over budget, silent under it
 * ```
 *
 * ## What actually grows
 *
 * `experimental.turbopackFileSystemCacheForDev` **defaults to `true`** in Next 16
 * (`node_modules/next/dist/server/config-shared.js` — not documented as a default anywhere else),
 * so `next dev` keeps a persistent turbo-tasks store in `.next/dev/cache/turbopack/v<next version>/`
 * as a stream of immutable `.sst` segments. It is what makes a restart compile in seconds instead
 * of minutes, and it is also the thing that filled this disk: a single ~9-hour session wrote 638
 * files totalling **6.9 GB**, in ~250 MB segments, because the store is append-only — an edited
 * module does not overwrite its old entry, it adds a new one, and nothing compacts within a session.
 * Left alone it grows with keystrokes, not with the size of the app.
 *
 * `.next/cache/webpack` is the other one (834 MB when this script was written). That is
 * `next build --webpack`, not dev, and it is pruned on the same terms.
 *
 * ## Why this is a budget and not a `rm -rf`
 *
 * **Several sessions share this working tree**, each possibly with its own dev server. Deleting the
 * turbopack store from under a running one does not error, it corrupts: the server keeps serving
 * from memory and then fails on the next cache read, minutes later, somewhere unrelated. So nothing
 * here deletes a directory that a live process could be holding —
 *
 * - `.next/dev/lock` carries the owning pid; a live pid means hands off.
 * - every `next dev` / `next-server` / `next build` process is checked for a `cwd` inside this
 *   repo, because a second server may have started without taking the lock.
 * - a check that cannot be answered (no `lsof`, an unreadable process) counts as **in use**.
 *
 * Two things are always safe and always pruned: turbopack stores for a Next version that is no
 * longer installed (nothing can read them), and `.next/dev/logs`.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, '.next')

/** The store directory is named for the Next version that wrote it. */
const NEXT_VERSION = JSON.parse(
    readFileSync(path.join(ROOT, 'node_modules/next/package.json'), 'utf8'),
).version

/**
 * Over this, `--preflight` prunes before the dev server starts; under it, the cache is doing its
 * job and paying one cold compile to reclaim disk would be a bad trade. 4 GiB is roughly half a
 * working day of the growth measured above.
 */
const BUDGET_BYTES = Number(process.env.NEXT_DEV_CACHE_BUDGET_GB ?? 4) * 1024 ** 3

const mode = process.argv.includes('--clean')
    ? 'clean'
    : process.argv.includes('--preflight')
      ? 'preflight'
      : 'report'

const fmt = (bytes) => {
    if (bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
    return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/** `du` rather than a JS walk: these trees are hundreds of files and the sizes are all we want. */
const sizeOf = (dir) => {
    if (!existsSync(dir)) return 0
    try {
        const out = execFileSync('du', ['-sk', dir], { encoding: 'utf8' })
        return Number.parseInt(out.trim().split(/\s+/)[0], 10) * 1024
    } catch {
        return 0
    }
}

const isPidAlive = (pid) => {
    try {
        process.kill(pid, 0)
        return true
    } catch (err) {
        // EPERM means it exists and belongs to someone else. Still alive.
        return err.code === 'EPERM'
    }
}

/**
 * Every reason to believe a Next process is using this tree right now.
 *
 * Deliberately conservative: if `lsof` is missing or a process cannot be inspected, the process is
 * reported as a holder. A false "in use" costs some disk; a false "free" costs a corrupted store
 * and an hour of confusing errors.
 */
function findHolders() {
    const holders = []

    const lockPath = path.join(DIST, 'dev/lock')
    if (existsSync(lockPath)) {
        try {
            const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
            if (typeof lock.pid === 'number' && isPidAlive(lock.pid)) {
                holders.push({
                    kind: 'dev',
                    what: `next dev (pid ${lock.pid}, port ${lock.port ?? '?'}) holds .next/dev/lock`,
                })
            }
        } catch {
            holders.push({
                kind: 'both',
                what: '.next/dev/lock is unreadable — assuming a dev server owns it',
            })
        }
    }

    let processes = []
    try {
        processes = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' })
            .split('\n')
            .map((line) => line.trim())
            /**
             * Matched on the **binary**, not on the words. A looser pattern (`next (dev|build)`)
             * matched the shell running this script, because its own command line quotes the
             * command — which reported the build cache as in use by a process that was about to
             * delete it.
             */
            .filter((line) => /(^|[\s/])next-server|next[/\\]dist[/\\]bin[/\\]next\s+(dev|build)\b/.test(line))
            .map((line) => {
                const [, pid, command] = line.match(/^(\d+)\s+(.*)$/) ?? []
                return pid ? { pid: Number(pid), command } : null
            })
            .filter((proc) => proc && proc.pid !== process.pid && proc.pid !== process.ppid)
    } catch {
        // No `ps` at all: the lock check above is all we have, so refuse to prune anything live.
        holders.push({ kind: 'both', what: 'could not list processes — assuming Next is running' })
    }

    for (const proc of processes) {
        let cwd
        try {
            cwd = execFileSync('lsof', ['-a', '-d', 'cwd', '-p', String(proc.pid), '-Fn'], {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
            })
                .split('\n')
                .find((l) => l.startsWith('n'))
                ?.slice(1)
        } catch {
            cwd = undefined
        }
        const kind = /next\s+build\b/.test(proc.command) ? 'build' : 'dev'
        if (cwd === undefined) {
            holders.push({
                kind: 'both',
                what: `pid ${proc.pid} is a Next process whose cwd could not be read`,
            })
        } else if (cwd === ROOT || cwd.startsWith(`${ROOT}${path.sep}`)) {
            holders.push({ kind, what: `pid ${proc.pid} — ${proc.command.slice(0, 72)}` })
        }
    }

    return holders
}

/** A `next dev` does not touch the webpack build cache, and a `next build` does not touch the dev store. */
const blocks = (holders, needs) =>
    holders.filter((h) => h.kind === 'both' || h.kind === needs)

const turbopackRoot = path.join(DIST, 'dev/cache/turbopack')
const storeDirs = existsSync(turbopackRoot)
    ? readdirSync(turbopackRoot, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
    : []

/** A store a version we no longer have wrote: unreadable by anything, prunable unconditionally. */
const staleStores = storeDirs.filter((name) => name !== `v${NEXT_VERSION}`)

const targets = [
    ...staleStores.map((name) => ({
        dir: path.join(turbopackRoot, name),
        label: `.next/dev/cache/turbopack/${name}`,
        why: `written by Next ${name.slice(1)}, not the installed ${NEXT_VERSION}`,
        needs: null,
    })),
    {
        dir: path.join(DIST, 'dev/logs'),
        label: '.next/dev/logs',
        why: 'dev server logs',
        needs: null,
    },
    {
        dir: path.join(turbopackRoot, `v${NEXT_VERSION}`),
        label: `.next/dev/cache/turbopack/v${NEXT_VERSION}`,
        why: 'turbopack dev store — costs one cold compile to rebuild',
        needs: 'dev',
    },
    {
        dir: path.join(DIST, 'cache/webpack'),
        label: '.next/cache/webpack',
        why: 'production build cache (`next build --webpack`)',
        needs: 'build',
    },
]

const measured = targets.map((t) => ({ ...t, size: sizeOf(t.dir) })).filter((t) => t.size > 0)
const total = measured.reduce((sum, t) => sum + t.size, 0)
const overBudget = total > BUDGET_BYTES

if (mode === 'preflight' && !overBudget && staleStores.length === 0) process.exit(0)

const holders = measured.some((t) => t.needs) ? findHolders() : []
const heldBy = (t) => (t.needs ? blocks(holders, t.needs) : [])
const prunable = measured.filter((t) => heldBy(t).length === 0)

if (mode === 'report' || (mode === 'preflight' && overBudget)) {
    console.log(`\n.next build caches — ${fmt(total)} total (budget ${fmt(BUDGET_BYTES)})\n`)
    for (const t of measured) {
        const held = heldBy(t)
        console.log(`  ${fmt(t.size).padStart(9)}  ${t.label}${held.length > 0 ? '  [in use]' : ''}`)
        console.log(`             ${t.why}`)
        for (const h of held) console.log(`             in use by ${h.what}`)
    }
}

if (mode === 'report') {
    console.log(
        overBudget
            ? `\nOver budget. \`pnpm cache:clean\` reclaims ${fmt(prunable.reduce((s, t) => s + t.size, 0))} now` +
                  (holders.length > 0 ? ' (stop the dev servers above to reclaim the rest).' : '.')
            : '\nWithin budget — nothing to do.',
    )
    console.log(
        '\nTo stop the dev store growing at all: NEXT_DEV_DISK_CACHE=0 pnpm dev' +
            '\n(slower cold start, no `.next/dev/cache/turbopack` — see next.config.ts)\n',
    )
    process.exit(0)
}

let reclaimed = 0
for (const t of prunable) {
    rmSync(t.dir, { recursive: true, force: true })
    reclaimed += t.size
    console.log(`  pruned ${fmt(t.size).padStart(9)}  ${t.label}`)
}

if (reclaimed > 0) console.log(`\nReclaimed ${fmt(reclaimed)}.\n`)
else if (mode === 'clean') console.log('Nothing to prune.\n')
