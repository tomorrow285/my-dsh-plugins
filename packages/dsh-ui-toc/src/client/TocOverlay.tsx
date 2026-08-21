/**
 * dsh-ui-toc floating overlay. Root-scoped (registered in the shell overlay),
 * so session data comes from the framework standard kit: the current session
 * id arrives through `useSessions`, and the live conversation snapshot is read
 * from that session's binding face (an ObservableSnapshot<ConversationSnapshot>)
 * — the same source the session-scoped slots read via `useSession`.
 *
 * Layout mirrors ChatTOC.tsx on wide screens: a collapsed 36px rail pinned at
 * 40% of the conversation column that expands to 224px on hover, listing the
 * user messages with scroll tracking. On narrow screens (< 920px) it becomes a
 * floating toggle button above the composer that opens a slide-in drawer.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import type {
  ConversationSnapshot,
  ISessions,
  UserMessageNode,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-layout SlotMap merge (the shell.overlay seat).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import styles from './toc.module.css'
// Type-only: pulls the LocaleNamespaceMap merge ('toc' seat).
import type {} from './locales.ts'

/** Content block shape needed for label extraction (a structural slice of ContentBlock). */
type ContentLike = UserMessageNode['content'][number]

const TOC_MIN_WIDTH = 920

/** Stable snapshot for the no-session state (getSnapshot must return cached values). */
const NO_SESSION: ConversationSnapshot | undefined = undefined

/** One TOC row: the chat node's stable context key plus its display label. */
export interface TocMessage {
  /** Stable chat node key — the `data-chat-anchor-key` value of the rendered row. */
  key: string
  label: string
}

/** Injected business face: the sessions service used to bind the current session. */
export interface TocInjected {
  sessions: ISessions | undefined
}

/** Full props of the TOC overlay entry. */
export type TocOverlayProps =
  PropsRuntime<'shell.overlay'>
  & InjectFace<TocInjected>
  & PropsLocale<'toc'>

/** Join the text/image blocks of one user message into a one-line label. */
function messageText(content: readonly ContentLike[], imageLabel: string): string {
  const parts: string[] = []
  for (const block of content) {
    if (block.type === 'text' && block.text.trim() !== '') parts.push(block.text.trim())
    else if (block.type === 'image') parts.push(imageLabel)
  }
  const text = parts.join(' ').trim()
  return text === '' ? '…' : text
}

/** Escape a stable key for use inside an attribute selector. */
function escapeSelector(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\\]]/g, '\\$&')
}

/** Join a few conditional class names. */
function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function TocOverlay({ useSessions, sessions, t }: TocOverlayProps) {
  const currentId = useSessions(s => s.current)
  const session = currentId === undefined ? undefined : sessions?.binding(currentId)?.session
  const snapshot = useSyncExternalStore(
    (onChange) => (session === undefined ? () => {} : session.subscribe(onChange)),
    () => session?.getSnapshot() ?? NO_SESSION,
  )

  // The conversation column the TOC floats over: the chat scrollport.
  const [scrollport, setScrollport] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (currentId === undefined) {
      setScrollport(null)
      return
    }
    setScrollport(document.querySelector<HTMLElement>('[data-conversation-scroll]'))
  }, [currentId])

  const [rect, setRect] = useState<DOMRect | null>(null)
  const [chatVisible, setChatVisible] = useState(false)
  useEffect(() => {
    if (scrollport === null) {
      setRect(null)
      setChatVisible(false)
      return
    }
    const update = () => setRect(scrollport.getBoundingClientRect())
    // The chat view's stable container exists whenever the chat tab is active,
    // regardless of how many messages it holds — so the TOC renders even for a
    // conversation with zero user turns yet.
    const syncChat = () => setChatVisible(scrollport.querySelector('[data-chat-flow]') !== null)
    update()
    syncChat()
    const resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(scrollport)
    const mutationObserver = new MutationObserver(() => {
      update()
      syncChat()
    })
    mutationObserver.observe(scrollport, { subtree: true, childList: true })
    window.addEventListener('resize', update)
    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [scrollport])

  // User messages in chat render order.
  const userMessages = useMemo<TocMessage[]>(() => {
    if (snapshot === undefined) return []
    const out: TocMessage[] = []
    for (const key of snapshot.chat.order) {
      const node = snapshot.chat.nodes.get(key)
      if (node === undefined) continue
      if (node.kind !== 'user' && node.kind !== 'steering') continue
      const data = node.data as UserMessageNode
      out.push({ key: node.key, label: messageText(data.content, t('image')) })
    }
    return out
  }, [snapshot, t])

  // Render whenever the chat view is mounted — no minimum message count.
  const shouldRender = chatVisible && rect !== null
  const mobile = rect !== null && rect.width < TOC_MIN_WIDTH

  // Active tracking: which user message is currently at the top of the view.
  const [activeKey, setActiveKey] = useState<string | null>(null)
  useEffect(() => {
    if (scrollport === null || !shouldRender) {
      setActiveKey(null)
      return
    }
    const compute = () => {
      const containerRect = scrollport.getBoundingClientRect()
      let lastPassed: string | null = null
      let firstVisible: string | null = null
      for (const message of userMessages) {
        const row = document.querySelector<HTMLElement>(
          `[data-chat-anchor-key="${escapeSelector(message.key)}"]`,
        )
        if (row === null) continue
        const top = row.getBoundingClientRect().top
        if (top < containerRect.top) {
          lastPassed = message.key
          continue
        }
        if (top <= containerRect.bottom && firstVisible === null) firstVisible = message.key
        break
      }
      setActiveKey(firstVisible ?? lastPassed)
    }
    compute()
    scrollport.addEventListener('scroll', compute, { passive: true })
    return () => scrollport.removeEventListener('scroll', compute)
  }, [scrollport, userMessages, shouldRender])

  // Keep the active item in view inside the TOC panel.
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (activeKey === null || panelRef.current === null) return
    const item = panelRef.current.querySelector<HTMLElement>(
      `[data-toc-item="${escapeSelector(activeKey)}"]`,
    )
    item?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeKey, userMessages])

  // Mobile drawer open state + Escape to close.
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  const handleItemClick = (key: string) => {
    document.querySelector<HTMLElement>(`[data-chat-anchor-key="${escapeSelector(key)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setOpen(false)
  }

  // Scroll the conversation back to the very top of the scrollport
  // (scrollTop = 0), regardless of how many user messages exist.
  const handleTopClick = () => {
    scrollport?.scrollTo({ top: 0, behavior: 'smooth' })
    setOpen(false)
  }

  if (!shouldRender || rect === null) return null

  if (mobile) {
    const fabStyle: CSSProperties = {
      right: window.innerWidth - rect.right + 12,
      bottom: window.innerHeight - rect.bottom + 96,
    }
    const drawerStyle: CSSProperties = {
      top: rect.top,
      right: window.innerWidth - rect.right,
      bottom: window.innerHeight - rect.bottom,
    }
    return (
      <>
        <button
          type="button"
          className={styles.fab}
          style={fabStyle}
          aria-expanded={open}
          aria-label={t(open ? 'toggle.close' : 'toggle.open')}
          onClick={() => setOpen(value => !value)}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path
              d="M2 4h14M2 9h14M2 14h9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        {open && <div className={styles.backdrop} onClick={() => setOpen(false)} />}
        <div
          id="dsh-ui-toc-drawer"
          role="navigation"
          aria-label={t('aria.toc')}
          className={cn(styles.drawer, open && styles.drawerOpen)}
          style={drawerStyle}
        >
          <button
            type="button"
            className={styles.topItem}
            title={t('top.title')}
            onClick={handleTopClick}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M7 11.5V2.5M3.5 6 7 2.5 10.5 6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className={styles.topItemText}>{t('top.label')}</span>
          </button>
          {userMessages.map(message => (
            <div
              key={message.key}
              role="button"
              tabIndex={0}
              className={cn(styles.drawerItem, message.key === activeKey && styles.drawerItemActive)}
              title={message.label}
              onClick={() => handleItemClick(message.key)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  handleItemClick(message.key)
                }
              }}
            >
              <span className={styles.drawerItemText}>{message.label}</span>
            </div>
          ))}
        </div>
      </>
    )
  }

  const panelStyle: CSSProperties = {
    top: rect.top + rect.height * 0.4,
    right: window.innerWidth - rect.right + 12,
  }
  return (
    <div
      ref={panelRef}
      role="navigation"
      aria-label={t('aria.toc')}
      className={styles.toc}
      style={panelStyle}
    >
      <button
        type="button"
        className={styles.topItem}
        title={t('top.title')}
        aria-label={t('top.title')}
        onClick={handleTopClick}
      >
        <span className={styles.topItemBar} />
      </button>
      {userMessages.map(message => (
        <div
          key={message.key}
          data-toc-item={message.key}
          className={cn(styles.item, message.key === activeKey && styles.itemActive)}
          title={message.label}
          onClick={() => handleItemClick(message.key)}
        >
          <span className={styles.itemText}>{message.label}</span>
          <span className={styles.itemBar} />
        </div>
      ))}
    </div>
  )
}
