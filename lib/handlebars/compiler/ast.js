/**
 * Shared AST helpers used by the parser and compiler to classify path-like nodes.
 */
let AST = {
  // Public API used to evaluate derived attributes regarding AST nodes
  helpers: {
    // a mustache is definitely a helper if:
    // * it is an eligible helper, and
    // * it has at least one parameter or hash segment
    /**
     * Returns whether an AST node must be treated as a helper expression.
     *
     * @param {import('./compiler').default | Record<string, unknown>} node
     * @returns {boolean}
     */
    helperExpression: function(node) {
      return (
        node.type === 'SubExpression' ||
        (node.type === 'MustacheStatement' ||
          node.type === 'BlockStatement') &&
          !!(node.params && node.params.length || node.hash)
      );
    },

    /**
     * Returns whether a path is explicitly scoped with `.` or `this`.
     *
     * @param {{ original: string }} path
     * @returns {boolean}
     */
    scopedId: function(path) {
      return /^\.|this\b/.test(path.original);
    },

    // an ID is simple if it only has one part, and that part is not
    // `..` or `this`.
    /**
     * Returns whether a path is a single unscoped identifier.
     *
     * @param {{ depth: number, parts: string[] }} path
     * @returns {boolean}
     */
    simpleId: function(path) {
      return (
        path.parts.length === 1 && !AST.helpers.scopedId(path) && !path.depth
      );
    }
  }
};

// Must be exported as an object rather than the root of the module as the jison lexer
// must modify the object to operate properly.
export default AST;
