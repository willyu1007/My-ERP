# Example: Feature module structure blueprint

```
features/
  users/
    api/
      userApi.ts
    components/
      UserProfile.tsx
      UserList.tsx
      modals/
        DeleteUserModal.tsx
    hooks/
      useUsersQuery.ts
      useUserMutations.ts
      useUserPermissions.ts
    helpers/
      formatters.ts
      validation.ts
    types/
      index.ts
    index.ts
```

Guidance:
- `api/` contains typed API calls for this feature.
- `hooks/` contains query/mutation hooks and feature logic.
- `components/` are feature-scoped by default.
- `index.ts` re-exports the feature’s public API.
