import React, { useState, useCallback } from 'react';
import { UserCard } from './UserCard';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface UserListProps {
  users: User[];
  onAddUser: (user: Omit<User, 'id'>) => void;
  onRemoveUser: (id: string) => void;
}

export function UserList({ users, onAddUser, onRemoveUser }: UserListProps): React.ReactElement {
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (newUserName.trim() && newUserEmail.trim()) {
      onAddUser({ name: newUserName, email: newUserEmail });
      setNewUserName('');
      setNewUserEmail('');
    }
  }, [newUserName, newUserEmail, onAddUser]);

  return (
    <div className="user-list">
      <form onSubmit={handleSubmit} className="add-user-form">
        <input
          type="text"
          value={newUserName}
          onChange={e => setNewUserName(e.target.value)}
          placeholder="Name"
        />
        <input
          type="email"
          value={newUserEmail}
          onChange={e => setNewUserEmail(e.target.value)}
          placeholder="Email"
        />
        <button type="submit">Add User</button>
      </form>

      <div className="users-grid">
        {users.length === 0 ? (
          <p className="no-users">No users yet. Add one above!</p>
        ) : (
          users.map(user => (
            <UserCard
              key={user.id}
              user={user}
              onRemove={() => onRemoveUser(user.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
