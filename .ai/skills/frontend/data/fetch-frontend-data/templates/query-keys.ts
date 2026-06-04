// Template: Query key helpers (TypeScript)

export const queryKeys = {
  user: (id: string) => ['user', id] as const,
  users: () => ['users'] as const,
  // Add feature-specific keys here.
};
