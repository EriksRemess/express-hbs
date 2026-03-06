export default class CodeGen {
    constructor(srcFile: any);
    srcFile: any;
    source: any[];
    isEmpty(): boolean;
    prepend(source: any, loc: any): void;
    push(source: any, loc: any): void;
    merge(): SourceNode;
    each(iter: any): void;
    empty(): SourceNode;
    wrap(chunk: any, loc?: any): SourceNode;
    functionCall(fn: any, type: any, params: any): SourceNode;
    quotedString(str: any): string;
    objectLiteral(obj: any): SourceNode;
    generateList(entries: any): SourceNode;
    generateArray(entries: any): SourceNode;
}
declare class SourceNode {
    constructor(line: any, column: any, srcFile: any, chunks: any);
    src: string;
    add(chunks: any): void;
    prepend(chunks: any): void;
    toStringWithSourceMap(): {
        code: string;
    };
    toString(): string;
}
export {};
