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

// 1. Load Authentication
const configPath = path.resolve(__dirname, '../config.cjs');
const config = require(configPath);

// 2. Initialize Turndown
const turndownService = new TurndownService({ 
    headingStyle: 'atx', 
    codeBlockStyle: 'fenced' 
});
turndownService.use(gfm);

// --- THE STRIKETHROUGH OVERRIDE ---
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

async function runBulkPipeline() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error("Usage: node bulk_extract.js <CATEGORY>");
        console.error("Example: node bulk_extract.js feats");
        process.exit(1);
    }

    // --- NEW: SANITIZE USER INPUT ---
    let rawInput = args[0].trim();
    // Automatically adds a leading slash if you didn't type one
    const targetPath = rawInput.startsWith('/') ? rawInput : '/' + rawInput;
    // Strips the slash for naming your folders and categories securely
    const categoryName = targetPath.replace(/[^a-zA-Z0-9_-]/g, '');
    // --------------------------------

    const outputDir = path.join(__dirname, '..', 'sources', 'repositories', categoryName);

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`\n--- Starting Bulk Extract for ${categoryName.toUpperCase()} ---`);
    console.log(`📁 Output Directory: ${outputDir}`);
    
    let currentPage = 1;
    let hasNext = true;

    // --- ROBUST AUTH & HEADERS ---
    // Safely resolve the token whether it's in config or directly in process.env
    const sessionToken = config.cobaltSession || config.DNDBEYOND_COBALT_SESSION || process.env.COBALTSESSION || '';
    const reqHeaders = { 
        'Cookie': sessionToken ? `CobaltSession=${sessionToken}` : '',
        // Full User-Agent required to bypass Cloudflare anti-bot checks
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
    };

    while (hasNext) {
        console.log(`\nScouting Page ${currentPage}...`);
        const pageUrl = `https://www.dndbeyond.com${targetPath}?page=${currentPage}`;
        
        try {
            const res = await axios.get(pageUrl, { headers: reqHeaders });
            // FIX: Prevent silent lowercasing of HTML attributes
            const $ = cheerio.load(res.data, { lowerCaseTags: false, lowerCaseAttributeNames: false });
            const items = [];

            // --- THE ANCHOR SCAVENGER ---
            // Hunts for links by URL pattern instead of CSS classes (Resilient to UI updates)
            const categoryBase = `${targetPath}/`; // e.g., '/feats/'
            
            $('a').each((_, el) => {
                let url = $(el).attr('href');
                if (!url) return;

                // FIX 1: DDB's new grids use absolute URLs. Normalize to a relative path first.
                const relativeUrl = url.replace('https://www.dndbeyond.com', '');
                
                // If it's a link to an item in our target category (e.g. /species/1830524-geleton)
                if (relativeUrl.startsWith(categoryBase) && relativeUrl.length > categoryBase.length) {
                    
                    // Ignore pagination links, comments, and marketplace redirects
                    if (relativeUrl.includes('?') || relativeUrl.includes('#') || relativeUrl.includes('/marketplace/')) return;
                    
                    // FIX 2: Target the specific title class to prevent grabbing subtitle metadata
                    let name = $(el).find('.listing-card__title').text().trim() || $(el).text().replace(/\s+/g, ' ').trim();
                    
                    // Ignore empty links or icon-only links
                    if (!name || name.length < 2) return; 
                    
                    // Ensure the final URL we push to the queue is absolute
                    if (!url.startsWith('http')) url = 'https://www.dndbeyond.com' + url;
                    
                    // Deduplicate (DDB often renders desktop/mobile lists twice in the DOM)
                    if (!items.find(i => i.url === url)) {
                        items.push({ name, url });
                    }
                }
            });

            if (items.length === 0) {
                console.log(`  ! No items found on this page. (If unexpected, DDB HTML may have changed or Cloudflare blocked the request)`);
            }

            for (const item of items) {
                console.log(`[Page ${currentPage}] Extracting: ${item.name}`);
                
                // Fast-fail if the URL is blatantly a marketplace link
                if (item.url.includes('/marketplace/')) {
                    console.log(`  > Skipped (Unowned): ${item.name}`);
                    continue;
                }

                try {
                    const itemRes = await axios.get(item.url, { headers: reqHeaders });

                    // Check if DDB secretly redirected us to the marketplace due to lack of ownership
                    if (itemRes.request.res.responseUrl.includes('/marketplace/')) {
                        console.log(`  > Skipped (Unowned Redirect): ${item.name}`);
                        continue;
                    }

                    // FIX: Prevent silent lowercasing of HTML attributes on the target page
                    const $s = cheerio.load(itemRes.data, { lowerCaseTags: false, lowerCaseAttributeNames: false });
                    let $content = null;
                    const selectors = ['.page-content', '.p-article-content', '.primary-content', 'main', 'article', '.container', '.details-container'];
                    
                    for (const sel of selectors) {
                        const found = $s(sel);
                        if (found.length > 0) {
                            $content = found.first();
                            break;
                        }
                    }

                    if ($content && $content.length > 0) {
                        // --- EXTRACT METADATA ---
                        let sourceText = "";
                        const sourceEl = $s('.source, .spell-source, .monster-source, .equipment-source, .magic-item-source').first();
                        if (sourceEl.length > 0) {
                            sourceText = sourceEl.text().replace(/\s+/g, ' ').trim();
                        }

                        let rulesetTag = "5e";
                        if (sourceText.includes('2024')) rulesetTag = '2024';
                        else if (sourceText.includes('2014')) rulesetTag = '2014';
                        
                        // --- THE BADGE SANITIZER ---
                        const legacyBadge = $s('.badge, #legacy-badge');
                        let finalItemName = item.name.trim();
                        let isLegacyFlag = "false";

                        if (legacyBadge.length > 0) {
                            isLegacyFlag = "true";
                            $s('.badge-tooltip, .badge-text, .badge-cta').remove();
                            
                            if (!finalItemName.toLowerCase().includes('(legacy)')) {
                                finalItemName = `${finalItemName} (Legacy)`;
                            }
                            legacyBadge.remove();
                        }

                        // Remove existing H1s and page titles so we don't duplicate them when we manually inject the URN header
                        $content.find('h1, .page-title').remove();
                        
                        const category = categoryName.toUpperCase();
                        
                        // --- DOUBLE-DOMAIN IMAGE FIX ---
                        // Pre-process protocol-relative URLs (//www.dndbeyond.com...)
                        $content.find('img, a').each((_, el) => {
                            const attr = $s(el).is('img') ? 'src' : 'href';
                            let val = $s(el).attr(attr);
                            if (val && val.startsWith('//')) {
                                $s(el).attr(attr, 'https:' + val);
                            }
                        });

                        // Pass through handler pipeline to scrub layout artifacts
                        const cleanHtml = processContent($s, $content, item.url, category);
                        
                        // Generate pure Markdown
                        let markdown = turndownService.turndown(cleanHtml);
                        
                        // --- THE ESCAPE CHARACTER FIX ---
                        markdown = markdown.replace(/\\\*/g, '*'); 
                        markdown = markdown.replace(/\\\[/g, '[');
                        markdown = markdown.replace(/\\\]/g, ']');

                        // --- FILE & SLUG PREPARATION ---
                        const idMatchForFile = item.url.match(/\/(\d+)-/);
                        const entityIdPrefix = idMatchForFile ? `${idMatchForFile[1]}-` : '';
                        const safeName = item.name.replace(/[<>:"/\\|?*]+/g, '').trim();
                        const finalFileName = `${entityIdPrefix}${safeName}.md`;
                        const itemSlug = finalFileName.replace('.md', '').toLowerCase();

                        // --- URN TITLE INJECTION ---
                        // Automatically generate singular form for proper ref tags (e.g., 'feats' -> 'feat')
                        const singularCategory = (categoryName.toLowerCase().endsWith('s') && categoryName.toLowerCase() !== 'species') 
                            ? categoryName.toLowerCase().slice(0, -1) 
                            : categoryName.toLowerCase();
                            
                        const urnHeader = `# ${finalItemName} {#ref:${singularCategory}:${itemSlug}}\n\n`;
                        
                        // Enforce the Title at the very top of the markdown payload
                        markdown = urnHeader + markdown;

                        // --- NAMESPACE HEADING IDS ---
                        // Converts inner {#actions} -> {#category:itemslug:actions} (Preserving Casing)
                        markdown = markdown.replace(/\{#([^}]+)\}/g, (match, p1) => {
                            // Don't double-namespace the URN we just explicitly injected
                            if (p1.startsWith('ref:')) return match;
                            return `{#${categoryName.toLowerCase()}:${itemSlug}:${p1}}`;
                        });

                        markdown = markdown.replace(/^[\s\u00A0\uFEFF\xA0]+/, ''); 

                        // ENVELOPING FOR STITCHER:
                        const wrappedMarkdown = `<ENTRY type="${category}" name="${finalItemName}" source_url="${item.url}" source_book="${sourceText}" ruleset="${rulesetTag}" is_legacy="${isLegacyFlag}">\n${markdown}\n</ENTRY>`;
                        
                        fs.writeFileSync(path.join(outputDir, finalFileName), wrappedMarkdown);
                    }
                } catch (e) { 
                    console.error(`  > Error on ${item.name}: ${e.message}`); 
                }
                
                await new Promise(r => setTimeout(r, 1000)); // Throttling
            }

            // Check for D&D Beyond's "Next" button pagination
            hasNext = $('.b-pagination-item-next a').length > 0;
            currentPage++;

        } catch(e) {
            console.error(`Failed to load page ${currentPage}: ${e.message}`);
            break; // Stop loop if the main listing page crashes
        }
    }

    console.log(`\nSuccess! Extraction complete for ${targetPath}.`);
}

runBulkPipeline();