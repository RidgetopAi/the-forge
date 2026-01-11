import React, { useState } from 'react';
import { UserList } from './components/UserList';
import { useUsers } from './hooks/useUsers';

interface AppState {
  darkMode: boolean;
}

export function App(): React.ReactElement {
  const [state, setState] = useState<AppState>({ darkMode: false });
  const { users, loading, error, addUser, removeUser } = useUsers();

  const toggleDarkMode = () => {
    setState(prev => ({ ...prev, darkMode: !prev.darkMode }));
  };

  if (loading) {
    return <div className="loading">Loading users...</div>;
  }

  if (error) {
    return <div className="error">Error: {error.message}</div>;
  }

  return (
    <div className={`app ${state.darkMode ? 'dark' : 'light'}`}>
      <header>
        <h1>User Management</h1>
        <button onClick={toggleDarkMode}>
          {state.darkMode ? 'Light Mode' : 'Dark Mode'}
        </button>
      </header>
      <main>
        <UserList
          users={users}
          onAddUser={addUser}
          onRemoveUser={removeUser}
        />
      </main>
    </div>
  );
}

export default App;
