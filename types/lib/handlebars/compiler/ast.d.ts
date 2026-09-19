/**
 * Shared AST helpers used by the parser and compiler to classify path-like nodes.
 */
declare let AST: {
    helpers: {
        /**
         * Returns whether an AST node must be treated as a helper expression.
         *
         * @param {import('./compiler').default | Record<string, unknown>} node
         * @returns {boolean}
         */
        helperExpression: (node: import('./compiler').default | Record<string, unknown>) => boolean;
        /**
         * Returns whether a path is explicitly scoped with `.` or `this`.
         *
         * @param {{ original: string }} path
         * @returns {boolean}
         */
        scopedId: (path: {
            original: string;
        }) => boolean;
        /**
         * Returns whether a path is a single unscoped identifier.
         *
         * @param {{ depth: number, parts: string[] }} path
         * @returns {boolean}
         */
        simpleId: (path: {
            depth: number;
            parts: string[];
        }) => boolean;
    };
};
export default AST;
