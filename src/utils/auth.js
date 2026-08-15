import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export function getSessionToken() {
    const configPath = path.resolve(__dirname, '../../config.cjs');
    let config = {};

    try {
        config = require(configPath);
    } catch (e) {
        console.warn(
            `⚠️ Could not load config.cjs (${e.message}). Falling back to environment variables.`,
        );
    }

    return (
        process.env.COBALTSESSION || config.cobaltSession || config.DNDBEYOND_COBALT_SESSION || ''
    );
}
