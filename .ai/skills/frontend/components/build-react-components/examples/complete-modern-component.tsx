// Example: Complete modern component (React + TypeScript)
// Demonstrates: typed props, derived state, stable callbacks, async data state boundaries.
//
// Note: Replace the data-fetching and notification hooks with your project equivalents.

import React, { useCallback, useMemo, useState } from 'react';

type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
};

async function fetchUser(userId: string): Promise<User> {
  // Replace with your API client.
  return {
    id: userId,
    email: 'user@example.com',
    firstName: 'First',
    lastName: 'Last',
    roles: ['user'],
  };
}

export interface UserProfileProps {
  userId: string;
  onUpdate?: () => void;
}

export const UserProfile: React.FC<UserProfileProps> = ({ userId, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchUser(userId)
      .then(u => {
        if (cancelled) return;
        setUser(u);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Failed to load user');
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const fullName = useMemo(() => {
    if (!user) return '';
    return `${user.firstName} ${user.lastName}`;
  }, [user?.firstName, user?.lastName]);

  const handleEdit = useCallback(() => setIsEditing(true), []);
  const handleCancel = useCallback(() => setIsEditing(false), []);
  const handleSave = useCallback(() => {
    // Replace with your mutation; call onUpdate when done.
    onUpdate?.();
    setIsEditing(false);
  }, [onUpdate]);

  if (isLoading) return <div>Loading…</div>;
  if (error) return <div role="alert">{error}</div>;
  if (!user) return <div>Not found.</div>;

  return (
    <div>
      <header>
        <h2>{fullName}</h2>
        <p>{user.email}</p>
      </header>

      <div>
        <p>Roles: {user.roles.join(', ')}</p>
      </div>

      <div>
        {!isEditing ? (
          <button type="button" onClick={handleEdit}>Edit</button>
        ) : (
          <>
            <button type="button" onClick={handleSave}>Save</button>
            <button type="button" onClick={handleCancel}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
};
