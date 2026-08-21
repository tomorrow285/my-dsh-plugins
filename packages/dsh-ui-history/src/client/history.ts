/**
 * dsh-ui-history, browser half: mirrors the current session into the browser
 * path so every session is addressable:
 *
 *   /chat/{sessionId}                      — ungrouped session
 *   /w/{workspaceId}/chat/{sessionId}      — session accounted under a workspace
 *
 * Two directions are kept in sync:
 *
 *   - session → URL: while `sessions.list`'s `current` changes, the path is
 *     rewritten (replaceState, no history pollution). The workspace prefix is
 *     derived from the workspaces list account, when one is known.
 *   - URL → session: on initial load and on `popstate` (back/forward or manual
 *     URL edit), a `/chat/{id}` path opens that session; the optional
 *     `/w/{workspaceId}` prefix is validated against the workspace account but
 *     never blocks opening the named session.
 *
 * Pure logic — no UI, no styles, no host RPC. Both services are optional reads
 * (`ctx.get`) so the plugin degrades to a no-op if the shell lacks them.
 *
 * @module dsh-ui-history/client
 */

import type {
  ClientContext,
  ISessions,
  IWorkspaces,
  SessionId,
} from '@deepseek-ai/dsh-client-runtime/client'

/** Root chat path prefix. */
const CHAT_PREFIX = '/chat/'

/** Workspace-scoped chat path prefix. */
const WORKSPACE_CHAT_PREFIX = '/w/'

/** URL-encode one path segment (session / workspace id). */
function segment(value: string): string {
  return encodeURIComponent(value)
}

/** Decode one path segment, tolerating malformed escapes. */
function unsegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Parse a chat-scoped pathname into its optional workspace and required session id. */
export function parseChatPath(pathname: string): { sessionId: SessionId; workspaceId?: string } | null {
  if (!pathname.startsWith(CHAT_PREFIX) && !pathname.startsWith(WORKSPACE_CHAT_PREFIX)) return null
  const segments = pathname.split('/').filter((part) => part !== '')
  // Forms: ['chat', id] | ['w', workspaceId, 'chat', id]
  if (segments.length === 2 && segments[0] === 'chat') {
    const id = segments[1]
    if (id === undefined) return null
    return { sessionId: unsegment(id) as SessionId }
  }
  if (segments.length === 4 && segments[0] === 'w' && segments[2] === 'chat') {
    const workspaceId = segments[1]
    const id = segments[3]
    if (workspaceId === undefined || id === undefined) return null
    return { sessionId: unsegment(id) as SessionId, workspaceId: unsegment(workspaceId) }
  }
  return null
}

/** Find the workspace a session is accounted under, if any. */
function workspaceOf(sessionId: SessionId, workspaces: IWorkspaces | undefined): string | undefined {
  if (workspaces === undefined) return undefined
  const state = workspaces.list.getSnapshot()
  for (const workspace of state.items) {
    if (workspace.sessionIds.includes(sessionId)) return workspace.workspaceId
  }
  return undefined
}

/** Build the canonical chat path for one session (workspace prefix when known). */
export function chatPathFor(sessionId: SessionId, workspaces: IWorkspaces | undefined): string {
  const workspaceId = workspaceOf(sessionId, workspaces)
  return workspaceId === undefined
    ? `${CHAT_PREFIX}${segment(sessionId)}`
    : `${WORKSPACE_CHAT_PREFIX}${segment(workspaceId)}${CHAT_PREFIX}${segment(sessionId)}`
}

/**
 * Install the URL ↔ session sync. All subscriptions/listeners are owned by the
 * returned effect disposer so stop/update tears them down.
 * @param ctx - client root context.
 */
export function installHistorySync(ctx: ClientContext): void {
  const sessions = ctx.get('sessions')
  if (sessions === undefined) return
  const workspaces = ctx.get('workspaces')

  // One-shot deep-link apply: remember the session we already opened from the
  // initial URL so a later list change cannot re-trigger it.
  let appliedInitial = false

  ctx.effect(() => {
    /** Write the path for the current session (no-op when already in place). */
    const syncPath = () => {
      const state = sessions.list.getSnapshot()
      const current = state.current
      const target = current === undefined ? '/' : chatPathFor(current, workspaces)
      if (window.location.pathname !== target) window.history.pushState(null, '', target)
    }

    /** Apply a parsed chat path: open the named session once it is listed. */
    const openPath = (parsed: { sessionId: SessionId; workspaceId?: string }) => {
      const state = sessions.list.getSnapshot()
      // Wait until the session list has materialized (open fails loud on unknown
      // ids; a pending list is simply "not arrived yet", not "missing").
      if (state.phase !== 'ready') return
      // Any path that actually names a listed session settles the initial-URL
      // decision: from here on, list changes only mirror the URL, never reopen.
      if (state.byId[parsed.sessionId] === undefined) {
        // The URL names a session this list will never contain (stale bookmark).
        // Settle the initial-URL decision and adopt the current selection's path.
        appliedInitial = true
        syncPath()
        return
      }
      appliedInitial = true
      if (state.current === parsed.sessionId) {
        // Already current — just align the path (e.g. workspace prefix added).
        syncPath()
        return
      }
      sessions.open(parsed.sessionId)
    }

    /** Handle back/forward and manual URL edits. */
    const onPopState = () => {
      const parsed = parseChatPath(window.location.pathname)
      if (parsed === null) return
      openPath(parsed)
    }

    // Session selection changed → rewrite the path.
    const unlistenSessions = sessions.list.subscribe(() => {
      if (appliedInitial) {
        syncPath()
        return
      }
      // First change after mount: the initial URL (or a default selection) wins.
      const parsed = parseChatPath(window.location.pathname)
      if (parsed !== null) openPath(parsed)
      else syncPath()
    })

    // Workspace accounting changed → the prefix may appear/disappear.
    const unlistenWorkspaces = workspaces?.list.subscribe(() => {
      if (appliedInitial) syncPath()
    })

    window.addEventListener('popstate', onPopState)

    // Kick once for the initial URL / default selection.
    const initial = parseChatPath(window.location.pathname)
    if (initial !== null) openPath(initial)
    else syncPath()

    return () => {
      unlistenSessions()
      unlistenWorkspaces?.()
      window.removeEventListener('popstate', onPopState)
    }
  }, 'dsh-ui-history: url sync')
}
