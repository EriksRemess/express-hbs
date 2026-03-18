import { createFrame } from '#handlebars/utils';
import Exception from '#handlebars/exception';
import { registerDefaultDecorators } from '#handlebars/decorators';
import { registerDefaultHelpers } from '#handlebars/helpers';
import logger from '#handlebars/logger';
import {
  assignLookupObject,
  createNewLookupObject
} from '#handlebars/internal/create-new-lookup-object';
import { resetLoggedProperties } from '#handlebars/internal/proto-access';

const objectType = '[object Object]';
const reservedRegistryNames = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return Object.prototype.toString.call(value) === objectType;
}

/**
 * @param {unknown} name
 * @param {string} type
 * @returns {void}
 */
function assertRegistryName(name, type) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Exception(`${type} name must be a non-empty string`);
  }

  if (reservedRegistryNames.has(name)) {
    throw new Exception(`Cannot register ${type} with reserved name "${name}"`);
  }
}

/**
 * Shared Handlebars runtime environment for helpers, partials, and decorators.
 */
export class HandlebarsEnvironment {
  /**
   * @param {Record<string, Function>} [helpers]
   * @param {Record<string, string | Function>} [partials]
   * @param {Record<string, Function>} [decorators]
   */
  constructor(helpers, partials, decorators) {
    this.helpers = createNewLookupObject(helpers);
    this.partials = createNewLookupObject(partials);
    this.decorators = createNewLookupObject(decorators);
    this.helperRevision = 0;
    this.partialRevision = 0;
    this.decoratorRevision = 0;

    registerDefaultHelpers(this);
    registerDefaultDecorators(this);
    this.logger = logger;
    this.log = logger.log;
  }

  /**
   * @param {string | Record<string, Function>} name
   * @param {Function} [fn]
   * @returns {void}
   */
  registerHelper(name, fn) {
    if (isPlainObject(name)) {
      if (fn) {
        throw new Exception('Arg not supported with multiple helpers');
      }
      assignLookupObject(this.helpers, name);
      this.helperRevision += 1;
      return;
    }

    assertRegistryName(name, 'helper');
    this.helpers[name] = fn;
    this.helperRevision += 1;
  }

  /**
   * @param {string} name
   * @returns {void}
   */
  unregisterHelper(name) {
    delete this.helpers[name];
    this.helperRevision += 1;
  }

  /**
   * @param {string | Record<string, string | Function>} name
   * @param {string | Function} [partial]
   * @returns {void}
   */
  registerPartial(name, partial) {
    if (isPlainObject(name)) {
      assignLookupObject(this.partials, name);
      this.partialRevision += 1;
      return;
    }

    assertRegistryName(name, 'partial');
    if (typeof partial === 'undefined') {
      throw new Exception(
        `Attempting to register a partial called "${name}" as undefined`
      );
    }

    this.partials[name] = partial;
    this.partialRevision += 1;
  }

  /**
   * @param {string} name
   * @returns {void}
   */
  unregisterPartial(name) {
    delete this.partials[name];
    this.partialRevision += 1;
  }

  /**
   * @param {string | Record<string, Function>} name
   * @param {Function} [fn]
   * @returns {void}
   */
  registerDecorator(name, fn) {
    if (isPlainObject(name)) {
      if (fn) {
        throw new Exception('Arg not supported with multiple decorators');
      }
      assignLookupObject(this.decorators, name);
      this.decoratorRevision += 1;
      return;
    }

    assertRegistryName(name, 'decorator');
    this.decorators[name] = fn;
    this.decoratorRevision += 1;
  }

  /**
   * @param {string} name
   * @returns {void}
   */
  unregisterDecorator(name) {
    delete this.decorators[name];
    this.decoratorRevision += 1;
  }

  /**
   * Clears the prototype-access warning cache used by the runtime.
   *
   * @returns {void}
   */
  resetLoggedPropertyAccesses() {
    resetLoggedProperties();
  }
}

export { createFrame, logger };
