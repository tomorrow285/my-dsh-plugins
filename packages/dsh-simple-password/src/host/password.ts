/**
 * Password record persisted under the DSH home.
 *
 * Stored shape (never the plaintext):
 *   { algo: 'scrypt', salt: <hex>, hash: <hex>, createdAt: <iso> }
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'

/** File name holding the password record under the DSH home. */
const PASSWORD_FILE = 'dsh-simple-password.json'

/** Scrypt parameters (cost / blockSize / parallelization). */
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 } as const

/** Length of the derived key in bytes. */
const KEY_LENGTH = 64

interface PasswordRecord {
  algo: 'scrypt'
  salt: string
  hash: string
  createdAt: string
}

/** Absolute path of the password record file. */
export function passwordFilePath(): string {
  return join(dshHomePath(), PASSWORD_FILE)
}

/** Read the record; `undefined` when absent or malformed. */
export async function readPasswordRecord(): Promise<PasswordRecord | undefined> {
  try {
    const text = await readFile(passwordFilePath(), 'utf8')
    const parsed = JSON.parse(text) as Partial<PasswordRecord>
    if (parsed.algo !== 'scrypt' || typeof parsed.salt !== 'string' || typeof parsed.hash !== 'string') {
      return undefined
    }
    return { algo: parsed.algo, salt: parsed.salt, hash: parsed.hash, createdAt: parsed.createdAt ?? '' }
  } catch {
    return undefined
  }
}

/** Whether a password record currently exists on the server. */
export async function isConfigured(): Promise<boolean> {
  return (await readPasswordRecord()) !== undefined
}

/**
 * Check one candidate password against the stored record.
 * @param record - the stored record (absent ⇒ no password is configured).
 * @param candidate - the plaintext candidate from the browser.
 * @returns whether it matches.
 */
export function verifyPassword(record: PasswordRecord | undefined, candidate: string): boolean {
  if (record === undefined) return false
  try {
    const expected = Buffer.from(record.hash, 'hex')
    const actual = scryptSync(candidate, record.salt, KEY_LENGTH, SCRYPT_OPTS)
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

/**
 * Persist a fresh password record (first-time setup only).
 * @param password - the plaintext chosen by the user.
 * @returns `true` when written; `false` when a record already exists.
 */
export async function setupPassword(password: string): Promise<boolean> {
  if (await isConfigured()) return false
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, KEY_LENGTH, SCRYPT_OPTS).toString('hex')
  const record: PasswordRecord = { algo: 'scrypt', salt, hash, createdAt: new Date().toISOString() }
  await writeFile(passwordFilePath(), JSON.stringify(record, null, 2), 'utf8')
  return true
}
