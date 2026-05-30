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

// --- ADDED ENHANCEMENTS: Turndown Rules ---
// FORCE DOUBLE-TILDE STRIKETHROUGH
turndownService.addRule('strikethrough', {
    filter: ['del', 's', 'strike'],
    replacement: function (content) {
        return '~~' + content + '~~';
    }
});

// Rule: Capture Heading IDs (Sync with extract.js)
turndownService.addRule('headingIds', {
    filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    replacement: function (content, node) {
        const level = node.nodeName.charAt(1);
        const prefix = '#'.repeat(level);
        
        // Reverted the forced lowercasing so Cheerio passes the exact original casing.
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

const TARGET_DIR = process.argv[2] || '/spells'; 
const BASE_URL = 'https://www.dndbeyond.com';

const CATEGORY_MAP = {
    '/spells': 'SPELL',
    '/monsters': 'MONSTER',
    '/magic-items': 'MAGIC_ITEM',
    '/equipment': 'EQUIPMENT',
    '/species': 'SPECIES' 
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
            
            // FIX: Prevent silent lowercasing of IDs
            const $ = cheerio.load(response.data, { lowerCaseTags: false, lowerCaseAttributeNames: false });

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
            
            // FIX: Prevent silent lowercasing of IDs
            const $s = cheerio.load(itemRes.data, { lowerCaseTags: false, lowerCaseAttributeNames: false });
            
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
                // --- SOURCE & RULESET TAGGING ---
                let sourceText = "";
                const sourceEl = $content.find('.source, .spell-source, .monster-source, .equipment-source, .magic-item-source').first();
                if (sourceEl.length > 0) {
                    sourceText = sourceEl.text().replace(/\s+/g, ' ').trim();
                }

                let rulesetTag = "5e";
                if (sourceText.includes('2024')) rulesetTag = '2024';
                else if (sourceText.includes('2014')) rulesetTag = '2014';
                
                // --- THE BADGE SANITIZER & ANCHOR TARGET INJECTION ---
                let finalItemName = item.name.trim();
                let isLegacyFlag = "false";
                const legacyBadge = $content.find('.badge, #legacy-badge');

                if (legacyBadge.length > 0) {
                    isLegacyFlag = "true";
                    $content.find('.badge-tooltip, .badge-text, .badge-cta').remove();
                    
                    if (!finalItemName.toLowerCase().includes('(legacy)')) {
                        finalItemName = `${finalItemName} (Legacy)`;
                    }
                    legacyBadge.remove();
                }
                
                // Remove existing H1s and page titles so we don't duplicate them
                $content.find('h1, .page-title').remove();

                // --- DOUBLE-DOMAIN IMAGE FIX ---
                $content.find('img, a').each((_, el) => {
                    const attr = $s(el).is('img') ? 'src' : 'href';
                    let val = $s(el).attr(attr);
                    if (val && val.startsWith('//')) {
                        $s(el).attr(attr, 'https:' + val);
                    }
                });

                const cleanHtml = processContent($s, $content, item.url, category);
                
                if (cleanHtml) {
                    let markdown = turndownService.turndown(cleanHtml);
                    
                    // Un-escape Turndown's aggressive backslashes
                    markdown = markdown.replace(/\\\*/g, '*'); 
                    markdown = markdown.replace(/\\\[/g, '[');
                    markdown = markdown.replace(/\\\]/g, ']');
                    
                    // --- FILE & SLUG PREPARATION ---
                    const idMatchForFile = item.url.match(/\/(\d+)-/);
                    const entityIdPrefix = idMatchForFile ? `${idMatchForFile[1]}-` : '';
                    const safeName = item.name.replace(/[<>:"/\\|?*]+/g, '').trim();
                    const finalFileName = `${entityIdPrefix}${safeName}.md`;
                    
                    // NEW FIX: Extract exact slug directly from URL to guarantee perfect hyphenation
                    const itemSlug = item.url.split('/').pop().split('?')[0].toLowerCase();

                    // Strip leading whitespace before adding our header
                    markdown = markdown.replace(/^[\s\u00A0\uFEFF\xA0]+/, ''); 

                    // --- URN TITLE INJECTION ---
                    const cleanCategory = folderName.toLowerCase();
                    const singularCategory = (cleanCategory.endsWith('s') && cleanCategory !== 'species') 
                        ? cleanCategory.slice(0, -1) 
                        : cleanCategory;
                        
                    const urnHeader = `# ${finalItemName} {#ref:${singularCategory}:${itemSlug}}\n\n`;
                    markdown = urnHeader + markdown;

                    // --- NAMESPACE HEADING IDS ---
                    markdown = markdown.replace(/\{#([^}]+)\}/g, (match, p1) => {
                        // Don't double-namespace the URN we just injected
                        if (p1.startsWith('ref:')) return match;
                        return `{#${cleanCategory}:${itemSlug}:${p1}}`;
                    });

                    // Add a double newline after the ENTRY tag for readability
                    const wrappedMarkdown = `<ENTRY type="${category}" name="${finalItemName}" source_url="${item.url}" source_book="${sourceText}" ruleset="${rulesetTag}" is_legacy="${isLegacyFlag}">\n\n${markdown}\n</ENTRY>`;
                    
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