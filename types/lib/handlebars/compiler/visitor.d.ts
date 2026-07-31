/**
 * Generic AST visitor used by the compiler and whitespace-control passes.
 */
export default class Visitor {
    parents: any[];
    mutating: boolean;
    /**
     * Visits a named child property and writes back mutations when enabled.
     *
     * @param {Record<string, unknown>} node
     * @param {string | number} name
     * @returns {void}
     */
    acceptKey(node: Record<string, unknown>, name: string | number): void;
    /**
     * Visits a required child property and throws when it is missing.
     *
     * @param {Record<string, unknown>} node
     * @param {string | number} name
     * @returns {void}
     */
    acceptRequired(node: Record<string, unknown>, name: string | number): void;
    /**
     * Visits every entry in an array, removing falsy results in mutating mode.
     *
     * @param {unknown[]} array
     * @returns {void}
     */
    acceptArray(array: unknown[]): void;
    /**
     * Dispatches a node to the matching visitor handler.
     *
     * @param {{ type?: string }} object
     * @returns {unknown}
     */
    accept(object: {
        type?: string;
    }): unknown;
    current: any;
    /**
     * Visits a `Program` node.
     *
     * @param {{ body: unknown[] }} program
     * @returns {void}
     */
    Program(program: {
        body: unknown[];
    }): void;
    MustacheStatement(mustache: any): void;
    Decorator(mustache: any): void;
    BlockStatement(block: any): void;
    DecoratorBlock(block: any): void;
    PartialStatement(partial: any): void;
    SubExpression(sexpr: any): void;
    /**
     * Visits a partial block node and its nested program.
     *
     * @param {object} partial
     * @returns {void}
     */
    PartialBlockStatement(partial: object): void;
    ContentStatement(): void;
    CommentStatement(): void;
    PathExpression(): void;
    StringLiteral(): void;
    NumberLiteral(): void;
    BooleanLiteral(): void;
    UndefinedLiteral(): void;
    NullLiteral(): void;
    /**
     * Visits a hash node.
     *
     * @param {{ pairs: unknown[] }} hash
     * @returns {void}
     */
    Hash(hash: {
        pairs: unknown[];
    }): void;
    /**
     * Visits a hash pair node.
     *
     * @param {object} pair
     * @returns {void}
     */
    HashPair(pair: object): void;
}
