import { useState, useEffect, useCallback } from 'react';
import type { User } from '../components/UserList';

interface UseUsersReturn {
  users: User[];
  loading: boolean;
  error: Error | null;
  addUser: (user: Omit<User, 'id'>) => void;
  removeUser: (id: string) => void;
  refreshUsers: () => Promise<void>;
}

export function useUsers(): UseUsersReturn {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      // Simulated API call
      await new Promise(resolve => setTimeout(resolve, 500));

      // Mock data
      const mockUsers: User[] = [
        { id: '1', name: 'Alice Johnson', email: 'alice@example.com' },
        { id: '2', name: 'Bob Smith', email: 'bob@example.com' },
      ];
      setUsers(mockUsers);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch users'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const addUser = useCallback((newUser: Omit<User, 'id'>) => {
    const user: User = {
      ...newUser,
      id: crypto.randomUUID(),
    };
    setUsers(prev => [...prev, user]);
  }, []);

  const removeUser = useCallback((id: string) => {
    setUsers(prev => prev.filter(user => user.id !== id));
  }, []);

  return {
    users,
    loading,
    error,
    addUser,
    removeUser,
    refreshUsers: fetchUsers,
  };
}
