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
        
        const response = await axios.get(TARGET_URL, {
            headers: { 'Cookie': `CobaltSession=${config.cobaltSession}` }
        });

        const $ = cheerio.load(response.data);
        const urlParts = TARGET_URL.replace(/\/$/, "").split('/');
        const bookSlug = urlParts.pop();
        
        const outputDir = path.resolve(__dirname, '../sources', bookSlug);
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        const manifest = new Map();
        manifest.set(TARGET_URL, "Front Matter & Table of Contents");

        const rootPath = new URL(TARGET_URL).pathname.replace(/\/$/, "");
        const tocSelectors = ['.compendium-toc-full', '.compendium-toc-full-text', '.list-of-contents', '.p-article-content'];
        
        tocSelectors.forEach(selector => {
            $(selector).find('a').each((i, el) => {
                let href = $(el).attr('href');
                if (!href) return;
                const abs = new URL(href, 'https://www.dndbeyond.com');
                const cleanUrl = abs.origin + abs.pathname;
                const cleanPath = abs.pathname.replace(/\/$/, "");

                if (cleanPath.startsWith('/sources/') || cleanPath.split('/').length > 2) {
                    if (!manifest.has(cleanUrl)) manifest.set(cleanUrl, $(el).text().trim());
                }
            });
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
                    headers: { 'Cookie': `CobaltSession=${config.cobaltSession}` },
                    maxRedirects: 5
                });

                const finalUrl = chapterRes.request.res.responseUrl || sectionUrl;
                if (finalUrl.includes('marketplace.dndbeyond.com')) {
                    console.warn(`   > Skipping: Access Denied (Marketplace Redirect)`);
                    continue; 
                }

                const $s = cheerio.load(chapterRes.data);
                
                // --- THE WRAPPER FIX (Synchronized with bulk_muncher.js) ---
                // We prioritize the outer details wrappers before falling back to the raw statblock or article text.
                // This ensures we capture Lore, Tags, Environments, and Sourcebooks embedded in adventures.
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
                    
                    // Optional Asterisk Escaping Fix (Un-escapes Turndown's aggressive backslashes on normal asterisks)
                    markdown = markdown.replace(/\\\*/g, '*'); 
                    
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