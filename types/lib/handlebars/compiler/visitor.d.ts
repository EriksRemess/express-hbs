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
    MustacheStatement: typeof visitSubExpression;
    Decorator: typeof visitSubExpression;
    BlockStatement: typeof visitBlock;
    DecoratorBlock: typeof visitBlock;
    PartialStatement: typeof visitPartial;
    SubExpression: typeof visitSubExpression;
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
/**
 * Visits a mustache-like node with a path, params, and hash.
 *
 * @this {Visitor}
 * @param {{ path?: object, params: object[], hash?: object }} mustache
 * @returns {void}
 */
declare function visitSubExpression(this: Visitor, mustache: {
    path?: object;
    params: object[];
    hash?: object;
}): void;
/**
 * Visits a block-like node including its nested programs.
 *
 * @this {Visitor}
 * @param {{ program?: object, inverse?: object }} block
 * @returns {void}
 */
declare function visitBlock(this: Visitor, block: {
    program?: object;
    inverse?: object;
}): void;
/**
 * Visits a partial-like node.
 *
 * @this {Visitor}
 * @param {{ name?: object, params: object[], hash?: object }} partial
 * @returns {void}
 */
declare function visitPartial(this: Visitor, partial: {
    name?: object;
    params: object[];
    hash?: object;
}): void;
export {};
