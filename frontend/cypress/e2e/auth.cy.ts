// Auth flow, driven entirely through the UI against the real backend:
// register -> land on the dashboard -> log out -> log back in. Also covers the
// router guard that bounces anonymous visitors to /login.

describe('Authentication', () => {
  it('redirects an anonymous visitor to the login page', () => {
    cy.visit('/home')
    cy.location('pathname').should('eq', '/login')
    cy.contains('h1, h2', /sign in/i)
  })

  it('registers a new account and lands on the empty dashboard', () => {
    const email = `e2e-${Date.now()}@example.com`
    const password = 'sup3rSecret!diary'

    cy.visit('/register')
    cy.get('#email').type(email)
    cy.get('#password').type(password)
    cy.contains('button', /create account/i).click()

    cy.location('pathname').should('eq', '/home')
    cy.contains(/your events/i)
    // A fresh account has no events.
    cy.contains(/no events yet/i)
    // The header shows who's signed in.
    cy.contains(email)
  })

  it('logs out and logs back in with the same credentials', () => {
    cy.createUser().then(({ email, password }) => {
      cy.visit('/home')
      cy.contains(email)

      cy.contains('button', /log out/i).click()
      cy.location('pathname').should('eq', '/login')

      cy.get('#email').type(email)
      cy.get('#password').type(password)
      cy.contains('button', /sign in/i).click()

      cy.location('pathname').should('eq', '/home')
      cy.contains(email)
    })
  })

  it('shows an error for invalid credentials', () => {
    cy.visit('/login')
    cy.get('#email').type('nobody@example.com')
    cy.get('#password').type('wrongpassword123')
    cy.contains('button', /sign in/i).click()

    cy.location('pathname').should('eq', '/login')
    cy.contains(/invalid credentials/i)
  })
})
