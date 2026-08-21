/**
 * dsh-ui-history, browser half entry: installs the URL ↔ session sync.
 * No services are hard-required — sessions and workspaces are read through
 * `ctx.get` and the plugin no-ops when the shell lacks them.
 *
 * @module dsh-ui-history/client
 */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { installHistorySync } from './history.ts'

/** Parsed chat-path result: the addressed session plus an optional workspace. */
export interface ChatPathParse {
  sessionId: SessionId
  workspaceId?: string
}

export { parseChatPath, chatPathFor } from './history.ts'

/** Required services: none (both faces are optional reads inside the sync). */
export const inject: string[] = []

/**
 * Client plugin body: mirrors the current session into the browser path and
 * opens sessions named by `/chat/…` URLs.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  installHistorySync(ctx)
}
