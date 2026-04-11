/**
 * Creates and stores an async placeholder id.
 *
 * @param {ResolverCache} cache
 * @param {(context: unknown, cb: (value: unknown) => void) => void} fn
 * @param {unknown} context
 * @returns {string}
 */
export function resolve(cache: ResolverCache, fn: (context: unknown, cb: (value: unknown) => void) => void, context: unknown): string;
/**
 * Resolves all pending async helper placeholders in cache.
 *
 * @param {ResolverCache} cache
 * @param {(err: Error | null, resolvedCache?: Record<string, unknown>) => void} [callback]
 * @returns {Promise<Record<string, unknown>> | void}
 */
export function done(cache: ResolverCache, callback?: (err: Error | null, resolvedCache?: Record<string, unknown>) => void): Promise<Record<string, unknown>> | void;
export const resolverPendingEntriesKey: unique symbol;
export function hasResolvers(text: unknown): boolean;
export type ResolverCache = Map<string, Promise<unknown>> | Record<string, Promise<unknown>>;
