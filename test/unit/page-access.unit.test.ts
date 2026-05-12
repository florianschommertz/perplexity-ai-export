import { describe, expect, it } from 'vitest'
import { detectPageAccessState } from '../../src/scraper/page-access.js'

describe('detectPageAccessState', () => {
  it('classifies Cloudflare verification pages as a challenge', () => {
    expect(
      detectPageAccessState({
        title: 'Just a moment...',
        bodyText: 'Performing security verification before accessing Perplexity',
        userMenuCount: 0,
        signInControlCount: 0,
        authCookieCount: 0,
      })
    ).toBe('challenge')
  })

  it('classifies pages with user menu controls as authenticated', () => {
    expect(
      detectPageAccessState({
        title: 'Settings',
        bodyText: 'Manage your account',
        userMenuCount: 1,
        signInControlCount: 0,
        authCookieCount: 0,
      })
    ).toBe('authenticated')
  })

  it('classifies pages with auth cookies and no sign-in prompt as authenticated', () => {
    expect(
      detectPageAccessState({
        title: 'Settings',
        bodyText: 'Manage your account',
        userMenuCount: 0,
        signInControlCount: 0,
        authCookieCount: 2,
      })
    ).toBe('authenticated')
  })

  it('classifies pages with no auth markers as unauthenticated', () => {
    expect(
      detectPageAccessState({
        title: 'Perplexity',
        bodyText: 'Sign in to manage your account\nContinue with Google',
        userMenuCount: 0,
        signInControlCount: 0,
        authCookieCount: 0,
      })
    ).toBe('unauthenticated')
  })
})
