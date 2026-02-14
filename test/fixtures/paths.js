import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function dirnameFromMeta(metaUrl) {
  return path.dirname(fileURLToPath(metaUrl));
}

export function fromHere(metaUrl, ...parts) {
  return path.join(dirnameFromMeta(metaUrl), ...parts);
}
