/**
 * bulk_extract.js
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

// Rule: Capture Heading IDs (Sync with extract.js)
turndownService.addRule('headingIds', {
    filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    replacement: function (content, node) {
        const level = node.nodeName.charAt(1);
        const prefix = '#'.repeat(level);
        const id = node.getAttribute('id');
        const cleanContent = content.replace(/\[\]\(.*?\)/g, '').trim();
        return id 
            ? `\n\n${prefix} ${cleanContent} {#${id}}\n\n` 
            : `\n\n${prefix} ${cleanContent}\n\n`;
    }
});

// Rule: Clean Blockquote Formatting for Read-Aloud Text
turndownService.addRule('blockquotes', {
    filter: 'blockquote',
    replacement: function (content) {
        content = content.replace(/^\n+|\n+$/g, '');
        content = content.replace(/^/gm, '> ');
        return `\n\n${content}\n\n`;
    }
});

const CATEGORY_MAP = {
    'spells': 'SPELL',
    'monsters': 'MONSTER',
    'magic-items': 'MAGIC_ITEM',
    'equipment': 'EQUIPMENT',
    'feats': 'FEAT',
    'species': 'SPECIES',
    'backgrounds': 'BACKGROUND'
};

const TARGET_PATH = process.argv[2] || '/spells'; 

async function runBulkExtraction(targetPath) {
    const categoryPathPart = targetPath.split('/').filter(Boolean)[0];
    const category = CATEGORY_MAP[categoryPathPart] || 'GENERAL';
    const outputDir = path.resolve(__dirname, '../sources/repositories', category.toLowerCase());
    
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    console.log(`--- Starting Bulk Extract for ${targetPath.toUpperCase()} ---`);

    // 1. Pagination Loop
    let currentPage = 1;
    let hasNext = true;

    while (hasNext) {
        console.log(`\nScouting Page ${currentPage}...`);
        const listUrl = `https://www.dndbeyond.com${targetPath}?page=${currentPage}`;
        let response;
        try {
            response = await axios.get(listUrl, { headers: { 'Cookie': `CobaltSession=${config.cobaltSession}` } });
        } catch (e) {
            console.error(`Failed to load page ${currentPage}: ${e.message}`);
            break;
        }
        
        const $ = cheerio.load(response.data);

        const items = [];
        $('.list-row, .info, .monster-name').find('a.link').each((_, el) => {
            const href = $(el).attr('href');
            if (href && href.startsWith(targetPath + '/')) {
                items.push({ name: $(el).text().trim(), url: `https://www.dndbeyond.com${href}` });
            }
        });

        if (items.length === 0) {
            console.log("No items found on this page. Ending pagination.");
            break;
        }

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            // Junk filter
            if (item.name.toLowerCase().includes('test') || item.name.toLowerCase().includes('copy_of')) continue;

            process.stdout.write(`\r[Page ${currentPage}] Extracting: ${item.name.substring(0, 40).padEnd(40)}`);

            try {
                const res = await axios.get(item.url, { headers: { 'Cookie': `CobaltSession=${config.cobaltSession}` } });
                
                // Marketplace Redirection Check
                if (res.request.res.responseUrl.includes('marketplace.dndbeyond.com')) {
                    console.log(`\n  > Skipped (Unowned): ${item.name}`);
                    continue;
                }

                const $s = cheerio.load(res.data);
                
                // --- THE WRAPPER FIX ---
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
                    // Pass category to handlers.js so it knows to run monster/spell specific surgery
                    const cleanHtml = processContent($s, $content, item.url, category);

                    if (cleanHtml) {
                        let markdown = turndownService.turndown(cleanHtml);
                        
                        // --- THE ASTERISK FIX ---
                        markdown = markdown.replace(/\\\*/g, '*'); 
                        
                        markdown = markdown.replace(/^[\s\u00A0\uFEFF\xA0]+/, ''); 

                        // ENVELOPING FOR STITCHER:
                        // Adds XML-style metadata tags so the Stitcher knows how to sort this
                        const wrappedMarkdown = `<ENTRY type="${category}" name="${item.name}" source_url="${item.url}">\n${markdown}\n</ENTRY>`;
                        
                        const safeName = item.name.replace(/[<>:"/\\|?*]+/g, '');
                        fs.writeFileSync(path.join(outputDir, `${safeName}.md`), wrappedMarkdown);
                    }
                }
            } catch (e) { 
                console.error(`\nError on ${item.name}: ${e.message}`); 
            }
            
            await new Promise(r => setTimeout(r, 1000)); // Throttling
        }

        // Check for "Next" button
        hasNext = $('.b-pagination-item-next a').length > 0;
        currentPage++;
    }

    console.log(`\n\nSuccess! Extraction complete for ${targetPath}.`);
}

runBulkExtraction(TARGET_PATH);