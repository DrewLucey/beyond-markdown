import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import * as cheerio from 'cheerio';
import { marked } from 'marked';
import readline from 'readline'; // Built-in Node module for terminal prompts

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target the folder created by our extractor
const TARGET_BOOK = process.argv[2];
if (!TARGET_BOOK) {
    console.error("Usage: node stitcher.js <sourcebook_id>");
    console.error("Example: node stitcher.js wgte");
    process.exit(1);
}

const sourceDir = path.resolve(__dirname, '../sources', TARGET_BOOK);

// NEW NAMING & LOCATION: Saves into the book's subfolder as _master__[book].md
const outputFile = path.resolve(__dirname, `../sources/${TARGET_BOOK}/_master__${TARGET_BOOK}.md`);

/**
 * Creates an interactive terminal prompt.
 */
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

    // Always start with the table of contents / index file
    const indexFilePath = path.join(dirPath, 'index.md');
    if (!fs.existsSync(indexFilePath)) {
        throw new Error(`Critical Error: index.md not found in ${dirPath}. The stitcher relies on the index to determine the reading order.`);
    }

    console.log("Found index.md. Mapping reading order...");

    const indexContent = fs.readFileSync(indexFilePath, 'utf-8');
    
    // Parse the Markdown into HTML so we can easily traverse the DOM and extract links
    const htmlContent = marked.parse(indexContent);
    const $ = cheerio.load(htmlContent);

    const chapterSlugs = [];
    
    // We implicitly add the index as the first chapter
    chapterSlugs.push('index.md');

    const sourcebookId = TARGET_BOOK.toLowerCase();

    // Locate chapter links inside your Table of Contents
    $('a').each((_, el) => {
        let href = $(el).attr('href');
        if (!href) return;
        
        if (href.includes(`/sources/${sourcebookId}/`)) {
            // --- THE HASH CUTTER ---
            // Cleans out anchor tags (#) and query params (?) commonly used in legacy prototypes
            let cleanSlug = href.split('/sources/')[1]; // e.g., "wgte/what-is-eberron#AMagicalWorld"
            cleanSlug = cleanSlug.split('#')[0].split('?')[0]; // Resolves down strictly to "wgte/what-is-eberron"
            
            const pathParts = cleanSlug.split('/');
            const slug = pathParts[pathParts.length - 1]; // Pulls out "what-is-eberron"
            
            // Ignore the base index page and map duplicates cleanly
            if (slug && slug !== sourcebookId && slug !== 'index') {
                const targetFilename = `${slug}.md`;
                if (!chapterSlugs.includes(targetFilename)) {
                    chapterSlugs.push(targetFilename);
                }
            }
        }
    });

    const manifest = [];
    
    // Validate that the files mapped from the index actually exist in your local directory
    for (const filename of chapterSlugs) {
        const filePath = path.join(dirPath, filename);
        if (fs.existsSync(filePath)) {
            // Convert slug back into a Title Case string for the XML wrapper
            const rawTitle = filename.replace('.md', '').replace(/-/g, ' ');
            const title = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);
            
            manifest.push({
                slug: filename,
                title: title
            });
        } else {
            console.warn(`[WARNING] Skipping missing file referenced in index: ${filename}`);
        }
    }

    return manifest;
}

async function runStitcher() {
    try {
        if (fs.existsSync(outputFile)) {
            const answer = await askQuestion(`\n⚠️ The master file for ${TARGET_BOOK} already exists. Overwrite? (y/n): `);
            if (answer.toLowerCase() !== 'y') {
                console.log('Aborting stitch process.');
                return;
            }
            console.log(''); // Formatting spacing
        }

        const manifest = buildStitcherManifest(sourceDir);
        console.log(`Manifest built: ${manifest.length} chapters found in chronological order.\n`);

        // --- AI ARCHITECT UPGRADE: Macro-XML Wrapper ---
        let masterContent = `<SOURCEBOOK id="${TARGET_BOOK.toUpperCase()}">\n\n`;

        for (let i = 0; i < manifest.length; i++) {
            const { slug, title } = manifest[i];
            const filePath = path.join(sourceDir, slug);
            
            console.log(`[${i+1}/${manifest.length}] Stitching: ${title}`);
            
            let chapterText = fs.readFileSync(filePath, 'utf-8');
            
            // XML ENVELOPING: Critical for AI Context Windows
            masterContent += `<CHAPTER id="${slug.replace('.md', '')}" title="${title}">\n\n`;
            masterContent += chapterText;
            masterContent += `\n\n</CHAPTER>\n\n`;
            masterContent += `--- \n\n`; 
        }

        masterContent += `</SOURCEBOOK>\n`;

        fs.writeFileSync(outputFile, masterContent);
        console.log(`\nSuccess! Master Context saved to: ${outputFile}`);
        
        // Output file size info
        const stats = fs.statSync(outputFile);
        const fileSizeInMegabytes = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`File Size: ${fileSizeInMegabytes} MB`);

    } catch (error) {
        console.error(`\nStitcher Failed: ${error.message}`);
    }
}

runStitcher();