import { done, hasResolvers, resolve, resolverPendingEntriesKey } from '#lib/resolver';
import handlebars from '#handlebars';
import { assignLookupObject, createNewLookupObject } from '#handlebars/internal/create-new-lookup-object';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * @typedef {Record<string, unknown>} AnyObject
 */

/**
 * @template [T=unknown]
 * @callback NodeStyleCallback
 * @param {Error | null} err
 * @param {T} [value]
 * @returns {void}
 */

/**
 * @template Callback, T
 * @typedef {Callback extends null | undefined ? Promise<T> : void} CacheResult
 */

/**
 * @callback ExpressRenderCallback
 * @param {Error | null} err
 * @param {string | null} html
 * @returns {void}
 */

/**
 * @typedef {ExpressHbs['___express']} ExpressRenderFunction
 */

/**
 * @typedef {import('./handlebars.d.ts').LocalHandlebars} LocalHandlebars
 */

/**
 * @callback CompileHook
 * @param {ExpressHbs} instance
 * @param {string} source
 * @param {string} [filename]
 * @returns {Function}
 */

/**
 * @typedef {AnyObject & {
 *   extname?: string,
 *   cache?: boolean,
 *   partialsDir?: string | string[],
 *   layoutsDir?: string | string[],
 *   restrictLayoutsTo?: string,
 *   viewsDir?: string | string[],
 *   defaultLayout?: string | false,
 *   refreshPartialsManifest?: boolean,
 *   contentHelperName?: string,
 *   blockHelperName?: string,
 *   handlebars?: import('./handlebars.d.ts').HandlebarsLike,
 *   i18n?: { __: Function, __n: Function },
 *   onCompile?: CompileHook,
 *   templateOptions?: AnyObject
 * }} EngineOptions
 */

const isUnsafeKey = new Set(['__proto__', 'constructor', 'prototype']);
const unsafeLocalTemplateOptionKeys = new Set([
  'allowedProtoProperties',
  'allowProtoPropertiesByDefault',
  'allowedProtoMethods',
  'allowProtoMethodsByDefault',
  'allowCallsToHelperMissing',
  'protoAccessControl'
]);
const emptyObject = Object.freeze(Object.create(null));
const asyncPlaceholderPattern = /__aSyNcId__(?:<_|&lt;_)[a-f0-9]{32}__/g;
const asyncPlaceholderEscapedPrefix = '&lt;_';
const asyncPlaceholderRawPrefix = '<_';
const asyncRenderedValue = Symbol('asyncRenderedValue');

const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
};
const isObjectLike = (value) => value !== null && typeof value === 'object';
const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const createLookupObject = () => Object.create(null);
const defineOwnValue = (target, key, value) => {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true
  });
  return value;
};
const escapeAsyncPlaceholderId = (id) => id.replace(asyncPlaceholderRawPrefix, asyncPlaceholderEscapedPrefix);
const isPathWithinRoot = (root, filename) => {
  const relative = path.relative(root, filename);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};
const pathOptionCacheKey = (value) => JSON.stringify(Array.isArray(value) ? value : value ?? '');
const layoutCacheKey = (filename, allowedRoot, layoutBaseDir) => JSON.stringify([
  filename,
  allowedRoot ? path.resolve(allowedRoot) : '',
  path.resolve(layoutBaseDir)
]);
const captureAsyncRawValue = (value) => {
  try {
    return String(value);
  } catch {
    // A toHTML-only object may still render correctly through escaped braces.
    // Leave raw coercion errors to the unescaped placeholders that use it.
    return value;
  }
};
const captureAsyncRenderedValue = (value, SafeString, escapeExpression) => {
  if (value instanceof SafeString || value != null &&
    Object.hasOwn(Object(value), 'toHTML') && typeof value.toHTML === 'function') {
    return {
      [asyncRenderedValue]: true,
      raw: captureAsyncRawValue(value),
      html: String(escapeExpression(value))
    };
  }
  return value;
};
const asyncValueTexts = value => value?.[asyncRenderedValue] ? [value.raw, value.html] : [value];
const captureAsyncHelperOptions = (options) => {
  const captured = createNewLookupObject(options);
  const frames = new WeakMap();
  const captureData = (frame) => {
    if (!isObjectLike(frame)) {
      return frame;
    }
    if (frames.has(frame)) {
      return frames.get(frame);
    }
    const copy = createNewLookupObject(frame);
    frames.set(frame, copy);
    if (Object.hasOwn(copy, '_parent')) {
      copy._parent = captureData(copy._parent);
    }
    return copy;
  };
  captured.data = captureData(options.data);

  for (const name of ['fn', 'inverse']) {
    const block = options[name];
    if (typeof block !== 'function') {
      continue;
    }
    const wrapped = (context, blockOptions) => {
      const invocationOptions = createNewLookupObject(blockOptions);
      invocationOptions.data ||= captured.data;
      return block(context, invocationOptions);
    };
    assignLookupObject(wrapped, block);
    captured[name] = wrapped;
  }
  return captured;
};
const callAsyncHelper = (fn, helperContext, cb) => {
  const { thisArg, args, options, includeOptions } = helperContext;

  // The final parameter is ambiguous for promise and legacy callback helpers.
  // A callable options object supports both without guessing from function syntax.
  if (!includeOptions && options) {
    for (const key of Object.keys(options)) {
      if (!isUnsafeKey.has(key)) {
        if (key in cb) {
          defineOwnValue(cb, key, options[key]);
        } else {
          cb[key] = options[key];
        }
      }
    }
  }

  switch (args.length) {
    case 0:
      return includeOptions ? fn.call(thisArg, options, cb) : fn.call(thisArg, cb);
    case 1:
      return includeOptions ? fn.call(thisArg, args[0], options, cb) : fn.call(thisArg, args[0], cb);
    case 2:
      return includeOptions ? fn.call(thisArg, args[0], args[1], options, cb) : fn.call(thisArg, args[0], args[1], cb);
    case 3:
      return includeOptions ? fn.call(thisArg, args[0], args[1], args[2], options, cb) : fn.call(thisArg, args[0], args[1], args[2], cb);
    default:
      return includeOptions ? fn.call(thisArg, ...args, options, cb) : fn.call(thisArg, ...args, cb);
  }
};
const collectPendingResolverEntries = (cache, resolvedValues) => {
  const keys = [];
  const pending = [];

  if (cache instanceof Map) {
    const pendingEntries = cache[resolverPendingEntriesKey];
    if (Array.isArray(pendingEntries) && pendingEntries.length > 0) {
      const queuedEntries = pendingEntries.splice(0, pendingEntries.length);

      for (let index = 0; index < queuedEntries.length;) {
        const entry = queuedEntries[index];
        let key;
        let value;

        if (Array.isArray(entry)) {
          [key, value] = entry;
          index += 1;
        } else {
          key = entry;
          value = queuedEntries[index + 1];
          index += 2;
        }

        if (Object.hasOwn(resolvedValues, key)) {
          continue;
        }

        keys.push(key);
        pending.push(value);
      }

      return { keys, pending };
    }

    for (const [key, value] of cache) {
      if (Object.hasOwn(resolvedValues, key)) {
        continue;
      }

      keys.push(key);
      pending.push(value);
    }

    return { keys, pending };
  }

  const cacheKeys = Object.keys(cache);
  for (let index = 0; index < cacheKeys.length; index += 1) {
    const key = cacheKeys[index];
    if (Object.hasOwn(resolvedValues, key)) {
      continue;
    }

    keys.push(key);
    pending.push(cache[key]);
  }

  return { keys, pending };
};
const attachNodeStyleCallback = (promise, cb, nullOnError = false) => {
  void promise.then(
    (value) => cb(null, value),
    (err) => cb(err, nullOnError ? null : undefined)
  );
};
const isAbortSignal = (value) =>
  value != null &&
  typeof value === 'object' &&
  typeof value.aborted === 'boolean' &&
  typeof value.addEventListener === 'function';
const getRenderSignal = (options) => {
  const signal = options.signal;

  if (signal === undefined) {
    return undefined;
  }

  if (!isAbortSignal(signal)) {
    throw new TypeError('render options signal must be an AbortSignal.');
  }

  return signal;
};
const throwIfAborted = (signal) => {
  if (!signal) {
    return;
  }

  if (typeof signal.throwIfAborted === 'function') {
    signal.throwIfAborted();
    return;
  }

  if (signal.aborted) {
    throw signal.reason ?? new Error('The operation was aborted.');
  }
};
const statPath = (filename, signal) => fs.stat(filename, signal ? { signal } : undefined);
const readUtf8File = (filename, signal) => fs.readFile(filename, signal ? { encoding: 'utf8', signal } : 'utf8');
const cloneWithoutTemplateOptions = (locals) => {
  const clone = createLookupObject();

  for (const key in locals) {
    if (!Object.hasOwn(locals, key) || key === '_templateOptions' || isUnsafeKey.has(key)) {
      continue;
    }

    clone[key] = locals[key];
  }

  return clone;
};

/**
 * Normalizes a filesystem path option and rejects malformed values.
 *
 * @param {unknown} value
 * @param {string} name
 * @param {{ allowArray?: boolean, allowFalse?: boolean }} [options]
 * @returns {string | string[] | false | undefined}
 */
const normalizePathOption = (value, name, options = emptyObject) => {
  const {
    allowArray = false,
    allowFalse = false
  } = options;

  if (value == null) {
    return undefined;
  }

  if (allowFalse && value === false) {
    return false;
  }

  if (isNonEmptyString(value)) {
    return value;
  }

  if (allowArray && Array.isArray(value)) {
    for (const entry of value) {
      if (!isNonEmptyString(entry)) {
        throw new TypeError(`${name} entries must be non-empty strings.`);
      }
    }

    return value.slice();
  }

  throw new TypeError(`${name} must be a non-empty string${allowArray ? ' or array of non-empty strings' : ''}.`);
};

/**
 * Creates a shallow clone of an object while dropping unsafe keys.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {AnyObject}
 */
const cloneSafeObject = (value, name) => {
  if (!isObjectLike(value)) {
    throw new TypeError(`${name} must be an object.`);
  }

  const clone = createLookupObject();

  for (const key in value) {
    if (!Object.hasOwn(value, key) || isUnsafeKey.has(key)) {
      continue;
    }

    clone[key] = value[key];
  }

  return clone;
};

/**
 * Deep-clones a template option value while dropping unsafe keys.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
const cloneTemplateOptionValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(cloneTemplateOptionValue);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const clone = createLookupObject();

  for (const key in value) {
    if (!Object.hasOwn(value, key) || isUnsafeKey.has(key)) {
      continue;
    }

    clone[key] = cloneTemplateOptionValue(value[key]);
  }

  return clone;
};

/**
 * Drops runtime security overrides from per-render template options.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
const sanitizeLocalTemplateOptions = (value) => {
  if (Array.isArray(value)) {
    return value.map(cloneTemplateOptionValue);
  }

  if (!isObjectLike(value)) {
    return value;
  }

  const clone = createLookupObject();

  for (const key in value) {
    if (
      !Object.hasOwn(value, key) ||
      isUnsafeKey.has(key) ||
      unsafeLocalTemplateOptionKeys.has(key)
    ) {
      continue;
    }

    clone[key] = cloneTemplateOptionValue(value[key]);
  }

  return clone;
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
      target[key] = mergeObject(targetValue && isPlainObject(targetValue) ? targetValue : createLookupObject(), sourceValue);
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

/**
 * Recursively lists files inside `rootDir`.
 *
 * @param {string} rootDir
 * @param {AbortSignal} [signal]
 * @returns {Promise<string[]>}
 */
async function listFilesRecursive(rootDir, signal) {
  const files = [];
  await statPath(rootDir, signal);

  for await (const entry of fs.glob('**/*', {
    cwd: rootDir,
    followSymlinks: false,
    withFileTypes: true
  })) {
    throwIfAborted(signal);

    if (entry.isFile()) {
      const parentDir = entry.parentPath ?? rootDir;
      const entryPath = path.join(parentDir, entry.name);
      files.push(entryPath);
    }
  }

  return files;
}

async function discoverPartials(roots, extname, signal) {
  const manifest = []
  for (const root of roots) {
    const files = await listFilesRecursive(root, signal)
    for (const fullPath of files.sort()) {
      if (fullPath.endsWith(extname)) {
        const name = path.relative(root, fullPath).slice(0, -extname.length).replace(/\\/g, '/')
        manifest.push({ fullPath, name })
      }
    }
  }
  return manifest
}

async function readPartialChanges(manifest, metadataCache, signal) {
  const stats = await Promise.all(manifest.map(entry => statPath(entry.fullPath, signal)))
  const changes = new Map()
  for (const [index, entry] of manifest.entries()) {
    const { mtimeMs, ctimeMs, size } = stats[index]
    const previous = metadataCache.get(entry.fullPath)
    if (!previous || previous.mtimeMs !== mtimeMs || previous.ctimeMs !== ctimeMs || previous.size !== size) {
      changes.set(entry.fullPath, { name: entry.name, metadata: { mtimeMs, ctimeMs, size } })
    }
  }
  await Promise.all(Array.from(changes, async ([file, change]) => {
    change.source = await readUtf8File(file, signal)
  }))
  return changes
}

function setRegisteredPartial(hb, name, value) {
  if (value !== undefined) {
    hb.registerPartial(name, value)
  } else if (typeof hb.unregisterPartial === 'function') {
    hb.unregisterPartial(name)
  } else if (hb.partials) {
    delete hb.partials[name]
  }
}

function publishPartialUpdates(hb, managed, updates) {
  const previous = new Map()
  try {
    for (const [name, value] of updates) {
      let registered = managed.get(name)
      if (hb.partials) {
        registered = Object.hasOwn(hb.partials, name) ? hb.partials[name] : undefined
      }
      if (value === undefined && registered !== managed.get(name)) {
        continue
      }
      previous.set(name, registered)
      setRegisteredPartial(hb, name, value)
    }
  } catch (error) {
    for (const [name, value] of previous) {
      if (!hb.partials || (Object.hasOwn(hb.partials, name) ? hb.partials[name] : undefined) !== value) {
        setRegisteredPartial(hb, name, value)
      }
    }
    throw error
  }
  for (const [name, value] of updates) {
    if (value === undefined) {
      managed.delete(name)
    } else {
      managed.set(name, value)
    }
  }
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
    this._defaultHandlebars = handlebars.create();
    /** @type {LocalHandlebars} */
    this.handlebars = this._defaultHandlebars;
    this.SafeString = this.handlebars.SafeString;
    this.Utils = this.handlebars.Utils;
    this.cwd = process.cwd();

    this._options = createLookupObject();
    this._options.templateOptions = createLookupObject();
    this.cache = new Map();
    this.defaultLayoutTemplates = null;
    this.isPartialCachingComplete = false;
    this.hasAsyncHelpers = false;
    this._partialsManifestGeneration = 0;
    this._partialsLoadId = 0
    this._publishedPartialsLoadId = 0
    this._partialsRevision = 0
    /** @type {{ fullPath: string, name: string }[] | null} */
    this.partialsManifest = null;
    this.partialsManifestKey = null;
    this.partialsSourceCache = null;
    this.partialsMetadataCache = null;
    this._managedPartialValues = new Map();
    this.uncachedLayoutCache = new Map();
    this.uncachedTemplateCache = new Map();

    this.partialsDir = null;
    this.layoutsDir = null;
    this.restrictLayoutsTo = null;
    this.restrictLayoutsRootRealpath = null;
    this.layoutRestrictionRootRealpaths = new Map();
    this.viewsDirOpt = null;
    this.normalizedViewsDirCacheInput = undefined;
    this.normalizedViewsDirCacheValue = undefined;
    this.layoutPathCache = new Map();
    this.filenameDirCache = new Map();

    /** @type {CompileHook | undefined} */
    this.onCompile = undefined;
    this._engineHelpers = new Map()
    this._engineHelpersHandlebars = this.handlebars;
  }

  /**
   * Syncs convenience aliases with the active Handlebars instance.
   *
   * @returns {void}
   */
  _syncHandlebarsAliases() {
    this.SafeString = this.handlebars.SafeString;
    this.Utils = this.handlebars.Utils;
  }

  /**
   * Normalizes and caches the active views directory option.
   *
   * @param {string | string[] | undefined} viewsDir
   * @returns {string | string[] | undefined}
   */
  _normalizeViewsDir(viewsDir) {
    if (viewsDir === this.normalizedViewsDirCacheInput) {
      if (!Array.isArray(viewsDir)) {
        return this.normalizedViewsDirCacheValue;
      }

      const cached = this.normalizedViewsDirCacheValue;
      if (
        Array.isArray(cached) &&
        cached.length === viewsDir.length &&
        cached.every((entry, index) => entry === viewsDir[index])
      ) {
        return cached;
      }
    }

    const normalized = normalizePathOption(viewsDir, 'views', { allowArray: true });
    this.normalizedViewsDirCacheInput = viewsDir;
    this.normalizedViewsDirCacheValue = normalized;
    return normalized;
  }

  /**
   * Memoizes dirname lookups for template files.
   *
   * @param {string} filename
   * @returns {string}
   */
  _dirname(filename) {
    const cached = this.filenameDirCache.get(filename);
    if (cached) {
      return cached;
    }

    const dirname = path.dirname(filename);
    this.filenameDirCache.set(filename, dirname);
    return dirname;
  }

  /**
   * Removes engine-managed helpers from the previously active Handlebars instance.
   *
   * @returns {void}
   */
  _clearEngineHelpers() {
    const target = this._engineHelpersHandlebars;
    if (target && typeof target.unregisterHelper === 'function') {
      for (const [name, helper] of this._engineHelpers) {
        if (!target.helpers || target.helpers[name] === helper) {
          target.unregisterHelper(name)
        }
      }
    }

    this._engineHelpers.clear();
    this._engineHelpersHandlebars = null;
  }

  /**
   * Registers an engine-managed helper on the active Handlebars instance.
   *
   * @param {string} name
   * @param {Function} fn
   * @returns {void}
   */
  _registerEngineHelper(name, fn) {
    this.handlebars.registerHelper(name, fn);
    this._engineHelpers.set(name, fn)
    this._engineHelpersHandlebars = this.handlebars;
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
    const blockCache = options.data.root.blockCache;
    const block = blockCache[name] ?? (blockCache[name] = []);
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
    if (!isNonEmptyString(layout)) {
      throw new TypeError('layout must be a non-empty string when enabled.');
    }

    const cacheKey = JSON.stringify([
      filename,
      layout,
      viewsDir ?? '',
      this.layoutsDir ?? ''
    ]);

    return this.layoutPathCache.getOrInsertComputed(cacheKey, () => {
      if (layout.startsWith('.')) {
        return path.resolve(this._dirname(filename), layout);
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
    });
  }

  /**
   * Returns ordered layout path candidates and their implicit safe roots.
   *
   * @param {string} filename
   * @param {string} layout
   * @param {string | string[]} viewsDir
   * @param {boolean} [declarative]
   * @returns {{ filename: string, root: string }[]}
   */
  _layoutPathCandidates(filename, layout, viewsDir, declarative = false) {
    if (!isNonEmptyString(layout)) {
      throw new TypeError('layout must be a non-empty string when enabled.');
    }

    if (layout.startsWith('.')) {
      const root = this._dirname(filename);
      return [{ filename: path.resolve(root, layout), root }];
    }

    const configuredDirs = this.layoutsDir || (declarative ? this._dirname(filename) : viewsDir);
    const dirs = Array.isArray(configuredDirs) ? configuredDirs : [configuredDirs];

    if (path.isAbsolute(layout)) {
      const root = dirs.find(dir => isNonEmptyString(dir) && isPathWithinRoot(dir, layout))
      if (root) {
        return [{ filename: layout, root }]
      }
      if (this.restrictLayoutsTo && !dirs.some(isNonEmptyString)) {
        return [{ filename: layout, root: this.restrictLayoutsTo }]
      }
    }

    return dirs
      .filter(isNonEmptyString)
      .map((root) => ({
        filename: path.resolve(root, layout),
        root
      }));
  }

  /**
   * Loads the first layout candidate that exists, preserving directory order.
   *
   * @param {string} filename
   * @param {string} layout
   * @param {boolean} useCache
   * @param {string | string[]} viewsDir
   * @param {{ seenLayouts?: Set<string>, signal?: AbortSignal, allowedRoot?: string, declarative?: boolean }} [context]
   * @returns {Promise<Function[]>}
   */
  async _cacheLayoutCandidates(filename, layout, useCache, viewsDir, context = emptyObject) {
    const candidates = this._layoutPathCandidates(filename, layout, viewsDir, context.declarative);
    const allowedRoot = context.allowedRoot;

    if (candidates.length === 0) {
      throw new Error('Cannot resolve a safe root for options.layout. Set restrictLayoutsTo or provide viewsDir.');
    }

    const last = candidates.at(-1)
    for (const candidate of candidates) {
      const layouts = await this._cacheLayout(
        candidate.filename,
        useCache,
        viewsDir,
        allowedRoot ?? candidate.root,
        { ...context, layoutBaseDir: candidate.root, skipMissing: candidate !== last }
      )
      if (layouts.length > 0) {
        return layouts
      }
    }
  }

  /**
   * Extracts a declared layout directive from template source.
   *
   * @param {string} str
   * @returns {string | undefined}
   */
  declaredLayout(str) {
    const matches = str.match(layoutPattern);
    if (!matches) {
      return;
    }

    return matches[1];
  }

  /**
   * Finds and resolves a declared layout from template source.
   *
   * @param {string} str
   * @param {string} filename
   * @returns {string | undefined}
   */
  declaredLayoutFile(str, filename) {
    const declaredLayout = this.declaredLayout(str);
    if (!declaredLayout) {
      return;
    }

    let layout = declaredLayout;

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

    return path.resolve(this._dirname(filename), layout);
  }

  /**
   * Resolves the implicit safe root for declarative layouts.
   *
   * @param {string} filename
   * @param {string | string[] | undefined} viewsDir
   * @param {string} layout
   * @returns {string | undefined}
   */
  _getImplicitDeclaredLayoutRestrictionRoot(filename, viewsDir, layout) {
    if (layout.startsWith('.')) {
      return this._dirname(filename);
    }

    if (this.layoutsDir) {
      if (Array.isArray(this.layoutsDir)) {
        return this.layoutsDir[0] ?? this._dirname(filename);
      }

      return this.layoutsDir;
    }

    return this._dirname(filename);
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

    if (Array.isArray(viewsDir)) {
      return path.relative(this.cwd, filename).replace(/\\/g, '/');
    }

    return path.relative(viewsDir ?? '', filename).replace(/\\/g, '/');
  }

  /**
   * Resolves the implicit safe root for programmatic `options.layout`.
   *
   * @param {string} filename
   * @param {string | string[]} viewsDir
   * @param {string} layout
   * @returns {string | undefined}
   */
  _getImplicitLayoutRestrictionRoot(filename, viewsDir, layout) {
    if (layout.startsWith('.')) {
      return this._dirname(filename);
    }

    if (this.layoutsDir) {
      return Array.isArray(this.layoutsDir) ? this.layoutsDir[0] : this.layoutsDir;
    }

    if (Array.isArray(viewsDir)) {
      return viewsDir[0];
    }

    return viewsDir;
  }

  /**
   * Validates that a layout path is inside an allowed root.
   *
   * @param {string} layoutFile
   * @param {string | undefined} allowedRoot
   * @returns {Promise<string>}
   */
  async _ensureLayoutWithinRoot(layoutFile, allowedRoot) {
    const normalizedLayout = path.resolve(layoutFile);

    if (!allowedRoot) {
      return normalizedLayout;
    }

    const normalizedRoot = path.resolve(allowedRoot);
    const rootCache = this.layoutRestrictionRootRealpaths;

    let root = rootCache.get(normalizedRoot);
    if (!root) {
      if (this.restrictLayoutsTo && normalizedRoot === path.resolve(this.restrictLayoutsTo) && this.restrictLayoutsRootRealpath) {
        root = this.restrictLayoutsRootRealpath;
      } else {
        root = await fs.realpath(normalizedRoot);
        rootCache.set(normalizedRoot, root);

        if (rootCache === this.layoutRestrictionRootRealpaths && this.restrictLayoutsTo && normalizedRoot === path.resolve(this.restrictLayoutsTo)) {
          this.restrictLayoutsRootRealpath = root;
        }
      }
    }

    const resolved = await fs.realpath(normalizedLayout);
    if (!isPathWithinRoot(root, resolved)) {
      throw new Error(`Cannot read ${layoutFile} it does not reside in ${allowedRoot}`);
    }

    return resolved;
  }

  /**
   * Validates that a layout path is inside `restrictLayoutsTo`, when configured.
   *
   * @param {string} layoutFile
   * @returns {Promise<string | undefined>}
   */
  async _ensureInRestrictLayoutsTo(layoutFile) {
    if (!this.restrictLayoutsTo) {
      return;
    }

    return this._ensureLayoutWithinRoot(layoutFile, this.restrictLayoutsTo);
  }

  /**
   * Loads and compiles a layout and its parent chain.
   *
   * @param {string} layoutFile
   * @param {boolean} useCache
   * @param {string | string[]} viewsDir
   * @param {string | undefined} [allowedRoot]
   * @param {{ seenLayouts?: Set<string>, signal?: AbortSignal, layoutBaseDir?: string, skipMissing?: boolean }} [context]
   * @returns {Promise<Function[]>}
   */
  async _cacheLayout(layoutFile, useCache, viewsDir, allowedRoot = this.restrictLayoutsTo, context = emptyObject) {
    const cache = this.cache;
    const seenLayouts = context.seenLayouts ?? new Set();
    const signal = context.signal;
    const layoutBaseDir = context.layoutBaseDir ?? (
      Array.isArray(this.layoutsDir)
        ? this.layoutsDir.find(dir => isPathWithinRoot(path.resolve(dir), path.resolve(layoutFile)))
        : this.layoutsDir
    ) ?? this._dirname(layoutFile);

    throwIfAborted(signal);

    let targetLayoutFile = layoutFile;
    if (path.extname(targetLayoutFile) === '') {
      targetLayoutFile += this._options.extname;
    }
    const cacheKey = layoutCacheKey(targetLayoutFile, allowedRoot, layoutBaseDir);

    if (useCache) {
      const cached = cache.get(cacheKey);
      if (cached?.type === 'layout') {
        return cached.templates;
      }
    }

    if (seenLayouts.has(cacheKey)) {
      throw new Error(`Circular layout dependency detected for ${targetLayoutFile}`);
    }

    seenLayouts.add(cacheKey);

    try {
      let validatedLayoutFile
      try {
        validatedLayoutFile = await this._ensureLayoutWithinRoot(targetLayoutFile, allowedRoot)
      } catch (error) {
        if (context.skipMissing && (error?.code === 'ENOENT' || error?.code === 'ENOTDIR')) {
          return []
        }
        throw error
      }
      const parentLayoutBaseDir = this.layoutsDir ? layoutBaseDir : this._dirname(validatedLayoutFile);

      if (!useCache) {
        const { compiled, parentLayoutFile } = await this._getUncachedLayoutInfo(
          validatedLayoutFile,
          viewsDir,
          signal,
          parentLayoutBaseDir
        );

        let layouts = [];
        if (parentLayoutFile) {
          layouts = await this._cacheLayout(parentLayoutFile, useCache, viewsDir, allowedRoot, {
            seenLayouts,
            signal,
            layoutBaseDir: parentLayoutBaseDir
          });
        }

        return [...layouts, compiled];
      }

      const source = await readUtf8File(validatedLayoutFile, signal);
      const declaredParentLayout = this.declaredLayout(source);
      const parentLayoutFile = declaredParentLayout
        ? path.resolve(
          declaredParentLayout.startsWith('.') ? this._dirname(validatedLayoutFile) : parentLayoutBaseDir,
          declaredParentLayout
        )
        : undefined;

      let layouts = [];
      if (parentLayoutFile) {
        layouts = await this._cacheLayout(parentLayoutFile, useCache, viewsDir, allowedRoot, {
          seenLayouts,
          signal,
          layoutBaseDir: parentLayoutBaseDir
        });
      }

      const compiled = this.compile(source, validatedLayoutFile, viewsDir);
      const result = [...layouts, compiled];

      if (useCache) {
        cache.set(cacheKey, {
          type: 'layout',
          templates: result
        });
      }

      return result;
    } finally {
      seenLayouts.delete(cacheKey);
    }
  }

  /**
   * @overload
   * @param {string} layoutFile
   * @param {boolean} useCache
   * @param {null | undefined} [cb]
   * @param {string | string[]} [viewsDir]
   * @returns {Promise<Function[]>}
   */
  /**
   * @template {NodeStyleCallback<Function[] | null> | null | undefined} Callback
   * @overload
   * @param {string} layoutFile
   * @param {boolean} useCache
   * @param {Callback} cb
   * @param {string | string[]} [viewsDir]
   * @returns {CacheResult<Callback, Function[]>}
   */
  /** Callback/Promise wrapper for layout caching. */
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
   * @param {AbortSignal} [signal]
   * @returns {Promise<boolean>}
   */
  async _cachePartials(viewsDir, signal) {
    if (!this.partialsDir) {
      return true;
    }

    const generation = this._partialsManifestGeneration;
    const loadId = ++this._partialsLoadId
    const revision = this._partialsRevision
    const partialRoots = Array.isArray(this.partialsDir)
      ? this.partialsDir
      : [this.partialsDir];
    const manifestKey = JSON.stringify([this._options.extname, partialRoots]);

    const shouldRefreshManifest = this._options.refreshPartialsManifest || !this.partialsManifest || this.partialsManifestKey !== manifestKey;
    const sourceCache = shouldRefreshManifest ? new Map() : this.partialsSourceCache
    const metadataCache = shouldRefreshManifest ? new Map() : this.partialsMetadataCache
    let manifest = this.partialsManifest
    let changes
    let readError
    try {
      if (shouldRefreshManifest) {
        manifest = await discoverPartials(partialRoots, this._options.extname, signal)
      }
      changes = await readPartialChanges(manifest, metadataCache, signal)
    } catch (error) {
      readError = error
    }
    throwIfAborted(signal);

    // Invalidation or reconfiguration may have replaced the cache while reads
    // were pending. Retry against current state before publishing anything.
    if (generation !== this._partialsManifestGeneration) {
      return this._cachePartials(viewsDir, signal);
    }

    if (loadId < this._publishedPartialsLoadId) {
      return true
    }
    // Incremental reads compared against the cache as it stood before I/O.
    if (!shouldRefreshManifest && revision !== this._partialsRevision) {
      return this._cachePartials(viewsDir, signal)
    }

    if (!changes) {
      throw readError
    }

    if (shouldRefreshManifest || changes.size > 0) {
      const changedNames = new Set(Array.from(changes.values(), change => change.name))
      const winners = new Map()
      for (const entry of manifest) {
        if (changedNames.has(entry.name)) winners.set(entry.name, entry.fullPath)
      }
      const updates = new Map()
      for (const [name, file] of winners) {
        const source = changes.get(file)?.source ?? sourceCache.get(file)
        updates.set(name, this._createLazyPartial(name, source, file, viewsDir))
      }
      if (shouldRefreshManifest) {
        for (const name of this._managedPartialValues.keys()) {
          if (!updates.has(name)) updates.set(name, undefined)
        }
      }
      publishPartialUpdates(this.handlebars, this._managedPartialValues, updates)
      for (const [file, { source, metadata }] of changes) {
        sourceCache.set(file, source)
        metadataCache.set(file, metadata)
      }
      this._partialsRevision += 1
    }

    this.partialsManifest = manifest;
    this.partialsManifestKey = manifestKey;
    this.partialsSourceCache = sourceCache;
    this.partialsMetadataCache = metadataCache;
    this._publishedPartialsLoadId = loadId
    this.isPartialCachingComplete = true;
    return true;
  }

  /**
   * @overload
   * @param {null | undefined} [cb]
   * @param {string | string[]} [viewsDir]
   * @returns {Promise<boolean>}
   */
  /**
   * @template {NodeStyleCallback<boolean> | null | undefined} Callback
   * @overload
   * @param {Callback} cb
   * @param {string | string[]} [viewsDir]
   * @returns {CacheResult<Callback, boolean>}
   */
  /** Callback/Promise wrapper for partial caching. */
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
    this._partialsManifestGeneration += 1;
    this.isPartialCachingComplete = false;
    this._unregisterManagedPartials();
    this.partialsManifest = null;
    this.partialsManifestKey = null;
    this.partialsSourceCache = null;
    this.partialsMetadataCache = null;
  }

  /**
   * Removes partials registered from `partialsDir` when they still point at the engine-managed value.
   *
   * @returns {void}
   */
  _unregisterManagedPartials() {
    if (this._managedPartialValues.size === 0) return
    const removals = new Map()
    for (const name of this._managedPartialValues.keys()) removals.set(name, undefined)
    publishPartialUpdates(this.handlebars, this._managedPartialValues, removals)
  }

  /**
   * Configures this instance and returns an Express-compatible render function.
   *
   * @param {EngineOptions} [options]
   * @returns {ExpressRenderFunction}
   */
  express(options) {
    const instance = this;
    const engineOptions = options == null
      ? createLookupObject()
      : cloneSafeObject(options, 'options');

    engineOptions.extname ||= '.hbs';
    engineOptions.contentHelperName ||= 'contentFor';
    engineOptions.blockHelperName ||= 'block';
    engineOptions.templateOptions ||= createLookupObject();
    engineOptions.refreshPartialsManifest ||= false;

    if (!isNonEmptyString(engineOptions.extname) || engineOptions.extname.includes('/') || engineOptions.extname.includes('\\')) {
      throw new TypeError('extname must be a non-empty file extension string without path separators.');
    }
    if (!isNonEmptyString(engineOptions.contentHelperName)) {
      throw new TypeError('contentHelperName must be a non-empty string.');
    }
    if (!isNonEmptyString(engineOptions.blockHelperName)) {
      throw new TypeError('blockHelperName must be a non-empty string.');
    }

    engineOptions.partialsDir = normalizePathOption(engineOptions.partialsDir, 'partialsDir', { allowArray: true });
    engineOptions.layoutsDir = normalizePathOption(engineOptions.layoutsDir, 'layoutsDir', { allowArray: true });
    engineOptions.restrictLayoutsTo = normalizePathOption(engineOptions.restrictLayoutsTo, 'restrictLayoutsTo');
    engineOptions.viewsDir = normalizePathOption(engineOptions.viewsDir, 'viewsDir', { allowArray: true });
    engineOptions.defaultLayout = normalizePathOption(engineOptions.defaultLayout, 'defaultLayout', { allowFalse: true });

    this._partialsManifestGeneration += 1;
    this._unregisterManagedPartials();
    this._clearEngineHelpers();
    this.handlebars = this._defaultHandlebars;
    this._syncHandlebarsAliases();
    this.onCompile = undefined;

    if (engineOptions.handlebars) {
      this.handlebars = engineOptions.handlebars;
      this._syncHandlebarsAliases();
    }
    if (engineOptions.onCompile) {
      this.onCompile = engineOptions.onCompile;
    }

    this._options = engineOptions;
    if (this._options.handlebars) {
      this.handlebars = this._options.handlebars;
    }

    if (this._options.i18n) {
      const i18n = this._options.i18n;
      this._registerEngineHelper('__', function(...args) {
        const helperOptions = args.pop();
        return i18n.__.call(helperOptions.data.root, ...args);
      });

      this._registerEngineHelper('__n', function(...args) {
        const helperOptions = args.pop();
        return i18n.__n.call(helperOptions.data.root, ...args);
      });
    }

    this._registerEngineHelper(this._options.blockHelperName, function(name, helperOptions) {
      let val = helperOptions.data.root.blockCache[name];
      if (val === undefined && typeof helperOptions.fn === 'function') {
        val = helperOptions.fn(this);
      }
      if (Array.isArray(val)) {
        val = val.join('\n');
      }
      return val;
    });

    this._registerEngineHelper(this._options.contentHelperName, function(name, helperOptions) {
      return instance.content(name, helperOptions, this);
    });

    this.partialsDir = this._options.partialsDir;
    this.layoutsDir = this._options.layoutsDir;
    this.restrictLayoutsTo = this._options.restrictLayoutsTo;
    this.restrictLayoutsRootRealpath = null;
    this.layoutRestrictionRootRealpaths = new Map();
    this.viewsDirOpt = this._options.viewsDir;
    this.normalizedViewsDirCacheInput = undefined;
    this.normalizedViewsDirCacheValue = undefined;
    this.layoutPathCache = new Map();
    this.filenameDirCache = new Map();

    this.cache = new Map();
    this.defaultLayoutTemplates = null;
    this.isPartialCachingComplete = false;
    this.partialsManifest = null;
    this.partialsManifestKey = null;
    this.partialsSourceCache = null;
    this.partialsMetadataCache = null;
    this._managedPartialValues = new Map();
    this.uncachedLayoutCache = new Map();
    this.uncachedTemplateCache = new Map();

    return this.___express.bind(this);
  }

  /**
   * Backward-compatible Express 4 alias for `express()`.
   *
   * @param {EngineOptions} [options]
   * @returns {ExpressRenderFunction}
   */
  express4(options) {
    return this.express(options);
  }

  /**
   * Loads default layout templates when configured.
   *
   * @param {boolean} useCache
   * @param {string | string[]} viewsDir
   * @param {AbortSignal} [signal]
   * @returns {Promise<Function[] | null>}
   */
  async _loadDefaultLayout(useCache, viewsDir, signal) {
    throwIfAborted(signal);
    const cache = this.cache;

    if (!this._options.defaultLayout) {
      return null;
    }

    if (useCache && this.defaultLayoutTemplates) {
      return this.defaultLayoutTemplates;
    }

    const templates = await this._cacheLayout(this._options.defaultLayout, useCache, viewsDir, this.restrictLayoutsTo, { signal });
    if (useCache && cache === this.cache) {
      this.defaultLayoutTemplates = templates.slice();
    }
    return templates;
  }

  /**
   * @overload
   * @param {boolean} useCache
   * @param {null | undefined} [cb]
   * @param {string | string[]} [viewsDir]
   * @returns {Promise<Function[] | null>}
   */
  /**
   * @template {NodeStyleCallback<Function[] | null> | null | undefined} Callback
   * @overload
   * @param {boolean} useCache
   * @param {Callback} cb
   * @param {string | string[]} [viewsDir]
   * @returns {CacheResult<Callback, Function[] | null>}
   */
  /** Callback/Promise wrapper for default layout loading. */
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
   * @param {string | Record<string, Function>} name
   * @param {Function} [fn]
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
    this._managedPartialValues.delete(name)
  }

  /**
   * Creates a partial that compiles itself on first use.
   *
   * @param {string} name
   * @param {string} source
   * @param {string} filename
   * @param {string | string[]} [viewsDir]
   * @returns {Function}
   */
  _createLazyPartial(name, source, filename, viewsDir) {
    let compiled = null;

    const lazyPartial = (context, options) => {
      if (!compiled) {
        const template = this.compile(source, filename, viewsDir)
        // A deferred render may still hold this function after refresh or override.
        if (this._managedPartialValues.get(name) === lazyPartial && this.handlebars.partials?.[name] === lazyPartial) {
          this.handlebars.registerPartial(name, template)
          this._managedPartialValues.set(name, template)
        }
        compiled = template
      }

      return compiled(context, options);
    };

    return lazyPartial
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
    if (typeof source !== 'string') {
      throw new TypeError('Template source must be a string.');
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
    const invokeAsyncHelper = (helperContext, cb) => callAsyncHelper(fn, helperContext, cb);

    this.handlebars.registerHelper(name, function(...helperArgs) {
      const lastArg = helperArgs[helperArgs.length - 1];
      const hasOptions = !!lastArg && typeof lastArg === 'object' &&
        (Object.hasOwn(lastArg, 'hash') || Object.hasOwn(lastArg, 'data'));
      const options = hasOptions ? captureAsyncHelperOptions(lastArg) : null;
      const resolverCache = options?.data?.root?.resolverCache ??
        helperArgs[0]?.data?.root?.resolverCache ??
        this.resolverCache;

      if (!resolverCache) {
        throw new Error(`Could not find resolver cache in async helper ${name}.`);
      }

      const argCount = hasOptions ? helperArgs.length - 1 : helperArgs.length;
      const includeOptions = hasOptions && fn.length > argCount + 1;
      if (hasOptions) {
        helperArgs.length = argCount;
      }

      return resolve(resolverCache, invokeAsyncHelper, {
        thisArg: this,
        args: helperArgs,
        options,
        includeOptions
      });
    });
  }

  get hasGlobalTemplateOptions() {
    return hasEnumerableKeys(this._options.templateOptions)
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
  }

  /**
   * Reads local template options from current locals.
   *
   * @param {AnyObject} locals
   * @returns {AnyObject}
   */
  getLocalTemplateOptions(locals) {
    return locals && Object.hasOwn(Object(locals), '_templateOptions')
      ? locals._templateOptions
      : emptyObject;
  }

  /**
   * Updates local template options on locals.
   *
   * @param {AnyObject} locals
   * @param {AnyObject | undefined} localTemplateOptions
   * @returns {AnyObject | undefined}
   */
  updateLocalTemplateOptions(locals, localTemplateOptions) {
    if (!isObjectLike(locals)) {
      throw new TypeError('locals must be an object.');
    }

    return defineOwnValue(locals, '_templateOptions', sanitizeLocalTemplateOptions(localTemplateOptions));
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
    const useGlobalTemplateOptions = this.hasGlobalTemplateOptions;
    let localTemplateOptions;
    let renderLocals = targetLocals;

    try {
      if (!hasLocalTemplateOptions && !useGlobalTemplateOptions) {
        return template(targetLocals);
      }

      if (hasLocalTemplateOptions) {
        localTemplateOptions = sanitizeLocalTemplateOptions(targetLocals._templateOptions);

        renderLocals = cloneWithoutTemplateOptions(targetLocals);
      }

      const useLocalTemplateOptions = hasEnumerableKeys(localTemplateOptions);

      if (!useGlobalTemplateOptions && !useLocalTemplateOptions) {
        return template(renderLocals);
      }

      let templateOptions;

      if (useGlobalTemplateOptions || useLocalTemplateOptions) {
        templateOptions = useGlobalTemplateOptions ? mergeObject(createLookupObject(), this._options.templateOptions) : createLookupObject();
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

    let layoutLocals = locals;
    for (let index = layouts.length - 1; index >= 0; index -= 1) {
      // Each layer may retain its locals in a deferred helper.
      layoutLocals = createNewLookupObject(layoutLocals);
      layoutLocals.body = html;
      html = this._renderTemplate(layouts[index], layoutLocals);
    }

    return html;
  }

  /**
   * Returns uncached layout info while avoiding rereads for unchanged files.
   *
   * @param {string} filename
   * @param {string | string[]} viewsDir
   * @param {AbortSignal} [signal]
   * @param {string} [layoutBaseDir]
   * @returns {Promise<{ compiled: Function, parentLayoutFile: string | undefined }>}
   */
  async _getUncachedLayoutInfo(filename, viewsDir, signal, layoutBaseDir = this._dirname(filename)) {
    const cache = this.uncachedLayoutCache;
    const stat = await statPath(filename, signal);
    const viewsKey = pathOptionCacheKey(viewsDir);
    const cacheKey = JSON.stringify([filename, layoutBaseDir]);
    const cached = cache.get(cacheKey);

    if (
      cached &&
      cached.mtimeMs === stat.mtimeMs &&
      cached.ctimeMs === stat.ctimeMs &&
      cached.size === stat.size
    ) {
      const compiled = cached.compiledByViews.getOrInsertComputed(viewsKey, () => this.compile(cached.source, filename, viewsDir));
      return {
        compiled,
        parentLayoutFile: cached.parentLayoutFile
      };
    }

    const source = await readUtf8File(filename, signal);
    const declaredParentLayout = this.declaredLayout(source);
    const parentLayoutFile = declaredParentLayout
      ? path.resolve(
        declaredParentLayout.startsWith('.') ? this._dirname(filename) : layoutBaseDir,
        declaredParentLayout
      )
      : undefined;
    const compiled = this.compile(source, filename, viewsDir);
    cache.set(cacheKey, {
      mtimeMs: stat.mtimeMs,
      ctimeMs: stat.ctimeMs,
      size: stat.size,
      source,
      parentLayoutFile,
      compiledByViews: new Map([[viewsKey, compiled]])
    });

    return {
      compiled,
      parentLayoutFile
    };
  }

  /**
   * Returns uncached template info while avoiding rereads for unchanged files.
   *
   * @param {string} filename
   * @param {string | string[]} viewsDir
   * @param {AbortSignal} [signal]
   * @returns {Promise<{ type: 'template', source: string, template: Function, declaredLayout: string | undefined, declaredLayoutFile: string | undefined }>}
   */
  async _getUncachedTemplateInfo(filename, viewsDir, signal) {
    const cache = this.uncachedTemplateCache;
    const stat = await statPath(filename, signal);
    const viewsKey = pathOptionCacheKey(viewsDir);
    const cached = cache.get(filename);

    if (
      cached &&
      cached.mtimeMs === stat.mtimeMs &&
      cached.ctimeMs === stat.ctimeMs &&
      cached.size === stat.size
    ) {
      return cached.infoByViews.getOrInsertComputed(viewsKey, () => ({
        type: 'template',
        source: cached.source,
        template: this.compile(cached.source, filename, viewsDir),
        declaredLayout: cached.declaredLayout,
        declaredLayoutFile: cached.declaredLayoutFile
      }));
    }

    const templateSource = await readUtf8File(filename, signal);
    const declaredLayout = this.declaredLayout(templateSource);
    const info = {
      type: 'template',
      source: templateSource,
      template: this.compile(templateSource, filename, viewsDir),
      declaredLayout,
      declaredLayoutFile: this.declaredLayoutFile(templateSource, filename)
    };
    cache.set(filename, {
      mtimeMs: stat.mtimeMs,
      ctimeMs: stat.ctimeMs,
      size: stat.size,
      source: templateSource,
      declaredLayout,
      declaredLayoutFile: info.declaredLayoutFile,
      infoByViews: new Map([[viewsKey, info]])
    });

    return info;
  }

  /**
   * Returns compiled template info, optionally reading from cache.
   *
   * @param {string} filename
   * @param {string | null} source
   * @param {boolean} useCache
   * @param {string | string[]} viewsDir
   * @param {AbortSignal} [signal]
   * @returns {Promise<{ type: 'template', source: string, template: Function, declaredLayout: string | undefined, declaredLayoutFile: string | undefined }>}
   */
  async _getSourceTemplate(filename, source, useCache, viewsDir, signal) {
    throwIfAborted(signal);
    const cache = this.cache;

    if (useCache) {
      const cached = cache.get(filename);
      if (cached?.type === 'template') {
        return cached;
      }
    }

    if (typeof source !== 'string' && !useCache) {
      return this._getUncachedTemplateInfo(filename, viewsDir, signal);
    }

    const templateSource = typeof source === 'string'
      ? source
      : await readUtf8File(filename, signal);
    const declaredLayout = this.declaredLayout(templateSource);

    const template = this.compile(templateSource, filename, viewsDir);
    const info = {
      type: 'template',
      source: templateSource,
      template,
      declaredLayout,
      declaredLayoutFile: this.declaredLayoutFile(templateSource, filename)
    };

    if (useCache) {
      cache.set(filename, info);
    }

    return info;
  }

  /**
   * Resolves which layout templates should be applied to render request.
   *
   * @param {string} filename
   * @param {{ declaredLayout?: string, declaredLayoutFile?: string }} templateInfo
   * @param {AnyObject} options
   * @param {string | string[]} viewsDir
   * @param {AbortSignal} [signal]
   * @returns {Promise<Function[] | null>}
   */
  async _resolveLayoutTemplates(filename, templateInfo, options, viewsDir, signal) {
    const optionLayout = options.layout;
    const hasLayoutOption = Object.hasOwn(options, 'layout');

    if (hasLayoutOption && !optionLayout) {
      return null;
    }

    let declaredLayoutTemplates = null;
    const declaredLayout = templateInfo.declaredLayout;

    if (declaredLayout) {
      if (options.cache && templateInfo.declaredLayoutTemplates) {
        return templateInfo.declaredLayoutTemplates;
      }

      declaredLayoutTemplates = await this._cacheLayoutCandidates(
        filename,
        declaredLayout,
        options.cache,
        viewsDir,
        { signal, allowedRoot: this.restrictLayoutsTo, declarative: true }
      );

      if (options.cache) {
        templateInfo.declaredLayoutTemplates = declaredLayoutTemplates;
      }
    }

    if (declaredLayoutTemplates) {
      return declaredLayoutTemplates;
    }

    if (hasLayoutOption && optionLayout) {
      return this._cacheLayoutCandidates(
        filename,
        optionLayout,
        options.cache,
        viewsDir,
        { signal, allowedRoot: this.restrictLayoutsTo }
      );
    }

    if (options.cache && this.defaultLayoutTemplates) {
      return this.defaultLayoutTemplates;
    }

    if (this._options.defaultLayout) {
      return this._loadDefaultLayout(options.cache, viewsDir, signal);
    }

    return null;
  }

  /**
   * Updates replacement entries for a subset of async placeholders.
   *
   * @param {Record<string, unknown>} values
   * @param {Record<string, unknown>} replacements
   * @param {string[]} changedKeys
   * @param {Record<string, string>} escapedIds
   * @returns {void}
   */
  _updateAsyncReplacements(values, replacements, changedKeys, escapedIds) {
    const escapeExpression = this.Utils.escapeExpression;

    for (let index = 0; index < changedKeys.length; index += 1) {
      const key = changedKeys[index];
      const value = values[key];
      if (value?.[asyncRenderedValue]) {
        replacements[key] = value.raw;
        replacements[escapedIds[key]] = value.html;
        continue;
      }
      if (value == null) {
        replacements[key] = '';
        replacements[escapedIds[key]] = '';
        continue;
      }

      replacements[key] = value;
      replacements[escapedIds[key]] = escapeExpression(value);
    }
  }

  /**
   * Resolves each nested representation after its dependencies, retaining unknown IDs for later batches.
   *
   * @param {Record<string, unknown>} values
   * @param {Record<string, unknown>} replacements
   * @param {string[]} nestedValueKeys
   * @param {Record<string, string>} escapedIds
   * @param {number} replacementCount
   * @param {{ pending: Map<string, { text: string, escapeAfter?: boolean }>, poll: () => boolean }} [state]
   * @returns {string[]}
   */
  _resolveNestedAsyncReplacements(values, replacements, nestedValueKeys, escapedIds, replacementCount, state) {
    const pending = state?.pending ?? new Map()
    for (const key of nestedValueKeys) {
      const value = values[key]
      const escaped = escapedIds[key]
      if (value?.[asyncRenderedValue]) {
        if (hasResolvers(value.raw)) pending.set(key, { text: value.raw })
        if (hasResolvers(value.html)) pending.set(escaped, { text: value.html })
      } else {
        pending.set(key, { text: value })
        // Escape the completed raw value, including substitutions from its dependencies.
        pending.set(escaped, { text: key, escapeAfter: true })
      }
    }

    const active = new Set()
    const stack = []
    let unresolved = false
    for (const key of pending.keys()) {
      stack.push({ key })
      while (stack.length) {
        const frame = stack.pop()
        const node = pending.get(frame.key)
        if (!node) continue

        let dependencies
        if (!frame.exit) {
          if (active.has(frame.key)) {
            throw new Error('Encountered unresolved async placeholder in a circular dependency.')
          }
          active.add(frame.key)
          dependencies = node.escapeAfter ? [node.text] : node.text.match(asyncPlaceholderPattern)
        } else {
          const result = node.escapeAfter
            ? this.Utils.escapeExpression(replacements[node.text])
            : this._replaceValue(node.text, replacements, replacementCount)
          const remaining = hasResolvers(result) ? result.match(asyncPlaceholderPattern) : null
          // A coercion can invoke a helper. Resume at the resulting ID without repeating it.
          if (remaining?.some(id => !Object.hasOwn(replacements, id)) && state?.poll()) {
            node.text = result
            node.escapeAfter = false
            return nestedValueKeys
          }
          if (!remaining || !remaining.some(id => Object.hasOwn(replacements, id))) {
            unresolved ||= !!remaining
            replacements[frame.key] = result
            active.delete(frame.key)
            pending.delete(frame.key)
            continue
          }

          // Joining fragments can produce a placeholder absent from the original text.
          if (result === node.text) {
            throw new Error('Encountered unresolved async placeholder in a circular dependency.')
          }
          node.text = result
          node.escapeAfter = false
          dependencies = remaining
        }
        stack.push({ key: frame.key, exit: true })
        for (const id of dependencies) {
          if (pending.has(id)) stack.push({ key: id })
        }
      }
    }
    return unresolved ? nestedValueKeys : []
  }

  /**
   * Replaces async placeholder ids in a string.
   *
   * @param {unknown} text
   * @param {Record<string, unknown>} replacements
   * @param {number} replacementCount
   * @returns {unknown}
   */
  _replaceValue(text, replacements, replacementCount) {
    if (typeof text !== 'string') {
      return text;
    }

    if (replacementCount === 0) {
      return text;
    }

    asyncPlaceholderPattern.lastIndex = 0;
    return text.replace(asyncPlaceholderPattern, (match) =>
      Object.hasOwn(replacements, match) ? replacements[match] : match
    );
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
   * Awaits async helper work that was queued but removed from the final output.
   *
   * @param {Map<string, Promise<unknown>> | Record<string, Promise<unknown>>} resolverCache
   * @returns {Promise<void>}
   */
  async _drainAsyncValues(resolverCache) {
    const values = createLookupObject();

    while (true) {
      const { keys, pending } = collectPendingResolverEntries(resolverCache, values);
      if (keys.length === 0) {
        return;
      }

      const resolvedValues = await Promise.all(pending);
      for (let index = 0; index < keys.length; index += 1) {
        values[keys[index]] = resolvedValues[index];
      }
    }
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
    const values = createLookupObject();
    const replacements = createLookupObject();
    const replacementEscapedIds = createLookupObject();
    let replacementCount = 0;
    const nestedValueKeys = []

    let batch = collectPendingResolverEntries(resolverCache, values)
    const graph = {
      pending: new Map(),
      poll() {
        batch = collectPendingResolverEntries(resolverCache, values)
        return batch.keys.length > 0
      }
    }
    while (batch.keys.length) {
      const pendingKeys = batch.keys
      const resolvedValues = await Promise.all(batch.pending)

      for (let index = 0; index < pendingKeys.length; index += 1) {
        const key = pendingKeys[index];
        const resolvedValue = captureAsyncRenderedValue(resolvedValues[index], this.SafeString, this.Utils.escapeExpression);
        values[key] = resolvedValue;
        replacementEscapedIds[key] = escapeAsyncPlaceholderId(key);
        if (asyncValueTexts(resolvedValue).some(hasResolvers)) {
          nestedValueKeys.push(key);
        }
      }

      this._updateAsyncReplacements(values, replacements, pendingKeys, replacementEscapedIds);
      replacementCount += pendingKeys.length * 2;
      batch = collectPendingResolverEntries(resolverCache, values)
      if (!batch.keys.length && (nestedValueKeys.length || graph.pending.size)) {
        this._resolveNestedAsyncReplacements(
          values, replacements, nestedValueKeys, replacementEscapedIds, replacementCount, graph
        )
        nestedValueKeys.length = 0
        if (!batch.keys.length) graph.poll()
      }
    }

    if (replacementCount === 0) {
      return result;
    }

    result = this._replaceValue(result, replacements, replacementCount);
    if (!hasResolvers(result)) {
      return result;
    }

    const trackedKeys = Object.keys(replacements);
    for (let index = 0; index < trackedKeys.length; index += 1) {
      if (result.includes(trackedKeys[index])) {
        throw new Error('Encountered unresolved async placeholder that could not be replaced.');
      }
    }

    return result;
  }

  /**
   * Core renderer used by Express adapter.
   *
   * @param {string} filename
   * @param {string | null} source
   * @param {AnyObject & { signal?: AbortSignal }} options
   * @returns {Promise<string>}
   */
  async _renderFile(filename, source, options) {
    const renderOptions = options == null
      ? createLookupObject()
      : cloneSafeObject(options, 'render options')
    renderOptions.blockCache = createLookupObject()
    const settingsViews = renderOptions.settings && Object.hasOwn(Object(renderOptions.settings), 'views')
      ? renderOptions.settings.views
      : undefined;
    const viewsDir = this._normalizeViewsDir(settingsViews ?? this.viewsDirOpt);
    const signal = getRenderSignal(renderOptions);

    throwIfAborted(signal);

    if (this.partialsDir && (this._options.refreshPartialsManifest || !renderOptions.cache || !this.isPartialCachingComplete)) {
      await this._cachePartials(viewsDir, signal);
    }

    const info = await this._getSourceTemplate(filename, source, renderOptions.cache, viewsDir, signal);
    const layoutTemplates = await this._resolveLayoutTemplates(filename, info, renderOptions, viewsDir, signal);

    throwIfAborted(signal);

    let resolverCache
    if (this.hasAsyncHelpers) {
      resolverCache = new Map()
      resolverCache[resolverPendingEntriesKey] = []
      renderOptions.resolverCache = resolverCache
    }
    const renderedHtml = this._renderWithLayouts(info.template, renderOptions, layoutTemplates)
    if (!resolverCache?.size) {
      return renderedHtml;
    }

    if (!hasResolvers(renderedHtml)) {
      await this._drainAsyncValues(resolverCache);
      return renderedHtml;
    }

    return this._resolveAsyncHtml(resolverCache, renderedHtml);
  }

  /**
   * @overload
   * @param {string} filename
   * @param {AnyObject | null | undefined} options
   * @param {ExpressRenderCallback} cb
   * @returns {void}
   */
  /**
   * @overload
   * @param {string} filename
   * @param {string | null} source
   * @param {AnyObject | null | undefined} options
   * @param {ExpressRenderCallback} cb
   * @returns {void}
   */
  /** Express view-engine entry point. */
  ___express(filename, sourceOrOptions, optionsOrCb, maybeCb) {
    let source = sourceOrOptions;
    let options = optionsOrCb;
    let cb = maybeCb;

    if (typeof maybeCb !== 'function') {
      source = null;
      options = sourceOrOptions;
      cb = optionsOrCb;
    }

    if (typeof cb !== 'function') {
      throw new TypeError('Render callback must be a function.');
    }

    attachNodeStyleCallback(this._renderFile(filename, source, options), cb, true);
  }
}

export default new ExpressHbs();
