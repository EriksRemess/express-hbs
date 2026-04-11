declare const _default: ExpressHbs;
export default _default;
export type AnyObject = Record<string, unknown>;
export type NodeStyleCallback = (err: Error | null, value?: unknown) => void;
export type ExpressRenderCallback = (err: Error | null, html: string | null) => void;
export type LocalHandlebars = import("./handlebars.d.ts").LocalHandlebars;
export type CompileHook = (instance: ExpressHbs, source: string, filename?: string) => Function;
export type EngineOptions = AnyObject & {
    extname?: string;
    cache?: boolean;
    partialsDir?: string | string[];
    layoutsDir?: string | string[];
    restrictLayoutsTo?: string;
    viewsDir?: string | string[];
    defaultLayout?: string;
    refreshPartialsManifest?: boolean;
    contentHelperName?: string;
    blockHelperName?: string;
    handlebars?: LocalHandlebars;
    i18n?: {
        __: Function;
        __n: Function;
    };
    onCompile?: CompileHook;
    templateOptions?: AnyObject;
};
/**
 * Handlebars view engine wrapper compatible with Express.
 */
declare class ExpressHbs {
    _defaultHandlebars: import("./handlebars.d.ts").LocalHandlebars;
    /** @type {LocalHandlebars} */
    handlebars: LocalHandlebars;
    SafeString: new (value: string) => {
        toString(): string;
        toHTML(): string;
    };
    Utils: {
        escapeExpression(value: unknown): string;
    };
    cwd: string;
    _options: {
        templateOptions: {};
    };
    hasGlobalTemplateOptions: boolean;
    cache: Map<any, any>;
    defaultLayoutTemplates: Function[];
    isPartialCachingComplete: boolean;
    hasAsyncHelpers: boolean;
    partialsManifest: any[];
    partialsManifestKey: any;
    partialsSourceCache: any;
    partialsMetadataCache: any;
    uncachedLayoutCache: Map<any, any>;
    uncachedTemplateCache: Map<any, any>;
    partialsDir: any;
    layoutsDir: any;
    restrictLayoutsTo: any;
    restrictLayoutsRootRealpath: any;
    layoutRestrictionRootRealpaths: Map<any, any>;
    viewsDirOpt: any;
    normalizedViewsDirCacheInput: any;
    normalizedViewsDirCacheValue: string | false | string[];
    layoutPathCache: Map<any, any>;
    filenameDirCache: Map<any, any>;
    /** @type {CompileHook | undefined} */
    onCompile: CompileHook | undefined;
    _engineHelperNames: Set<any>;
    _engineHelpersHandlebars: import("./handlebars.d.ts").LocalHandlebars;
    /**
     * Syncs convenience aliases with the active Handlebars instance.
     *
     * @returns {void}
     */
    _syncHandlebarsAliases(): void;
    /**
     * Normalizes and caches the active views directory option.
     *
     * @param {string | string[] | undefined} viewsDir
     * @returns {string | string[] | undefined}
     */
    _normalizeViewsDir(viewsDir: string | string[] | undefined): string | string[] | undefined;
    /**
     * Memoizes dirname lookups for template files.
     *
     * @param {string} filename
     * @returns {string}
     */
    _dirname(filename: string): string;
    /**
     * Removes engine-managed helpers from the previously active Handlebars instance.
     *
     * @returns {void}
     */
    _clearEngineHelpers(): void;
    /**
     * Registers an engine-managed helper on the active Handlebars instance.
     *
     * @param {string} name
     * @param {Function} fn
     * @returns {void}
     */
    _registerEngineHelper(name: string, fn: Function): void;
    /**
     * Stores content for a named block.
     *
     * @param {string} name
     * @param {AnyObject} options
     * @param {unknown} context
     * @returns {void}
     */
    content(name: string, options: AnyObject, context: unknown): void;
    /**
     * Resolves a layout name to an absolute path.
     *
     * @param {string} filename
     * @param {string} layout
     * @param {string | string[]} viewsDir
     * @returns {string | undefined}
     */
    layoutPath(filename: string, layout: string, viewsDir: string | string[]): string | undefined;
    /**
     * Extracts a declared layout directive from template source.
     *
     * @param {string} str
     * @returns {string | undefined}
     */
    declaredLayout(str: string): string | undefined;
    /**
     * Finds and resolves a declared layout from template source.
     *
     * @param {string} str
     * @param {string} filename
     * @returns {string | undefined}
     */
    declaredLayoutFile(str: string, filename: string): string | undefined;
    /**
     * Resolves the implicit safe root for declarative layouts.
     *
     * @param {string} filename
     * @param {string | string[] | undefined} viewsDir
     * @param {string} layout
     * @returns {string | undefined}
     */
    _getImplicitDeclaredLayoutRestrictionRoot(filename: string, viewsDir: string | string[] | undefined, layout: string): string | undefined;
    /**
     * Builds a human-friendly template filename for error messages.
     *
     * @param {string | undefined} filename
     * @param {string | string[] | undefined} viewsDir
     * @returns {string | undefined}
     */
    _toErrorFilename(filename: string | undefined, viewsDir: string | string[] | undefined): string | undefined;
    /**
     * Resolves the implicit safe root for programmatic `options.layout`.
     *
     * @param {string} filename
     * @param {string | string[]} viewsDir
     * @param {string} layout
     * @returns {string | undefined}
     */
    _getImplicitLayoutRestrictionRoot(filename: string, viewsDir: string | string[], layout: string): string | undefined;
    /**
     * Validates that a layout path is inside an allowed root.
     *
     * @param {string} layoutFile
     * @param {string | undefined} allowedRoot
     * @returns {void}
     */
    _ensureLayoutWithinRoot(layoutFile: string, allowedRoot: string | undefined): void;
    /**
     * Validates that a layout path is inside `restrictLayoutsTo`, when configured.
     *
     * @param {string} layoutFile
     * @returns {void}
     */
    _ensureInRestrictLayoutsTo(layoutFile: string): void;
    /**
     * Loads and compiles a layout and its parent chain.
     *
     * @param {string} layoutFile
     * @param {boolean} useCache
     * @param {string | string[]} viewsDir
     * @returns {Promise<Function[]>}
     */
    _cacheLayout(layoutFile: string, useCache: boolean, viewsDir: string | string[], allowedRoot?: any): Promise<Function[]>;
    /**
     * Callback/Promise wrapper for layout caching.
     *
     * @param {string} layoutFile
     * @param {boolean} useCache
     * @param {NodeStyleCallback} [cb]
     * @param {string | string[]} [viewsDir]
     * @returns {Promise<Function[]> | void}
     */
    cacheLayout(layoutFile: string, useCache: boolean, cb?: NodeStyleCallback, viewsDir?: string | string[]): Promise<Function[]> | void;
    /**
     * Discovers and compiles partials from configured directories.
     *
     * @param {string | string[]} viewsDir
     * @returns {Promise<boolean>}
     */
    _cachePartials(viewsDir: string | string[]): Promise<boolean>;
    /**
     * Callback/Promise wrapper for partial caching.
     *
     * @param {NodeStyleCallback} [cb]
     * @param {string | string[]} [viewsDir]
     * @returns {Promise<boolean> | void}
     */
    cachePartials(cb?: NodeStyleCallback, viewsDir?: string | string[]): Promise<boolean> | void;
    /**
     * Clears partial directory manifest so it can be rebuilt on next render.
     *
     * @returns {void}
     */
    invalidatePartialsManifest(): void;
    /**
     * Configures this instance and returns an Express-compatible render function.
     *
     * @param {EngineOptions} options
     * @returns {(filename: string, sourceOrOptions: unknown, optionsOrCb: unknown, maybeCb?: ExpressRenderCallback) => void}
     */
    express(options: EngineOptions): (filename: string, sourceOrOptions: unknown, optionsOrCb: unknown, maybeCb?: ExpressRenderCallback) => void;
    /**
     * Backward-compatible Express 4 alias for `express()`.
     *
     * @param {EngineOptions} options
     * @returns {(filename: string, sourceOrOptions: unknown, optionsOrCb: unknown, maybeCb?: ExpressRenderCallback) => void}
     */
    express4(options: EngineOptions): (filename: string, sourceOrOptions: unknown, optionsOrCb: unknown, maybeCb?: ExpressRenderCallback) => void;
    /**
     * Loads default layout templates when configured.
     *
     * @param {boolean} useCache
     * @param {string | string[]} viewsDir
     * @returns {Promise<Function[] | null>}
     */
    _loadDefaultLayout(useCache: boolean, viewsDir: string | string[]): Promise<Function[] | null>;
    /**
     * Callback/Promise wrapper for default layout loading.
     *
     * @param {boolean} useCache
     * @param {NodeStyleCallback} [cb]
     * @param {string | string[]} [viewsDir]
     * @returns {Promise<Function[] | null> | void}
     */
    loadDefaultLayout(useCache: boolean, cb?: NodeStyleCallback, viewsDir?: string | string[]): Promise<Function[] | null> | void;
    /**
     * Registers a Handlebars helper.
     *
     * @param {string} name
     * @param {Function} fn
     * @returns {void}
     */
    registerHelper(name: string, fn: Function): void;
    /**
     * Registers a Handlebars partial by compiling the provided source.
     *
     * @param {string} name
     * @param {string} source
     * @param {string} [filename]
     * @param {string | string[]} [viewsDir]
     * @returns {void}
     */
    registerPartial(name: string, source: string, filename?: string, viewsDir?: string | string[]): void;
    /**
     * Registers a partial that compiles itself on first use.
     *
     * @param {string} name
     * @param {string} source
     * @param {string} filename
     * @param {string | string[]} [viewsDir]
     * @returns {void}
     */
    _registerLazyPartial(name: string, source: string, filename: string, viewsDir?: string | string[]): void;
    /**
     * Compiles a template source string.
     *
     * @param {string} source
     * @param {string} [filename]
     * @param {string | string[]} [viewsDir]
     * @returns {Function}
     */
    compile(source: string, filename?: string, viewsDir?: string | string[]): Function;
    /**
     * Registers an async helper that resolves values after initial render.
     *
     * @param {string} name
     * @param {Function} fn
     * @returns {void}
     */
    registerAsyncHelper(name: string, fn: Function): void;
    /**
     * Returns global template options.
     *
     * @returns {AnyObject}
     */
    getTemplateOptions(): AnyObject;
    /**
     * Replaces global template options.
     *
     * @param {AnyObject} templateOptions
     * @returns {void}
     */
    updateTemplateOptions(templateOptions: AnyObject): void;
    /**
     * Reads local template options from current locals.
     *
     * @param {AnyObject} locals
     * @returns {AnyObject}
     */
    getLocalTemplateOptions(locals: AnyObject): AnyObject;
    /**
     * Updates local template options on locals.
     *
     * @param {AnyObject} locals
     * @param {AnyObject | undefined} localTemplateOptions
     * @returns {AnyObject | undefined}
     */
    updateLocalTemplateOptions(locals: AnyObject, localTemplateOptions: AnyObject | undefined): AnyObject | undefined;
    /**
     * Creates a fresh engine instance.
     *
     * @returns {ExpressHbs}
     */
    create(): ExpressHbs;
    /**
     * Renders a compiled template with merged template options.
     *
     * @param {Function} template
     * @param {AnyObject} locals
     * @returns {string}
     */
    _renderTemplate(template: Function, locals: AnyObject): string;
    /**
     * Renders template output through zero or more layout templates.
     *
     * @param {Function} template
     * @param {AnyObject} locals
     * @param {Function[] | null} layoutTemplates
     * @returns {string}
     */
    _renderWithLayouts(template: Function, locals: AnyObject, layoutTemplates: Function[] | null): string;
    /**
     * Returns uncached layout info while avoiding rereads for unchanged files.
     *
     * @param {string} filename
     * @param {string | string[]} viewsDir
     * @returns {Promise<{ compiled: Function, parentLayoutFile: string | undefined }>}
     */
    _getUncachedLayoutInfo(filename: string, viewsDir: string | string[]): Promise<{
        compiled: Function;
        parentLayoutFile: string | undefined;
    }>;
    /**
     * Returns uncached template info while avoiding rereads for unchanged files.
     *
     * @param {string} filename
     * @param {string | string[]} viewsDir
     * @returns {Promise<{ type: 'template', source: string, template: Function, declaredLayout: string | undefined, declaredLayoutFile: string | undefined }>}
     */
    _getUncachedTemplateInfo(filename: string, viewsDir: string | string[]): Promise<{
        type: "template";
        source: string;
        template: Function;
        declaredLayout: string | undefined;
        declaredLayoutFile: string | undefined;
    }>;
    /**
     * Returns compiled template info, optionally reading from cache.
     *
     * @param {string} filename
     * @param {string | null} source
     * @param {boolean} useCache
     * @param {string | string[]} viewsDir
     * @returns {Promise<{ type: 'template', source: string, template: Function, declaredLayout: string | undefined, declaredLayoutFile: string | undefined }>}
     */
    _getSourceTemplate(filename: string, source: string | null, useCache: boolean, viewsDir: string | string[]): Promise<{
        type: "template";
        source: string;
        template: Function;
        declaredLayout: string | undefined;
        declaredLayoutFile: string | undefined;
    }>;
    /**
     * Resolves which layout templates should be applied to render request.
     *
     * @param {string} filename
     * @param {{ declaredLayout?: string, declaredLayoutFile?: string }} templateInfo
     * @param {AnyObject} options
     * @param {string | string[]} viewsDir
     * @returns {Promise<Function[] | null>}
     */
    _resolveLayoutTemplates(filename: string, templateInfo: {
        declaredLayout?: string;
        declaredLayoutFile?: string;
    }, options: AnyObject, viewsDir: string | string[]): Promise<Function[] | null>;
    /**
     * Updates replacement entries for a subset of async placeholders.
     *
     * @param {Record<string, unknown>} values
     * @param {Record<string, unknown>} replacements
     * @param {string[]} changedKeys
     * @param {Record<string, string>} escapedIds
     * @returns {void}
     */
    _updateAsyncReplacements(values: Record<string, unknown>, replacements: Record<string, unknown>, changedKeys: string[], escapedIds: Record<string, string>): void;
    /**
     * Replaces async placeholder ids in a string.
     *
     * @param {unknown} text
     * @param {Record<string, unknown>} replacements
     * @param {number} replacementCount
     * @returns {unknown}
     */
    _replaceValue(text: unknown, replacements: Record<string, unknown>, replacementCount: number): unknown;
    /**
     * Resolves pending async helper values.
     *
     * @param {Map<string, Promise<unknown>> | Record<string, Promise<unknown>>} cache
     * @returns {Promise<Record<string, unknown>>}
     */
    _resolveAsyncValues(cache: Map<string, Promise<unknown>> | Record<string, Promise<unknown>>): Promise<Record<string, unknown>>;
    /**
     * Repeatedly resolves async placeholders until the output is stable.
     *
     * @param {Map<string, Promise<unknown>> | Record<string, Promise<unknown>>} resolverCache
     * @param {string} html
     * @returns {Promise<string>}
     */
    _resolveAsyncHtml(resolverCache: Map<string, Promise<unknown>> | Record<string, Promise<unknown>>, html: string): Promise<string>;
    /**
     * Core renderer used by Express adapter.
     *
     * @param {string} filename
     * @param {string | null} source
     * @param {AnyObject} options
     * @returns {Promise<string>}
     */
    _renderFile(filename: string, source: string | null, options: AnyObject): Promise<string>;
    /**
     * Express view-engine entry point.
     *
     * @param {string} filename
     * @param {AnyObject | null} sourceOrOptions
     * @param {AnyObject | ExpressRenderCallback} optionsOrCb
     * @param {ExpressRenderCallback} [maybeCb]
     * @returns {void}
     */
    ___express(filename: string, sourceOrOptions: AnyObject | null, optionsOrCb: AnyObject | ExpressRenderCallback, maybeCb?: ExpressRenderCallback): void;
}
