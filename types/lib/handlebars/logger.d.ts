export default logger;
declare namespace logger {
    let methodMap: string[];
    let level: string;
    /**
     * Maps a logger level name or number to an index in `methodMap`.
     *
     * @param {string | number} level
     * @returns {number}
     */
    function lookupLevel(level: string | number): number;
    /**
     * Emits a log message if the configured logger level allows it.
     *
     * @param {string | number} level
     * @param {...unknown} message
     * @returns {void}
     */
    function log(level: string | number, ...message: unknown[]): void;
}
