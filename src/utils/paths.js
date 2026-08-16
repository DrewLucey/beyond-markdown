import { fileURLToPath } from 'url';
import path from 'path';

/**
 * Returns the equivalent of __dirname for ES modules.
 * @param {string} metaUrl - Usually import.meta.url
 * @returns {string} The directory name
 */
export function getDirname(metaUrl) {
    const __filename = fileURLToPath(metaUrl);
    return path.dirname(__filename);
}

/**
 * Returns the equivalent of __filename for ES modules.
 * @param {string} metaUrl - Usually import.meta.url
 * @returns {string} The file name
 */
export function getFilename(metaUrl) {
    return fileURLToPath(metaUrl);
}
