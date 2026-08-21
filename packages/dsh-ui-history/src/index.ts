/**
 * dsh-ui-history, node half.
 *
 * Serves the SPA index for chat deep-link paths so a hard refresh (or a
 * pasted bookmark) on a session URL never hits the frontend-static 404:
 *
 *   /chat/{sessionId}                  — ungrouped session
 *   /w/{workspaceId}/chat/{sessionId}  — session accounted under a workspace
 *
 * The shipped frontend-static fallback answers unknown paths with an empty
 * 404 (it has no SPA history fallback), which blanks the page before the
 * client bundle can run. These prefix routes claim the chat path shapes and
 * render the same index.html as the app root — preserving the URL so the
 * browser half can open the named session on boot — while every other path
 * keeps the original 404 behavior.
 *
 * @module dsh-ui-history
 */

import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'

/** Stable plugin name. */
export const name = 'dsh-ui-history'

/** Services required before the deep-link routes can be registered. */
export const inject = ['webServer']

/** Parse a chat-scoped pathname: [chat, id] | [w, workspaceId, chat, id]. */
function parseChatPath(pathname: string): { sessionId: string; workspaceId?: string } | null {
  const segments = pathname.split('/').filter((part) => part !== '')
  if (segments.length === 2 && segments[0] === 'chat' && segments[1] !== '') {
    return { sessionId: decodeURIComponent(segments[1]!) }
  }
  if (
    segments.length === 4
    && segments[0] === 'w'
    && segments[2] === 'chat'
    && segments[1] !== ''
    && segments[3] !== ''
  ) {
    return { sessionId: decodeURIComponent(segments[3]!), workspaceId: decodeURIComponent(segments[1]!) }
  }
  return null
}

/**
 * Build the deep-link handler: render the SPA index for chat-shaped paths.
 * The HTML is fetched from the loopback app root so every index tap applies
 * (module graph, password gate, …); only the URL stays on the deep link.
 * @param ctx - plugin context carrying the webServer service.
 */
function deepLinkHandler(ctx: Context): WebRoute['handler'] {
  return async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405)
      res.end()
      return
    }
    const rawPath = new URL(req.url ?? '/', 'http://x').pathname
    const pathname = decodeURIComponent(rawPath)
    if (parseChatPath(pathname) === null) {
      // Not one of our path shapes — keep the original 404 behavior.
      res.writeHead(404)
      res.end()
      return
    }
    try {
      const upstream = await fetch(`http://127.0.0.1:${ctx.webServer.port}/`, {
        method: req.method,
        headers: req.method === 'HEAD' ? undefined : { accept: 'text/html' },
      })
      const body = await upstream.text()
      res.writeHead(upstream.status, { 'content-type': 'text/html; charset=utf-8' })
      res.end(body)
    } catch (error) {
      ctx.logger.warn(`dsh-ui-history: deep-link render failed: ${String(error)}`)
      res.writeHead(502)
      res.end()
    }
  }
}

/**
 * Mount the deep-link SPA routes for chat paths.
 * @param ctx - plugin context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/chat',
    handler: deepLinkHandler(ctx),
  }), 'dsh-ui-history: /chat deep-link route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/w',
    handler: deepLinkHandler(ctx),
  }), 'dsh-ui-history: /w deep-link route')
}
