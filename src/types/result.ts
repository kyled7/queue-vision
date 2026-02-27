/**
 * Result<T, E> type for functional error handling without exceptions.
 *
 * A Result is either:
 * - Ok: contains a success value of type T
 * - Err: contains an error value of type E
 *
 * This enables explicit error handling and makes error cases visible in type signatures.
 *
 * @example
 * ```typescript
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) {
 *     return Err("Division by zero");
 *   }
 *   return Ok(a / b);
 * }
 * ```
 */

/**
 * Success variant of Result<T, E>
 */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * Error variant of Result<T, E>
 */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * Result type - either Ok<T> or Err<E>
 */
export type Result<T, E> = Ok<T> | Err<E>;
