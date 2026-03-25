/**
 * Shared Handlebars runtime environment for helpers, partials, and decorators.
 */
export class HandlebarsEnvironment {
    /**
     * @param {Record<string, Function>} [helpers]
     * @param {Record<string, string | Function>} [partials]
     * @param {Record<string, Function>} [decorators]
     */
    constructor(helpers?: Record<string, Function>, partials?: Record<string, string | Function>, decorators?: Record<string, Function>);
    helpers: any;
    partials: any;
    decorators: any;
    helperRevision: number;
    partialRevision: number;
    decoratorRevision: number;
    logger: {
        methodMap: string[];
        level: string;
        lookupLevel(level: string | number): number;
        log(level: string | number, ...message: unknown[]): void;
    };
    log: (level: string | number, ...message: unknown[]) => void;
    /**
     * @param {string | Record<string, Function>} name
     * @param {Function} [fn]
     * @returns {void}
     */
    registerHelper(name: string | Record<string, Function>, fn?: Function): void;
    /**
     * @param {string} name
     * @returns {void}
     */
    unregisterHelper(name: string): void;
    /**
     * @param {string | Record<string, string | Function>} name
     * @param {string | Function} [partial]
     * @returns {void}
     */
    registerPartial(name: string | Record<string, string | Function>, partial?: string | Function): void;
    /**
     * @param {string} name
     * @returns {void}
     */
    unregisterPartial(name: string): void;
    /**
     * @param {string | Record<string, Function>} name
     * @param {Function} [fn]
     * @returns {void}
     */
    registerDecorator(name: string | Record<string, Function>, fn?: Function): void;
    /**
     * @param {string} name
     * @returns {void}
     */
    unregisterDecorator(name: string): void;
    /**
     * Clears the prototype-access warning cache used by the runtime.
     *
     * @returns {void}
     */
    resetLoggedPropertyAccesses(): void;
}
import { createFrame } from '#handlebars/utils';
import logger from '#handlebars/logger';
export { createFrame, logger };
