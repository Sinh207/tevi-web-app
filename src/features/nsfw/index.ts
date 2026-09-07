/**
 * The sensitive-content gate — one question ("are you over 18, for this space?"), asked by every
 * surface that can show a space's content: the space itself, a live event, a post.
 *
 * The panel owns both routes past it and the auth requirement; a caller decides only where it appears
 * and what to reveal once the gate opens. The consent store is lower still, in
 * `shared/lib/nsfw-consent.ts`, because `AuthProvider` erases it with the rest of an account's traces.
 *
 * It used to be a **dialog**, and that was wrong for the same reason on every surface: a modal
 * interrupts what somebody is doing, while this *is* the state of the thing they asked for. See
 * `nsfw-gate-panel.tsx`. A future post gate wants the same shape — a covered post with a way to
 * uncover it — so nothing keeps the dialog around for it.
 */

export { NsfwGatePanel } from './components/nsfw-gate-panel'
export { NsfwInfoDialog } from './components/nsfw-info-dialog'
export { useNsfwGate } from './hooks/use-nsfw-gate'
