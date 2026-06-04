// Example: Service orchestrating repository calls (TypeScript)

import type { UserRepository } from '../templates/service-with-di';

export class UserService {
  constructor(private readonly repo: UserRepository) {}

  async findById(id: string) {
    return this.repo.findById?.(id) ?? null;
  }

  async create(input: { email: string; age: number }) {
    if (input.age < 18) {
      throw new Error('VALIDATION: user must be 18+');
    }

    const existing = await this.repo.findByEmail(input.email);
    if (existing) {
      throw new Error('CONFLICT: email already in use');
    }

    return this.repo.create(input);
  }
}
