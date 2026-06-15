/// <reference types="cypress" />
// Custom commands for the Location Diary e2e suite. These talk to the real
// Django backend (proxied via /api), so the dev/preview server and the API must
// both be running. See README for the e2e run instructions.

/**
 * Register a brand-new account directly through the API and return its
 * credentials. Registering also logs the user in (the backend starts a session
 * on register), so the browser is authenticated for the subsequent cy.visit.
 *
 * Each call uses a unique email so runs are independent and repeatable against
 * a persistent dev database.
 */
Cypress.Commands.add('createUser', () => {
  const email = `e2e-${Date.now()}-${Cypress._.random(1e6)}@example.com`
  const password = 'sup3rSecret!diary'
  // Anonymous register is CSRF-exempt under DRF SessionAuthentication, so no
  // token is needed here. The Set-Cookie session is stored in Cypress's jar and
  // shared with the browser.
  return cy
    .request('POST', '/api/auth/register/', { email, password })
    .then(() => ({ email, password }))
})

/** Log in through the API (faster than driving the form) for test setup. */
Cypress.Commands.add('login', (email: string, password: string) => {
  cy.request('POST', '/api/auth/login/', { email, password })
})

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      createUser(): Chainable<{ email: string; password: string }>
      login(email: string, password: string): Chainable<void>
    }
  }
}

export {}
