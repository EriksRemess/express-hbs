import { done, hasResolvers, resolve } from '#lib/resolver';
import handlebars from './handlebars.js';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * @typedef {Record<string, unknown>} AnyObject
 */

/**
 * @callback NodeStyleCallback
 * @param {Error | null} err
 * @param {unknown} [value]
 * @returns {void}
 */

/**
 * @callback ExpressRenderCallback
 * @param {Error | null} err
 * @param {string | null} html
 * @returns {void}
 */

/**
 * @typedef {AnyObject & {
 *   extname?: string,
 *   cache?: boolean,
 *   partialsDir?: string | string[],
 *   layoutsDir?: string | string[],
 *   restrictLayoutsTo?: string,
 *   viewsDir?: string | string[],
 *   defaultLayout?: string,
 *   refreshPartialsManifest?: boolean,
 *   contentHelperName?: string,
 *   blockHelperName?: string,
 *   handlebars?: typeof handlebars,
 *   i18n?: { __: Function, __n: Function },
 *   onCompile?: (instance: ExpressHbs, source: string, filename?: string) => Function,
 *   templateOptions?: AnyObject
 * }} EngineOptions
 */

const isUnsafeKey = new Set(['__proto__', 'constructor', 'prototype']);
const plainObjectTag = '[object Object]';
const emptyObject = Object.freeze({});

const isPlainObject = (value) => Object.prototype.toString.call(value) === plainObjectTag;
const attachNodeStyleCallback = (promise, cb, nullOnError = false) => {
  void promise.then(
    (value) => cb(null, value),
    (err) => cb(err, nullOnError ? null : undefined)
  );
};
const cloneWithoutTemplateOptions = (locals) => {
  const clone = {};

  for (const key in locals) {
    if (!Object.hasOwn(locals, key) || key === '_templateOptions') {
      continue;
    }

    clone[key] = locals[key];
  }

  return clone;
};
const hideTemplateOptions = (locals) => {
  const localTemplateOptions = locals._templateOptions;

  if (Reflect.deleteProperty(locals, '_templateOptions')) {
    return {
      localTemplateOptions,
      renderLocals: locals,
      restore: true
    };
  }

  return {
    localTemplateOptions,
    renderLocals: cloneWithoutTemplateOptions(locals),
    restore: false
  };
};

/**
 * Deep-merges plain objects into `target` and replaces arrays by value.
 *
 * @param {AnyObject} target - Merge destination.
 * @param {unknown} source - Merge source.
 * @returns {AnyObject}
 */
const mergeObject = (target, source) => {
  if (!source || typeof source !== 'object') {
    return target;
  }

  for (const key in source) {
    if (!Object.hasOwn(source, key) || isUnsafeKey.has(key)) {
      continue;
    }

    const sourceValue = source[key];

    if (Array.isArray(sourceValue)) {
      target[key] = sourceValue.slice();
      continue;
    }

    if (sourceValue && isPlainObject(sourceValue)) {
      const targetValue = target[key];
      target[key] = mergeObject(targetValue && isPlainObject(targetValue) ? targetValue : {}, sourceValue);
      continue;
    }

    target[key] = sourceValue;
  }

  return target;
};

/**
 * Checks whether `value` has at least one enumerable key.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
const hasEnumerableKeys = (value) => {
  if (value == null) {
    return false;
  }

  for (const key in value) {
    if (Object.hasOwn(value, key)) {
      return true;
    }
  }

  return false;
};

let supportsGlobWithFileTypes;

async function canUseGlobWithFileTypes() {
  if (supportsGlobWithFileTypes !== undefined) {
    return supportsGlobWithFileTypes;
  }

  if (typeof fs.glob !== 'function') {
    supportsGlobWithFileTypes = false;
    return false;
  }

  try {
    for await (const entry of fs.glob('*', { cwd: process.cwd(), withFileTypes: true })) {
      void entry;
      break;
    }
    supportsGlobWithFileTypes = true;
  } catch {
    supportsGlobWithFileTypes = false;
  }

  return supportsGlobWithFileTypes;
}

/**
 * Recursively lists files inside `rootDir`.
 *
 * @param {string} rootDir
 * @returns {Promise<string[]>}
 */
async function listFilesRecursive(rootDir) {
  const files = [];

  if (await canUseGlobWithFileTypes()) {
    for await (const entry of fs.glob('**/*', { cwd: rootDir, withFileTypes: true })) {
      if (entry.isFile()) {
        const parentDir = entry.parentPath ?? rootDir;
        const entryPath = path.join(parentDir, entry.name);
        files.push(entryPath);
      }
    }

    return files;
  }

  const pendingDirs = [rootDir];
  while (pendingDirs.length > 0) {
    const currentDir = pendingDirs.pop();
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);

      if (entry.isFile()) {
        files.push(entryPath);
      } else if (entry.isDirectory()) {
        pendingDirs.push(entryPath);
      }
    }
  }

  return files;
}

/**
 * Regex pattern for layout directive. {{!< layout }}
 */
const layoutPattern = /{{!<\s+([A-Za-z0-9\._\-\/]+)\s*}}/;

/**
 * Handlebars view engine wrapper compatible with Express.
 */
class ExpressHbs {
  /**
   * Initializes engine state and caches.
   */
  constructor() {
    this.handlebars = handlebars.create();
    this.SafeString = this.handlebars.SafeString;
    this.Utils = this.handlebars.Utils;
    this.cwd = process.cwd();

    this._options = { templateOptions: {} };
    this.hasGlobalTemplateOptions = false;
    this.cache = new Map();
    this.defaultLayoutTemplates = null;
    this.isPartialCachingComplete = false;
    this.hasAsyncHelpers = false;
    this.partialsManifest = null;
    this.partialsManifestKey = null;
    this.partialsSourceCache = null;

    this.partialsDir = null;
    this.layoutsDir = null;
    this.restrictLayoutsTo = null;
    this.viewsDirOpt = null;
  }

  /**
   * Stores content for a named block.
   *
   * @param {string} name
   * @param {AnyObject} options
   * @param {unknown} context
   * @returns {void}
   */
  content(name, options, context) {
    const block = options.data.root.blockCache[name] ?? (options.data.root.blockCache[name] = []);
    block.push(options.fn(context));
  }

  /**
   * Resolves a layout name to an absolute path.
   *
   * @param {string} filename
   * @param {string} layout
   * @param {string | string[]} viewsDir
   * @returns {string | undefined}
   */
  layoutPath(filename, layout, viewsDir) {
    if (layout.startsWith('.')) {
      return path.resolve(path.dirname(filename), layout);
    }

    if (this.layoutsDir) {
      if (Array.isArray(this.layoutsDir)) {
        if (this.layoutsDir.length === 0) {
          return;
        }
        return path.resolve(this.layoutsDir[0], layout);
      }
      return path.resolve(this.layoutsDir, layout);
    }

    if (Array.isArray(viewsDir)) {
      if (viewsDir.length === 0) {
        return;
      }
      return path.resolve(viewsDir[0], layout);
    }
    return path.resolve(viewsDir, layout);
  }

  /**
   * Finds and resolves a declared layout from template source.
   *
   * @param {string} str
   * @param {string} filename
   * @returns {string | undefined}
   */
  declaredLayoutFile(str, filename) {
    const matches = str.match(layoutPattern);
    if (!matches) {
      return;
    }

    let layout = matches[1];

    // behave like `require`, if '.' then relative, else look in usual location (layoutsDir)
    if (this.layoutsDir && !layout.startsWith('.')) {
      if (Array.isArray(this.layoutsDir)) {
        if (this.layoutsDir.length > 0) {
          layout = path.resolve(this.layoutsDir[0], layout);
        }
      } else {
        layout = path.resolve(this.layoutsDir, layout);
      }
    }

    return path.resolve(path.dirname(filename), layout);
  }

  /**
   * Builds a human-friendly template filename for error messages.
   *
   * @param {string | undefined} filename
   * @param {string | string[] | undefined} viewsDir
   * @returns {string | undefined}
   */
  _toErrorFilename(filename, viewsDir) {
    if (!filename) {
      return filename;
    }

    if (Array.isArray(viewsDir) && viewsDir.length > 0) {
      return path.relative(this.cwd, filename).replace(/\\/g, '/');
    }

    return path.relative(viewsDir ?? '', filename).replace(/\\/g, '/');
  }

  /**
   * Validates that a layout path is inside `restrictLayoutsTo`, when configured.
   *
   * @param {string} layoutFile
   * @returns {void}
   */
  _ensureInRestrictLayoutsTo(layoutFile) {
    if (!this.restrictLayoutsTo) {
      return;
    }

    const root = path.resolve(this.restrictLayoutsTo);
    const resolved = path.resolve(layoutFile);
    const relativePath = path.relative(root, resolved);
    const isRoot = relativePath === '';
    const isDescendant = !relativePath.startsWith('..') && !path.isAbsolute(relativePath);

    if (!isRoot && !isDescendant) {
      throw new Error(`Cannot read ${layoutFile} it does not reside in ${this.restrictLayoutsTo}`);
    }
  }

  /**
   * Loads and compiles a layout and its parent chain.
   *
   * @param {string} layoutFile
   * @param {boolean} useCache
   * @param {string | string[]} viewsDir
   * @returns {Promise<Function[]>}
   */
  async _cacheLayout(layoutFile, useCache, viewsDir) {
    this._ensureInRestrictLayoutsTo(layoutFile);

    let targetLayoutFile = layoutFile;
    if (path.extname(targetLayoutFile) === '') {
      targetLayoutFile += this._options.extname;
    }

    const cached = this.cache.get(targetLayoutFile);
    if (cached?.type === 'layout') {
      return cached.templates;
    }

    const source = await fs.readFile(targetLayoutFile, 'utf8');
    const parentLayoutFile = this.declaredLayoutFile(source, targetLayoutFile);

    let layouts = [];
    if (parentLayoutFile) {
      layouts = await this._cacheLayout(parentLayoutFile, useCache, viewsDir);
    }

    const compiled = this.compile(source, targetLayoutFile, viewsDir);
    const result = [...layouts, compiled];

    if (useCache) {
      this.cache.set(targetLayoutFile, {
        type: 'layout',
        templates: result
      });
    }

    return result;
  }

  /**
   * Callback/Promise wrapper for layout caching.
   *
   * @param {string} layoutFile
   * @param {boolean} useCache
   * @param {NodeStyleCallback} [cb]
   * @param {string | string[]} [viewsDir]
   * @returns {Promise<Function[]> | void}
   */
  cacheLayout(layoutFile, useCache, cb, viewsDir) {
    const promise = this._cacheLayout(layoutFile, useCache, viewsDir ?? this.viewsDirOpt);

    if (typeof cb === 'function') {
      attachNodeStyleCallback(promise, cb, true);
      return;
    }

    return promise;
  }

  /**
   * Discovers and compiles partials from configured directories.
   *
   * @param {string | string[]} viewsDir
   * @returns {Promise<boolean>}
   */
  async _cachePartials(viewsDir) {
    if (!this.partialsDir) {
      return true;
    }

    const partialRoots = Array.isArray(this.partialsDir)
      ? this.partialsDir
      : [this.partialsDir];
    const manifestKey = `${this._options.extname}:${partialRoots.join('\n')}`;

    const shouldRefreshManifest = this._options.refreshPartialsManifest || !this.partialsManifest || this.partialsManifestKey !== manifestKey;
    if (shouldRefreshManifest) {
      this.partialsManifest = [];
      this.partialsManifestKey = manifestKey;
      this.partialsSourceCache = new Map();

      for (const partialRoot of partialRoots) {
        const files = await listFilesRecursive(partialRoot);
        files.sort();

        for (const fullPath of files) {
          if (!fullPath.endsWith(this._options.extname)) {
            continue;
          }

          const relativePath = path.relative(partialRoot, fullPath);
          const dirname = path.dirname(relativePath);
          const namePrefix = dirname === '.' ? '' : `${dirname}/`;
          const basename = path.basename(relativePath, this._options.extname);
          const name = (namePrefix + basename).replace(/\\/g, '/');

          this.partialsManifest.push({
            fullPath,
            name
          });
        }
      }
    }

    const manifest = this.partialsManifest;
    const reads = manifest.map(({ fullPath }) => fs.readFile(fullPath, 'utf8'));
    const sources = await Promise.all(reads);

    // Preserve legacy behavior for custom compile hooks.
    if (this.onCompile) {
      for (let index = 0; index < manifest.length; index += 1) {
        const entry = manifest[index];
        const source = sources[index];
        this.registerPartial(entry.name, source, entry.fullPath, viewsDir);
      }
    } else {
      const sourceCache = this.partialsSourceCache ?? new Map();
      this.partialsSourceCache = sourceCache;

      for (let index = 0; index < manifest.length; index += 1) {
        const entry = manifest[index];
        const source = sources[index];
        const previousSource = sourceCache.get(entry.fullPath);
        if (previousSource === source) {
          continue;
        }

        sourceCache.set(entry.fullPath, source);
        this.registerPartial(entry.name, source, entry.fullPath, viewsDir);
      }
    }

    this.isPartialCachingComplete = true;
    return true;
  }

  /**
   * Callback/Promise wrapper for partial caching.
   *
   * @param {NodeStyleCallback} [cb]
   * @param {string | string[]} [viewsDir]
   * @returns {Promise<boolean> | void}
   */
  cachePartials(cb, viewsDir) {
    const promise = this._cachePartials(viewsDir ?? this.viewsDirOpt);

    if (typeof cb === 'function') {
      attachNodeStyleCallback(promise, cb);
      return;
    }

    return promise;
  }

  /**
   * Clears partial directory manifest so it can be rebuilt on next render.
   *
   * @returns {void}
   */
  invalidatePartialsManifest() {
    this.partialsManifest = null;
    this.partialsManifestKey = null;
    this.partialsSourceCache = null;
  }

  /**
   * Configures this instance and returns an Express-compatible render function.
   *
   * @param {EngineOptions} options
   * @returns {(filename: string, sourceOrOptions: unknown, optionsOrCb: unknown, maybeCb?: ExpressRenderCallback) => void}
   */
  express(options) {
    const instance = this;
    const engineOptions = {
      ...options
    };

    engineOptions.extname ||= '.hbs';
    engineOptions.contentHelperName ||= 'contentFor';
    engineOptions.blockHelperName ||= 'block';
    engineOptions.templateOptions ||= {};
    engineOptions.refreshPartialsManifest ||= false;

    if (engineOptions.handlebars) {
      this.handlebars = engineOptions.handlebars;
    }
    if (engineOptions.onCompile) {
      this.onCompile = engineOptions.onCompile;
    }

    this._options = engineOptions;
    this.hasGlobalTemplateOptions = hasEnumerableKeys(this._options.templateOptions);
    if (this._options.handlebars) {
      this.handlebars = this._options.handlebars;
    }

    if (this._options.i18n) {
      const i18n = this._options.i18n;
      this.handlebars.registerHelper('__', function(...args) {
        const helperOptions = args.pop();
        return i18n.__.call(helperOptions.data.root, ...args);
      });

      this.handlebars.registerHelper('__n', function(...args) {
        const helperOptions = args.pop();
        return i18n.__n.call(helperOptions.data.root, ...args);
      });
    }

    this.handlebars.registerHelper(this._options.blockHelperName, function(name, helperOptions) {
      let val = helperOptions.data.root.blockCache[name];
      if (val === undefined && typeof helperOptions.fn === 'function') {
        val = helperOptions.fn(this);
      }
      if (Array.isArray(val)) {
        val = val.join('\n');
      }
      return val;
    });

    this.handlebars.registerHelper(this._options.contentHelperName, function(name, helperOptions) {
      return instance.content(name, helperOptions, this);
    });

    this.partialsDir = this._options.partialsDir;
    this.layoutsDir = this._options.layoutsDir;
    this.restrictLayoutsTo = this._options.restrictLayoutsTo;
    this.viewsDirOpt = this._options.viewsDir;

    this.cache = new Map();
    this.defaultLayoutTemplates = null;
    this.isPartialCachingComplete = false;
    this.partialsManifest = null;
    this.partialsManifestKey = null;
    this.partialsSourceCache = null;

    return this.___express.bind(this);
  }

  /**
   * Backward-compatible Express 4 alias for `express()`.
   *
   * @param {EngineOptions} options
   * @returns {(filename: string, sourceOrOptions: unknown, optionsOrCb: unknown, maybeCb?: ExpressRenderCallback) => void}
   */
  express4(options) {
    return this.express(options);
  }

  /**
   * Loads default layout templates when configured.
   *
   * @param {boolean} useCache
   * @param {string | string[]} viewsDir
   * @returns {Promise<Function[] | null>}
   */
  async _loadDefaultLayout(useCache, viewsDir) {
    if (!this._options.defaultLayout) {
      return null;
    }

    if (useCache && this.defaultLayoutTemplates) {
      return this.defaultLayoutTemplates;
    }

    const templates = await this._cacheLayout(this._options.defaultLayout, useCache, viewsDir);
    this.defaultLayoutTemplates = templates.slice();
    return templates;
  }

  /**
   * Callback/Promise wrapper for default layout loading.
   *
   * @param {boolean} useCache
   * @param {NodeStyleCallback} [cb]
   * @param {string | string[]} [viewsDir]
   * @returns {Promise<Function[] | null> | void}
   */
  loadDefaultLayout(useCache, cb, viewsDir) {
    const promise = this._loadDefaultLayout(useCache, viewsDir ?? this.viewsDirOpt);

    if (typeof cb === 'function') {
      attachNodeStyleCallback(promise, cb);
      return;
    }

    return promise;
  }

  /**
   * Registers a Handlebars helper.
   *
   * @param {string} name
   * @param {Function} fn
   * @returns {void}
   */
  registerHelper(name, fn) {
    this.handlebars.registerHelper(name, fn);
  }

  /**
   * Registers a Handlebars partial by compiling the provided source.
   *
   * @param {string} name
   * @param {string} source
   * @param {string} [filename]
   * @param {string | string[]} [viewsDir]
   * @returns {void}
   */
  registerPartial(name, source, filename, viewsDir) {
    this.handlebars.registerPartial(name, this.compile(source, filename, viewsDir));
  }

  /**
   * Compiles a template source string.
   *
   * @param {string} source
   * @param {string} [filename]
   * @param {string | string[]} [viewsDir]
   * @returns {Function}
   */
  compile(source, filename, viewsDir) {
    // Handlebars has a bug with comment only partial causes errors. This must
    // be a string so the block below can add a space.
    if (typeof source !== 'string') {
      throw new Error('registerPartial must be a string for empty comment workaround');
    }
    if (source.indexOf('}}') === source.length - 2) {
      source += ' ';
    }

    let compiled;
    if (this.onCompile) {
      compiled = this.onCompile(this, source, filename);
    } else {
      compiled = this.handlebars.compile(source);
    }

    if (filename) {
      compiled.__filename = this._toErrorFilename(filename, viewsDir ?? this.viewsDirOpt);
    }

    return compiled;
  }

  /**
   * Registers an async helper that resolves values after initial render.
   *
   * @param {string} name
   * @param {Function} fn
   * @returns {void}
   */
  registerAsyncHelper(name, fn) {
    this.hasAsyncHelpers = true;

    this.handlebars.registerHelper(name, function(...helperArgs) {
      const lastArg = helperArgs[helperArgs.length - 1];
      const hasOptions = !!lastArg && typeof lastArg === 'object' &&
        (Object.hasOwn(lastArg, 'hash') || Object.hasOwn(lastArg, 'data'));
      const options = hasOptions ? lastArg : null;
      const resolverCache = this.resolverCache ??
        options?.data?.root?.resolverCache ??
        helperArgs[0]?.data?.root?.resolverCache;

      if (!resolverCache) {
        throw new Error(`Could not find resolver cache in async helper ${name}.`);
      }

      const argsWithoutOptions = hasOptions ? helperArgs.slice(0, -1) : helperArgs;
      const includeOptions = hasOptions && fn.length > argsWithoutOptions.length + 1;
      const resolveFunc = (args, cb) => {
        if (includeOptions) {
          fn.call(this, ...args, options, cb);
          return;
        }

        fn.call(this, ...args, cb);
      };

      return resolve(resolverCache, resolveFunc, argsWithoutOptions);
    });
  }

  /**
   * Returns global template options.
   *
   * @returns {AnyObject}
   */
  getTemplateOptions() {
    return this._options.templateOptions;
  }

  /**
   * Replaces global template options.
   *
   * @param {AnyObject} templateOptions
   * @returns {void}
   */
  updateTemplateOptions(templateOptions) {
    this._options.templateOptions = templateOptions;
    this.hasGlobalTemplateOptions = hasEnumerableKeys(templateOptions);
  }

  /**
   * Reads local template options from current locals.
   *
   * @param {AnyObject} locals
   * @returns {AnyObject}
   */
  getLocalTemplateOptions(locals) {
    return locals?._templateOptions ?? {};
  }

  /**
   * Updates local template options on locals.
   *
   * @param {AnyObject} locals
   * @param {AnyObject | undefined} localTemplateOptions
   * @returns {AnyObject | undefined}
   */
  updateLocalTemplateOptions(locals, localTemplateOptions) {
    locals._templateOptions = localTemplateOptions;
    return locals._templateOptions;
  }

  /**
   * Creates a fresh engine instance.
   *
   * @returns {ExpressHbs}
   */
  create() {
    return new ExpressHbs();
  }

  /**
   * Renders a compiled template with merged template options.
   *
   * @param {Function} template
   * @param {AnyObject} locals
   * @returns {string}
   */
  _renderTemplate(template, locals) {
    const targetLocals = locals ?? emptyObject;
    const hasLocalTemplateOptions = targetLocals !== emptyObject && Object.hasOwn(targetLocals, '_templateOptions');
    let localTemplateOptions;
    let renderLocals = targetLocals;
    let restoreTemplateOptions = false;

    try {
      if (hasLocalTemplateOptions) {
        localTemplateOptions = targetLocals._templateOptions;

        if (template.isTop === true) {
          const hiddenTemplateOptions = hideTemplateOptions(targetLocals);
          renderLocals = hiddenTemplateOptions.renderLocals;
          restoreTemplateOptions = hiddenTemplateOptions.restore;
        } else {
          renderLocals = cloneWithoutTemplateOptions(targetLocals);
        }
      }

      const useLocalTemplateOptions = hasEnumerableKeys(localTemplateOptions);

      let templateOptions;

      if (this.hasGlobalTemplateOptions || useLocalTemplateOptions) {
        templateOptions = this.hasGlobalTemplateOptions ? mergeObject({}, this._options.templateOptions) : {};
        if (useLocalTemplateOptions) {
          mergeObject(templateOptions, localTemplateOptions);
        }
      }

      return template(renderLocals, templateOptions);
    } catch (err) {
      if (err?.message) {
        err.message = `[${template.__filename}] ${err.message}`;
      } else if (typeof err === 'string') {
        throw new Error(`[${template.__filename}] ${err}`);
      }
      throw err;
    } finally {
      if (restoreTemplateOptions) {
        targetLocals._templateOptions = localTemplateOptions;
      }
    }
  }

  /**
   * Renders template output through zero or more layout templates.
   *
   * @param {Function} template
   * @param {AnyObject} locals
   * @param {Function[] | null} layoutTemplates
   * @returns {string}
   */
  _renderWithLayouts(template, locals, layoutTemplates) {
    const layouts = layoutTemplates ?? [];

    let html = this._renderTemplate(template, locals);
    if (layouts.length === 0) {
      return html;
    }

    const layoutLocals = locals ?? {};
    const hadBody = Object.hasOwn(layoutLocals, 'body');
    const originalBody = layoutLocals.body;

    try {
      for (let index = layouts.length - 1; index >= 0; index -= 1) {
        layoutLocals.body = html;
        html = this._renderTemplate(layouts[index], layoutLocals);
      }
    } finally {
      if (hadBody) {
        layoutLocals.body = originalBody;
      } else {
        delete layoutLocals.body;
      }
    }

    return html;
  }

  /**
   * Returns compiled template info, optionally reading from cache.
   *
   * @param {string} filename
   * @param {string | null} source
   * @param {boolean} useCache
   * @param {string | string[]} viewsDir
   * @returns {Promise<{ type: 'template', source: string, template: Function }>}
   */
  async _getSourceTemplate(filename, source, useCache, viewsDir) {
    if (useCache) {
      const cached = this.cache.get(filename);
      if (cached?.type === 'template') {
        return cached;
      }
    }

    const templateSource = typeof source === 'string'
      ? source
      : await fs.readFile(filename, 'utf8');

    const template = this.compile(templateSource, filename, viewsDir);
    const info = {
      type: 'template',
      source: templateSource,
      template
    };

    if (useCache) {
      this.cache.set(filename, info);
    }

    return info;
  }

  /**
   * Resolves which layout templates should be applied to render request.
   *
   * @param {string} filename
   * @param {string} templateSource
   * @param {AnyObject} options
   * @param {string | string[]} viewsDir
   * @returns {Promise<Function[] | null>}
   */
  async _resolveLayoutTemplates(filename, templateSource, options, viewsDir) {
    const optionLayout = options.layout;
    const hasLayoutOption = Object.hasOwn(options, 'layout');
    let declaredLayoutTemplates = null;
    const declaredLayoutFile = this.declaredLayoutFile(templateSource, filename);

    if (declaredLayoutFile) {
      declaredLayoutTemplates = await this._cacheLayout(declaredLayoutFile, options.cache, viewsDir);
    }

    if (hasLayoutOption && !optionLayout) {
      return null;
    }

    if (declaredLayoutTemplates) {
      return declaredLayoutTemplates;
    }

    if (hasLayoutOption && optionLayout) {
      const layoutFile = this.layoutPath(filename, optionLayout, viewsDir);
      return this._cacheLayout(layoutFile, options.cache, viewsDir);
    }

    if (this.defaultLayoutTemplates) {
      return this.defaultLayoutTemplates;
    }

    return null;
  }

  /**
   * Builds a replacement table for async placeholder substitution.
   *
   * @param {Record<string, unknown>} values
   * @param {string[]} keys
   * @returns {{ id: string, escapedId: string, value: unknown, escapedValue: string }[]}
   */
  _buildAsyncReplacements(values, keys) {
    const escapeExpression = this.Utils.escapeExpression;
    const replacements = new Array(keys.length);

    for (let index = 0; index < keys.length; index += 1) {
      const id = keys[index];
      const value = values[id];
      replacements[index] = {
        id,
        escapedId: escapeExpression(id),
        value,
        escapedValue: escapeExpression(value)
      };
    }

    return replacements;
  }

  /**
   * Replaces async placeholder ids in a string.
   *
   * @param {unknown} text
   * @param {{ id: string, escapedId: string, value: unknown, escapedValue: string }[]} replacements
   * @returns {unknown}
   */
  _replaceValue(text, replacements) {
    if (typeof text !== 'string') {
      return text;
    }

    if (replacements.length === 0) {
      return text;
    }

    let rendered = text;

    for (const replacement of replacements) {
      rendered = rendered.replace(replacement.id, () => replacement.value);
      rendered = rendered.replace(replacement.escapedId, () => replacement.escapedValue);
    }

    return rendered;
  }

  /**
   * Resolves pending async helper values.
   *
   * @param {Map<string, Promise<unknown>> | Record<string, Promise<unknown>>} cache
   * @returns {Promise<Record<string, unknown>>}
   */
  _resolveAsyncValues(cache) {
    return done(cache);
  }

  /**
   * Repeatedly resolves async placeholders until the output is stable.
   *
   * @param {Map<string, Promise<unknown>> | Record<string, Promise<unknown>>} resolverCache
   * @param {string} html
   * @returns {Promise<string>}
   */
  async _resolveAsyncHtml(resolverCache, html) {
    let result = html;

    while (hasResolvers(result)) {
      const values = await this._resolveAsyncValues(resolverCache);
      const keys = Object.keys(values);
      let replacements = this._buildAsyncReplacements(values, keys);
      let hasNestedValues = false;

      for (const key of keys) {
        const value = values[key];
        if (!hasResolvers(value)) {
          continue;
        }

        hasNestedValues = true;
        values[key] = this._replaceValue(value, replacements);
      }

      if (hasNestedValues) {
        replacements = this._buildAsyncReplacements(values, keys);
      }

      result = this._replaceValue(result, replacements);
    }

    return result;
  }

  /**
   * Core renderer used by Express adapter.
   *
   * @param {string} filename
   * @param {string | null} source
   * @param {AnyObject} options
   * @returns {Promise<string>}
   */
  async _renderFile(filename, source, options) {
    const baseOptions = options ?? emptyObject;
    const renderOptions = {
      ...baseOptions,
      blockCache: {}
    };
    const viewsDir = baseOptions.settings?.views ?? this.viewsDirOpt;

    if (this.hasAsyncHelpers) {
      renderOptions.resolverCache = Object.create(null);
    }

    await this._loadDefaultLayout(baseOptions.cache, viewsDir);

    if (this.partialsDir && (!baseOptions.cache || !this.isPartialCachingComplete)) {
      await this._cachePartials(viewsDir);
    }

    const info = await this._getSourceTemplate(filename, source, baseOptions.cache, viewsDir);
    const layoutTemplates = await this._resolveLayoutTemplates(filename, info.source, baseOptions, viewsDir);

    const renderedHtml = this._renderWithLayouts(info.template, renderOptions, layoutTemplates);

    if (!this.hasAsyncHelpers) {
      return renderedHtml;
    }

    return this._resolveAsyncHtml(renderOptions.resolverCache, renderedHtml);
  }

  /**
   * Express view-engine entry point.
   *
   * @param {string} filename
   * @param {AnyObject | null} sourceOrOptions
   * @param {AnyObject | ExpressRenderCallback} optionsOrCb
   * @param {ExpressRenderCallback} [maybeCb]
   * @returns {void}
   */
  ___express(filename, sourceOrOptions, optionsOrCb, maybeCb) {
    let source = sourceOrOptions;
    let options = optionsOrCb;
    let cb = maybeCb;

    if (typeof maybeCb !== 'function') {
      source = null;
      options = sourceOrOptions;
      cb = optionsOrCb;
    }

    attachNodeStyleCallback(this._renderFile(filename, source, options), cb, true);
  }
}

export default new ExpressHbs();
