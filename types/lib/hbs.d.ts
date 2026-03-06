declare const _default: ExpressHbs;
export default _default;
export type AnyObject = Record<string, unknown>;
export type NodeStyleCallback = (err: Error | null, value?: unknown) => void;
export type ExpressRenderCallback = (err: Error | null, html: string | null) => void;
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
    handlebars?: typeof handlebars;
    i18n?: {
        __: Function;
        __n: Function;
    };
    onCompile?: (instance: ExpressHbs, source: string, filename?: string) => Function;
    templateOptions?: AnyObject;
};
/**
 * Handlebars view engine wrapper compatible with Express.
 */
declare class ExpressHbs {
    handlebars: import("./handlebars.js").LocalHandlebars;
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
    partialsDir: any;
    layoutsDir: any;
    restrictLayoutsTo: any;
    viewsDirOpt: any;
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
     * Finds and resolves a declared layout from template source.
     *
     * @param {string} str
     * @param {string} filename
     * @returns {string | undefined}
     */
    declaredLayoutFile(str: string, filename: string): string | undefined;
    /**
     * Builds a human-friendly template filename for error messages.
     *
     * @param {string | undefined} filename
     * @param {string | string[] | undefined} viewsDir
     * @returns {string | undefined}
     */
    _toErrorFilename(filename: string | undefined, viewsDir: string | string[] | undefined): string | undefined;
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
    _cacheLayout(layoutFile: string, useCache: boolean, viewsDir: string | string[]): Promise<Function[]>;
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
    onCompile: (instance: ExpressHbs, source: string, filename?: string) => Function;
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
     * Returns compiled template info, optionally reading from cache.
     *
     * @param {string} filename
     * @param {string | null} source
     * @param {boolean} useCache
     * @param {string | string[]} viewsDir
     * @returns {Promise<{ type: 'template', source: string, template: Function }>}
     */
    _getSourceTemplate(filename: string, source: string | null, useCache: boolean, viewsDir: string | string[]): Promise<{
        type: "template";
        source: string;
        template: Function;
    }>;
    /**
     * Resolves which layout templates should be applied to render request.
     *
     * @param {string} filename
     * @param {string} templateSource
     * @param {AnyObject} options
     * @param {string | string[]} viewsDir
     * @returns {Promise<Function[] | null>}
     */
    _resolveLayoutTemplates(filename: string, templateSource: string, options: AnyObject, viewsDir: string | string[]): Promise<Function[] | null>;
    /**
     * Builds a replacement table for async placeholder substitution.
     *
     * @param {Record<string, unknown>} values
     * @param {string[]} keys
     * @returns {{ id: string, escapedId: string, value: unknown, escapedValue: string }[]}
     */
    _buildAsyncReplacements(values: Record<string, unknown>, keys: string[]): {
        id: string;
        escapedId: string;
        value: unknown;
        escapedValue: string;
    }[];
    /**
     * Replaces async placeholder ids in a string.
     *
     * @param {unknown} text
     * @param {{ id: string, escapedId: string, value: unknown, escapedValue: string }[]} replacements
     * @returns {unknown}
     */
    _replaceValue(text: unknown, replacements: {
        id: string;
        escapedId: string;
        value: unknown;
        escapedValue: string;
    }[]): unknown;
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
import handlebars from '#handlebars';
