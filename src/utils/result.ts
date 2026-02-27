/**
 * Helper functions for working with Result<T, E> types.
 *
 * @module result
 */

import { Result, Ok as OkType, Err as ErrType } from '../types/result';

/**
 * Create a successful Result containing a value.
 *
 * @param value - The success value
 * @returns Ok<T> result
 *
 * @example
 * ```typescript
 * const result = Ok(42);
 * // result: Ok<number> = { ok: true, value: 42 }
 * ```
 */
export function Ok<T>(value: T): OkType<T> {
  return { ok: true, value };
}

/**
 * Create a failed Result containing an error.
 *
 * @param error - The error value
 * @returns Err<E> result
 *
 * @example
 * ```typescript
 * const result = Err("Something went wrong");
 * // result: Err<string> = { ok: false, error: "Something went wrong" }
 * ```
 */
export function Err<E>(error: E): ErrType<E> {
  return { ok: false, error };
}

/**
 * Type guard to check if a Result is Ok.
 *
 * @param result - The result to check
 * @returns true if result is Ok, false if Err
 *
 * @example
 * ```typescript
 * const result = Ok(42);
 * if (isOk(result)) {
 *   console.log(result.value); // TypeScript knows result.value exists
 * }
 * ```
 */
export function isOk<T, E>(result: Result<T, E>): result is OkType<T> {
  return result.ok === true;
}

/**
 * Type guard to check if a Result is Err.
 *
 * @param result - The result to check
 * @returns true if result is Err, false if Ok
 *
 * @example
 * ```typescript
 * const result = Err("Failed");
 * if (isErr(result)) {
 *   console.error(result.error); // TypeScript knows result.error exists
 * }
 * ```
 */
export function isErr<T, E>(result: Result<T, E>): result is ErrType<E> {
  return result.ok === false;
}
