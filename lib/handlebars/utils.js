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
const forbiddenCodePoints = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE-\uFFFF]/;
const replacementCharacter = '\uFFFD';
const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * @param {string} chr
 * @returns {string}
 */
function escapeChar(chr) {
  return escape[chr];
}

/**
 * Escapes a value for safe HTML output.
 *
 * @param {unknown} string
 * @returns {string}
 */
export function escapeExpression(string) {
  if (typeof string !== 'string') {
    if (
      string != null &&
      Object.hasOwn(Object(string), 'toHTML') &&
      typeof string.toHTML === 'function'
    ) {
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

  if (forbiddenCodePoints.test(string)) {
    string = replaceForbiddenCodePoints(string);
  }

  if (!possible.test(string)) {
    return string;
  }

  return string.replace(badChars, escapeChar);
}

/**
 * Replaces code points forbidden in XML/HTML text nodes with U+FFFD.
 *
 * @param {string} string
 * @returns {string}
 */
function replaceForbiddenCodePoints(string) {
  let sanitized = '';
  let lastSafeIndex = 0;

  for (let index = 0; index < string.length;) {
    const codePoint = string.charCodeAt(index);

    if (
      codePoint === 0x9 ||
      codePoint === 0xA ||
      codePoint === 0xD ||
      codePoint >= 0x20 && codePoint <= 0xD7FF ||
      codePoint >= 0xE000 && codePoint <= 0xFFFD
    ) {
      index += 1;
      continue;
    }

    if (codePoint >= 0xD800 && codePoint <= 0xDBFF) {
      const nextCodePoint = string.charCodeAt(index + 1);
      if (nextCodePoint >= 0xDC00 && nextCodePoint <= 0xDFFF) {
        index += 2;
        continue;
      }
    }

    sanitized += string.slice(lastSafeIndex, index) + replacementCharacter;
    index += 1;
    lastSafeIndex = index;
  }

  return lastSafeIndex === 0 ? string : sanitized + string.slice(lastSafeIndex);
}

/**
 * Implements Handlebars emptiness semantics used by built-in helpers.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isEmpty(value) {
  if (!value && value !== 0) {
    return true;
  }

  return Array.isArray(value) && value.length === 0;
}

/**
 * Creates a child data frame linked to a parent frame.
 *
 * @param {Record<string, unknown>} object
 * @returns {Record<string, unknown> & { _parent: Record<string, unknown> }}
 */
export function createFrame(object) {
  const frame = Object.create(null);

  if (object != null) {
    for (const key in object) {
      if (!Object.hasOwn(object, key) || unsafeKeys.has(key)) {
        continue;
      }

      frame[key] = object[key];
    }
  }

  Object.defineProperty(frame, '_parent', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: object
  });
  return frame;
}

/**
 * Attaches block-param path metadata to the params array.
 *
 * @param {unknown[] & { path?: unknown }} params
 * @param {unknown} ids
 * @returns {unknown[] & { path: unknown }}
 */
export function blockParams(params, ids) {
  params.path = ids;
  return params;
}

/**
 * Appends a child path segment to a Handlebars context path.
 *
 * @param {string | undefined} contextPath
 * @param {string} id
 * @returns {string}
 */
export function appendContextPath(contextPath, id) {
  return `${contextPath ? `${contextPath}.` : ''}${id}`;
}
