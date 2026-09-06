import { createNewLookupObject } from '#handlebars/internal/create-new-lookup-object';
import logger from '#handlebars/logger';

const loggedProperties = Object.create(null);

/**
 * Creates the runtime prototype-access allowlist structure.
 *
 * @param {Record<string, unknown>} runtimeOptions
 * @returns {{ properties: { whitelist: object, defaultValue: unknown }, methods: { whitelist: object, defaultValue: unknown } }}
 */
export function createProtoAccessControl(runtimeOptions) {
  runtimeOptions = createNewLookupObject(runtimeOptions);

  let defaultMethodWhiteList = Object.create(null);
  defaultMethodWhiteList['constructor'] = false;
  defaultMethodWhiteList['__defineGetter__'] = false;
  defaultMethodWhiteList['__defineSetter__'] = false;
  defaultMethodWhiteList['__lookupGetter__'] = false;
  defaultMethodWhiteList['__lookupSetter__'] = false;

  let defaultPropertyWhiteList = Object.create(null);
  defaultPropertyWhiteList['__proto__'] = false;

  // Preserve reserved-name denials on these null-prototype maps; the generic
  // lookup-object copier intentionally drops those keys from untrusted input.
  return {
    properties: {
      whitelist: Object.assign(
        defaultPropertyWhiteList,
        createNewLookupObject(runtimeOptions.allowedProtoProperties)
      ),
      defaultValue: runtimeOptions.allowProtoPropertiesByDefault
    },
    methods: {
      whitelist: Object.assign(
        defaultMethodWhiteList,
        createNewLookupObject(runtimeOptions.allowedProtoMethods)
      ),
      defaultValue: runtimeOptions.allowProtoMethodsByDefault
    }
  };
}

/**
 * Checks whether a resolved property or method value may be returned to templates.
 *
 * @param {unknown} result
 * @param {{ properties: object, methods: object }} protoAccessControl
 * @param {string} propertyName
 * @returns {boolean}
 */
export function resultIsAllowed(result, protoAccessControl, propertyName) {
  if (typeof result === 'function') {
    return checkWhiteList(protoAccessControl.methods, propertyName);
  } 
    return checkWhiteList(protoAccessControl.properties, propertyName);
  
}

/**
 * Evaluates a whitelist entry for a particular property type.
 *
 * @param {{ whitelist: Record<string, boolean>, defaultValue?: boolean }} protoAccessControlForType
 * @param {string} propertyName
 * @returns {boolean}
 */
function checkWhiteList(protoAccessControlForType, propertyName) {
  if (protoAccessControlForType.whitelist[propertyName] !== undefined) {
    return protoAccessControlForType.whitelist[propertyName] === true;
  }
  if (protoAccessControlForType.defaultValue !== undefined) {
    return protoAccessControlForType.defaultValue;
  }
  logUnexpecedPropertyAccessOnce(propertyName);
  return false;
}

/**
 * Emits the prototype-access warning at most once per property name.
 *
 * @param {string} propertyName
 * @returns {void}
 */
function logUnexpecedPropertyAccessOnce(propertyName) {
  if (loggedProperties[propertyName] !== true) {
    loggedProperties[propertyName] = true;
    logger.log(
      'error',
      `Handlebars: Access has been denied to resolve the property "${propertyName}" because it is not an "own property" of its parent.\n` +
        'You can add a runtime option to disable the check or this warning:\n' +
        'See https://handlebarsjs.com/api-reference/runtime-options.html#options-to-control-prototype-access for details'
    );
  }
}

/**
 * Clears the once-per-property warning cache used during tests.
 *
 * @returns {void}
 */
export function resetLoggedProperties() {
  Object.keys(loggedProperties).forEach(propertyName => {
    delete loggedProperties[propertyName];
  });
}
