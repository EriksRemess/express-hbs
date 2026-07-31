/**
 * Small utility that assembles generated JavaScript fragments.
 */
export default class CodeGen {
    /**
     * @param {string} srcFile
     */
    constructor(srcFile: string);
    srcFile: string;
    source: any[];
    /**
     * @returns {boolean}
     */
    isEmpty(): boolean;
    /**
     * @param {unknown} source
     * @param {object} loc
     * @returns {void}
     */
    prepend(source: unknown, loc: object): void;
    /**
     * @param {unknown} source
     * @param {object} loc
     * @returns {void}
     */
    push(source: unknown, loc: object): void;
    /**
     * @returns {SourceNode}
     */
    merge(): SourceNode;
    /**
     * @param {(line: SourceNode) => void} iter
     * @returns {void}
     */
    each(iter: (line: SourceNode) => void): void;
    /**
     * @returns {SourceNode}
     */
    empty(): SourceNode;
    /**
     * @param {unknown} chunk
     * @param {object} loc
     * @returns {SourceNode}
     */
    wrap(chunk: unknown, loc?: object): SourceNode;
    /**
     * @param {string} fn
     * @param {string} type
     * @param {unknown[]} params
     * @returns {SourceNode}
     */
    functionCall(fn: string, type: string, params: unknown[]): SourceNode;
    /**
     * @param {unknown} str
     * @returns {string}
     */
    quotedString(str: unknown): string;
    /**
     * @param {Record<string, unknown>} obj
     * @returns {SourceNode}
     */
    objectLiteral(obj: Record<string, unknown>): SourceNode;
    /**
     * @param {unknown[]} entries
     * @returns {SourceNode}
     */
    generateList(entries: unknown[]): SourceNode;
    /**
     * @param {unknown[]} entries
     * @returns {SourceNode}
     */
    generateArray(entries: unknown[]): SourceNode;
}
/**
 * Minimal source node used by the local code generator.
 */
declare class SourceNode {
    /**
     * @param {number} line
     * @param {number} column
     * @param {string} srcFile
     * @param {string | string[] | SourceNode} chunks
     */
    constructor(line: number, column: number, srcFile: string, chunks: string | string[] | SourceNode);
    children: any[];
    /**
     * @param {string | string[] | SourceNode} chunks
     * @returns {void}
     */
    add(chunks: string | string[] | SourceNode): void;
    /**
     * @param {string | string[] | SourceNode} chunks
     * @returns {void}
     */
    prepend(chunks: string | string[] | SourceNode): void;
    /**
     * @returns {{ code: string }}
     */
    toStringWithSourceMap(): {
        code: string;
    };
    /**
     * @returns {string}
     */
    toString(): string;
}
export {};
