import { randomBytes } from 'node:crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_';
const alphabetLength = alphabet.length;
const maxByte = Math.floor(256 / alphabetLength) * alphabetLength;

/**
 * Generates a random identifier using a fixed URL-safe alphabet.
 *
 * @param {number} [length=8]
 * @returns {string}
 */
const generateId = (length = 8) => {
  let result = '';

  while (result.length < length) {
    const bytes = randomBytes(length - result.length);
    for (let index = 0; index < bytes.length; index += 1) {
      const byte = bytes[index];
      if (byte >= maxByte) {
        continue;
      }

      result += alphabet[byte % alphabetLength];
    }
  }

  return result;
};

export default generateId;
