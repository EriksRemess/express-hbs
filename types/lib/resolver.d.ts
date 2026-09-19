export type ResolverCache = Map<string, Promise<unknown>> | Record<string, Promise<unknown>>;
export declare const resolverPendingEntriesKey: unique symbol;
/**
 * Creates and stores an async placeholder id.
 *
 * @param {ResolverCache} cache
 * @param {(context: unknown, cb: (value: unknown) => void) => void} fn
 * @param {unknown} context
 * @returns {string}
 */
export declare function resolve(cache: ResolverCache, fn: (context: unknown, cb: (value: unknown) => void) => void, context: unknown): string;
/**
 * Resolves all pending async helper placeholders in cache.
 *
 * @param {ResolverCache} cache
 * @param {(err: Error | null, resolvedCache?: Record<string, unknown>) => void} [callback]
 * @returns {Promise<Record<string, unknown>> | void}
 */
export declare function done(cache: ResolverCache, callback?: (err: Error | null, resolvedCache?: Record<string, unknown>) => void): Promise<Record<string, unknown>> | void;
/**
 * Checks whether string still contains unresolved async placeholders.
 *
 * @param {unknown} text
 * @returns {boolean}
 */
export declare const hasResolvers: (text: unknown) => boolean;
