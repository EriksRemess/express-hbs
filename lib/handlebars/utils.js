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
  const frame = Object.assign({}, object);
  frame._parent = object;
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
