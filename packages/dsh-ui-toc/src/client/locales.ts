/** `toc` namespace dictionaries (aria labels and placeholder copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'aria.toc': '对话目录',
  'toggle.open': '展开目录',
  'toggle.close': '收起目录',
  'top.title': '回到顶部',
  'top.label': '回到顶部',
  'image': '[图片]',
  'empty': '(空)',
} satisfies Record<string, string>

/** The toc namespace key union. */
export type TocKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The conversation TOC entry's copy. */
    toc: TocKey
  }
}

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'aria.toc': 'Table of contents',
  'toggle.open': 'Open contents',
  'toggle.close': 'Close contents',
  'top.title': 'Back to top',
  'top.label': 'Back to top',
  'image': '[image]',
  'empty': '(empty)',
} satisfies Record<TocKey, string>

/** Dictionary namespace owned by this plugin. */
export const NS = 'toc'
