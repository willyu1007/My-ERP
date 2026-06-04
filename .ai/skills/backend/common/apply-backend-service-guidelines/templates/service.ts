// Template: service layer skeleton (TypeScript)
// Intent: keep business logic here; do not depend on HTTP request/response objects.

export interface CreateThingInput {
  name: string;
}

export interface Thing {
  id: string;
  name: string;
}

export class ExampleService {
  constructor(/* inject repositories or other services here */) {}

  async createThing(input: CreateThingInput): Promise<Thing> {
    // 1) enforce business rules
    // 2) call repository for persistence
    // 3) return domain object
    return { id: 'generated-id', name: input.name };
  }
}
