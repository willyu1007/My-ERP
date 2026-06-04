// Template: Service with manual dependency injection (TypeScript)

export interface User {
  id: string;
  email: string;
  isActive: boolean;
}

export interface CreateUserInput {
  email: string;
  age: number;
}

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
}

export class UserService {
  constructor(private readonly repo: UserRepository) {}

  async createUser(input: CreateUserInput): Promise<User> {
    // Domain rule example
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
