import * as Utils from '#handlebars/utils';
import Exception from '#handlebars/exception';
import {
  createFrame,
} from '#handlebars/base';
import { wrapHelper } from '#handlebars/internal/wrapHelper';
import {
  createProtoAccessControl,
  resultIsAllowed
} from '#handlebars/internal/proto-access';
import {
  assignLookupObject,
  createNewLookupObject
} from '#handlebars/internal/create-new-lookup-object';

const emptyObject = Object.freeze(Object.create(null));
const internalPartialOptions = Symbol('handlebarsInternalPartialOptions');

/**
 * Converts a compiled template spec into an executable render function.
 *
 * @param {{ main?: Function, main_d?: Function, compilerOptions?: unknown, useData?: boolean, useDepths?: boolean, useBlockParams?: boolean, [key: string]: unknown }} templateSpec
 * @param {Record<string, unknown>} env
 * @returns {Function}
 */
export function template(templateSpec, env) {
  if (!env) {
    throw new Exception('No environment passed to template');
  }
  if (!templateSpec || !templateSpec.main) {
    throw new Exception('Unknown template object: ' + typeof templateSpec);
  }

  templateSpec.main.decorator = templateSpec.main_d;
  const defaultProtoAccessControl = createProtoAccessControl({});
  const defaultHelperBundles = {
    keep: undefined,
    strip: undefined
  };
  const helperWrapperCache = new WeakMap();

  function wrapHelperWithLookup(helper) {
    if (typeof helper !== 'function') {
      return helper;
    }

    return helperWrapperCache.getOrInsertComputed(helper, () => wrapHelper(helper, container.lookupProperty));
  }

  function copyWrappedHelpers(target, source) {
    for (const helperName in source) {
      if (Object.hasOwn(source, helperName)) {
        target[helperName] = wrapHelperWithLookup(source[helperName]);
      }
    }
  }

  function finalizeHelperBundle(mergedHelpers, keepHelperInHelpers) {
    const helperMissing = mergedHelpers.helperMissing;
    const blockHelperMissing = mergedHelpers.blockHelperMissing;
    const hooks = createNewLookupObject();

    if (helperMissing) {
      hooks.helperMissing = helperMissing;
    }
    if (blockHelperMissing) {
      hooks.blockHelperMissing = blockHelperMissing;
    }

    const keepsDefaultHelpers = keepHelperInHelpers || !helperMissing && !blockHelperMissing;
    if (keepsDefaultHelpers) {
      return {
        helpers: mergedHelpers,
        hooks
      };
    }

    const helpers = createNewLookupObject();
    for (const helperName in mergedHelpers) {
      if (
        Object.hasOwn(mergedHelpers, helperName) &&
        helperName !== 'helperMissing' &&
        helperName !== 'blockHelperMissing'
      ) {
        helpers[helperName] = mergedHelpers[helperName];
      }
    }

    return {
      helpers,
      hooks
    };
  }

  function getDefaultHelperBundle(keepHelperInHelpers) {
    const cacheKey = keepHelperInHelpers ? 'keep' : 'strip';
    const cached = defaultHelperBundles[cacheKey];

    if (cached?.revision === env.helperRevision) {
      return cached.bundle;
    }

    const mergedHelpers = createNewLookupObject();
    copyWrappedHelpers(mergedHelpers, env.helpers);

    const bundle = finalizeHelperBundle(mergedHelpers, keepHelperInHelpers);
    defaultHelperBundles[cacheKey] = {
      revision: env.helperRevision,
      bundle
    };

    return bundle;
  }

  function getHelperBundle(localHelpers, keepHelperInHelpers) {
    if (!localHelpers) {
      return getDefaultHelperBundle(keepHelperInHelpers);
    }

    const mergedHelpers = createNewLookupObject();
    copyWrappedHelpers(mergedHelpers, env.helpers);
    copyWrappedHelpers(mergedHelpers, localHelpers);

    return finalizeHelperBundle(mergedHelpers, keepHelperInHelpers);
  }

  function getIsolatedPartialState(options) {
    const keepHelperInHelpers = options.allowCallsToHelperMissing === true;
    const helperBundle = getDefaultHelperBundle(keepHelperInHelpers);

    return {
      helpers: helperBundle.helpers,
      hooks: helperBundle.hooks,
      partials: env.partials,
      decorators: env.decorators
    };
  }

  function getProtoAccessControl(options) {
    if (
      options.allowedProtoProperties === undefined &&
      options.allowProtoPropertiesByDefault === undefined &&
      options.allowedProtoMethods === undefined &&
      options.allowProtoMethodsByDefault === undefined
    ) {
      return defaultProtoAccessControl;
    }

    return createProtoAccessControl(options);
  }

  function createPartialInvocationOptions(partial, options, hooks, protoAccessControl) {
    const partialOptions = createNewLookupObject(options, {
      hooks,
      protoAccessControl
    });

    partialOptions.data = options.data ? createFrame(options.data) : createNewLookupObject();

    if (
      partial &&
      typeof partial === 'function' &&
      partial._handlebarsEnv &&
      partial._handlebarsEnv !== env &&
      typeof partial._getIsolatedPartialState === 'function'
    ) {
      assignLookupObject(partialOptions, partial._getIsolatedPartialState(options));
    }

    partialOptions[internalPartialOptions] = true;
    return partialOptions;
  }

  function prepareDirectPartialInvocationOptions(partial, options, hooks, protoAccessControl) {
    const partialOptions = options;

    partialOptions.hooks = hooks;
    partialOptions.protoAccessControl = protoAccessControl;
    partialOptions.data = options.data ? createFrame(options.data) : createNewLookupObject();
    partialOptions.partial = true;

    if (options.ids) {
      partialOptions.ids = options.ids;
      partialOptions.data.contextPath = options.ids[0] || partialOptions.data.contextPath;
    }

    if (options.depths) {
      partialOptions.depths = options.depths;
    }

    if (options.name) {
      partialOptions.data.partialName = options.name;
    }

    if (
      partial._handlebarsEnv &&
      partial._handlebarsEnv !== env &&
      typeof partial._getIsolatedPartialState === 'function'
    ) {
      assignLookupObject(partialOptions, partial._getIsolatedPartialState(options));
    }

    partialOptions[internalPartialOptions] = true;
    return partialOptions;
  }

  function preparePartialExecutionOptions(options) {
    const partialOptions = options;

    partialOptions.partial = true;

    if (partialOptions.ids) {
      partialOptions.data.contextPath =
        partialOptions.ids[0] || partialOptions.data.contextPath;
    }

    if (partialOptions.name) {
      partialOptions.data.partialName = partialOptions.name;
    }

    return partialOptions;
  }

  function invokePartialWrapper(partial, context, options) {
    if (options.hash) {
      context = createNewLookupObject(context, options.hash);
      if (options.ids) {
        options.ids[0] = true;
      }
    }

    if (!options.hash && !options.fn && typeof partial === 'function') {
      const partialOptions = prepareDirectPartialInvocationOptions(
        partial,
        options,
        this.hooks,
        this.protoAccessControl
      );
      const result = partial(context, partialOptions);
      return result != null && partialOptions.indent
        ? indentPartialResult(result, partialOptions.indent)
        : result;
    }

    let partialOptions = createPartialInvocationOptions(
      partial,
      options,
      this.hooks,
      this.protoAccessControl
    );
    partial = resolvePartial.call(this, partial, context, partialOptions);
    partialOptions = preparePartialExecutionOptions(partialOptions);

    let result = invokePartial.call(
      this,
      partial,
      context,
      partialOptions
    );

    if (result == null && env.compile) {
      if (typeof partial !== 'string') {
        throw new Exception('The partial ' + options.name + ' could not be found');
      }

      partialOptions.partials[partialOptions.name] = env.compile(
        partial,
        templateSpec.compilerOptions,
        env
      );
      result = partialOptions.partials[partialOptions.name](context, partialOptions);
    }
    if (result != null) {
      if (partialOptions.indent) {
        result = indentPartialResult(result, partialOptions.indent);
      }
      return result;
    } 
      throw new Exception(
        'The partial ' +
          options.name +
          ' could not be compiled when running in runtime-only mode'
      );
    
  }

  // Just add water
  const container = {
    strict(obj, name, loc) {
      if (!obj || !(name in obj)) {
        throw new Exception('"' + name + '" not defined in ' + obj, {
          loc
        });
      }
      return container.lookupProperty(obj, name);
    },
    lookupProperty(parent, propertyName) {
      const result = parent[propertyName];
      if (result == null) {
        return result;
      }
      if (Object.hasOwn(parent, propertyName)) {
        return result;
      }

      if (resultIsAllowed(result, container.protoAccessControl, propertyName)) {
        return result;
      }
      return undefined;
    },
    lookup(depths, name) {
      const len = depths.length;
      for (let i = 0; i < len; i++) {
        const result = depths[i] && container.lookupProperty(depths[i], name);
        if (result != null) {
          return result;
        }
      }
    },
    lambda(current, context) {
      return typeof current === 'function' ? current.call(context) : current;
    },

    escapeExpression: Utils.escapeExpression,
    invokePartial: invokePartialWrapper,

    fn(i) {
      const ret = templateSpec[i];
      ret.decorator = templateSpec[i + '_d'];
      return ret;
    },

    programs: [],
    program(i, data, declaredBlockParams, blockParams, depths) {
      let programWrapper = this.programs[i],
        fn = this.fn(i);
      if (data || depths || blockParams || declaredBlockParams) {
        programWrapper = wrapProgram(
          this,
          i,
          fn,
          data,
          declaredBlockParams,
          blockParams,
          depths
        );
      } else if (!programWrapper) {
        programWrapper = this.programs[i] = wrapProgram(this, i, fn);
      }
      return programWrapper;
    },

    data(value, depth) {
      while (value && depth--) {
        value = value._parent;
      }
      return value;
    },
    mergeIfNeeded(param, common) {
      let obj = common;

      if (param) {
        obj = param === common ? param : createNewLookupObject(common, param);
      }

      return obj;
    },
    // An empty object to use as replacement for null-contexts
    nullContext: Object.seal({}),

    noop,
  };

  function ret(context, options) {
    if (options == null) {
      options = emptyObject;
    } else if (options[internalPartialOptions] !== true) {
      options = createNewLookupObject(options);
    }
    let data = options.data;

    ret._setup(options);
    if (!options.partial && templateSpec.useData) {
      data = initData(context, data);
    }
    let depths,
      blockParams = templateSpec.useBlockParams ? [] : undefined;
    if (templateSpec.useDepths) {
      if (options.depths) {
        depths =
          context !== options.depths[0]
            ? [context].concat(options.depths)
            : options.depths;
      } else {
        depths = [context];
      }
    }

    function main(context /*, options*/) {
      return (
        '' +
        templateSpec.main(
          container,
          context,
          container.helpers,
          container.partials,
          data,
          blockParams,
          depths
        )
      );
    }

    main = executeDecorators(
      templateSpec.main,
      main,
      container,
      options.depths || [],
      data,
      blockParams
    );
    return main(context, options);
  }

  ret.isTop = true;
  ret._handlebarsEnv = env;
  ret._getIsolatedPartialState = getIsolatedPartialState;

  ret._setup = function(options) {
    if (!options.partial) {
      const keepHelperInHelpers = options.allowCallsToHelperMissing === true;
      const helperBundle = getHelperBundle(options.helpers, keepHelperInHelpers);
      container.helpers = helperBundle.helpers;
      container.hooks = helperBundle.hooks;

      if (templateSpec.usePartial) {
        container.partials = options.partials
          ? container.mergeIfNeeded(options.partials, env.partials)
          : env.partials;
      }
      if (templateSpec.usePartial || templateSpec.useDecorators) {
        container.decorators = options.decorators
          ? createNewLookupObject(env.decorators, options.decorators)
          : env.decorators;
      }
      container.protoAccessControl = getProtoAccessControl(options);
    } else {
      container.protoAccessControl = options.protoAccessControl; // internal option
      container.helpers = options.helpers;
      container.partials = options.partials;
      container.decorators = options.decorators;
      container.hooks = options.hooks;
    }
  };

  ret._child = function(i, data, blockParams, depths) {
    if (templateSpec.useBlockParams && !blockParams) {
      throw new Exception('must pass block params');
    }
    if (templateSpec.useDepths && !depths) {
      throw new Exception('must pass parent depths');
    }

    return wrapProgram(
      container,
      i,
      templateSpec[i],
      data,
      0,
      blockParams,
      depths
    );
  };
  return ret;
}

// Fixed arity avoids rest-parameter array allocation in the render loop.
// eslint-disable-next-line max-params
function wrapProgram(container, i, fn, data, declaredBlockParams, blockParams, depths) {
  function prog(context, options) {
    options = options == null || Utils.isInternalOptions(options)
      ? options || emptyObject
      : createNewLookupObject(options);
    let currentDepths = depths;
    if (
      depths &&
      context !== depths[0] &&
      !(context === container.nullContext && depths[0] === null)
    ) {
      currentDepths = [context].concat(depths);
    }

    return fn(
      container,
      context,
      container.helpers,
      container.partials,
      options.data || data,
      blockParams && [options.blockParams].concat(blockParams),
      currentDepths
    );
  }

  prog = executeDecorators(fn, prog, container, depths, data, blockParams);

  prog.program = i;
  prog.depth = depths ? depths.length : 0;
  prog.blockParams = declaredBlockParams || 0;
  return prog;
}

/**
 * This is currently part of the official API, therefore implementation details should not be changed.
 *
 * @param {unknown} partial
 * @param {unknown} context
 * @param {{ name?: string, data?: Record<string, unknown>, partials: Record<string, unknown> }} options
 * @returns {unknown}
 */
function resolvePartial(partial, context, options) {
  if (!partial) {
    if (options.name === '@partial-block') {
      partial = lookupOwnProperty(options.data, 'partial-block');
    } else {
      partial = lookupOwnProperty(options.partials, options.name);
    }
  } else if (typeof partial !== 'function' && !options.name) {
    // This is a dynamic partial that returned a string
    if (typeof partial !== 'string') {
      return undefined;
    }

    options.name = partial;
    partial = lookupOwnProperty(options.partials, partial);
  }
  return partial;
}

function indentPartialResult(result, indent) {
  if (result === '') {
    return result;
  }

  let output = indent;
  let start = 0;

  while (true) {
    const index = result.indexOf('\n', start);
    if (index === -1) {
      return output + result.slice(start);
    }

    output += result.slice(start, index + 1);
    start = index + 1;
    if (start < result.length) {
      output += indent;
    }
  }
}

/**
 * Resolves and invokes a partial, including partial blocks.
 *
 * @param {unknown} partial
 * @param {unknown} context
 * @param {{ data?: Record<string, unknown>, ids?: string[], fn?: Function, partials: Record<string, unknown>, name?: string }} options
 * @returns {unknown}
 */
function invokePartial(partial, context, options) {
  // Use the current closure context to save the partial-block if this partial
  const currentPartialBlock = lookupOwnProperty(options.data, 'partial-block');
  options.partial = true;
  if (options.ids) {
    options.data.contextPath = options.ids[0] || options.data.contextPath;
  }

  let partialBlock;
  if (options.fn && options.fn !== noop) {
    options.data = createFrame(options.data);
    // Wrapper function to get access to currentPartialBlock from the closure
    let fn = options.fn;
    partialBlock = options.data['partial-block'] = function partialBlockWrapper(
      context,
      options
    ) {
      options = createNewLookupObject(options);
      // Restore the partial-block from the closure for the execution of the block
      // i.e. the part inside the block of the partial call.
      options.data = createFrame(options.data);
      options.data['partial-block'] = currentPartialBlock;
      return fn(context, options);
    };
    if (fn.partials) {
      options.partials = createNewLookupObject(options.partials, fn.partials);
    }
  }

  if (partial === undefined && partialBlock) {
    partial = partialBlock;
  }

  if (partial === undefined) {
    throw new Exception('The partial ' + options.name + ' could not be found');
  } else if (partial instanceof Function) {
    return partial(context, options);
  }
}

/**
 * Default no-op template function used for absent partial blocks.
 *
 * @returns {string}
 */
function noop() {
  return '';
}

/**
 * Reads an own property without traversing polluted prototypes.
 *
 * @param {unknown} obj
 * @param {PropertyKey} name
 * @returns {unknown}
 */
function lookupOwnProperty(obj, name) {
  if (obj != null && Object.hasOwn(obj, name)) {
    return obj[name];
  }
}

/**
 * Ensures render data has a root context.
 *
 * @param {unknown} context
 * @param {Record<string, unknown> | undefined} data
 * @returns {Record<string, unknown>}
 */
function initData(context, data) {
  if (!data || !Object.hasOwn(Object(data), 'root')) {
    data = data ? createFrame(data) : createNewLookupObject();
    Object.defineProperty(data, 'root', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: context
    });
  }
  return data;
}

/**
 * Applies decorator functions to a compiled program.
 *
 * @param {Function} fn
 * @param {Function} prog
 * @param {Record<string, unknown>} container
 * @param {unknown[] | undefined} depths
 * @param {Record<string, unknown> | undefined} data
 * @param {unknown[] | undefined} blockParams
 * @returns {Function}
 */
// eslint-disable-next-line max-params
function executeDecorators(fn, prog, container, depths, data, blockParams) {
  if (fn.decorator) {
    const props = createNewLookupObject();
    prog = fn.decorator(
      prog,
      props,
      container,
      depths && depths[0],
      data,
      blockParams,
      depths
    );
    assignLookupObject(prog, props);
  }
  return prog;
}
