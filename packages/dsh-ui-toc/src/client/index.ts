/**
 * dsh-ui-toc, browser half: a floating conversation TOC on the right side of
 * the session area. Registers one additive entry in the shell overlay
 * (list/root) — a frame-wide floating layer that stays out of the scroll
 * containers — and renders the TOC strip on wide screens (collapsed rail that
 * expands on hover, mirroring ChatTOC.tsx) plus a floating toggle + slide-in
 * drawer on narrow screens.
 *
 * Data flows through framework props only: the current session id arrives via
 * the standard `useSessions` selector, and the conversation snapshot is read
 * from the session binding's observable face — no host RPC, no private state.
 *
 * @module dsh-ui-toc/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ui-layout SlotMap merge (the shell.overlay seat).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { TocOverlay } from './TocOverlay.tsx'
import { en, NS, zh } from './locales.ts'

export type { TocMessage, TocOverlayProps } from './TocOverlay.tsx'

/** Required services: the slot registry and the copy. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: registers the TOC entry into the shell overlay.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-ui-toc: dictionaries')

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'dsh-ui-toc',
    order: 20,
    locale: NS,
    inject: () => ({
      sessions: ctx.get('sessions'),
    }),
  }, TocOverlay))
}
