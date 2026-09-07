'use client'

import { useAuth } from '@features/auth'
import { balanceKeys, useBalance } from '@features/balance'
import { useMyChannel } from '@features/channel'
import { env } from '@shared/config/env'
import { useTranslation } from '@shared/i18n/use-translation'
import { normalizeApiError } from '@shared/lib/api/errors'
import { getDeviceInfo } from '@shared/lib/api/request-context'
import { eventBus } from '@shared/lib/event-bus'
import { safeExternalUrl } from '@shared/lib/safe-url'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { INSUFFICIENT_STARS_CODE, miniAppApi, miniAppKeys } from '../api/mini-app-api'
import { buyItemOptionsSchema, type TopupOptions, topupOptionsSchema } from '../api/types'
import { normalizeMiniAppConfig } from '../lib/app-config'
import { frameVersionFor, recordReportedVersion } from '../lib/app-version'
import { buildMiniAppFrameUrl, campaignFromUrl } from '../lib/frame-url'
import {
    canceledReply,
    type Envelope,
    failedReply,
    MINI_APP_ACTIONS,
    okReply,
    parseBridgeMessage,
    type ReplyPayload,
    serializeBridgeMessage,
} from '../lib/protocol'
import type { MiniAppTab } from '../lib/tabs'
import { forgetTabHandlers, registerTabHandlers, useMiniAppStore } from '../store/mini-app-store'

/**
 * One tab's bridge: everything a single framed mini app can ask the host to do.
 *
 * `lib/protocol.ts` says what a message *is*; this says what it *means*. It is a hook rather than
 * a module because every answer needs something only React has here — the active account, the
 * balance, the query cache, the tab's own state.
 *
 * ## One instance per tab, and messages are matched to their own frame
 *
 * The listener is on `window`, so with three tabs open every frame's messages reach all three
 * bridges. Legacy filters on `event.origin` alone, which is not enough: two tabs of the **same
 * app** share an origin, so each one answers the other's `getInfo` and both apps see two replies
 * to a question they asked once. Worse, a `buyItem` from tab A is handled by tab B as well and the
 * purchase is attempted twice.
 *
 * The fix is `event.source === iframe.contentWindow` — identity, not similarity. Origin is still
 * checked, because `source` alone would accept a message from a frame that had navigated somewhere
 * else entirely.
 *
 * ## Every action answers, including the ones that fail
 *
 * A mini app's `jsCall` registers a callback keyed on the action and waits. Legacy leaves four
 * paths with no reply — a failed `getInfo`, `checkRemainingUser`, a network error on `buyItem`,
 * and every unrecognised action — and each of those is an app that shows a spinner forever. So the
 * rule here is: **every handled action posts exactly one reply**, and an unknown action gets one
 * too. The only silent actions are the ones the contract defines as one-way (`loadConfig` is
 * answered anyway, as legacy does; `quitGame` closes the tab, which is the answer).
 */
export interface MiniAppBridge {
    iframeRef: React.RefObject<HTMLIFrameElement | null>
    /**
     * `null` for two different reasons, which `isPreparing` separates: the account context has not
     * settled yet, or the app's URL cannot be framed at all.
     */
    frameUrl: string | null
    /**
     * Still waiting on the account before the URL can be built. The frame shows its loader — which
     * is what it would be showing anyway — rather than the "cannot be opened" message, because
     * nothing is wrong.
     */
    isPreparing: boolean
    /** The reader has been asked to confirm a Star top-up, or `null`. */
    pendingTopup: TopupOptions | null
    isDepositing: boolean
    confirmTopup: () => void
    cancelTopup: () => void
    /** The frame fired `load`. Clears the tab's spinner. */
    onFrameLoad: () => void
}

export function useMiniAppBridge({ tab }: { tab: MiniAppTab }): MiniAppBridge {
    const iframeRef = useRef<HTMLIFrameElement | null>(null)
    const [pendingTopup, setPendingTopup] = useState<TopupOptions | null>(null)
    const [isDepositing, setIsDepositing] = useState(false)

    const { currentUser, activeId } = useAuth()
    const { myChannel, isLoading: isChannelLoading } = useMyChannel()
    const { hasEnoughStars, starShortfall } = useBalance()
    const { t, currentLanguage } = useTranslation()
    const queryClient = useQueryClient()

    const patchTab = useMiniAppStore(state => state.patchTab)
    const reloadTab = useMiniAppStore(state => state.reloadTab)
    const closeTab = useMiniAppStore(state => state.closeTab)
    const openTab = useMiniAppStore(state => state.open)

    /**
     * The frame's `src` — built **once**, and only once there is something true to build it from.
     *
     * ## Frozen, deliberately
     *
     * `frameVersion` and `reloadKey` come from tab state; every other input (account, own slug,
     * locale) is read at the moment the frame boots and then pinned for this mount. A running mini
     * app must not be reloaded out from under somebody because a background refetch of `/me`
     * landed, or because they changed the interface language mid-game — the app is told its
     * parameters once, at boot, exactly as a native WebView is. A genuine reload goes through
     * `reloadKey`, which remounts the element and re-runs this.
     *
     * ## But not frozen *before* the account is known
     *
     * `slug` is part of the URL contract (`docs/MINI_APP.md` §3) and it comes from
     * `MyChannelProvider`, whose query can still be in flight — a hard reload of a space page
     * followed immediately by "Open" is the case. Pinning the URL on the first render would send
     * that app a permanently absent `slug` with no way to correct it, because correcting it means
     * changing `src`, which means reloading the app.
     *
     * So the URL is built on the first render where **`isLoading` is false** — "true only while a
     * request could still change the answer", which is also `false` for a guest, whose channel query
     * never runs at all. Until then `frameUrl` is `null` and the frame shows its loader, which is
     * what it would be showing anyway.
     *
     * A ref rather than state: this is a compute-once memo whose input arrives late, and writing it
     * during the render that first sees a settled context is idempotent — there is no second value
     * it could take.
     */
    const frameUrlRef = useRef<string | null>(null)
    if (frameUrlRef.current === null && !isChannelLoading) {
        frameUrlRef.current = buildMiniAppFrameUrl(tab.config, {
            userId: currentUser?.id ? String(currentUser.id) : null,
            channelSlug: myChannel?.slug ?? null,
            locale: currentLanguage,
            version: tab.frameVersion,
            campaign: campaignFromUrl(typeof window === 'undefined' ? null : window.location.href),
        })
    }
    const frameUrl = frameUrlRef.current

    /**
     * Everything a handler needs, re-pointed on every render.
     *
     * The listener is registered **once** per mount (see the effect below) and closes over this ref
     * instead of over the values. Legacy re-adds its listener whenever any of eight dependencies
     * changes, which on a busy page is several times a second — and each swap has a window in which
     * a message arrives with no listener attached at all. A ref has no such window.
     */
    const latest = useRef({
        tab,
        activeId,
        userId: currentUser?.id ? String(currentUser.id) : null,
        slug: myChannel?.slug ?? null,
        hasEnoughStars,
        starShortfall,
        t,
    })
    latest.current = {
        tab,
        activeId,
        userId: currentUser?.id ? String(currentUser.id) : null,
        slug: myChannel?.slug ?? null,
        hasEnoughStars,
        starShortfall,
        t,
    }

    /** Which envelope this frame speaks. See `lib/protocol.ts`. */
    const envelope = useRef<Envelope | null>(null)

    /**
     * Post a reply into the frame.
     *
     * The target origin is the **app's** origin, never `'*'`. That is the whole containment story
     * for outbound messages: a reply to `getInfo` carries a token, and `'*'` would deliver it to
     * whatever document happened to be in the frame — including one the app navigated itself to.
     */
    const send = useCallback((action: string, payload: ReplyPayload = {}) => {
        const frame = iframeRef.current
        if (!frame?.contentWindow) return
        let origin: string
        try {
            origin = new URL(latest.current.tab.config.url).origin
        } catch {
            return
        }
        for (const message of serializeBridgeMessage(envelope.current, action, payload)) {
            frame.contentWindow.postMessage(message, origin)
        }
    }, [])

    /**
     * The per-app token, through the query cache.
     *
     * `fetchQuery` rather than `useQuery`: the app asks for it imperatively and possibly more than
     * once, and this way two `getInfo` calls in flight together collapse into one request instead
     * of racing. Keyed on account **and** app id, so switching accounts cannot hand an app the
     * previous reader's token.
     *
     * The 30s `staleTime` is a deduplication window, not a cache lifetime — the token's real
     * expiry is not documented (**B82**), so nothing here assumes one; a repeat `getInfo` a minute
     * later asks the service again.
     */
    const fetchAppToken = useCallback(
        (appId: string) =>
            queryClient.fetchQuery({
                queryKey: miniAppKeys.appToken(latest.current.activeId, appId),
                queryFn: ({ signal }) =>
                    miniAppApi.getAppToken(appId, { accountId: latest.current.activeId, signal }),
                staleTime: 30_000,
                gcTime: 30_000,
            }),
        [queryClient],
    )

    /** After anything that moves Star: the figure and both ledgers. `features/balance` says why. */
    const invalidateBalance = useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: balanceKeys.all })
    }, [queryClient])

    /**
     * Offer the reader Star. Returns whether a sheet actually opened.
     *
     * The same `payment:star-purchase-requested` event `useRequireStars` raises, for the same
     * structural reason (`event-bus.ts`): the sheet lives in `features/payment`, which imports
     * `features/balance`, and this feature must not close a cycle by importing it. `ack` is how
     * the caller learns whether anything was listening — a player mounted outside
     * `PaymentProvider` has nobody to open one.
     */
    const offerStars = useCallback((shortfall: number) => {
        let opened = false
        eventBus.emit('payment:star-purchase-requested', {
            shortfall: Number.isFinite(shortfall) && shortfall > 0 ? shortfall : 0,
            ack: () => {
                opened = true
            },
        })
        return opened
    }, [])

    /**
     * Open a link the mini app asked for, in a new tab.
     *
     * ## Three outcomes, not two, and the third one is the browser's
     *
     * `safeExternalUrl` first, always: this URL came from a third party, and `window.open` on a
     * `javascript:` URL executes **in this document**. `noopener` is not optional either — without
     * it the opened page gets a handle on this window and can navigate it.
     *
     * Then `'blocked'`, which is the outcome worth naming. This runs from a `message` handler, and a
     * popup is only allowed while the page has **transient user activation**. It normally does: the
     * spec hands activation from a click inside a frame up to its ancestors, so the reader's tap on
     * a button inside the mini app counts for us too. But it expires, and it is never granted for a
     * message the app sent on a timer or off its own socket — at which point `window.open` returns
     * `null` and nothing happens at all.
     *
     * Legacy cannot tell that case from success and reports `ok` for it, so an app shows "Saved!"
     * over a download that never started. Naming it lets the reply be honest and lets the reader be
     * told why the tab they expected did not appear.
     */
    const openExternal = useCallback((value: unknown): 'opened' | 'blocked' | 'invalid' => {
        const url = safeExternalUrl(value)
        if (!url) return 'invalid'
        const opened = window.open(url, '_blank', 'noopener,noreferrer')
        if (!opened) {
            toast.error(latest.current.t('miniapp_popup_blocked'))
            return 'blocked'
        }
        return 'opened'
    }, [])

    /**
     * Share a URL: the platform sheet, the clipboard where there is none.
     *
     * Takes the URL rather than reading the tab, because there are two callers — the host's own
     * Share control (which shares *the app*) and `executeLink` with `type: 'share'` (which shares
     * whatever the app nominated). Legacy has the first, and for the second calls `navigator.share`
     * unguarded, so on a desktop browser without it that action silently does nothing.
     */
    const shareUrl = useCallback(async (url: string, title?: string) => {
        try {
            if (typeof navigator !== 'undefined' && navigator.share) {
                await navigator.share({ title, url })
                return
            }
            await navigator.clipboard?.writeText(url)
            toast.success(latest.current.t('miniapp_link_copied'))
        } catch {
            /*
             * A cancelled share sheet rejects, and so does a clipboard write the browser refused.
             * Neither is a failure worth a message: the reader either changed their mind or the
             * browser said no to something they can do by hand.
             */
        }
    }, [])

    /** The host's own Share control: the app's Tevi page, or the app itself when it has none. */
    const shareApp = useCallback(() => {
        const { config } = latest.current.tab
        return shareUrl(config.shareableUrl ?? config.url, config.name)
    }, [shareUrl])

    /** So the `TOPUP` handler can refuse a second request without re-registering the listener. */
    const pendingTopupRef = useRef<TopupOptions | null>(null)
    pendingTopupRef.current = pendingTopup

    /**
     * The deposit is in flight — a **ref**, not the `isDepositing` state, and this one is a
     * double-spend guard rather than a rendering concern.
     *
     * `pending` disables the Confirm button, but that only takes effect on the next render, and
     * React batches: two clicks inside one frame both read `isDepositing === false` from the same
     * closure and both send the deposit. A ref is written synchronously, so the second call sees it.
     * The state stays because the dialog renders from it.
     */
    const isDepositingRef = useRef(false)

    const handleMessage = useCallback(
        async (event: MessageEvent) => {
            const frame = iframeRef.current
            if (!frame?.contentWindow || event.source !== frame.contentWindow) return

            const { config, id: tabId } = latest.current.tab
            try {
                if (event.origin !== new URL(config.url).origin) return
            } catch {
                return
            }

            const message = parseBridgeMessage(event.data)
            if (!message) return
            envelope.current = message.envelope

            const { action, options } = message

            switch (action) {
                case MINI_APP_ACTIONS.LOAD_CONFIG: {
                    /*
                     * Answered with the app's own identity, as legacy does, and then the version is
                     * dealt with — in that order. The reply is what the app is waiting for; the
                     * reload, if there is one, discards this frame.
                     */
                    send(
                        action,
                        okReply({
                            config: {
                                app_id: config.id,
                                app_name: config.name,
                                app_url: config.url,
                            },
                        }),
                    )
                    const { version, shouldReload } = recordReportedVersion({
                        appId: config.id,
                        reported: options.version,
                        frameVersion: latest.current.tab.frameVersion,
                        now: Date.now(),
                    })
                    if (shouldReload) reloadTab(tabId, version)
                    return
                }

                case MINI_APP_ACTIONS.GET_USER_INFO: {
                    const appId =
                        typeof options.app_id === 'string' && options.app_id !== ''
                            ? options.app_id
                            : config.id
                    const userInfo: Record<string, unknown> = {
                        user_id: latest.current.userId,
                        user_slug: latest.current.slug,
                        device_id: getDeviceInfo().device_id ?? null,
                        source_url: typeof window === 'undefined' ? null : window.location.href,
                    }
                    /*
                     * No app id, no token — and that is an `ok`, not a failure. The Center and any
                     * app opened by bare URL are in this state, and they still want the account.
                     */
                    if (!appId) {
                        send(action, okReply({ userInfo, userParam: {} }))
                        return
                    }
                    try {
                        const token = await fetchAppToken(appId)
                        send(
                            action,
                            okReply({
                                userInfo: { ...userInfo, user_app_token: token },
                                userParam: {},
                            }),
                        )
                    } catch (error) {
                        /*
                         * Legacy swallows this and replies nothing, which is an app stuck on its
                         * loading screen with no way to know why. The app is told the call failed
                         * and can retry; the reason stays out of the payload — an API error body is
                         * not something to hand a third party.
                         */
                        const apiError = normalizeApiError(error)
                        if (apiError.isCanceled) return
                        send(action, failedReply('token unavailable'))
                    }
                    return
                }

                case MINI_APP_ACTIONS.CHECK_REMAINING_USER:
                    /*
                     * Nothing on the web has a notion of "remaining user slots" — it is a native
                     * concept (`docs/MINI_APP.md` §6.3) and there is no endpoint behind it here.
                     * Answered `ok` with nothing rather than left unanswered, which is what legacy
                     * does (`break`) and is indistinguishable, from inside the app, from a host
                     * that has hung.
                     */
                    send(action, okReply())
                    return

                case MINI_APP_ACTIONS.BUY_ITEM: {
                    const parsed = buyItemOptionsSchema.safeParse(options)
                    if (!parsed.success) {
                        send(action, failedReply('invalid options'))
                        return
                    }
                    try {
                        await miniAppApi.purchaseItem(parsed.data, {
                            accountId: latest.current.activeId,
                        })
                        send(action, okReply({ metadata: parsed.data.metadata }))
                        invalidateBalance()
                    } catch (error) {
                        const apiError = normalizeApiError(error)
                        if (apiError.isCanceled) return
                        /*
                         * **The backend decides affordability, not this client.** A price arrives
                         * from the app and is not to be trusted, and the balance in hand can be
                         * 60 seconds old. So the purchase is attempted and a 422/EC0001 is what
                         * "not enough Star" means — at which point the reader is offered some,
                         * pre-selected to the gap when the app's stated price makes that
                         * computable.
                         */
                        if (apiError.status === 422 && apiError.code === INSUFFICIENT_STARS_CODE) {
                            const shortfall = parsed.data.price
                                ? latest.current.starShortfall(parsed.data.price)
                                : 0
                            if (!offerStars(shortfall))
                                toast.error(latest.current.t('miniapp_purchase_failed'))
                            send(action, failedReply('insufficient stars'))
                            return
                        }
                        toast.error(latest.current.t('miniapp_purchase_failed'))
                        send(action, failedReply('purchase failed'))
                    }
                    return
                }

                case MINI_APP_ACTIONS.TOPUP: {
                    const parsed = topupOptionsSchema.safeParse(options)
                    if (!parsed.success) {
                        send(action, failedReply('invalid options'))
                        return
                    }
                    /*
                     * The one action that does not resolve here. Moving Star out of the account and
                     * into an app's wallet is spending, so it is confirmed by the reader first —
                     * `confirmTopup` / `cancelTopup` finish the exchange. A second request while a
                     * dialog is already up is refused rather than queued: two confirmations for two
                     * amounts, one dialog, is how a reader agrees to the wrong number.
                     */
                    if (pendingTopupRef.current) {
                        send(action, failedReply('another top-up is pending'))
                        return
                    }
                    setPendingTopup(parsed.data)
                    return
                }

                case MINI_APP_ACTIONS.PURCHASE_STAR:
                    if (offerStars(0)) send(action, okReply())
                    else send(action, failedReply('star purchase unavailable'))
                    return

                case MINI_APP_ACTIONS.QUIT_GAME:
                    closeTab(tabId)
                    return

                case MINI_APP_ACTIONS.SHOW_BACK_BUTTON:
                    // Mutually exclusive, as legacy has them: the chrome has one leading slot.
                    patchTab(tabId, { showBackButton: true, showCloseButton: false })
                    return

                case MINI_APP_ACTIONS.SHOW_CLOSE_BUTTON:
                    patchTab(tabId, { showBackButton: false, showCloseButton: true })
                    return

                case MINI_APP_ACTIONS.EXECUTE_LINK: {
                    const meta = (options.metadata ?? {}) as Record<string, unknown>
                    const type = typeof meta.type === 'string' ? meta.type.toLowerCase() : ''

                    if (type === 'app') {
                        /*
                         * An app opening another app — this is how a row in the Mini App Center
                         * launches what it names. A new tab, through the same vetting every other
                         * entry point goes through; no `requireAuth`, because a running mini app is
                         * already behind it.
                         */
                        const next = normalizeMiniAppConfig(
                            {
                                id: (meta.app_key ?? null) as string | null,
                                name: (meta.title ?? null) as string | null,
                                url: (meta.app_url ?? null) as string | null,
                                iconUrl: (meta.app_icon ?? null) as string | null,
                                shareableUrl: (meta.space_url ?? null) as string | null,
                            },
                            latest.current.t('miniapp_fallback_name'),
                        )
                        if (next) openTab(next, frameVersionFor(next.id, Date.now()))
                        return
                    }
                    if (type === 'share') {
                        const url = safeExternalUrl(meta.link)
                        if (url) {
                            void shareUrl(
                                url,
                                typeof meta.title === 'string' ? meta.title : undefined,
                            )
                        }
                        return
                    }
                    /*
                     * `space_url` outranks `link` when no type is given — the contract's rule
                     * (§6.9), and it is the useful one: a Tevi deep link is somewhere this app can
                     * actually go.
                     */
                    openExternal(meta.space_url ?? meta.link)
                    return
                }

                case MINI_APP_ACTIONS.SCAN_QR_CODE:
                    /*
                     * Not "not implemented yet" — a browser has no camera scanner to open, and the
                     * frame is deliberately not delegated camera access (`frame-url.ts`). Answered
                     * so the app can fall back to asking the reader to type the code.
                     */
                    send(action, failedReply('not supported on web'))
                    return

                case MINI_APP_ACTIONS.DOWNLOAD_MEDIA: {
                    /*
                     * Opened in a new tab rather than saved. `<a download>` is ignored for a
                     * cross-origin URL — the attribute only applies same-origin — so a hidden
                     * anchor click (legacy's approach) navigates instead of downloading, and
                     * claiming otherwise in the reply would be a lie the app builds a "Saved!"
                     * toast on. The reader saves it from there.
                     */
                    const outcome = openExternal(options.url)
                    if (outcome === 'opened') send(action, okReply())
                    else
                        send(
                            action,
                            failedReply(outcome === 'blocked' ? 'popup blocked' : 'invalid url'),
                        )
                    return
                }

                case MINI_APP_ACTIONS.CREATE_POST:
                    // The composer does not exist in this app yet. When it does, this opens it
                    // pre-filled — the payload is `{ text, type, url }`.
                    send(action, failedReply('not supported on web'))
                    return

                case MINI_APP_ACTIONS.SETTING_BUTTON_CLICKED:
                    send(action, okReply())
                    return

                case MINI_APP_ACTIONS.SHARE_BUTTON_CLICKED:
                    void shareApp()
                    send(action, okReply())
                    return

                case MINI_APP_ACTIONS.RELOAD_BUTTON_CLICKED:
                    reloadTab(tabId)
                    return

                case MINI_APP_ACTIONS.TERM_BUTTON_CLICKED:
                    openExternal(`${env.NEXT_PUBLIC_BASE_URL}/terms`)
                    return

                case MINI_APP_ACTIONS.PRIVACY_BUTTON_CLICKED:
                    openExternal(`${env.NEXT_PUBLIC_BASE_URL}/privacy`)
                    return

                default:
                    /*
                     * An action this host does not know — a newer app against an older web player.
                     * Answered, because the alternative is the app waiting on a callback that will
                     * never fire, and "unknown action" is something its own logs can show.
                     */
                    send(action, failedReply('unknown action'))
                    return
            }
        },
        [
            send,
            fetchAppToken,
            invalidateBalance,
            offerStars,
            openExternal,
            shareApp,
            shareUrl,
            patchTab,
            reloadTab,
            closeTab,
            openTab,
        ],
    )

    useEffect(() => {
        const listener = (event: MessageEvent) => {
            void handleMessage(event)
        }
        window.addEventListener('message', listener)
        return () => window.removeEventListener('message', listener)
    }, [handleMessage])

    const confirmTopup = useCallback(async () => {
        const options = pendingTopupRef.current
        if (!options || isDepositingRef.current) return
        const action = MINI_APP_ACTIONS.TOPUP

        /*
         * Checked here and **not** by `useRequireStars`: that hook wraps a callback and diverts,
         * which is right for a button, but this path owes the mini app a reply either way. The
         * balance is the local one and it can be stale — a false negative costs the reader a trip
         * through the purchase sheet, where the real figure is shown. B82 asks whether the deposit
         * endpoint answers `EC0001` like `purchase/` does, which would let this go the same way
         * `buyItem` does and let the server decide.
         */
        if (!latest.current.hasEnoughStars(options.amount)) {
            setPendingTopup(null)
            if (!offerStars(latest.current.starShortfall(options.amount))) {
                toast.error(latest.current.t('miniapp_topup_failed'))
            }
            send(action, failedReply('insufficient stars'))
            return
        }

        isDepositingRef.current = true
        setIsDepositing(true)
        try {
            await miniAppApi.depositStars(options, { accountId: latest.current.activeId })
            setPendingTopup(null)
            send(action, okReply({ metadata: options.metadata }))
            invalidateBalance()
        } catch (error) {
            const apiError = normalizeApiError(error)
            setPendingTopup(null)
            if (!apiError.isCanceled) {
                toast.error(latest.current.t('miniapp_topup_failed'))
                send(action, failedReply('deposit failed'))
            }
        } finally {
            isDepositingRef.current = false
            setIsDepositing(false)
        }
    }, [offerStars, send, invalidateBalance])

    const cancelTopup = useCallback(() => {
        if (isDepositingRef.current) return
        setPendingTopup(null)
        // `cancel`, not a failure: the contract distinguishes them and an app shows different copy.
        send(MINI_APP_ACTIONS.TOPUP, canceledReply())
    }, [send])

    const onFrameLoad = useCallback(() => {
        patchTab(latest.current.tab.id, { isLoading: false })
    }, [patchTab])

    /**
     * The chrome's controls, handed to the store's registry so the tab strip can call them.
     *
     * Re-registered whenever a callback changes and dropped on unmount — a stale `close` belonging
     * to a frame that is gone would post into nothing and then close a tab by id that no longer
     * exists.
     */
    useEffect(() => {
        const tabId = tab.id
        registerTabHandlers(tabId, {
            back: () => send(MINI_APP_ACTIONS.BACK_BUTTON_CLICKED),
            close: () => {
                /*
                 * Told, then closed. The app asked for this button, so it gets the chance to save
                 * — and the close is not conditional on it answering, because a frozen app must
                 * still be closable.
                 */
                send(MINI_APP_ACTIONS.CLOSE_BUTTON_CLICKED)
                closeTab(tabId)
            },
            reload: () => reloadTab(tabId),
            share: () => void shareApp(),
            settings: () => send(MINI_APP_ACTIONS.SETTING_BUTTON_CLICKED),
        })
        return () => forgetTabHandlers(tabId)
    }, [tab.id, send, closeTab, reloadTab, shareApp])

    return {
        iframeRef,
        frameUrl,
        isPreparing: frameUrl === null && isChannelLoading,
        pendingTopup,
        isDepositing,
        confirmTopup,
        cancelTopup,
        onFrameLoad,
    }
}
