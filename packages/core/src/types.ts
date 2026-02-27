/**
 * Result type for error handling without exceptions.
 * Prefer this over throwing in adapter and server code.
 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Pagination options for list endpoints.
 */
export interface PaginationOpts {
  page: number;
  limit: number;
}

/**
 * Standard API error shape returned by REST endpoints.
 */
export interface ApiError {
  code: string;
  message: string;
}

/**
 * Cleanup function returned by subscribe().
 */
export type Unsubscribe = () => void;
