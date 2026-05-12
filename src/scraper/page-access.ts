export interface PageAccessSignals {
  title: string
  bodyText: string
  userMenuCount: number
  signInControlCount: number
  authCookieCount: number
}

export type PageAccessState = 'authenticated' | 'unauthenticated' | 'challenge'

const securityChallengeMarkers = [
  'just a moment',
  'performing security verification',
  'security service to protect against malicious bots',
  'checking your browser before accessing',
  'cloudflare',
]

const unauthenticatedMarkers = [
  'sign in to manage your account',
  'continue with google',
  'continue with apple',
  'continue with email',
  'single sign-on (sso)',
]

export function detectPageAccessState(signals: PageAccessSignals): PageAccessState {
  const pageText = `${signals.title} ${signals.bodyText}`.toLowerCase()

  if (securityChallengeMarkers.some((marker) => pageText.includes(marker))) {
    return 'challenge'
  }

  if (
    signals.signInControlCount > 0 ||
    unauthenticatedMarkers.some((marker) => pageText.includes(marker))
  ) {
    return 'unauthenticated'
  }

  if (signals.userMenuCount > 0) {
    return 'authenticated'
  }

  if (signals.authCookieCount > 0 && signals.signInControlCount === 0) {
    return 'authenticated'
  }

  return 'unauthenticated'
}
