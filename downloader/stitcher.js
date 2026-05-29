/**
 * stitcher.js
 * Assembles atomic Markdown files into a macro-level sourcebook based on the index.
 * Final: Auto-Overwrite, Beautiful Naming, & Google Drive (.md.txt) Sync
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import * as cheerio from 'cheerio';
import { marked } from 'marked';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_BOOK = process.argv[2];
if (!TARGET_BOOK) {
    console.error("Usage: node stitcher.js <sourcebook_id>");
    console.error("Example: node stitcher.js phb-2024");
    process.exit(1);
}

// --- AI METADATA INJECTION & BEAUTIFUL NAMING ---
let bookTitle = TARGET_BOOK;
let bookMeta = { ruleset: "5e", type: "sourcebook", isLegacy: false, title: TARGET_BOOK };
const mapFilePath = path.resolve(__dirname, '../sources/ruleset_map.json');

if (fs.existsSync(mapFilePath)) {
    try {
        const rulesMap = JSON.parse(fs.readFileSync(mapFilePath, 'utf-8'));
        if (rulesMap[TARGET_BOOK.toLowerCase()]) {
            bookMeta = rulesMap[TARGET_BOOK.toLowerCase()];
            // Strip illegal characters from the title for safe file saving
            if (bookMeta.title) {
                bookTitle = bookMeta.title.replace(/[<>:"/\\|?*]+/g, '').trim(); 
            }
        }
    } catch (err) {
        console.warn("Could not read ruleset_map.json. Proceeding with default tags.");
    }
} else {
    console.warn("ruleset_map.json not found. Run `node downloader/library.js` for better naming.");
}

// --- NEW DIRECTORY HIERARCHY LOGIC ---
const rulesetFolder = bookMeta.ruleset.includes('5.5') ? '5.5e' : '5e';
const sourceDir = path.resolve(__dirname, `../sources/${rulesetFolder}/atomic/${TARGET_BOOK}`);

// Restored native .md extension!
const finalFileName = `${bookTitle} (${bookMeta.ruleset}).md`;
const outputFile = path.resolve(__dirname, `../sources/${rulesetFolder}/${finalFileName}`);
// ---------------------------------------------------------

function buildStitcherManifest(dirPath) {
    console.log(`Analyzing directory: ${dirPath}`);
    if (!fs.existsSync(dirPath)) {
        throw new Error(`Directory not found. Run extract.js on ${TARGET_BOOK} first.`);
    }

    const indexFilePath = path.join(dirPath, 'index.md');
    if (!fs.existsSync(indexFilePath)) {
        throw new Error(`Critical Error: index.md not found in ${dirPath}. The stitcher relies on the index to determine reading order.`);
    }

    const availableFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.md') && !f.endsWith('.md.txt'));
    
    console.log(`Found ${availableFiles.length} atomic files. Mapping reading order from index.md...`);

    const indexContent = fs.readFileSync(indexFilePath, 'utf-8');
    const htmlContent = marked.parse(indexContent);
    const $ = cheerio.load(htmlContent);

    const chapterSlugs = ['index.md'];

    $('a').each((_, el) => {
        let href = $(el).attr('href');
        if (!href) return;
        
        let cleanSlug = href.split('?')[0].split('#')[0].replace(/\/$/, ""); 
        const pathParts = cleanSlug.split('/');
        const targetSlug = pathParts[pathParts.length - 1]; 
        
        const matchedFileName = availableFiles.find(f => f.replace('.md', '').toLowerCase() === targetSlug.toLowerCase());

        if (matchedFileName && matchedFileName !== 'index.md') {
            if (!chapterSlugs.includes(matchedFileName)) {
                chapterSlugs.push(matchedFileName);
            }
        }
    });

    const manifest = [];
    
    for (const filename of chapterSlugs) {
        const filePath = path.join(dirPath, filename);
        if (fs.existsSync(filePath)) {
            const rawTitle = filename.replace('.md', '').replace(/-/g, ' ');
            const title = rawTitle.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            
            manifest.push({
                slug: filename,
                title: title
            });
        }
    }

    availableFiles.forEach(file => {
        if (!chapterSlugs.includes(file)) {
            console.log(`[Info] Automatically appending unlinked file: ${file}`);
            const rawTitle = file.replace('.md', '').replace(/-/g, ' ');
            const title = rawTitle.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            manifest.push({ slug: file, title: title });
        }
    });

    return manifest;
}

function transformMarkdownLinks(content, manifest) {
    const validChapterIds = new Set(manifest.map(m => m.slug.replace('.md', '')));
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
        lines[i] = lines[i].replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
            if (url.startsWith('#')) return match;

            let targetSlug = "";
            let hash = "";

            if (url.includes('/sources/')) {
                let cleanUrl = url.split('?')[0]; 
                const hashIndex = cleanUrl.indexOf('#');
                
                hash = hashIndex !== -1 ? cleanUrl.substring(hashIndex) : '';
                cleanUrl = hashIndex !== -1 ? cleanUrl.substring(0, hashIndex) : cleanUrl;
                
                const pathParts = cleanUrl.replace(/\/$/, "").split('/');
                targetSlug = pathParts[pathParts.length - 1];
            } else if (url.endsWith('.md') || url.includes('.md#')) {
                let cleanUrl = url.split('?')[0];
                const hashIndex = url.indexOf('#');
                
                hash = hashIndex !== -1 ? url.substring(hashIndex) : '';
                targetSlug = cleanUrl.split('#')[0].replace('.md', '');
            }

            if (targetSlug && validChapterIds.has(targetSlug)) {
                if (hash) {
                    return `[${text}](${hash})`;
                } else {
                    return `[${text}](#${targetSlug})`;
                }
            }

            return match;
        });
    }

    return lines.join('\n');
}

async function runStitcher() {
    try {
        const outputFolder = path.dirname(outputFile);
        if (!fs.existsSync(outputFolder)) fs.mkdirSync(outputFolder, { recursive: true });

        // Unattended Execution: Silently overwrite if exists
        if (fs.existsSync(outputFile)) {
            console.log(`\nℹ️ Overwriting existing master file: ${finalFileName}`);
        }

        const manifest = buildStitcherManifest(sourceDir);
        console.log(`Manifest built: ${manifest.length} chapters loaded.\n`);

        let masterContent = `<SOURCEBOOK id="${TARGET_BOOK.toUpperCase()}" ruleset="${bookMeta.ruleset}" type="${bookMeta.type}" legacy="${bookMeta.isLegacy}">\n\n`;

        for (let i = 0; i < manifest.length; i++) {
            const { slug, title } = manifest[i];
            const filePath = path.join(sourceDir, slug);
            
            console.log(`[${i+1}/${manifest.length}] Stitching: ${title}`);
            
            let chapterText = fs.readFileSync(filePath, 'utf-8');
            
            chapterText = transformMarkdownLinks(chapterText, manifest);
            
            masterContent += `<CHAPTER id="${slug.replace('.md', '')}" title="${title}">\n\n`;
            masterContent += chapterText;
            masterContent += `\n\n</CHAPTER>\n\n`;
            masterContent += `--- \n\n`; 
        }

        masterContent += `</SOURCEBOOK>\n`;

        fs.writeFileSync(outputFile, masterContent);
        console.log(`\nSuccess! Master Context saved to: ${outputFile}`);
        
        const stats = fs.statSync(outputFile);
        const fileSizeInMegabytes = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`File Size: ${fileSizeInMegabytes} MB`);

    } catch (error) {
        console.error(`\nStitcher Failed: ${error.message}`);
    }
}

runStitcher();