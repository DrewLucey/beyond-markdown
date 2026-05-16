import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.resolve(__dirname, '../config.cjs');
const config = require(configPath);

const BASE_URL = 'https://www.dndbeyond.com';
const TARGET_DIR = process.argv[2] || '/spells'; // e.g., /monsters, /magic-items

async function crawlListing() {
    try {
        console.log(`--- Starting Listing Crawl: ${TARGET_DIR} ---`);
        const itemManifest = new Map();
        let currentPage = 1;
        let hasNextPage = true;

        while (hasNextPage) {
            console.log(`Scanning Page ${currentPage}...`);
            const url = `${BASE_URL}${TARGET_DIR}?page=${currentPage}`;
            
            const response = await axios.get(url, {
                headers: { 'Cookie': `CobaltSession=${config.cobaltSession}` }
            });

            const $ = cheerio.load(response.data);
            
            // 1. DISCOVER ITEMS
            // Standard DDB Listing Row Selector
            $('.list-row, .info, .monster-name').find('a.link').each((_, el) => {
                const href = $(el).attr('href');
                const name = $(el).text().trim();
                
                // Ensure it's a detail link (e.g., /spells/fireball) and not a category link
                if (href && href.startsWith(TARGET_DIR + '/')) {
                    const fullUrl = BASE_URL + href;
                    if (!itemManifest.has(fullUrl)) {
                        itemManifest.set(fullUrl, name);
                    }
                }
            });

            // 2. CHECK FOR NEXT PAGE
            const nextButton = $('.b-pagination-item-next a');
            if (nextButton.length > 0 && currentPage < 50) { // Safety cap at 50 pages
                currentPage++;
                // Throttling to prevent 429 errors
                await new Promise(res => setTimeout(res, 1000));
            } else {
                hasNextPage = false;
            }
        }

        console.log(`\nDiscovered ${itemManifest.size} items in ${TARGET_DIR}.`);
        
        // Output the list for the extractor
        const results = Array.from(itemManifest.entries());
        results.forEach(([url, name]) => console.log(`${name}: ${url}`));

    } catch (error) {
        console.error("Listing Crawl Failed:", error.message);
    }
}

crawlListing();