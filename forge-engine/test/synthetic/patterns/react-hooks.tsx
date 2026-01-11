import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

// Pattern: useState with multiple state values
function useFormState<T extends Record<string, unknown>>(initialState: T) {
  const [state, setState] = useState<T>(initialState);

  const updateField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setState(prev => ({ ...prev, [field]: value }));
  }, []);

  const resetForm = useCallback(() => {
    setState(initialState);
  }, [initialState]);

  return { state, updateField, resetForm };
}

// Pattern: useEffect with cleanup
function useEventListener(
  eventName: string,
  handler: (event: Event) => void,
  element: HTMLElement | Window = window
) {
  const savedHandler = useRef(handler);

  useEffect(() => {
    savedHandler.current = handler;
  }, [handler]);

  useEffect(() => {
    const eventListener = (event: Event) => savedHandler.current(event);
    element.addEventListener(eventName, eventListener);

    // Cleanup function
    return () => {
      element.removeEventListener(eventName, eventListener);
    };
  }, [eventName, element]);
}

// Pattern: useEffect for data fetching
function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Unknown error'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();

    // Cleanup: prevent state updates on unmounted component
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { data, loading, error };
}

// Pattern: useMemo for expensive computations
function useFilteredList<T>(items: T[], filterFn: (item: T) => boolean, sortFn?: (a: T, b: T) => number) {
  return useMemo(() => {
    let result = items.filter(filterFn);
    if (sortFn) {
      result = result.sort(sortFn);
    }
    return result;
  }, [items, filterFn, sortFn]);
}

// Pattern: useCallback with dependencies
interface SearchParams {
  query: string;
  filters: Record<string, string>;
}

function useSearch() {
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const performSearch = useCallback(async (params: SearchParams) => {
    setLoading(true);
    try {
      // Simulated search
      await new Promise(resolve => setTimeout(resolve, 500));
      setResults([`Result for: ${params.query}`]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { results, loading, performSearch };
}

// Pattern: Custom hook combining multiple hooks
function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback((value: T) => {
    setStoredValue(value);
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key]);

  return [storedValue, setValue];
}

// Example component using the hooks
export function SearchComponent(): React.ReactElement {
  const { state, updateField, resetForm } = useFormState({ query: '', category: 'all' });
  const { results, loading, performSearch } = useSearch();
  const [darkMode, setDarkMode] = useLocalStorage('darkMode', false);

  useEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Escape') {
      resetForm();
    }
  });

  return (
    <div className={darkMode ? 'dark' : 'light'}>
      <input
        value={state.query}
        onChange={e => updateField('query', e.target.value)}
      />
      <button onClick={() => performSearch({ query: state.query, filters: {} })}>
        {loading ? 'Searching...' : 'Search'}
      </button>
      <button onClick={() => setDarkMode(!darkMode)}>Toggle Theme</button>
      <ul>
        {results.map((r, i) => <li key={i}>{r}</li>)}
      </ul>
    </div>
  );
}

export { useFormState, useEventListener, useFetch, useFilteredList, useSearch, useLocalStorage };
