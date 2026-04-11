export default JavaScriptCompiler;
/**
 * Compiles the Handlebars opcode stream into an executable template function.
 */
declare class JavaScriptCompiler {
    /**
     * Resolves a property access expression for generated code.
     *
     * @param {string | import('#handlebars/compiler/code-gen').default} parent
     * @param {string} name
     * @returns {Array<string | import('#handlebars/compiler/code-gen').default>}
     */
    nameLookup(parent: string | import("#handlebars/compiler/code-gen").default, name: string): Array<string | import("#handlebars/compiler/code-gen").default>;
    /**
     * Emits a lookup that walks up the depth stack at runtime.
     *
     * @param {string} name
     * @returns {Array<string>}
     */
    depthedLookup(name: string): Array<string>;
    /**
     * Appends generated source to the output buffer or returns the source directly for simple templates.
     *
     * @param {string | Array<unknown> | import('#handlebars/compiler/code-gen').default} source
     * @param {Record<string, unknown>=} location
     * @param {boolean=} explicit
     * @returns {Array<unknown> | import('#handlebars/compiler/code-gen').default}
     */
    appendToBuffer(source: string | Array<unknown> | import("#handlebars/compiler/code-gen").default, location?: Record<string, unknown> | undefined, explicit?: boolean | undefined): Array<unknown> | import("#handlebars/compiler/code-gen").default;
    initializeBuffer(): string;
    /**
     * Emits a guarded property lookup through the runtime `lookupProperty` helper.
     *
     * @param {string | import('#handlebars/compiler/code-gen').default} parent
     * @param {string} name
     * @returns {Array<string | import('#handlebars/compiler/code-gen').default>}
     */
    internalNameLookup(parent: string | import("#handlebars/compiler/code-gen").default, name: string): Array<string | import("#handlebars/compiler/code-gen").default>;
    lookupPropertyFunctionIsUsed: boolean;
    /**
     * Compiles a parsed template environment into a template function or precompiled spec object.
     *
     * @param {Record<string, unknown>} environment
     * @param {Record<string, unknown>} options
     * @param {Record<string, unknown>=} context
     * @param {boolean=} asObject
     * @returns {unknown}
     */
    compile(environment: Record<string, unknown>, options: Record<string, unknown>, context?: Record<string, unknown> | undefined, asObject?: boolean | undefined): unknown;
    environment: Record<string, unknown>;
    options: Record<string, unknown>;
    stringParams: unknown;
    trackIds: unknown;
    precompile: boolean;
    forceBuffer: boolean;
    name: unknown;
    isChild: boolean;
    context: Record<string, unknown>;
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
    /**
     * Resets per-compilation state shared by opcode emitters.
     */
    preamble(): void;
    lastContext: any;
    source: CodeGen;
    /**
     * Builds the final function body for the current program.
     *
     * @param {boolean} asObject
     * @returns {Function | import('#handlebars/compiler/code-gen').default}
     */
    createFunctionContext(asObject: boolean): Function | import("#handlebars/compiler/code-gen").default;
    /**
     * Folds adjacent buffer appends into the smallest source representation available.
     *
     * @param {string} varDeclarations
     * @returns {import('#handlebars/compiler/code-gen').default}
     */
    mergeSource(varDeclarations: string): import("#handlebars/compiler/code-gen").default;
    /**
     * Generates the fallback `lookupProperty` helper declaration used by compiled templates.
     *
     * @returns {string}
     */
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
    /**
     * Joins emitted code fragments with a separator without flattening the original items first.
     *
     * @param {unknown[]} items
     * @param {string} separator
     * @returns {unknown[]}
     */
    itemsSeparatedBy(items: unknown[], separator: string): unknown[];
    invokeKnownHelper(paramSize: any, name: any): void;
    invokeAmbiguous(name: any, helperCall: any): void;
    lastHelper: (string | CodeGen)[];
    invokePartial(isDynamic: any, name: any, indent: any): void;
    assignToHash(key: any): void;
    pushId(type: any, name: any, child: any): void;
    /**
     * Compiles nested block programs and reuses previously compiled equivalents when possible.
     *
     * @param {Record<string, unknown>} environment
     * @param {Record<string, unknown>} options
     */
    compileChildren(environment: Record<string, unknown>, options: Record<string, unknown>): void;
    /**
     * Returns a previously compiled child program with an equivalent environment, if present.
     *
     * @param {{ equals(environment: unknown): boolean }} child
     * @returns {unknown}
     */
    matchExistingProgram(child: {
        equals(environment: unknown): boolean;
    }): unknown;
    /**
     * Builds the runtime expression that loads a compiled child program.
     *
     * @param {number} guid
     * @returns {string}
     */
    programExpression(guid: number): string;
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
        add(chunks: string | string[] | /*elided*/ any): void;
        prepend(chunks: string | string[] | /*elided*/ any): void;
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
                add(chunks: string | string[] | /*elided*/ any): void;
                prepend(chunks: string | string[] | /*elided*/ any): void;
                toStringWithSourceMap(): {
                    code: string;
                };
                toString(): string;
            };
            ids: {
                src: string;
                add(chunks: string | string[] | /*elided*/ any): void;
                prepend(chunks: string | string[] | /*elided*/ any): void;
                toStringWithSourceMap(): {
                    code: string;
                };
                toString(): string;
            };
            types: {
                src: string;
                add(chunks: string | string[] | /*elided*/ any): void;
                prepend(chunks: string | string[] | /*elided*/ any): void;
                toStringWithSourceMap(): {
                    code: string;
                };
                toString(): string;
            };
            contexts: {
                src: string;
                add(chunks: string | string[] | /*elided*/ any): void;
                prepend(chunks: string | string[] | /*elided*/ any): void;
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
                add(chunks: string | string[] | /*elided*/ any): void;
                prepend(chunks: string | string[] | /*elided*/ any): void;
                toStringWithSourceMap(): {
                    code: string;
                };
                toString(): string;
            };
            ids: {
                src: string;
                add(chunks: string | string[] | /*elided*/ any): void;
                prepend(chunks: string | string[] | /*elided*/ any): void;
                toStringWithSourceMap(): {
                    code: string;
                };
                toString(): string;
            };
            types: {
                src: string;
                add(chunks: string | string[] | /*elided*/ any): void;
                prepend(chunks: string | string[] | /*elided*/ any): void;
                toStringWithSourceMap(): {
                    code: string;
                };
                toString(): string;
            };
            contexts: {
                src: string;
                add(chunks: string | string[] | /*elided*/ any): void;
                prepend(chunks: string | string[] | /*elided*/ any): void;
                toStringWithSourceMap(): {
                    code: string;
                };
                toString(): string;
            };
            data: string;
            partialName: string;
            blockParams: string;
        })[];
        name: (string | CodeGen)[];
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
            add(chunks: string | string[] | /*elided*/ any): void;
            prepend(chunks: string | string[] | /*elided*/ any): void;
            toStringWithSourceMap(): {
                code: string;
            };
            toString(): string;
        };
        ids: {
            src: string;
            add(chunks: string | string[] | /*elided*/ any): void;
            prepend(chunks: string | string[] | /*elided*/ any): void;
            toStringWithSourceMap(): {
                code: string;
            };
            toString(): string;
        };
        types: {
            src: string;
            add(chunks: string | string[] | /*elided*/ any): void;
            prepend(chunks: string | string[] | /*elided*/ any): void;
            toStringWithSourceMap(): {
                code: string;
            };
            toString(): string;
        };
        contexts: {
            src: string;
            add(chunks: string | string[] | /*elided*/ any): void;
            prepend(chunks: string | string[] | /*elided*/ any): void;
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
            add(chunks: string | string[] | /*elided*/ any): void;
            prepend(chunks: string | string[] | /*elided*/ any): void;
            toStringWithSourceMap(): {
                code: string;
            };
            toString(): string;
        };
        ids: {
            src: string;
            add(chunks: string | string[] | /*elided*/ any): void;
            prepend(chunks: string | string[] | /*elided*/ any): void;
            toStringWithSourceMap(): {
                code: string;
            };
            toString(): string;
        };
        types: {
            src: string;
            add(chunks: string | string[] | /*elided*/ any): void;
            prepend(chunks: string | string[] | /*elided*/ any): void;
            toStringWithSourceMap(): {
                code: string;
            };
            toString(): string;
        };
        contexts: {
            src: string;
            add(chunks: string | string[] | /*elided*/ any): void;
            prepend(chunks: string | string[] | /*elided*/ any): void;
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
            add(chunks: string | string[] | /*elided*/ any): void;
            prepend(chunks: string | string[] | /*elided*/ any): void;
            toStringWithSourceMap(): {
                code: string;
            };
            toString(): string;
        };
        ids: {
            src: string;
            add(chunks: string | string[] | /*elided*/ any): void;
            prepend(chunks: string | string[] | /*elided*/ any): void;
            toStringWithSourceMap(): {
                code: string;
            };
            toString(): string;
        };
        types: {
            src: string;
            add(chunks: string | string[] | /*elided*/ any): void;
            prepend(chunks: string | string[] | /*elided*/ any): void;
            toStringWithSourceMap(): {
                code: string;
            };
            toString(): string;
        };
        contexts: {
            src: string;
            add(chunks: string | string[] | /*elided*/ any): void;
            prepend(chunks: string | string[] | /*elided*/ any): void;
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
