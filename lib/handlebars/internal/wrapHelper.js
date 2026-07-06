export const lookupPropertyOption = Symbol('handlebarsLookupPropertyOption');

/**
 * Wraps a helper so runtime property lookups use the current lookup guard.
 *
 * @param {unknown} helper
 * @param {(parent: object, propertyName: string) => unknown} lookupProperty
 * @returns {unknown}
 */
export function wrapHelper(helper, lookupProperty) {
  if (typeof helper !== 'function') {
    // This should not happen, but apparently it does in https://github.com/wycats/handlebars.js/issues/1639
    // We try to make the wrapper least-invasive by not wrapping it, if the helper is not a function.
    return helper;
  }
  if (helper[lookupPropertyOption] === false) {
    return helper;
  }

  // Fixed arity avoids the generic apply() path for the helper call shapes emitted by the compiler.
  return function wrappedHelper(arg0, arg1, arg2, arg3, arg4) {
    const argumentCount = arguments.length;
    const options = argumentCount === 0 ? undefined : arguments[argumentCount - 1];
    if (options && typeof options === 'object') {
      options.lookupProperty = lookupProperty;
      const data = options.data;
      if (data && data.partialName !== undefined) {
        options.partialName = data.partialName;
      }
    }

    switch (argumentCount) {
      case 0:
        return helper.call(this);
      case 1:
        return helper.call(this, arg0);
      case 2:
        return helper.call(this, arg0, arg1);
      case 3:
        return helper.call(this, arg0, arg1, arg2);
      case 4:
        return helper.call(this, arg0, arg1, arg2, arg3);
      case 5:
        return helper.call(this, arg0, arg1, arg2, arg3, arg4);
      default:
        return helper.apply(this, arguments);
    }
  };
}
