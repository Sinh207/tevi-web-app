'use client'

import { useRequireAuth } from '@features/auth'
import { openPostComposer } from '@features/post'
import { useTranslation } from '@shared/i18n/use-translation'
import type { TeviIconName } from '@shared/ui/icon-names'
import { useState } from 'react'
import { TILE } from '../lib/menu-tiles'

/** One row of the Create list. `undefined` `onSelect` is what "not ready" means — see below. */
export interface CreateOption {
    key: 'post' | 'event'
    label: string
    /** The second line — what the option is for. `ListRow` is a two-line shape; legacy's create
     *  rows carry the same. */
    hint: string
    icon: TeviIconName
    /** The 32px tile colour, for the surfaces that draw `List/Action` rows. */
    tile: string
    /** Omitted while the flow does not exist — the row is then `disabled`, behind a badge. */
    onSelect?: () => void
}

/**
 * The shell's **Create** affordance — the rail's accent `+` and the tab bar's FAB. It offers a
 * choice of two, and only one of them is app-only.
 *
 * ## The two options are not the same kind of "not on the web"
 *
 * - **Create a post** opens the composer (`PostComposerDialog`, mounted once by the session stack
 *   and reached through its store — both navigation shells are in the DOM at once, so a dialog
 *   rendered from here would be two dialogs). It carried no `onSelect` while the composer did not
 *   exist, and every surface rendered it `disabled` behind a "Coming soon" badge; that is still
 *   what `CreateOptionRow` does for a row with no action, and still the right shape for the next
 *   one that arrives without a destination.
 * - **Create event** is genuinely app-only, permanently as far as this client is concerned: the
 *   web has never been able to broadcast, and legacy's own Go Live row opens a QR saying so. So
 *   this is the one option that raises `GetAppDialog`.
 *
 * ## Why the options live in a hook and the rendering does not
 *
 * Two surfaces draw this list and they are different objects: above `md` the rail opens an
 * `ActionMenu` popover beside itself, below `md` the FAB opens a dialog (there is no bottom sheet
 * in this app — the DS draws none). Both are the same two choices with the same two meanings, so
 * the list is data and each shell renders it, the way `features/navigation/lib/menu-rows.ts`
 * already treats the drawer's rows. What must not be duplicated is which option is app-only.
 *
 * The **`data-testid` is each shell's**, not this hook's: both navigation shells are in the DOM at
 * once (`docs/TEST_IDS.md` §5) and a leaf name reused across two of them is a lookup that silently
 * takes whichever comes first in document order.
 *
 * ## The gate is on the row, not on the trigger
 *
 * The menu opens for anybody, and the login prompt is raised by the *row* that needs an account —
 * legacy's own shape (`iconBtnCreate/createPost/index.js`): a guest sees what Create offers first,
 * and is asked to sign in only when they pick something that needs it. The surface closes before
 * the login dialog opens, for the same no-stacked-dialogs reason as below.
 *
 * Only `post` is gated. `event` raises the get-the-app prompt for anybody, as legacy's
 * `createLive` does — it creates nothing on the web, so there is nothing to sign in for.
 *
 * An anonymous session is not an account — `isAuthenticated` is `id && !anonymous` — so the
 * visitor every page silently carries still gets the prompt.
 */
export function useCreateAction() {
    const { t } = useTranslation()
    const requireAuth = useRequireAuth()
    /** The options surface: the rail's popover, or the tab bar's dialog. */
    const [open, setOpen] = useState(false)
    /** The app-only prompt, raised by the `event` option. */
    const [appPromptOpen, setAppPromptOpen] = useState(false)

    const composePost = requireAuth(() => openPostComposer())

    const options: CreateOption[] = [
        {
            key: 'post',
            label: t('nav_create_post'),
            hint: t('nav_create_post_hint'),
            icon: 'memo-pen',
            tile: TILE.indigo,
            onSelect: () => {
                /*
                 * Closes the options surface, then opens the composer — the same ordering the
                 * `event` row uses below, and for the same reason: two stacked dialogs put the
                 * composer's backdrop over the list it came from.
                 *
                 * The composer itself is mounted **once**, by the session stack, and reached
                 * through its store rather than rendered here: both navigation shells are in the
                 * DOM at once, so a dialog rendered by this hook would be two dialogs.
                 */
                setOpen(false)
                composePost()
            },
        },
        {
            key: 'event',
            label: t('nav_create_event'),
            /*
             * Legacy's own second line is "Create a broadcast Live", which under a title already
             * reading *Create event* repeats the verb twice — it works there because legacy titles
             * that row "Go Live". Reworded rather than copied, and flagged here because legacy is
             * otherwise the spec: its numbers and behaviour are ported as they stand, and a
             * divergence is stated at the call site rather than left to be noticed in a diff.
             */
            hint: t('nav_create_event_hint'),
            icon: 'signal-stream',
            tile: TILE.error,
            onSelect: () => {
                /*
                 * Closes the options surface **and** opens the prompt. In the popover the first
                 * call is redundant — base-ui closes a menu on item press — but the tab bar's
                 * dialog does not close itself, and two stacked dialogs is the one outcome to
                 * avoid: the prompt's own backdrop would land on the list behind it.
                 */
                setOpen(false)
                setAppPromptOpen(true)
            },
        },
    ]

    return {
        options,
        /** Title for the surface that needs one — the dialog has a header, the popover does not. */
        title: t('nav_create_title'),
        /** The badge beside the title on a row with no action yet — visible, not `sr-only`. */
        unavailableLabel: t('nav_create_post_unavailable'),
        open,
        /**
         * For the controlled `open` of a `Menu` or `Dialog` root. Not gated — a guest sees the
         * options too; the gate is on the `post` row.
         */
        onOpenChange: setOpen,
        /** Spread onto `GetAppDialog`, which takes `open` / `onOpenChange` / `title` / `body`. */
        appPrompt: {
            open: appPromptOpen,
            onOpenChange: setAppPromptOpen,
            title: t('nav_create_event_app_title'),
            body: t('nav_create_event_app_body'),
        },
    }
}
