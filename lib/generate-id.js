const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_';
const alphabetLength = alphabet.length;
let nextId = 0;

function encodeCounter(value, minLength) {
  let encoded = '';

  do {
    encoded = alphabet[value % alphabetLength] + encoded;
    value = Math.floor(value / alphabetLength);
  } while (value > 0);

  while (encoded.length < minLength) {
    encoded = `${alphabet[0]}${encoded}`;
  }

  return encoded;
}

/**
 * Generates a process-local identifier using a fixed URL-safe alphabet.
 *
 * @param {number} [length=8]
 * @returns {string}
 */
const generateId = (length = 8) => {
  const id = encodeCounter(nextId, length);
  nextId += 1;
  return id.length > length ? id.slice(-length) : id;
};

export default generateId;
