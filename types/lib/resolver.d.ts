export type ResolverCache = Map<string, Promise<unknown>> | Record<string, Promise<unknown>>;
/**
 * Resolves all pending async helper placeholders in cache.
 *
 * @param {ResolverCache} cache
 * @param {(err: Error | null, resolvedCache?: Record<string, unknown>) => void} [callback]
 * @returns {Promise<Record<string, unknown>> | void}
 */
export function done(cache: ResolverCache, callback?: (err: Error | null, resolvedCache?: Record<string, unknown>) => void): Promise<Record<string, unknown>> | void;
/**
 * Checks whether string still contains unresolved async placeholders.
 *
 * @param {unknown} text
 * @returns {boolean}
 */
export function hasResolvers(text: unknown): boolean;
/**
 * Creates and stores an async placeholder id.
 *
 * @param {ResolverCache} cache
 * @param {(context: unknown, cb: (value: unknown) => void) => void} fn
 * @param {unknown} context
 * @returns {string}
 */
export function resolve(cache: ResolverCache, fn: (context: unknown, cb: (value: unknown) => void) => void, context: unknown): string;
