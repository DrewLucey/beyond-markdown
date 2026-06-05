/**
 * stitcher.js
 * Assembles atomic Markdown files into a macro-level sourcebook based on the index.
 * Final: AI Context Namespaces, DDB Tooltip References, & Self-Healing Anchor Casing
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
            if (bookMeta.title) {
                bookTitle = bookMeta.title.replace(/[<>:"/\\|?*]+/g, '').trim(); 
            }
        }
    } catch (err) {
        console.warn("Could not read ruleset_map.json. Proceeding with default tags.");
    }
} else {
    console.warn("ruleset_map.json not found. Run `node downloader/library.js` for better AI metadata and naming.");
}

// --- DIRECTORY HIERARCHY LOGIC ---
const rulesetFolder = bookMeta.ruleset.includes('5.5') ? '5.5e' : '5e';
const sourceDir = path.resolve(__dirname, `../sources/${rulesetFolder}/atomic/${TARGET_BOOK}`);

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

    const availableFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.md') && !f.startsWith('_master__'));
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
        let targetSlug = pathParts[pathParts.length - 1]; 
        
        if (targetSlug.toLowerCase() === TARGET_BOOK.toLowerCase()) {
            targetSlug = 'index';
        }

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
            manifest.push({ slug: filename, title: title });
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

// --- SELF-HEALING DICTIONARY ---
// Scans the actual text of Markdown headings to dynamically construct the true CamelCase hash
function buildHashDictionary(manifest, srcDir) {
    const dict = {};
    for (const { slug } of manifest) {
        const filePath = path.join(srcDir, slug);
        if (!fs.existsSync(filePath)) continue;
        
        const chapterText = fs.readFileSync(filePath, 'utf-8');
        
        // Matches headings like: ## Some Heading Text {#namespace:slug:hash} or {#hash}
        const headingRegex = /^(#+)\s+(.*?)\s+\{#(?:[^:]+:[^:]+:)?([^}]+)\}/gm;
        let match;
        
        while ((match = headingRegex.exec(chapterText)) !== null) {
            const rawHeadingText = match[2]; 
            const rawHash = match[3]; 
            
            // Clean markdown artifacts (e.g., **Title**, [Title](url))
            const cleanText = rawHeadingText.replace(/[*_~`\[\]()]/g, '').trim();
            
            // Generate exact DDB CamelCase hash by stripping non-alphanumeric chars
            const camelCaseHash = cleanText.replace(/[^a-zA-Z0-9]/g, '');
            
            if (camelCaseHash && rawHash) {
                dict[rawHash.toLowerCase()] = camelCaseHash;
            }
        }
    }
    return dict;
}

/**
 * Dynamically builds a hierarchical breadcrumb ID specifically for the Table of Contents (index.md).
 * Ensures NotebookLM preserves the links while providing deep structural context.
 */
function applyHierarchicalHeadingIds(content, bookSlug, chapterSlug) {
    let currentHierarchy = [];
    let lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Matches headings: Starts with 1-6 hashes, text, and an optional existing {#id}
        const headingMatch = line.match(/^(#{1,6})\s+(.*?)(?:\s+\{#([^}]+)\})?$/);
        
        if (headingMatch) {
            const level = headingMatch[1].length;
            const headingText = headingMatch[2].trim(); 
            
            let targetSlug = "";
            const linkMatch = headingText.match(/\[.*?\]\(([^"'\s)]+).*?\)/);
            
            if (linkMatch) {
                let url = linkMatch[1];
                if (url.startsWith('#')) {
                    targetSlug = url.substring(1);
                } else {
                    let cleanUrl = url.split('?')[0].split('#')[0].replace(/\/$/, ""); 
                    const pathParts = cleanUrl.split('/');
                    targetSlug = pathParts[pathParts.length - 1]; 
                    if (targetSlug.toLowerCase() === bookSlug.toLowerCase()) {
                        targetSlug = 'index';
                    }
                }
            } else {
                // Non-link headings like "Contents"
                let rawText = headingText.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); 
                rawText = rawText.replace(/[*_~`()]/g, ''); 
                targetSlug = rawText.replace(/\s+/g, '').replace(/[^a-zA-Z0-9-]/g, ''); 
            }

            if (!targetSlug) targetSlug = `auto${level}`;

            currentHierarchy[level] = targetSlug;
            currentHierarchy.length = level + 1; // Drop deeper obsolete levels

            if (level > 1) {
                const breadcrumb = currentHierarchy.slice(2).filter(Boolean).join(':');
                const finalHash = breadcrumb ? breadcrumb : targetSlug;
                lines[i] = `${headingMatch[1]} ${headingText} {#${bookSlug.toLowerCase()}:${chapterSlug.toLowerCase()}:${finalHash}}`;
            } else {
                lines[i] = `${headingMatch[1]} ${headingText} {#${bookSlug.toLowerCase()}:${chapterSlug.toLowerCase()}}`;
            }
        }
    }
    return lines.join('\n');
}

/**
 * Parses and transforms relative Markdown links pointing to other chapter files.
 * Uses the hashDictionary to guarantee URL casing perfectly matches the source material.
 */
function transformMarkdownLinks(content, manifest, currentSlug, bookSlug, bookPath, hashDictionary) {
    const validChapterIds = new Set(manifest.map(m => m.slug.replace('.md', '')));
    const baseUrl = `https://www.dndbeyond.com${bookPath || `/sources/dnd/${bookSlug}`}`;

    return content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, rawUrlGroup) => {
        let url = rawUrlGroup;
        
        const spaceIndex = rawUrlGroup.indexOf(' ');
        if (spaceIndex !== -1 && rawUrlGroup.endsWith('"')) { 
            url = rawUrlGroup.substring(0, spaceIndex);
        }

        // Handle same-page jump links
        if (url.startsWith('#')) {
            const cleanHash = url.substring(1);
            // Self-Heal: Swap the broken lowercase hash for the true CamelCase hash
            const trueHash = hashDictionary[cleanHash.toLowerCase()] || cleanHash;
            
            const finalHash = `#${bookSlug}:${currentSlug}:${trueHash}`;
            const originalUrl = `${baseUrl}/${currentSlug}#${trueHash}`;
            return `[${text}](${finalHash} "${originalUrl}")`;
        }

        let targetSlug = "";
        let hash = "";

        if (url.includes('/sources/') || url.includes('/compendium/')) {
            let cleanUrl = url.split('?')[0]; 
            const hashIndex = cleanUrl.indexOf('#');
            
            hash = hashIndex !== -1 ? cleanUrl.substring(hashIndex) : '';
            cleanUrl = hashIndex !== -1 ? cleanUrl.substring(0, hashIndex) : cleanUrl;
            
            const pathParts = cleanUrl.replace(/\/$/, "").split('/');
            targetSlug = pathParts[pathParts.length - 1];

            if (targetSlug.toLowerCase() === bookSlug.toLowerCase()) {
                targetSlug = 'index';
            }
        } else if (url.endsWith('.md') || url.includes('.md#')) {
            let cleanUrl = url.split('?')[0];
            const hashIndex = url.indexOf('#');
            
            hash = hashIndex !== -1 ? url.substring(hashIndex) : '';
            targetSlug = cleanUrl.split('#')[0].replace('.md', '');
        }

        if (targetSlug && validChapterIds.has(targetSlug)) {
            let trueHash = "";
            if (hash) {
                const cleanHash = hash.substring(1);
                // Self-Heal: Swap the broken lowercase hash for the true CamelCase hash
                trueHash = hashDictionary[cleanHash.toLowerCase()] || cleanHash;
            }

            const finalHash = trueHash ? `#${bookSlug}:${targetSlug}:${trueHash}` : `#${bookSlug}:${targetSlug}`;
            
            const urlTargetSlug = targetSlug === 'index' ? '' : `/${targetSlug}`;
            const originalUrl = trueHash ? `${baseUrl}${urlTargetSlug}#${trueHash}` : `${baseUrl}${urlTargetSlug}`;

            return `[${text}](${finalHash} "${originalUrl}")`;
        }

        return match;
    });
}

async function runStitcher() {
    try {
        const outputFolder = path.dirname(outputFile);
        if (!fs.existsSync(outputFolder)) fs.mkdirSync(outputFolder, { recursive: true });

        if (fs.existsSync(outputFile)) {
            console.log(`\nℹ️ Overwriting existing master file: ${finalFileName}`);
        }

        const manifest = buildStitcherManifest(sourceDir);
        console.log(`Manifest built: ${manifest.length} chapters loaded.`);

        // Build the true-casing dictionary from actual Markdown headings
        const hashDictionary = buildHashDictionary(manifest, sourceDir);
        console.log(`Anchor dictionary mapped: Casing secured.\n`);

        let masterContent = `<SOURCEBOOK id="${TARGET_BOOK.toUpperCase()}" ruleset="${bookMeta.ruleset}" type="${bookMeta.type}" legacy="${bookMeta.isLegacy}">\n\n`;

        masterContent += `# ${bookTitle} {#${TARGET_BOOK.toLowerCase()}}\n\n`;

        for (let i = 0; i < manifest.length; i++) {
            const { slug, title } = manifest[i];
            const filePath = path.join(sourceDir, slug);
            
            console.log(`[${i+1}/${manifest.length}] Stitching: ${title}`);
            
            let chapterText = fs.readFileSync(filePath, 'utf-8');
            const chapterSlug = slug.replace('.md', '');
            
            // NEW: Build hierarchical breadcrumb IDs exclusively for the Table of Contents (Index)
            if (chapterSlug.toLowerCase() === 'index') {
                chapterText = applyHierarchicalHeadingIds(chapterText, TARGET_BOOK, chapterSlug);
            }
            
            // Self-Heal the anchor definitions embedded in the target chapter's body text
            chapterText = chapterText.replace(/\{#([^:]+):([^:]+):([^}]+)\}/g, (match, p1, p2, p3) => {
                const trueHash = hashDictionary[p3.toLowerCase()] || p3;
                return `{#${p1}:${p2}:${trueHash}}`;
            });
            
            // Pass the hashDictionary so transformMarkdownLinks can self-heal the TOC
            chapterText = transformMarkdownLinks(chapterText, manifest, chapterSlug, TARGET_BOOK, bookMeta.path, hashDictionary);
            
            masterContent += `<CHAPTER id="${TARGET_BOOK}:${chapterSlug}" title="${title}">\n\n`;
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