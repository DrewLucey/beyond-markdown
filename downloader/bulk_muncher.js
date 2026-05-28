/**
 * bulk_muncher.js
 * Handles paginated listings and wraps items for the central Repository Stitcher.
 */
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
    '/equipment': 'EQUIPMENT',
    '/species': 'SPECIES' // Add this
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

            // FIX: Support both legacy tables and the new React listing grids
            const links = $('.list-row, .info, .monster-name').find('a.link').length > 0 
                ? $('.list-row, .info, .monster-name').find('a.link') 
                : $('.listing-card__link');

            if (links.length === 0) { hasNext = false; break; }

            links.each((_, el) => {
                const href = $(el).attr('href');
                if (!href) return;

                const relativeUrl = href.replace('https://www.dndbeyond.com', '');
                const name = $(el).find('.listing-card__title').text().trim() || $(el).text().trim();
                
                if (relativeUrl.startsWith(TARGET_DIR + '/')) {
                    const fullUrl = href.startsWith('http') ? href : BASE_URL + href;
                    itemQueue.push({ name, url: fullUrl });
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

    console.log(`\nFound ${itemQueue.length} items. Starting extraction...\n`);
    let successCount = 0;

    // Phase 2: Download each item
    for (let i = 0; i < itemQueue.length; i++) {
        const item = itemQueue[i];
        
        try {
            const itemRes = await axios.get(item.url, { headers: { 'Cookie': `CobaltSession=${config.cobaltSession}` } });
            const $s = cheerio.load(itemRes.data);
            
            let $content = null;
            const contentSelectors = ['.page-content', '.p-article-content', '.primary-content', 'main', 'article'];
            
            for (const sel of contentSelectors) {
                const found = $s(sel);
                if (found.length > 0) {
                    $content = found.first();
                    break;
                }
            }

            if ($content && $content.length > 0) {
                // --- EXTRACT ID FOR TARGET ANCHOR ---
                const idMatch = item.url.match(/\/(\d+)-/);
                const entityId = idMatch ? idMatch[1] : '';

                // --- SOURCE & RULESET TAGGING ---
                let sourceText = "";
                const sourceEl = $content.find('.source, .spell-source, .monster-source, .equipment-source, .magic-item-source').first();
                if (sourceEl.length > 0) {
                    sourceText = sourceEl.text().replace(/\s+/g, ' ').trim();
                }

                let rulesetTag = "5e";
                if (sourceText.includes('2024')) rulesetTag = '2024';
                else if (sourceText.includes('2014')) rulesetTag = '2014';
                
                let isLegacyFlag = "false";

                // --- THE BADGE SANITIZER & ANCHOR TARGET INJECTION ---
                const legacyBadge = $content.find('.badge, #legacy-badge');
                const mainHeader = $content.find('h1').first();

                if (mainHeader.length > 0) {
                    // 1. Force the H1 to use our unique, scoped ID (e.g., id="Aasimar-1751434")
                    const safeNameForAnchor = item.name.replace(/\s+\(Legacy\)/i, '').replace(/[^a-zA-Z0-9]/g, '');
                    if (entityId && safeNameForAnchor) {
                        mainHeader.attr('id', `${safeNameForAnchor}-${entityId}`);
                    }
                }

                if (legacyBadge.length > 0) {
                    isLegacyFlag = "true";
                    if (rulesetTag === "5e") rulesetTag = "2014"; // Legacy badge implies older ruleset

                    // 2. Destroy the tooltips and links from the DOM entirely
                    $content.find('.badge-tooltip, .badge-text, .badge-cta').remove();
                    
                    // 3. Extract just the raw text of the header
                    let baseTitle = mainHeader.contents().filter(function() { return this.nodeType === 3; }).text().replace(/\s+/g, ' ').trim();
                    
                    // 4. Rewrite the header cleanly
                    if (baseTitle) mainHeader.text(`${baseTitle} (Legacy)`);
                    
                    // 5. Remove the badge container so Turndown doesn't read the word "Legacy" twice
                    legacyBadge.remove();
                }
                // ------------------------------
                
                const cleanHtml = processContent($s, $content, item.url, category);
                
                if (cleanHtml) {
                    let markdown = turndownService.turndown(cleanHtml);
                    
                    // Un-escape Turndown's aggressive backslashes on normal asterisks
                    markdown = markdown.replace(/\\\*/g, '*'); 
                    
                    markdown = markdown.replace(/^[\s\u00A0\uFEFF\xA0]+/, ''); 

                    // Include the new source ruleset metadata in the XML
                    const wrappedMarkdown = `<ENTRY type="${category}" name="${item.name}" source_url="${item.url}" source_book="${sourceText}" ruleset="${rulesetTag}" is_legacy="${isLegacyFlag}">\n${markdown}\n</ENTRY>`;
                    
                    // --- THE ID PRESERVATION FIX ---
                    const idMatchForFile = item.url.match(/\/(\d+)-/);
                    const entityIdPrefix = idMatchForFile ? `${idMatchForFile[1]}-` : '';
                    const safeName = item.name.replace(/[<>:"/\\|?*]+/g, '').trim();
                    const finalFileName = `${entityIdPrefix}${safeName}.md`;
                    
                    fs.writeFileSync(path.join(outputDir, finalFileName), wrappedMarkdown);
                    successCount++;
                    process.stdout.write(`\r[${i+1}/${itemQueue.length}] Extracted: ${item.name.substring(0, 40).padEnd(40)}`);
                }
            }
        } catch (e) { 
            console.error(`\nError on ${item.name}: ${e.message}`); 
        }
        
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n\nSuccess! ${successCount} items safely processed.`);
}

runBulkMuncher();