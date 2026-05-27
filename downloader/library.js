/**
 * library.js
 * Scrapes the Next.js hydration payload from D&D Beyond to map all owned/shared sourcebooks.
 * Captures their specific Ruleset tags (5e vs 2024), Type, and Legacy status to fuel AI context routing.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Load Authentication
const configPath = path.resolve(__dirname, '../config.cjs');
let config = {};
try { 
    config = require(configPath); 
} catch (e) {
    // Fallback to environment variables if config.cjs doesn't exist
}

const LIBRARY_URL = 'https://www.dndbeyond.com/en/library?ownership=owned-shared';

// Where we save the rule map so stitcher.js can access it
const OUTPUT_MAP_FILE = path.resolve(__dirname, '../sources/ruleset_map.json');

async function crawlLibrary() {
    try {
        console.log(`--- Crawling Library for Available Sources & Metadata ---`);
        const sessionToken = config.cobaltSession || config.DNDBEYOND_COBALT_SESSION || process.env.COBALTSESSION || '';
        
        const response = await axios.get(LIBRARY_URL, {
            headers: { 
                'Cookie': sessionToken ? `CobaltSession=${sessionToken}` : '',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const sourceMap = {};

        // --- THE NEXT.JS JSON HIJACK ---
        // DDB injects their entire Redux/State store into a hidden script tag
        const nextDataScript = $('#__NEXT_DATA__').html();
        
        if (nextDataScript) {
            console.log("Next.js Payload Found! Extracting hidden database schemas...");
            const nextData = JSON.parse(nextDataScript);
            
            try {
                // Safely traverse the Next.js prop tree based on DDB's current schema
                const sources = nextData.props?.pageProps?.initialState?.library?.sources || [];
                
                if (sources.length > 0) {
                    sources.forEach(source => {
                        if (source.relativePath) {
                            const slug = source.relativePath.split('/').pop();
                            
                            // Map the exact schema values required for AI routing + comprehensive repo data
                            sourceMap[slug] = {
                                id: source.id || null,
                                title: source.name || slug,
                                image: source.image || null,
                                marketplaceUrl: source.marketplaceUrl || null,
                                sku: source.sku || null,
                                path: source.relativePath,
                                isThirdParty: source.isThirdParty === true,
                                publisher: source.publisher || "Unknown",
                                ruleset: source.ruleset?.name || '5e',
                                fullRulesetInfo: source.ruleset || null,
                                type: source.type || 'unknown',
                                isFree: source.isFree === true,
                                isReleased: source.isReleased !== false,
                                releaseDate: source.releaseDate || null,
                                isOwned: source.isOwned === true,
                                isSharedWithMe: source.isSharedWithMe === true,
                                isFavorite: source.isFavorite === true,
                                isOnWishlist: source.isOnWishlist === true,
                                isLegacy: source.isLegacy === true
                            };
                        }
                    });
                } else {
                    console.warn("! Sources array empty in Next.js state. Layout may have changed.");
                }
            } catch (err) {
                console.warn("! Error traversing Next.js state tree:", err.message);
            }
        } else {
            console.warn("! Warning: Next.js script payload not found.");
        }

        // --- DOM FALLBACK ---
        // If the JSON extraction fails, we scrape the visual cards so the pipeline doesn't break
        if (Object.keys(sourceMap).length === 0) {
            console.log("Using DOM fallback extraction...");
            $('[data-testid="sourceCard"]').each((_, el) => {
                const $link = $(el).find('a[class*="sourceTitle"]');
                const title = $link.text().trim();
                const relativePath = $link.attr('href');
                
                if (title && relativePath) {
                    const slug = relativePath.split('/').pop();
                    const ruleset = title.includes('2024') ? '2024' : '5e'; 
                    
                    // Fallbacks lack exact deep-data, but we maintain the identical schema structure
                    sourceMap[slug] = { 
                        id: null,
                        title, 
                        image: null,
                        marketplaceUrl: null,
                        sku: null,
                        path: relativePath,
                        isThirdParty: false,
                        publisher: "Unknown",
                        ruleset, 
                        fullRulesetInfo: null,
                        type: 'unknown', 
                        isFree: false,
                        isReleased: true,
                        releaseDate: null,
                        isOwned: true, // Assumed if visible in library
                        isSharedWithMe: false,
                        isFavorite: false,
                        isOnWishlist: false,
                        isLegacy: false
                    };
                }
            });
        }

        const sourceCount = Object.keys(sourceMap).length;

        if (sourceCount === 0) {
            console.warn("! No sources mapped. Check your CobaltSession and library ownership.");
        } else {
            console.log(`\nDiscovered ${sourceCount} sources mapped to internal metadata.`);
            
            // Save the Map to a JSON file
            const outputDir = path.dirname(OUTPUT_MAP_FILE);
            if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
            
            fs.writeFileSync(OUTPUT_MAP_FILE, JSON.stringify(sourceMap, null, 2));
            console.log(`✅ Metadata Dictionary saved to: ${OUTPUT_MAP_FILE}`);
            
            // Provide a quick visual verification in the console
            const sampleAdv = Object.values(sourceMap).find(s => s.type === 'adventure');
            const sampleLegacy = Object.values(sourceMap).find(s => s.isLegacy === true);
            console.log(`\nSample Captures:\n- Adventure: ${sampleAdv ? sampleAdv.title : 'None found'}\n- Legacy Material: ${sampleLegacy ? sampleLegacy.title : 'None found'}\n`);
        }

    } catch (error) {
        console.error("\nLibrary Crawl Failed:", error.message);
    }
}

crawlLibrary();