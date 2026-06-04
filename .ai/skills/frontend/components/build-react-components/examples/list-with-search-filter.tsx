// Example: List with debounced search + memoized filtering (React + TypeScript)

import React, { useMemo, useState } from 'react';

type User = { id: string; name: string; email: string };

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}

export const UserList: React.FC<{ users: User[] }> = ({ users }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const debounced = useDebouncedValue(searchTerm, 300);

  const filtered = useMemo(() => {
    if (!debounced.trim()) return users;
    const q = debounced.toLowerCase();
    return users.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, debounced]);

  return (
    <div>
      <input
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Search users…"
      />
      <ul>
        {filtered.map(u => (
          <li key={u.id}>{u.name} — {u.email}</li>
        ))}
      </ul>
    </div>
  );
};
