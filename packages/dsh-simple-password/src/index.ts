/**
 * dsh-simple-password, node half.
 *
 * Provides a first-run / unlock password wall for the web GUI:
 *
 *  - password record persisted under the DSH home (scrypt hash, never
 *    plaintext) via `dshHomePath('dsh-simple-password.json')`;
 *  - three JSON routes on the web server:
 *      GET  /dsh-simple-password/status  → { configured: boolean }
 *      POST /dsh-simple-password/verify  → { ok: boolean }   (password check)
 *      POST /dsh-simple-password/setup   → { ok: boolean }   (first-time set)
 *  - an index.html tap that injects the gate script into <head> — it locks
 *    `#root` before any React bundle mounts and shows the password wall until
 *    a verified credential unlocks it.
 *
 * The browser half of the flow lives entirely inside that injected script
 * (plain DOM + fetch + localStorage): no separate client bundle is shipped.
 *
 * @module dsh-simple-password
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
// Type-only: pulls the webServer Context merge (ctx.webServer).
import type {} from '@deepseek-ai/dsh-host-webserver'
import { readPasswordRecord, setupPassword, verifyPassword } from './host/password.ts'
import { GATE_SCRIPT } from './host/gate.ts'

/** Stable plugin name. */
export const name = 'dsh-simple-password'

/** Services required before the gate can mount. */
export const inject = ['webServer']

/** JSON helpers. */
const JSON_HEADER = { 'content-type': 'application/json; charset=utf-8' }
const JSON_CACHE = { 'cache-control': 'no-store' }

/** Read a bounded request body as UTF-8 text. */
function readBody(req: IncomingMessage, maxBytes = 64 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** Parse a JSON body; tolerates empty/malformed input. */
function parseJson(body: string): unknown {
  if (body === '') return {}
  try {
    return JSON.parse(body) as unknown
  } catch {
    return {}
  }
}

/** Send one JSON response. */
function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, { ...JSON_HEADER, ...JSON_CACHE, 'content-length': Buffer.byteLength(body) })
  res.end(body)
}

/**
 * Mount the password gate: routes plus the index tap.
 * @param ctx - plugin context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-simple-password/status',
    handler: async (_req, res) => {
      const configured = await readPasswordRecord() !== undefined
      sendJson(res, 200, { configured })
    },
  }), 'dsh-simple-password: status route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-simple-password/verify',
    handler: async (req, res) => {
      const body = await readBody(req)
      const { password } = parseJson(body) as { password?: unknown }
      if (typeof password !== 'string') {
        sendJson(res, 400, { ok: false, error: 'password required' })
        return
      }
      const record = await readPasswordRecord()
      const ok = verifyPassword(record, password)
      sendJson(res, ok ? 200 : 401, { ok })
    },
  }), 'dsh-simple-password: verify route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-simple-password/setup',
    handler: async (req, res) => {
      const body = await readBody(req)
      const { password } = parseJson(body) as { password?: unknown }
      if (typeof password !== 'string' || password.length === 0) {
        sendJson(res, 400, { ok: false, error: 'password required' })
        return
      }
      const created = await setupPassword(password)
      if (!created) {
        sendJson(res, 409, { ok: false, error: 'a password is already configured' })
        return
      }
      sendJson(res, 200, { ok: true })
    },
  }), 'dsh-simple-password: setup route')

  ctx.effect(() => ctx.webServer.tapIndex((html) => {
    // Inject into <head> before any deferred module script: the gate locks the
    // document synchronously and the React bundle mounts into a hidden #root.
    const script = `<script>${GATE_SCRIPT}<\/script>`
    const head = html.indexOf('<head>')
    if (head === -1) return `${script}${html}`
    return `${html.slice(0, head + 6)}${script}${html.slice(head + 6)}`
  }), 'dsh-simple-password: gate injection')
}
