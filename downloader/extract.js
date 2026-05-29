/**
 * extract.js
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

// 1. Load Authentication (with resilient fallback)
const configPath = path.resolve(__dirname, '../config.cjs');
let config = {};
try {
    config = require(configPath);
} catch (e) {
    console.warn(`⚠️ Could not load config.cjs (${e.message}). Falling back to environment variables.`);
}

const sessionToken = config.cobaltSession || config.DNDBEYOND_COBALT_SESSION || process.env.COBALTSESSION || '';

// 2. Initialize Turndown
const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced'
});
turndownService.use(gfm);

// FORCE DOUBLE-TILDE STRIKETHROUGH
turndownService.addRule('strikethrough', {
    filter: ['del', 's', 'strike'],
    replacement: function (content) {
        return '~~' + content + '~~';
    }
});

// Rule: Capture Heading IDs
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

const DEFAULT_URL = 'https://www.dndbeyond.com/sources/dnd/phb-2014';
const TARGET_URL = process.argv[2] || DEFAULT_URL;

async function runPipeline() {
    try {
        console.log(`--- Starting Adventure Extraction Pipeline ---`);
        console.log(`Targeting: ${TARGET_URL}`);
        
        // 1. Grab the root page first to define our scope
        const response = await axios.get(TARGET_URL, {
            headers: { 'Cookie': sessionToken ? `CobaltSession=${sessionToken}` : '' }
        });

        const $ = cheerio.load(response.data);
        const urlParts = TARGET_URL.replace(/\/$/, "").split('/');
        const bookSlug = urlParts.pop();
        
        // 2. Determine 5e vs 5.5e Directory Hierarchy
        let rulesetFolder = "5e";
        const mapFilePath = path.resolve(__dirname, '../sources/ruleset_map.json');
        if (fs.existsSync(mapFilePath)) {
            try {
                const rulesMap = JSON.parse(fs.readFileSync(mapFilePath, 'utf-8'));
                if (rulesMap[bookSlug] && rulesMap[bookSlug].ruleset) {
                    rulesetFolder = rulesMap[bookSlug].ruleset.includes('5.5') ? '5.5e' : '5e';
                }
            } catch (e) {
                console.warn("Could not parse ruleset_map.json. Defaulting to '5e' folder.");
            }
        }
        
        const outputDir = path.resolve(__dirname, `../sources/${rulesetFolder}/atomic/${bookSlug}`);
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        const manifest = new Map();
        manifest.set(TARGET_URL, "Front Matter & Table of Contents");

        // 3. Intelligent TOC Harvester (CSS-Free)
        $('a').each((i, el) => {
            let href = $(el).attr('href');
            if (!href) return;
            
            try {
                const abs = new URL(href, 'https://www.dndbeyond.com');
                const cleanUrl = abs.origin + abs.pathname;
                const cleanPath = abs.pathname.replace(/\/$/, "");

                // Validates URL by verifying it explicitly sits inside the book's root slug directory
                if (cleanPath.includes(`/${bookSlug}/`)) {
                    if (!manifest.has(cleanUrl)) manifest.set(cleanUrl, $(el).text().trim());
                }
            } catch (e) {
                // Ignore malformed hrefs
            }
        });

        const uniqueSections = Array.from(manifest.entries());
        console.log(`Discovered ${uniqueSections.length} sections.`);

        for (let i = 0; i < uniqueSections.length; i++) {
            const [sectionUrl, sectionName] = uniqueSections[i];
            
            const isRoot = sectionUrl.replace(/\/$/, "") === TARGET_URL.replace(/\/$/, "");
            const fileSlug = isRoot ? 'index' : sectionUrl.split('/').filter(Boolean).pop();
            const filePath = path.join(outputDir, `${fileSlug}.md`);

            console.log(`[${i+1}/${uniqueSections.length}] Processing: ${sectionName}...`);

            try {
                const chapterRes = await axios.get(sectionUrl, {
                    headers: { 'Cookie': sessionToken ? `CobaltSession=${sessionToken}` : '' },
                    maxRedirects: 5
                });

                const finalUrl = chapterRes.request.res.responseUrl || sectionUrl;
                if (finalUrl.includes('marketplace.dndbeyond.com')) {
                    console.warn(`   > Skipping: Access Denied (Marketplace Redirect)`);
                    continue; 
                }

                const $s = cheerio.load(chapterRes.data);
                
                // Prioritize outer wrapper content
                const contentSelectors = [
                    '.monster-details',
                    '.magic-item-details',
                    '.equipment-details',
                    '.spell-details',
                    '.details',
                    '.mon-stat-block',
                    '.p-article-content',
                    '#content'
                ];
                
                let $content = null;
                for (const selector of contentSelectors) {
                    const found = $s(selector);
                    if (found.length > 0) {
                        $content = found.first();
                        break;
                    }
                }

                if (!$content || $content.length === 0) continue;

                const pathParts = new URL(sectionUrl).pathname.split('/');
                const category = pathParts.includes('spells') ? 'SPELL' : 
                                 pathParts.includes('monsters') ? 'MONSTER' : 
                                 'GENERAL';

                const sanitizedHtml = processContent($s, $content, sectionUrl, category);

                if (sanitizedHtml) {
                    let markdown = turndownService.turndown(sanitizedHtml);
                    
                    // Un-escapes Turndown's aggressive backslashes on normal asterisks and brackets
                    markdown = markdown.replace(/\\\*/g, '*'); 
                    markdown = markdown.replace(/\\\[/g, '[');
                    markdown = markdown.replace(/\\\]/g, ']');
                    
                    // --- NAMESPACE HEADING IDS ---
                    // Converts {#whatdwellshere} -> {#wdotmm:dungeon-level:whatdwellshere}
                    markdown = markdown.replace(/\{#([^}]+)\}/g, `{#${bookSlug}:${fileSlug}:$1}`);

                    markdown = markdown.replace(/^[\s\u00A0\uFEFF\xA0]+/, ''); 
                    fs.writeFileSync(filePath, markdown);
                }
            } catch (err) {
                console.error(`   ! Failed: ${err.message}`);
            }
            await new Promise(res => setTimeout(res, 1000));
        }
        console.log(`\nSuccess! Narrative files saved to: ${outputDir}`);
    } catch (error) {
        console.error("Pipeline Failed:", error.message);
    }
}

runPipeline();