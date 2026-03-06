const escape = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '`': '&#x60;',
  '=': '&#x3D;'
};

const badChars = /[&<>"'`=]/g;
const possible = /[&<>"'`=]/;

function escapeChar(chr) {
  return escape[chr];
}

export function extend(obj, ...sources) {
  for (const source of sources) {
    if (!source) {
      continue;
    }

    for (const key in source) {
      if (Object.hasOwn(source, key)) {
        obj[key] = source[key];
      }
    }
  }

  return obj;
}

export const toString = Object.prototype.toString;

// Sourced from lodash
// https://github.com/bestiejs/lodash/blob/master/LICENSE.txt
let isFunction = value => typeof value === 'function';

if (isFunction(/x/)) {
  isFunction = value =>
    typeof value === 'function' && toString.call(value) === '[object Function]';
}

export { isFunction };

export const isArray = Array.isArray;

export function indexOf(array, value) {
  for (let i = 0; i < array.length; i++) {
    if (array[i] === value) {
      return i;
    }
  }

  return -1;
}

export function escapeExpression(string) {
  if (typeof string !== 'string') {
    if (string?.toHTML) {
      return string.toHTML();
    }
    if (string == null) {
      return '';
    }
    if (!string) {
      return String(string);
    }

    string = String(string);
  }

  if (!possible.test(string)) {
    return string;
  }

  return string.replace(badChars, escapeChar);
}

export function isEmpty(value) {
  if (!value && value !== 0) {
    return true;
  }

  return isArray(value) && value.length === 0;
}

export function createFrame(object) {
  const frame = extend({}, object);
  frame._parent = object;
  return frame;
}

export function blockParams(params, ids) {
  params.path = ids;
  return params;
}

export function appendContextPath(contextPath, id) {
  return `${contextPath ? `${contextPath}.` : ''}${id}`;
}
