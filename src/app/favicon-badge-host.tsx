'use client'

import { useLiveUnreadConversations } from '@features/message/shell'
import { useUnreadInbox } from '@features/notification/shell'
import { useFaviconBadge } from '@shared/hooks/use-favicon-badge'
import { useTitleBadge } from '@shared/hooks/use-title-badge'
import { usePathname } from 'next/navigation'

/**
 * What the browser tab says while something is unread — a red dot on the favicon and the count in
 * the title, `(3) Home · Tevi`. The count is unread **notifications** plus conversations with an
 * unread **message**; both go to zero, and the tab goes back to how Next drew it, when nothing is.
 *
 * Here in `app/` because it is the one place allowed to see both features: the badge is the union
 * of two inboxes that do not know about each other, and neither should learn about the other to
 * draw a browser tab. The drawing is `useFaviconBadge` and `useTitleBadge` (`shared/hooks`), which
 * know nothing about either.
 *
 * Both signals are already live without this mount — `useUnreadInbox` on `inbox_change`,
 * `useLiveUnreadConversations` on the message frames — and both are gated on a real account, so a
 * guest's tab never shows anything. The pathname is passed to the favicon as a re-apply signal, in
 * case a navigation re-renders the head's icon links; the title watches the head itself.
 */
export function FaviconBadgeHost() {
    const { count: notifications, hasUnread } = useUnreadInbox()
    const conversations = useLiveUnreadConversations()
    const pathname = usePathname()

    const unread = (hasUnread ? notifications : 0) + conversations
    useFaviconBadge(unread > 0, pathname)
    useTitleBadge(unread)
    return null
}
