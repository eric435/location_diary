// Event CRUD from the dashboard, against the real backend. We register a fresh
// user per test via the API for speed, then drive create/edit/delete through
// the UI dialogs exactly as a user would.

describe('Events dashboard', () => {
  beforeEach(() => {
    cy.createUser()
    cy.visit('/home')
    cy.contains(/no events yet/i)
  })

  it('creates an event from the empty state', () => {
    cy.contains('button', /create your first event/i).click()

    cy.get('#event-title').type('Trip to Vancouver')
    cy.get('#event-description').type('A weekend by the water.')
    cy.contains('button', /^Create$/).click()

    // The new card appears and the empty state is gone.
    cy.contains(/no events yet/i).should('not.exist')
    cy.contains('.event-card', 'Trip to Vancouver')
    cy.contains('.event-card', 'A weekend by the water.')
  })

  it('edits an existing event', () => {
    // Seed one event through the UI.
    cy.contains('button', /create your first event/i).click()
    cy.get('#event-title').type('Original title')
    cy.contains('button', /^Create$/).click()
    cy.contains('.event-card', 'Original title')

    // Edit it.
    cy.get('.event-card').find('[aria-label="Edit event"]').click()
    cy.get('#event-title').clear()
    cy.get('#event-title').type('Updated title')
    cy.contains('button', /^Save$/).click()

    cy.contains('.event-card', 'Updated title')
    cy.contains('.event-card', 'Original title').should('not.exist')
  })

  it('deletes an event after confirmation', () => {
    cy.contains('button', /create your first event/i).click()
    cy.get('#event-title').type('Doomed event')
    cy.contains('button', /^Create$/).click()
    cy.contains('.event-card', 'Doomed event')

    cy.get('.event-card').find('[aria-label="Delete event"]').click()
    // PrimeVue ConfirmDialog -> click its "Delete" accept button.
    cy.get('.p-confirmdialog').contains('button', /delete/i).click()

    cy.contains('.event-card', 'Doomed event').should('not.exist')
    cy.contains(/no events yet/i)
  })

  it('persists a created event across a reload', () => {
    cy.contains('button', /create your first event/i).click()
    cy.get('#event-title').type('Persistent event')
    cy.contains('button', /^Create$/).click()
    cy.contains('.event-card', 'Persistent event')

    cy.reload()
    cy.contains('.event-card', 'Persistent event')
  })
})
