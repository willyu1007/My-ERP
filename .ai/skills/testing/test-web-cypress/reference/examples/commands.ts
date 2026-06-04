/**
 * Custom Commands Example (Cypress)
 *
 * Define reusable commands to reduce duplication across tests.
 * Place this file in: tests/web/cypress/support/commands.ts
 *
 * Best practices demonstrated:
 * - Typed commands for TypeScript support
 * - Login command with multiple strategies
 * - Data cleanup utilities
 */

// Extend Cypress namespace for TypeScript
declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Login via UI form
       * @example cy.login('user@example.com', 'password')
       */
      login(email: string, password: string): Chainable<void>;

      /**
       * Login via API (faster, for test setup)
       * @example cy.loginViaApi('user@example.com', 'password')
       */
      loginViaApi(email: string, password: string): Chainable<void>;

      /**
       * Get element by data-cy attribute
       * @example cy.getByCy('submit-button')
       */
      getByCy(selector: string): Chainable<JQuery<HTMLElement>>;

      /**
       * Get element by data-testid attribute
       * @example cy.getByTestId('main-content')
       */
      getByTestId(selector: string): Chainable<JQuery<HTMLElement>>;

      /**
       * Clear local storage and cookies
       * @example cy.clearSession()
       */
      clearSession(): Chainable<void>;
    }
  }
}

/**
 * Login via UI form
 */
Cypress.Commands.add('login', (email: string, password: string) => {
  cy.visit('/login');

  cy.get('[data-cy="email-input"]').type(email);
  cy.get('[data-cy="password-input"]').type(password);
  cy.get('[data-cy="login-button"]').click();

  // Wait for successful login
  cy.get('[data-cy="user-menu"]').should('be.visible');
});

/**
 * Login via API (faster for test setup)
 */
Cypress.Commands.add('loginViaApi', (email: string, password: string) => {
  cy.request({
    method: 'POST',
    url: '/api/auth/login',
    body: { email, password },
  }).then((response) => {
    expect(response.status).to.eq(200);

    // Store token in localStorage or cookies based on your app
    const { token } = response.body;
    window.localStorage.setItem('authToken', token);
  });
});

/**
 * Get element by data-cy attribute
 */
Cypress.Commands.add('getByCy', (selector: string) => {
  return cy.get(`[data-cy="${selector}"]`);
});

/**
 * Get element by data-testid attribute
 */
Cypress.Commands.add('getByTestId', (selector: string) => {
  return cy.get(`[data-testid="${selector}"]`);
});

/**
 * Clear session data
 */
Cypress.Commands.add('clearSession', () => {
  cy.clearLocalStorage();
  cy.clearCookies();
});

// Export empty object for ES module compatibility
export {};
