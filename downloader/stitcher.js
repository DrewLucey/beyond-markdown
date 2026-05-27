/**
 * stitcher.js
 * Assembles atomic Markdown files into a macro-level sourcebook based on the index.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import * as cheerio from 'cheerio';
import { marked } from 'marked';
import readline from 'readline';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target the folder created by our extractor
const TARGET_BOOK = process.argv[2];
if (!TARGET_BOOK) {
    console.error("Usage: node stitcher.js <sourcebook_id>");
    console.error("Example: node stitcher.js phb-2024");
    process.exit(1);
}

const sourceDir = path.resolve(__dirname, '../sources', TARGET_BOOK);
const outputFile = path.resolve(__dirname, `../sources/${TARGET_BOOK}/_master__${TARGET_BOOK}.md`);

function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

function buildStitcherManifest(dirPath) {
    console.log(`Analyzing directory: ${dirPath}`);
    if (!fs.existsSync(dirPath)) {
        throw new Error(`Directory not found. Run extract.js on ${TARGET_BOOK} first.`);
    }

    const indexFilePath = path.join(dirPath, 'index.md');
    if (!fs.existsSync(indexFilePath)) {
        throw new Error(`Critical Error: index.md not found in ${dirPath}. The stitcher relies on the index to determine reading order.`);
    }

    // Capture every actual .md file that exists in the directory. 
    // This is our source of truth.
    const availableFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
    
    console.log(`Found ${availableFiles.length} atomic files. Mapping reading order from index.md...`);

    const indexContent = fs.readFileSync(indexFilePath, 'utf-8');
    const htmlContent = marked.parse(indexContent);
    const $ = cheerio.load(htmlContent);

    const chapterSlugs = ['index.md'];

    // Locate chapter links inside the Table of Contents
    $('a').each((_, el) => {
        let href = $(el).attr('href');
        if (!href) return;
        
        // Isolate the final slug from ANY DDB URL (handles /sources/phb/ and /sources/dnd/phb/ equally)
        let cleanSlug = href.split('?')[0].split('#')[0].replace(/\/$/, ""); 
        const pathParts = cleanSlug.split('/');
        const targetSlug = pathParts[pathParts.length - 1]; 
        
        // Find if this slug matches any downloaded file (e.g. 'combat' matches 'combat.md')
        const matchedFileName = availableFiles.find(f => f.replace('.md', '').toLowerCase() === targetSlug.toLowerCase());

        if (matchedFileName && matchedFileName !== 'index.md') {
            if (!chapterSlugs.includes(matchedFileName)) {
                chapterSlugs.push(matchedFileName);
            }
        }
    });

    const manifest = [];
    
    // Validate local files
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

    // Catch-All: Append any files that downloaded but weren't linked in the index.md
    availableFiles.forEach(file => {
        if (!chapterSlugs.includes(file) && !file.startsWith('_master__')) {
            console.log(`[Info] Automatically appending unlinked file: ${file}`);
            const rawTitle = file.replace('.md', '').replace(/-/g, ' ');
            const title = rawTitle.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            manifest.push({ slug: file, title: title });
        }
    });

    return manifest;
}

/**
 * Parses and transforms relative Markdown links pointing to other chapter files.
 */
function transformMarkdownLinks(content, manifest) {
    const validChapterIds = new Set(manifest.map(m => m.slug.replace('.md', '')));

    return content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
        if (url.startsWith('#')) return match;

        let targetSlug = "";
        let hash = "";

        // If the URL contains DDB routing, isolate the target slug
        if (url.includes('/sources/')) {
            let cleanUrl = url.split('?')[0]; 
            const hashIndex = cleanUrl.indexOf('#');
            
            hash = hashIndex !== -1 ? cleanUrl.substring(hashIndex) : '';
            cleanUrl = hashIndex !== -1 ? cleanUrl.substring(0, hashIndex) : cleanUrl;
            
            const pathParts = cleanUrl.replace(/\/$/, "").split('/');
            targetSlug = pathParts[pathParts.length - 1];
        } else if (url.endsWith('.md') || url.includes('.md#')) {
            // If it is a direct local file reference
            let cleanUrl = url.split('?')[0];
            const hashIndex = url.indexOf('#');
            
            hash = hashIndex !== -1 ? url.substring(hashIndex) : '';
            targetSlug = cleanUrl.split('#')[0].replace('.md', '');
        }

        // If the identified target exists in our compiled manifest, update the link
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

async function runStitcher() {
    try {
        const outputFolder = path.dirname(outputFile);
        if (!fs.existsSync(outputFolder)) fs.mkdirSync(outputFolder, { recursive: true });

        if (fs.existsSync(outputFile)) {
            const answer = await askQuestion(`\n⚠️ The master file for ${TARGET_BOOK} already exists. Overwrite? (y/n): `);
            if (answer.toLowerCase() !== 'y') {
                console.log('Aborting stitch process.');
                return;
            }
            console.log(''); 
        }

        const manifest = buildStitcherManifest(sourceDir);
        console.log(`Manifest built: ${manifest.length} chapters loaded.\n`);

        // --- AI METADATA INJECTION ---
        let bookMeta = { ruleset: "5e", type: "sourcebook", isLegacy: false };
        const mapFilePath = path.resolve(__dirname, '../sources/ruleset_map.json');
        
        if (fs.existsSync(mapFilePath)) {
            try {
                const rulesMap = JSON.parse(fs.readFileSync(mapFilePath, 'utf-8'));
                if (rulesMap[TARGET_BOOK.toLowerCase()]) {
                    bookMeta = rulesMap[TARGET_BOOK.toLowerCase()];
                }
            } catch (err) {
                console.warn("Could not read ruleset_map.json. Proceeding with default tags.");
            }
        } else {
            console.warn("ruleset_map.json not found. Run `node downloader/library.js` for better AI metadata.");
        }

        let masterContent = `<SOURCEBOOK id="${TARGET_BOOK.toUpperCase()}" ruleset="${bookMeta.ruleset}" type="${bookMeta.type}" legacy="${bookMeta.isLegacy}">\n\n`;

        for (let i = 0; i < manifest.length; i++) {
            const { slug, title } = manifest[i];
            const filePath = path.join(sourceDir, slug);
            
            console.log(`[${i+1}/${manifest.length}] Stitching: ${title}`);
            
            let chapterText = fs.readFileSync(filePath, 'utf-8');
            
            // Execute the Link Transformer
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