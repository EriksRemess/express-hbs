export default JavaScriptCompiler;
declare class JavaScriptCompiler {
    nameLookup(parent: any, name: any): any[];
    depthedLookup(name: any): any[];
    appendToBuffer(source: any, location: any, explicit: any): any;
    initializeBuffer(): string;
    internalNameLookup(parent: any, name: any): any[];
    lookupPropertyFunctionIsUsed: boolean;
    compile(environment: any, options: any, context: any, asObject: any): any;
    environment: any;
    options: any;
    stringParams: any;
    trackIds: any;
    precompile: boolean;
    name: any;
    isChild: boolean;
    context: any;
    stackSlot: number;
    stackVars: any[];
    aliases: {};
    registers: {
        list: any[];
    };
    hashes: any[];
    compileStack: any[];
    inlineStack: any[];
    blockParams: any[];
    useDepths: any;
    useBlockParams: any;
    useDecorators: boolean;
    decorators: any;
    preamble(): void;
    lastContext: any;
    source: CodeGen;
    createFunctionContext(asObject: any): any;
    mergeSource(varDeclarations: any): {
        src: string;
        add(chunks: any): void;
        prepend(chunks: any): void;
        toStringWithSourceMap(): {
            code: string;
        };
        toString(): string;
    };
    lookupPropertyFunctionVarDeclaration(): string;
    blockValue(name: any): void;
    ambiguousBlockValue(): void;
    appendContent(content: any): void;
    pendingLocation: any;
    pendingContent: any;
    append(): void;
    appendEscaped(): void;
    getContext(depth: any): void;
    pushContext(): void;
    lookupOnContext(parts: any, falsy: any, strict: any, scoped: any): void;
    lookupBlockParam(blockParamId: any, parts: any): void;
    lookupData(depth: any, parts: any, strict: any): void;
    resolvePath(type: any, parts: any, i: any, falsy: any, strict: any): void;
    resolvePossibleLambda(): void;
    pushStringParam(string: any, type: any, idType: any, idName: any, idChild: any): void;
    emptyHash(omitEmpty: any): void;
    pushHash(): void;
    hash: any;
    popHash(): void;
    pushString(string: any): void;
    pushLiteral(value: any): void;
    pushProgram(guid: any): void;
    registerDecorator(paramSize: any, name: any): void;
    invokeHelper(paramSize: any, name: any, isSimple: any): void;
    itemsSeparatedBy(items: any, separator: any): any[];
    invokeKnownHelper(paramSize: any, name: any): void;
    invokeAmbiguous(name: any, helperCall: any): void;
    lastHelper: any[];
    invokePartial(isDynamic: any, name: any, indent: any): void;
    assignToHash(key: any): void;
    pushId(type: any, name: any, child: any): void;
    compileChildren(environment: any, options: any): void;
    matchExistingProgram(child: any): any;
    programExpression(guid: any): string;
    useRegister(name: any): void;
    push(expr: any): any;
    pushStackLiteral(item: any): void;
    pushSource(source: any): void;
    replaceStack(callback: any): void;
    incrStack(): string;
    topStackName(): string;
    flushInline(): void;
    isInline(): number;
    popStack(wrapped: any): any;
    topStack(): any;
    contextName(context: any): string;
    quotedString(str: any): string;
    objectLiteral(obj: any): {
        src: string;
        add(chunks: any): void;
        prepend(chunks: any): void;
        toStringWithSourceMap(): {
            code: string;
        };
        toString(): string;
    };
    aliasable(name: any): any;
    setupHelper(paramSize: any, name: any, blockHelper: any): {
        params: any[];
        paramsInit: string | {
            name: string;
            hash: any;
            hashIds: any;
            hashTypes: any;
            hashContexts: any;
            fn: any;
            inverse: any;
            args: {
                src: string;
                add(chunks: any): void;
                prepend(chunks: any): void;
                toStringWithSourceMap(): {
                    code: string;
                };
                toString(): string;
            };
            ids: {
                src: string;
                add(chunks: any): void;
                prepend(chunks: any): void;
                toStringWithSourceMap(): {
                    code: string;
                };
                toString(): string;
            };
            types: {
                src: string;
                add(chunks: any): void;
                prepend(chunks: any): void;
                toStringWithSourceMap(): {
                    code: string;
                };
                toString(): string;
            };
            contexts: {
                src: string;
                add(chunks: any): void;
                prepend(chunks: any): void;
                toStringWithSourceMap(): {
                    code: string;
                };
                toString(): string;
            };
            data: string;
            partialName: string;
            blockParams: string;
        } | (string | {
            name: string;
            hash: any;
            hashIds: any;
            hashTypes: any;
            hashContexts: any;
            fn: any;
            inverse: any;
            args: {
                src: string;
                add(chunks: any): void;
                prepend(chunks: any): void;
                toStringWithSourceMap(): {
                    code: string;
                };
                toString(): string;
            };
            ids: {
                src: string;
                add(chunks: any): void;
                prepend(chunks: any): void;
                toStringWithSourceMap(): {
                    code: string;
                };
                toString(): string;
            };
            types: {
                src: string;
                add(chunks: any): void;
                prepend(chunks: any): void;
                toStringWithSourceMap(): {
                    code: string;
                };
                toString(): string;
            };
            contexts: {
                src: string;
                add(chunks: any): void;
                prepend(chunks: any): void;
                toStringWithSourceMap(): {
                    code: string;
                };
                toString(): string;
            };
            data: string;
            partialName: string;
            blockParams: string;
        })[];
        name: any[];
        callParams: any[];
    };
    setupParams(helper: any, paramSize: any, params: any): {
        name: string;
        hash: any;
        hashIds: any;
        hashTypes: any;
        hashContexts: any;
        fn: any;
        inverse: any;
        args: {
            src: string;
            add(chunks: any): void;
            prepend(chunks: any): void;
            toStringWithSourceMap(): {
                code: string;
            };
            toString(): string;
        };
        ids: {
            src: string;
            add(chunks: any): void;
            prepend(chunks: any): void;
            toStringWithSourceMap(): {
                code: string;
            };
            toString(): string;
        };
        types: {
            src: string;
            add(chunks: any): void;
            prepend(chunks: any): void;
            toStringWithSourceMap(): {
                code: string;
            };
            toString(): string;
        };
        contexts: {
            src: string;
            add(chunks: any): void;
            prepend(chunks: any): void;
            toStringWithSourceMap(): {
                code: string;
            };
            toString(): string;
        };
        data: string;
        partialName: string;
        blockParams: string;
    };
    setupHelperArgs(helper: any, paramSize: any, params: any, useRegister: any): "" | {
        name: string;
        hash: any;
        hashIds: any;
        hashTypes: any;
        hashContexts: any;
        fn: any;
        inverse: any;
        args: {
            src: string;
            add(chunks: any): void;
            prepend(chunks: any): void;
            toStringWithSourceMap(): {
                code: string;
            };
            toString(): string;
        };
        ids: {
            src: string;
            add(chunks: any): void;
            prepend(chunks: any): void;
            toStringWithSourceMap(): {
                code: string;
            };
            toString(): string;
        };
        types: {
            src: string;
            add(chunks: any): void;
            prepend(chunks: any): void;
            toStringWithSourceMap(): {
                code: string;
            };
            toString(): string;
        };
        contexts: {
            src: string;
            add(chunks: any): void;
            prepend(chunks: any): void;
            toStringWithSourceMap(): {
                code: string;
            };
            toString(): string;
        };
        data: string;
        partialName: string;
        blockParams: string;
    } | (string | {
        name: string;
        hash: any;
        hashIds: any;
        hashTypes: any;
        hashContexts: any;
        fn: any;
        inverse: any;
        args: {
            src: string;
            add(chunks: any): void;
            prepend(chunks: any): void;
            toStringWithSourceMap(): {
                code: string;
            };
            toString(): string;
        };
        ids: {
            src: string;
            add(chunks: any): void;
            prepend(chunks: any): void;
            toStringWithSourceMap(): {
                code: string;
            };
            toString(): string;
        };
        types: {
            src: string;
            add(chunks: any): void;
            prepend(chunks: any): void;
            toStringWithSourceMap(): {
                code: string;
            };
            toString(): string;
        };
        contexts: {
            src: string;
            add(chunks: any): void;
            prepend(chunks: any): void;
            toStringWithSourceMap(): {
                code: string;
            };
            toString(): string;
        };
        data: string;
        partialName: string;
        blockParams: string;
    })[];
}
import CodeGen from '#handlebars/compiler/code-gen';
