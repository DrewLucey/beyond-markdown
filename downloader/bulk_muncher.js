import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm'; 
import { processContent } from './js/handlers.js';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.resolve(__dirname, '../config.cjs');
const config = require(configPath);

const turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
turndownService.use(gfm);

const TARGET_DIR = process.argv[2] || '/spells'; 
const BASE_URL = 'https://www.dndbeyond.com';

const CATEGORY_MAP = {
    '/spells': 'SPELL',
    '/monsters': 'MONSTER',
    '/magic-items': 'MAGIC_ITEM',
    '/equipment': 'EQUIPMENT'
};

async function runBulkMuncher() {
    const category = CATEGORY_MAP[TARGET_DIR] || 'GENERAL';
    const folderName = TARGET_DIR.replace(/\//g, '');
    const outputDir = path.resolve(__dirname, '../sources/repositories', folderName);
    
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    console.log(`--- Starting Bulk Muncher for ${TARGET_DIR.toUpperCase()} ---`);
    console.log(`Phase 1: Scouting pagination...`);

    let currentPage = 1;
    let hasNext = true;
    const itemQueue = [];

    // Phase 1: Scout all pages
    while (hasNext) {
        process.stdout.write(`\rScouting Page ${currentPage}...`);
        try {
            const listUrl = `${BASE_URL}${TARGET_DIR}?page=${currentPage}`;
            const response = await axios.get(listUrl, { headers: { 'Cookie': `CobaltSession=${config.cobaltSession}` } });
            const $ = cheerio.load(response.data);

            const links = $('.list-row, .info, .monster-name').find('a.link');
            if (links.length === 0) {
                hasNext = false;
                break;
            }

            links.each((_, el) => {
                const href = $(el).attr('href');
                const name = $(el).text().trim();
                if (href && href.startsWith(TARGET_DIR + '/')) {
                    itemQueue.push({ name, url: BASE_URL + href });
                }
            });

            hasNext = $('.b-pagination-item-next a').length > 0;
            if (hasNext) currentPage++;
            
            await new Promise(r => setTimeout(r, 250)); 
        } catch (e) {
            console.error(`\nError scouting page ${currentPage}: ${e.message}`);
            hasNext = false;
        }
    }

    console.log(`\n\nPhase 1 Complete. Found ${itemQueue.length} items to extract.`);
    console.log(`Phase 2: Extracting Data (This will take approximately ${Math.ceil(itemQueue.length / 60)} minutes)...\n`);

    // Phase 2: Extraction
    let successCount = 0;
    for (let i = 0; i < itemQueue.length; i++) {
        const item = itemQueue[i];
        
        // Exclude test benches and duplicate copies
        if (item.name.toLowerCase().includes('test') || item.name.toLowerCase().includes('copy_of')) continue;

        try {
            const res = await axios.get(item.url, { headers: { 'Cookie': `CobaltSession=${config.cobaltSession}` } });
            
            if (res.request.res.responseUrl.includes('marketplace.dndbeyond.com')) {
                console.log(`\n[${i+1}/${itemQueue.length}] Skipped (Unowned): ${item.name}`);
                continue;
            }

            const $s = cheerio.load(res.data);
            
            // --- THE WRAPPER FIX ---
            // Prioritize outer details wrappers before falling back to the raw statblock
            const contentSelectors = [
                '.monster-details',
                '.magic-item-details',
                '.equipment-details',
                '.spell-details',
                '.details',
                '.mon-stat-block',
                '.p-article-content'
            ];
            
            let $content = null;
            for (const selector of contentSelectors) {
                const found = $s(selector);
                if (found.length > 0) {
                    $content = found.first();
                    break;
                }
            }

            if ($content && $content.length > 0) {
                const cleanHtml = processContent($s, $content, item.url, category);
                
                if (cleanHtml) {
                    let markdown = turndownService.turndown(cleanHtml);
                    
                    // Un-escape Turndown's aggressive backslashes on normal asterisks
                    markdown = markdown.replace(/\\\*/g, '*'); 
                    
                    markdown = markdown.replace(/^[\s\u00A0\uFEFF\xA0]+/, ''); 

                    const wrappedMarkdown = `<ENTRY type="${category}" name="${item.name}" source_url="${item.url}">\n${markdown}\n</ENTRY>`;
                    
                    const safeName = item.name.replace(/[<>:"/\\|?*]+/g, '');
                    fs.writeFileSync(path.join(outputDir, `${safeName}.md`), wrappedMarkdown);
                    successCount++;
                    process.stdout.write(`\r[${i+1}/${itemQueue.length}] Extracted: ${item.name.substring(0, 40).padEnd(40)}`);
                }
            }
        } catch (e) { 
            console.error(`\nError on ${item.name}: ${e.message}`); 
        }
        
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n\nSuccess! ${successCount} items safely extracted to ${outputDir}`);
}

runBulkMuncher();