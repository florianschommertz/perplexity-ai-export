function normalizePathname(url: string): string | null {
  try {
    return new URL(url).pathname
  } catch {
    return null
  }
}

export function extractThreadIdFromSearchUrl(url: string): string | null {
  const match = url.match(/\/search\/([^/?]+)/)
  return match?.[1] ?? null
}

export function isThreadDetailResponseUrl(responseUrl: string, threadUrl: string): boolean {
  const threadId = extractThreadIdFromSearchUrl(threadUrl)
  const pathname = normalizePathname(responseUrl)

  if (!threadId || !pathname?.startsWith('/rest/thread/')) {
    return false
  }

  return pathname === `/rest/thread/${threadId}`
}

function hasAnswerBlocks(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object' || !('blocks' in entry) || !Array.isArray(entry.blocks)) {
    return false
  }

  return entry.blocks.some(
    (block) =>
      block &&
      typeof block === 'object' &&
      'markdown_block' in block &&
      block.markdown_block &&
      typeof block.markdown_block === 'object' &&
      'answer' in block.markdown_block &&
      typeof block.markdown_block.answer === 'string' &&
      block.markdown_block.answer.trim().length > 0
  )
}

function hasPrompt(entry: unknown): boolean {
  return (
    !!entry &&
    typeof entry === 'object' &&
    'query_str' in entry &&
    typeof entry.query_str === 'string' &&
    entry.query_str.trim().length > 0
  )
}

function hasThreadTitle(entry: unknown): boolean {
  return (
    !!entry &&
    typeof entry === 'object' &&
    'thread_title' in entry &&
    typeof entry.thread_title === 'string' &&
    entry.thread_title.trim().length > 0
  )
}

export function hasMeaningfulThreadData(data: unknown): boolean {
  if (!data || typeof data !== 'object') {
    return false
  }

  const entries = Array.isArray(data)
    ? data
    : 'entries' in data && Array.isArray(data.entries)
      ? data.entries
      : [data]

  return entries.some(
    (entry) => hasPrompt(entry) || hasAnswerBlocks(entry) || hasThreadTitle(entry)
  )
}
