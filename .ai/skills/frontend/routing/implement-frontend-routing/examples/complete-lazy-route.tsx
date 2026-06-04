// Example: Lazy-loaded route (React + TypeScript, router-agnostic intent)

import React, { lazy } from 'react';

// Replace with your router's route definition mechanism.
export const UserProfilePage = () => {
  const UserProfile = lazy(() => import('../features/users/UserProfile'));

  return (
    <React.Suspense fallback={<div>Loading…</div>}>
      <UserProfile />
    </React.Suspense>
  );
};
