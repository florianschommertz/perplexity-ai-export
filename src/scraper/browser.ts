import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { config } from '../utils/config.js'
import { logger } from '../utils/logger.js'
import { confirm } from '@inquirer/prompts'
import { detectPageAccessState, type PageAccessState } from './page-access.js'

export class BrowserManager {
  static readonly BrowserLaunchError = class extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'BrowserLaunchError'
    }
  }

  static readonly AuthError = class extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'AuthError'
    }
  }

  static readonly ContextError = class extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'ContextError'
    }
  }

  static readonly NavigationError = class extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'NavigationError'
    }
  }

  public browserInstance: Browser | null = null
  private activeContext: BrowserContext | null = null
  private activePage: Page | null = null

  async launch(): Promise<Page> {
    try {
      const isSavedAuthValid = this.checkIfSavedAuthenticationIsFresh(config.authStoragePath)

      if (isSavedAuthValid) {
        // Try starting in requested headless mode directly
        await this.launchBrowser(config.headless)
        await this.initializeBrowserContext()
        await this.navigateToSettingsPage()
        const initialAccessState = await this.getPageAccessState(this.getActivePage())

        if (initialAccessState === 'authenticated') {
          logger.success('Already logged in!')
          return this.getActivePage()
        }

        logger.warn(this.getHeadfulFallbackMessage(initialAccessState))
        await this.close()
      }

      // Need login: launch headful
      await this.launchBrowser(false)
      await this.initializeBrowserContext()
      await this.navigateToSettingsPage()
      await this.ensureUserIsAuthenticated()

      // If user wants headless, restart now that we are logged in
      if (config.headless !== false) {
        const restoredPage = await this.tryRestoreAuthenticatedHeadlessSession()
        if (restoredPage) {
          return restoredPage
        }
      }

      return this.getActivePage()
    } catch (_error) {
      if (_error instanceof Error) throw _error
      throw new BrowserManager.BrowserLaunchError(`Unexpected error: ${String(_error)}`)
    }
  }

  async close(): Promise<void> {
    if (this.activePage) await this.activePage.close().catch(() => {})
    if (this.activeContext) await this.activeContext.close().catch(() => {})
    if (this.browserInstance) await this.browserInstance.close().catch(() => {})
    this.activePage = null
    this.activeContext = null
    this.browserInstance = null
  }

  private async launchBrowser(headless: boolean | 'new'): Promise<void> {
    try {
      this.browserInstance = await chromium.launch({
        headless: headless === 'new' ? true : headless,
        args: ['--disable-blink-features=AutomationControlled'],
      })
    } catch (_error) {
      throw new BrowserManager.BrowserLaunchError(
        `Failed to launch browser: ${_error instanceof Error ? _error.message : String(_error)}`
      )
    }
  }

  private async initializeBrowserContext(): Promise<void> {
    if (!this.browserInstance) throw new BrowserManager.ContextError('Browser not initialized')

    const isSavedAuthValid = this.checkIfSavedAuthenticationIsFresh(config.authStoragePath)

    if (isSavedAuthValid) {
      logger.info('Loading saved authentication state...')
      try {
        const storageStateData = JSON.parse(readFileSync(config.authStoragePath, 'utf-8'))
        this.activeContext = await this.browserInstance.newContext({
          storageState: storageStateData,
        })
      } catch (_error) {
        logger.warn('Failed to load saved auth state, starting fresh.', _error)
        this.activeContext = await this.browserInstance.newContext()
      }
    } else {
      if (existsSync(config.authStoragePath)) {
        logger.info('Saved authentication is older than 1 day, discarding.')
      }
      this.activeContext = await this.browserInstance.newContext()
    }
  }

  private checkIfSavedAuthenticationIsFresh(path: string): boolean {
    if (!existsSync(path)) return false
    try {
      const fileStats = statSync(path)
      const fileAgeInMs = Date.now() - fileStats.mtimeMs
      const twentyFourHoursInMs = 24 * 60 * 60 * 1000
      return fileAgeInMs < twentyFourHoursInMs
    } catch (_error) {
      return false
    }
  }

  private async navigateToSettingsPage(): Promise<void> {
    if (!this.activeContext) {
      throw new BrowserManager.NavigationError('No browser context available')
    }
    this.activePage = await this.activeContext.newPage()
    const perplexitySettingsUrl = 'https://www.perplexity.ai/settings'
    try {
      await this.activePage.goto(perplexitySettingsUrl, {
        timeout: 3000,
      })
    } catch (_error) {
      throw new BrowserManager.NavigationError(
        `Failed to navigate to settings: ${_error instanceof Error ? _error.message : String(_error)}`
      )
    }
  }

  private async ensureUserIsAuthenticated(): Promise<void> {
    if (!this.activePage) {
      throw new BrowserManager.AuthError('Page not initialized')
    }

    const initialAccessState = await this.getPageAccessState(this.activePage)

    if (initialAccessState === 'authenticated') {
      logger.success('Already logged in!')
      return
    }

    logger.info('Please log in manually in the browser window...')
    await confirm({
      message:
        'Press Enter when you are logged in, past any security checks, and on the settings page',
      default: true,
    })

    const perplexitySettingsUrl = 'https://www.perplexity.ai/settings'
    await this.activePage.goto(perplexitySettingsUrl, {
      waitUntil: 'networkidle',
    })

    const currentAccessState = await this.getPageAccessState(this.activePage)
    if (currentAccessState !== 'authenticated') {
      if (currentAccessState === 'challenge') {
        throw new BrowserManager.AuthError(
          'Perplexity is still showing a security verification page. Complete it in the browser window and try again.'
        )
      }

      throw new BrowserManager.AuthError(
        `Login verification failed. Current URL: ${this.activePage.url()}`
      )
    }

    await this.persistAuthenticationState()
    logger.success('Authentication state saved!')
  }

  private async verifyLoginStatus(page: Page): Promise<boolean> {
    return (await this.getPageAccessState(page)) === 'authenticated'
  }

  private async persistAuthenticationState(): Promise<void> {
    if (!this.activeContext) {
      throw new BrowserManager.AuthError('No browser context available to save')
    }
    const currentStorageState = await this.activeContext.storageState()
    writeFileSync(config.authStoragePath, JSON.stringify(currentStorageState, null, 2))
  }

  private getActivePage(): Page {
    if (!this.activePage) {
      throw new BrowserManager.ContextError('Page not initialized')
    }
    return this.activePage
  }

  private async getPageAccessState(page: Page): Promise<PageAccessState> {
    await page.waitForTimeout(1000).catch(() => {})
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})

    const [title, bodyText, userMenuCount, signInButtonCount, signInLinkCount, cookies] =
      await Promise.all([
        page.title().catch(() => ''),
        page
          .locator('body')
          .innerText()
          .catch(() => ''),
        page
          .locator('[data-testid="user-menu"]')
          .count()
          .catch(() => 0),
        page
          .getByRole('button', { name: /sign in|log in/i })
          .count()
          .catch(() => 0),
        page
          .getByRole('link', { name: /sign in|log in/i })
          .count()
          .catch(() => 0),
        page
          .context()
          .cookies(page.url())
          .catch(() => []),
      ])

    const authCookieCount = cookies.filter(
      ({ name, value }) =>
        Boolean(value) && /auth|token|clerk|__session|next-auth|authjs/i.test(name)
    ).length

    return detectPageAccessState({
      title,
      bodyText,
      userMenuCount,
      signInControlCount: signInButtonCount + signInLinkCount,
      authCookieCount,
    })
  }

  private getHeadfulFallbackMessage(accessState: PageAccessState): string {
    if (accessState === 'challenge') {
      return 'Perplexity blocked headless mode with a security verification page. Restarting in a visible browser...'
    }

    return 'Saved authentication expired or invalid. Restarting in headful mode for login...'
  }

  private async tryRestoreAuthenticatedHeadlessSession(): Promise<Page | null> {
    logger.info('Authentication successful. Testing headless mode...')
    await this.close()
    await this.launchBrowser(config.headless)
    await this.initializeBrowserContext()
    await this.navigateToSettingsPage()

    const headlessAccessState = await this.getPageAccessState(this.getActivePage())
    if (headlessAccessState === 'authenticated') {
      return this.getActivePage()
    }

    logger.warn(
      headlessAccessState === 'challenge'
        ? 'Perplexity blocked the fresh login in headless mode. Continuing in a visible browser instead.'
        : 'Headless mode could not reuse the fresh login. Continuing in a visible browser instead.'
    )

    await this.close()
    await this.launchBrowser(false)
    await this.initializeBrowserContext()
    await this.navigateToSettingsPage()

    if (!(await this.verifyLoginStatus(this.getActivePage()))) {
      throw new BrowserManager.AuthError(
        'Authentication succeeded, but the session could not be restored after switching browser modes.'
      )
    }

    return null
  }
}
