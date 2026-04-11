/**
 * Compiler pass that applies Handlebars standalone and strip-whitespace rules.
 */
export default class WhitespaceControl extends Visitor {
    /**
     * @param {{ ignoreStandalone?: boolean }} options
     */
    constructor(options?: {
        ignoreStandalone?: boolean;
    });
    options: {
        ignoreStandalone?: boolean;
    };
    /**
     * Applies whitespace processing to a program body.
     *
     * @param {{ body: object[] }} program
     * @returns {object}
     */
    Program(program: {
        body: object[];
    }): object;
    isRootSeen: boolean;
    /**
     * @param {object} block
     * @returns {object}
     */
    BlockStatement(block: object): object;
    /**
     * @param {object} block
     * @returns {object}
     */
    DecoratorBlock(block: object): object;
    /**
     * @param {object} block
     * @returns {object}
     */
    PartialBlockStatement(block: object): object;
    /**
     * Applies whitespace processing shared by all block-like nodes.
     *
     * @param {object} block
     * @returns {{ open: boolean, close: boolean, openStandalone: boolean | undefined, closeStandalone: boolean | undefined }}
     */
    visitBlockLike(block: object): {
        open: boolean;
        close: boolean;
        openStandalone: boolean | undefined;
        closeStandalone: boolean | undefined;
    };
    /**
     * @param {{ strip?: object }} mustache
     * @returns {object}
     */
    Decorator(mustache: {
        strip?: object;
    }): object;
    /**
     * @param {{ strip?: object }} mustache
     * @returns {object}
     */
    MustacheStatement(mustache: {
        strip?: object;
    }): object;
    /**
     * @param {{ strip?: object }} node
     * @returns {object}
     */
    PartialStatement(node: {
        strip?: object;
    }): object;
    /**
     * @param {{ strip?: object }} node
     * @returns {object}
     */
    CommentStatement(node: {
        strip?: object;
    }): object;
    /**
     * Converts a standalone-capable node into strip metadata consumed by `Program`.
     *
     * @param {{ strip?: { open?: boolean, close?: boolean } }} node
     * @returns {{ inlineStandalone: boolean, open: boolean | undefined, close: boolean | undefined }}
     */
    visitStandaloneNode(node: {
        strip?: {
            open?: boolean;
            close?: boolean;
        };
    }): {
        inlineStandalone: boolean;
        open: boolean | undefined;
        close: boolean | undefined;
    };
}
import Visitor from '#handlebars/compiler/visitor';
