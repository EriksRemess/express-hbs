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

  return Array.isArray(value) && value.length === 0;
}

export function createFrame(object) {
  const frame = Object.assign({}, object);
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
