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

// Rule: Strip Empty Tooltips
turndownService.addRule('emptyTooltips', {
    filter: 'a',
    replacement: function(content, node) {
        const href = node.getAttribute('href');
        if (href && (href.startsWith('#') || href.includes('tooltip'))) {
            return content.trim(); 
        }
        return `[${content}](${href})`;
    }
});

// 3. API Execution Wrapper
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
            const $ = cheerio.load(res.data);
            const items = [];

            // --- THE ANCHOR SCAVENGER ---
            // Hunts for links by URL pattern instead of CSS classes (Resilient to UI updates)
            const categoryBase = `${targetPath}/`; // e.g., '/feats/'
            
            $('a').each((_, el) => {
                let name = $(el).text().replace(/\s+/g, ' ').trim();
                let url = $(el).attr('href');
                
                // If it's a link to an item in our target category (e.g. /feats/123-alert)
                if (url && url.startsWith(categoryBase) && url.length > categoryBase.length) {
                    
                    // Ignore pagination links, comments, and marketplace redirects
                    if (url.includes('?') || url.includes('#') || url.includes('/marketplace/')) return;
                    
                    // Ignore empty links or icon-only links
                    if (!name || name.length < 2) return; 
                    
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

                    const $s = cheerio.load(itemRes.data);
                    let $content = null;
                    const selectors = ['.page-content', '.p-article-content', '.primary-content', 'main', 'article', '.container', '.details-container'];
                    
                    for (const sel of selectors) {
                        const found = $s(sel);
                        if (found.length > 0) { 
                            $content = found.first(); 
                            break; 
                        }
                    }

                    if (!$content) {
                        console.log(`  > Skipped (No valid content container found)`);
                        continue;
                    }

                    const category = categoryName.toUpperCase();
                    const cleanHtml = processContent($s, $content, item.url, category);

                    if (cleanHtml) {
                        let markdown = turndownService.turndown(cleanHtml);
                        
                        // --- THE ASTERISK FIX ---
                        markdown = markdown.replace(/\\\*/g, '*'); 
                        markdown = markdown.replace(/^[\s\u00A0\uFEFF\xA0]+/, ''); 

                        // ENVELOPING FOR STITCHER:
                        // Adds XML-style metadata tags so the Stitcher knows how to sort this
                        const wrappedMarkdown = `<ENTRY type="${category}" name="${item.name}" source_url="${item.url}">\n${markdown}\n</ENTRY>`;
                        
                        const safeName = item.name.replace(/[<>:"/\\|?*]+/g, '').trim();
                        fs.writeFileSync(path.join(outputDir, `${safeName}.md`), wrappedMarkdown);
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