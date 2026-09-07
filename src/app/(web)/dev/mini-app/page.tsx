'use client'

import { OpenMiniAppButton, useAutoOpenMiniApp, useMiniApp } from '@features/mini-app'
import { miniAppCenterConfig, TopupConfirmDialog, useMiniAppStore } from '@features/mini-app/dev'
import { Button } from '@shared/ui/button'
import { notFound } from 'next/navigation'
import { useState } from 'react'

/**
 * Dev-only harness for the mini-app player: `pnpm dev`, then open `/dev/mini-app`.
 * 404s in production (`proxy.ts` stops the request; the `notFound()` below is the belt to that
 * braces).
 *
 * It exists because **every real way in needs something a developer does not have**: a space whose
 * creator has attached a mini app, or a published app in the Mini App Center. The window, the tab
 * strip, the drag and the resize are otherwise unreachable, and so is the top-up dialog, which is
 * behind a running app posting `action.user.billy.topup`.
 *
 * ## What is real here, and what is not
 *
 * **Real:** the store, the tab rules, the window geometry, the bridge, and `MiniAppHost` — which is
 * mounted by `session-providers.tsx`, so the player on this page is the shipped one. Opening an app
 * here goes through `useMiniApp().open`, so the sign-in gate and the URL vetting are the real ones
 * too. A signed-out developer gets the sign-in dialog, which is correct and is worth seeing.
 *
 * **Not real:** the apps. `example.com` frames nothing useful and speaks no bridge — it is there to
 * exercise the *chrome* (tabs, dedup, the cap, drag, resize, minimise). To exercise the **bridge**,
 * point one of the buttons at a local page that posts
 * `{ action: 'action.user.core.getInfo', options: '{}' }` to `window.parent`; `docs/MINI_APP.md` has
 * a copy-pasteable one.
 *
 * The top-up dialog is previewed **directly**, with no request behind it: `onConfirm` here does
 * nothing, because a harness must not be able to move Star. The amount goes through the real
 * formatter, so the one thing worth looking at — a large figure in the reader's own locale — is the
 * one production would render.
 */
export default function DevMiniAppPage() {
    if (process.env.NODE_ENV === 'production') notFound()
    return <Preview />
}

/** Three fake spaces, in the loose shape the action row actually holds. */
const SPACES = [
    {
        has_mini_app: true,
        mini_app_url: 'https://example.com/?app=alpha',
        mini_app_id: 'app-alpha',
        name: 'Alpha Arcade',
        shareable_url: 'https://tevi.com/@alpha',
        images: { thumb: null },
    },
    {
        has_mini_app: true,
        mini_app_url: 'https://example.org/?app=beta',
        mini_app_id: 'app-beta',
        name: 'Beta Bet with a rather long name indeed',
        shareable_url: null,
        images: { thumb: null },
    },
    // The common shape, and the one worth having on screen: the button renders nothing at all.
    { has_mini_app: false, mini_app_url: null, name: 'No app here', images: { thumb: null } },
]

function Preview() {
    const { open, openCenter, close, tabCount } = useMiniApp()
    const [topup, setTopup] = useState<number | null>(null)
    const [autoOpen, setAutoOpen] = useState(false)
    const tabs = useMiniAppStore(state => state.tabs)
    const rect = useMiniAppStore(state => state.rect)
    const isMinimized = useMiniAppStore(state => state.isMinimized)

    return (
        <main className="mx-auto flex w-full max-w-[612px] flex-col gap-6 p-4">
            <h1 className="type-title-t1-semibold text-(--text-title)">Mini app player</h1>

            <section className="flex flex-col gap-2">
                <h2 className="type-dense-strong text-(--text-body)">Open</h2>
                <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="medium" onClick={openCenter}>
                        Mini App Center
                    </Button>
                    {SPACES.slice(0, 2).map(space => (
                        <Button
                            key={space.mini_app_id}
                            variant="secondary"
                            size="medium"
                            onClick={() =>
                                open({
                                    id: space.mini_app_id,
                                    name: space.name,
                                    url: space.mini_app_url,
                                })
                            }
                        >
                            {space.name}
                        </Button>
                    ))}
                    <Button
                        variant="secondary"
                        size="medium"
                        // Same app, different hash route: must switch to the open tab, not open a
                        // second copy. The rule is `miniAppDedupKey`.
                        onClick={() =>
                            open({
                                id: 'app-alpha',
                                name: 'Alpha Arcade',
                                url: 'https://example.com/?app=alpha#/lobby',
                            })
                        }
                    >
                        Alpha again (dedup)
                    </Button>
                    <Button
                        variant="secondary"
                        size="medium"
                        // Six opens against a cap of five: the leftmost tab is evicted.
                        onClick={() => {
                            for (let index = 0; index < 6; index += 1) {
                                open({
                                    id: `bulk-${index}`,
                                    name: `App ${index}`,
                                    url: `https://example.com/?bulk=${index}`,
                                })
                            }
                        }}
                    >
                        Open six (tab cap)
                    </Button>
                    <Button variant="ghost" size="medium" onClick={close} disabled={tabCount === 0}>
                        Close player
                    </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                    {/*
                     * The **only** thing on this page that goes around the shipped path, and it is
                     * here because the shipped path is a sign-in gate: `useMiniApp().open` composes
                     * `useRequireAuth`, so a signed-out developer pressing anything above gets the
                     * login dialog and never sees the window. That is correct behaviour and worth
                     * seeing once — but it also makes the surface this page exists to preview
                     * unreachable without credentials.
                     *
                     * Everything past this call is still real: the store, the tab rules, the
                     * geometry and the bridge. Only the gate is skipped, which is why it is one
                     * clearly-labelled button rather than the default.
                     */}
                    <Button
                        variant="ghost"
                        size="medium"
                        onClick={() => {
                            const center = miniAppCenterConfig('Mini App Center')
                            useMiniAppStore.getState().open(center, null)
                        }}
                    >
                        Open without the sign-in gate (dev)
                    </Button>
                </div>
                <p className="type-caption-meta text-(--text-subtitle)">
                    The frames are `example.com` — they render a placeholder page and speak no
                    bridge. Drag the strip, grab an edge, minimise, maximise; below 900px the window
                    goes full-screen and neither drag nor resize is attached at all.
                </p>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-dense-strong text-(--text-body)">Action row button</h2>
                <div className="flex flex-col gap-2 rounded-xl bg-(--background-surface) p-3">
                    {SPACES.map(space => (
                        <div key={space.name} className="flex items-center gap-2">
                            <span className="type-dense-default min-w-0 flex-1 truncate text-(--text-body)">
                                {space.name}
                            </span>
                            {/* The real component, deciding for itself whether it exists. */}
                            <OpenMiniAppButton channel={space} />
                        </div>
                    ))}
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-dense-strong text-(--text-body)">
                    Auto-open on entering a space
                </h2>
                <div className="flex gap-2">
                    <Button
                        variant="secondary"
                        size="medium"
                        onClick={() => setAutoOpen(current => !current)}
                    >
                        {autoOpen ? 'Unmount' : 'Mount'} a mini-app space
                    </Button>
                </div>
                {autoOpen && <AutoOpenProbe />}
                <p className="type-caption-meta text-(--text-subtitle)">
                    Mounts the real `useAutoOpenMiniApp` with a fake space, the way
                    `ChannelViewerActions` does. **Signed out, nothing should happen** — no player
                    and no sign-in dialog, which is the property that matters: a page load must
                    never raise a login dialog by itself. Signed in, the app opens. Unmount and
                    remount to replay it; the rules it decides by are `lib/auto-open.ts`, which is
                    tested.
                </p>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-dense-strong text-(--text-body)">Top-up confirmation</h2>
                <div className="flex gap-2">
                    <Button variant="secondary" size="medium" onClick={() => setTopup(500)}>
                        500 Stars
                    </Button>
                    <Button variant="secondary" size="medium" onClick={() => setTopup(1_250_000)}>
                        1,250,000 Stars
                    </Button>
                </div>
                <TopupConfirmDialog
                    amount={topup}
                    pending={false}
                    onConfirm={() => setTopup(null)}
                    onCancel={() => setTopup(null)}
                />
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-dense-strong text-(--text-body)">Store</h2>
                {/* The state the player is actually in — the fastest way to see a rule misfire. */}
                <pre className="type-caption-meta overflow-x-auto rounded-xl bg-(--background-surface) p-3 text-(--text-body)">
                    {JSON.stringify(
                        {
                            isMinimized,
                            rect,
                            tabs: tabs.map(tab => ({
                                name: tab.config.name,
                                v: tab.frameVersion,
                                reloadKey: tab.reloadKey,
                                isLoading: tab.isLoading,
                            })),
                        },
                        null,
                        2,
                    )}
                </pre>
                <p className="type-caption-meta text-(--text-subtitle)">
                    `v` stays null here: it is only written once an app reports its version over the
                    bridge, and `example.com` reports nothing. See `lib/app-version.ts`.
                </p>
            </section>
        </main>
    )
}

/**
 * The auto-open hook, mounted the way the real action row mounts it — nothing else.
 *
 * A component of its own because the hook has to *mount* to run, so a toggle above it is the only
 * way to replay the effect without reloading the page.
 */
function AutoOpenProbe() {
    useAutoOpenMiniApp(SPACES[0])
    return null
}
