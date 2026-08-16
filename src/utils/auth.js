import axios from 'axios';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { getDirname } from './paths.js';
import { createRequire } from 'module';

const __dirname = getDirname(import.meta.url);
const require = createRequire(import.meta.url);

/**
 * Loads the raw CobaltSession cookie from environment variables or config file.
 * 
 * @returns {string} The raw CobaltSession cookie
 */
export function getRawCobaltSession() {
let config = {};
    try {
        const configPath = path.resolve(__dirname, '../../config.cjs');
        if (fs.existsSync(configPath)) {
            config = require(configPath);
        }
    } catch (e) {
        console.warn('Could not load config.cjs, falling back to process.env');
    }

    const cobaltSession = process.env.COBALTSESSION || config.cobaltSession || '';

    if (!cobaltSession) {
        throw new Error('Missing COBALTSESSION in .env or config.cjs');
    }
    return cobaltSession;
}

/**
 * Loads the CobaltSession cookie from environment variables or config file.
 * Authenticates with D&D Beyond Auth Service to return a bearer token.
 *
 * @returns {Promise<string>} The authentication bearer token
 */
export async function getAuthToken() {
    console.log('Authenticating with D&D Beyond Auth Service...');
    
    const cobaltSession = getRawCobaltSession();



    try {
        const res = await axios.post('https://auth-service.dndbeyond.com/v1/cobalt-token', null, {
            headers: { Cookie: `CobaltSession=${cobaltSession}` },
        });
        console.log('✅ Authentication Successful.');
        return res.data.token;
    } catch (err) {
        throw new Error(`Authentication Failed: ${err.message}`);
    }
}
