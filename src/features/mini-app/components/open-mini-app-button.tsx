'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { useMiniApp } from '../hooks/use-mini-app'
import { type MiniAppChannelLike, miniAppFromChannel } from '../lib/app-config'

/**
 * "Open" — a space's mini app, in the viewer's action row.
 *
 * The one entry point that was missing. `features/channel`'s action row already computed
 * `hasMiniApp` and used it to *suppress* the membership and donate buttons — legacy's rule, since a
 * space that leads with its app leads with its app — and the note in that file said the omission
 * was this button, so such a space rendered an empty row where its primary action should be.
 *
 * ## `MiniAppChannelLike`, not `Channel`
 *
 * A structural type, so this component does not import `features/channel`. Which matters because
 * the dependency runs the other way — the action row imports *this* — and the type is four fields
 * the channel DTO happens to carry.
 *
 * (`features/mini-app` does read `useMyChannel` in its bridge, so the two barrels do reference each
 * other. Safe for the same reason `features/membership` ⇄ `features/channel` already is: neither
 * side touches the other at module scope, only inside a component or a hook. Keeping the *type*
 * out of it is what stops that from becoming a type-level cycle as well.)
 *
 * ## `null` is the answer for most spaces, and it is computed from the DTO
 *
 * Rendering nothing when the creator has no app is the common case, so the check is
 * `miniAppFromChannel(...)` returning `null` — the same function the press uses to build the
 * config. One rule, so the button cannot exist for a space the player would then refuse to open.
 *
 * ## One button, three sizes
 *
 * `size` exists because the same affordance now appears in two places with two geometries — the
 * space's action row and a `/following` list row. It is a prop and not a `className`, so the glyph
 * shrinks with the box: the DS pairs 16px with the small button and 20 with the others, and a caller
 * overriding only the height would leave the glyph at 20 inside 28.
 *
 * ## Visible to a guest
 *
 * Legacy hides it unless signed in. Here it renders and the *press* raises the sign-in dialog
 * (`useMiniApp().open` composes `useRequireAuth`), which is this app's rule everywhere: gate the
 * action, never the route or the affordance. Hiding it tells a visitor the space has no app.
 */
export function OpenMiniAppButton({
    channel,
    size = 'large',
    className,
}: {
    channel: MiniAppChannelLike | null | undefined
    /**
     * The DS Button step. `large` is the space's own action row, where this started; `small` is a
     * list row — `/following` draws it in an 80px `List/User Item` beside a kebab, and the action
     * row's 48px button would own the row rather than sit in it.
     *
     * A prop rather than a `className` override, because the glyph has to shrink with the box: at
     * `small` the DS pairs a 16px icon with the 28px button, and a caller passing a height class
     * would get a 20px glyph in it.
     */
    size?: 'small' | 'medium' | 'large'
    className?: string
}) {
    const { t } = useTranslation()
    const { open } = useMiniApp()
    const config = miniAppFromChannel(channel, t('miniapp_fallback_name'))

    if (!config) return null

    const glyph = size === 'small' ? 16 : 20

    return (
        <Button
            data-testid="mini-app-launch"
            variant="accent"
            size={size}
            className={className}
            onClick={() => open(config)}
        >
            <Icon name="grid-category" size={glyph} className={size === 'small' ? '' : 'size-5'} />
            {t('miniapp_open')}
        </Button>
    )
}
