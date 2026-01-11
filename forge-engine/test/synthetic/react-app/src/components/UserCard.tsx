import React from 'react';
import type { User } from './UserList';

interface UserCardProps {
  user: User;
  onRemove: () => void;
}

export function UserCard({ user, onRemove }: UserCardProps): React.ReactElement {
  const { name, email, avatar } = user;

  const initials = name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="user-card">
      <div className="user-avatar">
        {avatar ? (
          <img src={avatar} alt={`${name}'s avatar`} />
        ) : (
          <span className="initials">{initials}</span>
        )}
      </div>
      <div className="user-info">
        <h3 className="user-name">{name}</h3>
        <p className="user-email">{email}</p>
      </div>
      <button
        className="remove-btn"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
      >
        ×
      </button>
    </div>
  );
}
