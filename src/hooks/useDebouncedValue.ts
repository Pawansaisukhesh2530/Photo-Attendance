import { useEffect, useState } from 'react';

/**
 * Trailing-edge debounce for a value that drives a query.
 *
 * The student directory's search term is part of the query key, so an undebounced field would
 * start a fresh paged request on every keystroke, discard the pages already loaded, and flash the
 * loading skeleton once per character. Typing "Sharma" would cost six requests to show one result.
 *
 * Returns the latest value once it has been still for `delayMs`. The input stays fully controlled
 * and responsive; only the query lags.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
