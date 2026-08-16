import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { getDirname } from '../utils/paths.js';
import { getRawCobaltSession } from '../utils/auth.js';

const require = createRequire(import.meta.url);
const __dirname = getDirname(import.meta.url);

const LIBRARY_URL = 'https://www.dndbeyond.com/sources';
const OUTPUT_MAP_FILE = path.resolve(__dirname, '../sources/ruleset_map.json');

const RULESET_MAP = {
    '2024 Core Rules': '5.5e',
    'Fifth Edition Core Rules': '5e',
};

/**
 * Crawls D&D Beyond library for owned sourcebooks.
 */
async function crawlLibrary() {
    try {
        const sessionToken = getRawCobaltSession();

        if (!sessionToken) {
            console.error(
                '❌ CobaltSession token is missing. Please check your config.cjs or .env file.',
            );
            process.exit(1);
        }

        const response = await axios.get(LIBRARY_URL, {
            headers: {
                Cookie: `CobaltSession=${sessionToken}`,
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });

        const html = response.data;
        const sourceMap = {};

        console.log('Decoding Next.js data stream...');

        // --- THE NEXT.JS JSON HIJACK ---
        // DDB injects their entire Redux/State store into a hidden script tag pushed to an array
        // We look for the specific push containing the sources array
        const regex = /self\.__next_f\.push\(\[1,"(.*?)"\]\)/g;
        let match;

        let foundSources = false;

        while ((match = regex.exec(html)) !== null) {
            const rawChunk = match[1];
            // Unescape the Next.js chunk payload (replacing \" with ")
            const unescapedChunk = rawChunk.replace(/\\"/g, '"').replace(/\\\\/g, '\\');

            // Check if this chunk contains the sources payload
            if (unescapedChunk.includes('{"sources":[')) {
                foundSources = true;
                const jsonStart = unescapedChunk.indexOf('{"sources":[');

                // We use bracket balancing to safely extract the valid JSON object
                let bracketCount = 0;
                let endIdx = -1;

                for (let i = jsonStart; i < unescapedChunk.length; i++) {
                    if (unescapedChunk[i] === '{') bracketCount++;
                    else if (unescapedChunk[i] === '}') {
                        bracketCount--;
                        if (bracketCount === 0) {
                            endIdx = i;
                            break;
                        }
                    }
                }

                if (endIdx !== -1) {
                    try {
                        const jsonStr = unescapedChunk.substring(jsonStart, endIdx + 1);
                        const data = JSON.parse(jsonStr);

                        if (data.sources && Array.isArray(data.sources)) {
                            data.sources.forEach((source) => {
                                if (source.relativePath) {
                                    const slug = source.relativePath.split('/').pop();
                                    const rulesetName = source.ruleset?.name || '5e';

                                    sourceMap[slug] = {
                                        title: source.name || slug,
                                        ruleset: RULESET_MAP[rulesetName] || rulesetName,
                                        type: source.type || 'unknown',
                                        isLegacy: source.isLegacy === true,
                                        path: source.relativePath,
                                    };
                                }
                            });
                        }
                    } catch (e) {
                        console.error('JSON Parse failed on extracted stream array:', e.message);
                    }
                }
            }
        }

        if (!foundSources || Object.keys(sourceMap).length === 0) {
            console.warn(
                '! Stream extraction failed or array was empty. Falling back to DOM parsing.',
            );

            // DOM Fallback in case D&D Beyond dramatically changes their Next.js state structure
            const $ = cheerio.load(html);
            $('[data-testid="sourceCard"]').each((_, el) => {
                const $link = $(el).find('a[class*="sourceTitle"]');
                const title = $link.text().trim();
                const relativePath = $link.attr('href');

                if (title && relativePath) {
                    const slug = relativePath.split('/').pop();
                    // Fallback heuristics
                    const ruleset = title.includes('2024') ? '5.5e' : '5e';
                    sourceMap[slug] = {
                        title,
                        ruleset,
                        type: 'unknown',
                        isLegacy: false,
                        path: relativePath,
                    };
                }
            });
        }

        const sourceCount = Object.keys(sourceMap).length;

        if (sourceCount === 0) {
            console.warn(
                '! No sources mapped. Verify your CobaltSession token is valid and unexpired.',
            );
        } else {
            const outputDir = path.dirname(OUTPUT_MAP_FILE);
            if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

            fs.writeFileSync(OUTPUT_MAP_FILE, JSON.stringify(sourceMap, null, 2));
            console.log(`✅ Metadata Dictionary successfully saved to: ${OUTPUT_MAP_FILE}`);
            console.log(`Mapped ${sourceCount} sourcebooks.`);

            // Quick visual verification for the user
            const sample55e = Object.values(sourceMap).find((s) => s.ruleset === '5.5e');
            const sampleLegacy = Object.values(sourceMap).find((s) => s.isLegacy === true);
            console.log(
                `\nSample Captures:\n- 5.5e System: ${sample55e ? sample55e.title : 'None found'}\n- Legacy Material: ${sampleLegacy ? sampleLegacy.title : 'None found'}\n`,
            );
        }
    } catch (error) {
        console.error('Library Crawl Failed:', error.message);
    }
}

crawlLibrary();
