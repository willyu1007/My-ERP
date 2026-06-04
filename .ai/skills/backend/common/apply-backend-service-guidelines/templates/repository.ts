// Template: repository layer skeleton (TypeScript)
// Intent: encapsulate persistence details (ORM/query builder) behind an interface.

export interface ThingRecord {
  id: string;
  name: string;
  createdAt: Date;
}

export interface ThingRepository {
  findById(id: string): Promise<ThingRecord | null>;
  create(data: { name: string }): Promise<ThingRecord>;
}
