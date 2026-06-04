/**
 * Smoke Test Example (Cypress)
 *
 * A minimal smoke test that verifies the application is accessible
 * and core elements are present. Use as a template for new specs.
 *
 * Best practices demonstrated:
 * - Stable selectors (data-cy, data-testid)
 * - No fixed waits (use Cypress retry-ability + assertions)
 * - Environment-agnostic (no hardcoded URLs)
 */

describe('Smoke Tests', () => {
  beforeEach(() => {
    // Visit base URL (configured in cypress.config.ts)
    cy.visit('/');
  });

  it('homepage loads successfully', () => {
    // Assert page title
    cy.title().should('match', /My App/i);

    // Assert main content is visible using data-cy
    cy.get('[data-cy="main-content"]').should('be.visible');
  });

  it('navigation menu is accessible', () => {
    // Use data-cy selectors (preferred)
    cy.get('[data-cy="navigation"]').should('be.visible');

    // Assert specific nav items
    cy.get('[data-cy="nav-home"]').should('be.visible');
    cy.get('[data-cy="nav-about"]').should('be.visible');
  });

  it('critical user flow is available', () => {
    // Verify a key action button exists and is interactive
    cy.get('[data-cy="cta-button"]')
      .should('be.visible')
      .and('be.enabled')
      .and('contain.text', 'Get Started');
  });
});

describe('Health Check', () => {
  it('API health endpoint responds', () => {
    // Direct API call
    cy.request('/api/health').then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.status).to.eq('ok');
    });
  });
});

describe('Network Stubbing Example', () => {
  it('handles API responses gracefully', () => {
    // Intercept and stub API response
    cy.intercept('GET', '/api/users', {
      statusCode: 200,
      body: [
        { id: 1, name: 'Test User 1' },
        { id: 2, name: 'Test User 2' },
      ],
    }).as('getUsers');

    cy.visit('/users');

    // Wait for intercepted request
    cy.wait('@getUsers');

    // Assert UI reflects stubbed data
    cy.get('[data-cy="user-list"]').should('contain', 'Test User 1');
  });

  it('handles API errors gracefully', () => {
    // Stub error response
    cy.intercept('GET', '/api/users', {
      statusCode: 500,
      body: { error: 'Internal Server Error' },
    }).as('getUsersError');

    cy.visit('/users');
    cy.wait('@getUsersError');

    // Assert error state is shown
    cy.get('[data-cy="error-message"]').should('be.visible');
  });
});
