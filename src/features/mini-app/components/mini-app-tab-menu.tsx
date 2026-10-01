'use client'

import { useOpenConversation } from '@features/message'
import { ActionMenu, ActionMenuContent, ActionMenuItem } from '@shared/components/action-menu'
import { useTranslation } from '@shared/i18n/use-translation'
import { Icon } from '@shared/ui/icon'
import { MenuTrigger } from '@shared/ui/menu'
import { spaceSlugFromUrl } from '../lib/app-config'
import { isMiniAppCenter } from '../lib/center'
import type { MiniAppTab } from '../lib/tabs'
import { getTabHandlers, useMiniAppStore } from '../store/mini-app-store'

/**
 * The active tab's ⋯ menu, hung off its own mark (see `mini-app-tab.tsx`).
 *
 * Rows come from legacy's `tabMenu`, minus one and with each remaining one honest about what it
 * does here:
 *
 * - **Settings** — a `settingButtonClicked` sent *into* the app, so the app draws its own settings.
 *   Only for the Mini App Center, which is legacy's rule: it is the one app known to implement it,
 *   and a row that silently does nothing is worse than an absent row.
 * - **Visit Space** — the app's Tevi page, in a new tab. Only when there is one.
 * - **Send message** — the conversation with the app's space, in this tab: the floating chat window
 *   from `md` up (the player minimises first — it is `z-40` and the window is `z-30`, so it would
 *   open underneath), `/@{slug}/messages` below it. Only when `shareableUrl` names a space.
 * - **Share** — the platform share sheet, or the clipboard where there is none.
 * - **Reload page** — remounts the frame.
 * - **Terms** / **Privacy** — this app's own, in a new tab, because the reader is inside a third
 *   party's screen and those are the terms that still apply.
 *
 * "Send message" used to open legacy's `${shareableUrl}/messages` in a new tab, which 404'd here
 * until direct messages were ported. It now goes through `features/message`'s `useOpenConversation`
 * — the same door as a space's own Send message — so the reader stays in the app they are using. The
 * two barrels reference each other (the chat draws this feature's Open button), which is safe for the
 * reason `features/membership` ⇄ `features/channel` is: neither touches the other at module scope.
 *
 * ## No group divider, and that is not an omission
 *
 * Legacy puts an MUI `<Divider/>` before Reload, splitting "this app" from "this page". There is no
 * equivalent here because `ActionMenuItem` gives **every** row a full-bleed bottom rule, so a
 * divider in one gap is a *second* line rather than a stronger one — and `MenuSeparator`, the only
 * one available, is built for `shared/ui/menu.tsx`'s DS dropdown, which has no per-row rules: it is
 * a hairline inset 8px inside a 17px band. Dropped into this menu it read as one full-width rule,
 * a gap, then a shorter inset rule. It looked like a defect because it was one.
 *
 * The honest options were a uniform list or designing a group treatment for a `shared/components`
 * primitive from inside a feature — which is the thing `action-menu.tsx`'s own doc warns against.
 * Seven ruled rows it is. If grouping ever earns its place, it belongs in that component, for every
 * kebab in the app.
 *
 * ## The actions go through the store's handler registry
 *
 * Reload, Share and Settings all act on the *frame*, which is a sibling in the tree, not a child.
 * `getTabHandlers(id)` is how the chrome reaches it — a module-scoped map rather than state, for
 * the reason `mini-app-store.ts` gives. It always answers, with no-ops when the frame has not
 * registered yet, so a press in that one frame does nothing instead of throwing.
 */
export function MiniAppTabMenu({ tab, children }: { tab: MiniAppTab; children: React.ReactNode }) {
    const { t } = useTranslation()
    const { config } = tab
    const handlers = () => getTabHandlers(tab.id)
    const openConversation = useOpenConversation()
    const minimize = useMiniAppStore(state => state.minimize)
    const spaceSlug = spaceSlugFromUrl(config.shareableUrl)

    return (
        <ActionMenu>
            {/*
             * The **unstyled** base-ui trigger, not `ActionMenuTrigger`: that one carries the DS
             * ghost-button geometry (36×36), and this trigger is a 20px mark inside a 34px pill.
             * `group/mark` is what the mark's hover overlay keys off.
             */}
            <MenuTrigger
                data-testid="mini-app-menu"
                aria-label={t('miniapp_tab_options', { name: config.name })}
                className="group/mark flex flex-none items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-(--text-link)"
            >
                {children}
            </MenuTrigger>
            <ActionMenuContent align="start">
                {isMiniAppCenter(config.url) && (
                    <ActionMenuItem
                        data-testid="mini-app-menu-settings"
                        onClick={() => handlers().settings()}
                    >
                        {t('miniapp_menu_settings')}
                        <Icon name="gear" size={20} className="size-5 flex-none" />
                    </ActionMenuItem>
                )}
                {config.shareableUrl && (
                    <ActionMenuItem
                        data-testid="mini-app-menu-open-space"
                        onClick={() =>
                            window.open(config.shareableUrl!, '_blank', 'noopener,noreferrer')
                        }
                    >
                        {t('miniapp_menu_visit_space')}
                        <Icon
                            name="arrow-up-right-from-square"
                            size={20}
                            className="size-5 flex-none"
                        />
                    </ActionMenuItem>
                )}
                {spaceSlug && (
                    <ActionMenuItem
                        data-testid="mini-app-menu-messages"
                        onClick={() => {
                            minimize()
                            openConversation(spaceSlug)
                        }}
                    >
                        {t('miniapp_menu_send_message')}
                        <Icon name="send" size={20} className="size-5 flex-none" />
                    </ActionMenuItem>
                )}
                <ActionMenuItem
                    data-testid="mini-app-menu-share"
                    onClick={() => handlers().share()}
                >
                    {t('miniapp_menu_share')}
                    <Icon name="share" size={20} className="size-5 flex-none" />
                </ActionMenuItem>
                <ActionMenuItem
                    data-testid="mini-app-menu-reload"
                    onClick={() => handlers().reload()}
                >
                    {t('miniapp_menu_reload')}
                    <Icon name="arrows-rotate" size={20} className="size-5 flex-none" />
                </ActionMenuItem>
                <ActionMenuItem
                    data-testid="mini-app-menu-terms"
                    onClick={() => window.open('/terms', '_blank', 'noopener,noreferrer')}
                >
                    {t('miniapp_menu_terms')}
                    <Icon name="info-circle" size={20} className="size-5 flex-none" />
                </ActionMenuItem>
                <ActionMenuItem
                    data-testid="mini-app-menu-privacy"
                    onClick={() => window.open('/privacy', '_blank', 'noopener,noreferrer')}
                >
                    {t('miniapp_menu_privacy')}
                    <Icon name="shield" size={20} className="size-5 flex-none" />
                </ActionMenuItem>
            </ActionMenuContent>
        </ActionMenu>
    )
}
