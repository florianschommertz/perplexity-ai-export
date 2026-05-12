import { describe, expect, it } from 'vitest'
import {
  extractThreadIdFromSearchUrl,
  hasMeaningfulThreadData,
  isThreadDetailResponseUrl,
} from '../../src/scraper/thread-response.js'

describe('extractThreadIdFromSearchUrl', () => {
  it('extracts the search slug from a thread URL', () => {
    expect(
      extractThreadIdFromSearchUrl(
        'https://www.perplexity.ai/search/example-thread-AbCdEf123?foo=bar'
      )
    ).toBe('example-thread-AbCdEf123')
  })
})

describe('isThreadDetailResponseUrl', () => {
  const threadUrl = 'https://www.perplexity.ai/search/example-thread-AbCdEf123'

  it('matches the detail endpoint for the active thread', () => {
    expect(
      isThreadDetailResponseUrl(
        'https://www.perplexity.ai/rest/thread/example-thread-AbCdEf123?version=2.18',
        threadUrl
      )
    ).toBe(true)
  })

  it('rejects list endpoints that previously polluted exports', () => {
    expect(
      isThreadDetailResponseUrl(
        'https://www.perplexity.ai/rest/thread/list_recent?exclude_asi=false&version=2.18',
        threadUrl
      )
    ).toBe(false)

    expect(
      isThreadDetailResponseUrl(
        'https://www.perplexity.ai/rest/thread/list_pinned_ask_threads?version=2.18',
        threadUrl
      )
    ).toBe(false)
  })
})

describe('hasMeaningfulThreadData', () => {
  it('accepts real thread payloads with prompts or answers', () => {
    expect(
      hasMeaningfulThreadData({
        entries: [
          {
            thread_title: 'Thread title',
            query_str: 'Question',
            blocks: [{ markdown_block: { answer: 'Answer' } }],
          },
        ],
      })
    ).toBe(true)
  })

  it('rejects metadata-only list payloads', () => {
    expect(
      hasMeaningfulThreadData([
        {
          slug: 'example-thread-AbCdEf123',
          title: 'Thread title',
          last_query_datetime: '2026-05-12T00:00:00.000Z',
        },
      ])
    ).toBe(false)
  })
})
