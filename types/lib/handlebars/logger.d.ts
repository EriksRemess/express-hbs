/**
 * Minimal logger used by the Handlebars environment.
 */
declare const logger: {
    methodMap: string[];
    level: string;
    /**
     * Maps a logger level name or number to an index in `methodMap`.
     *
     * @param {string | number} level
     * @returns {number}
     */
    lookupLevel(level: string | number): number;
    /**
     * Emits a log message if the configured logger level allows it.
     *
     * @param {string | number} level
     * @param {...unknown} message
     * @returns {void}
     */
    log(level: string | number, ...message: unknown[]): void;
};
export default logger;
