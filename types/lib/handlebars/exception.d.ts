/**
 * Handlebars-flavored error with optional location metadata from the AST.
 */
export default class Exception extends Error {
    /**
     * @param {string} message
     * @param {{ loc?: { start: { line: number, column: number }, end: { line: number, column: number } } }} [node]
     */
    constructor(message: string, node?: {
        loc?: {
            start: {
                line: number;
                column: number;
            };
            end: {
                line: number;
                column: number;
            };
        };
    });
    lineNumber: number;
    endLineNumber: number;
}
