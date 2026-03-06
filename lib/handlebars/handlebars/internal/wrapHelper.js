export function wrapHelper(helper, lookupProperty) {
  if (typeof helper !== 'function') {
    // This should not happen, but apparently it does in https://github.com/wycats/handlebars.js/issues/1639
    // We try to make the wrapper least-invasive by not wrapping it, if the helper is not a function.
    return helper;
  }

  return function wrappedHelper() {
    const options = arguments[arguments.length - 1];
    if (options && typeof options === 'object') {
      options.lookupProperty = lookupProperty;
    }
    return helper.apply(this, arguments);
  };
}
