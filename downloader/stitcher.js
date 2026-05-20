import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import readline from 'readline'; // Built-in Node module for terminal prompts

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target the folder created by our extractor
const TARGET_BOOK = process.argv[2] || 'phb-2014';
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

    // Ignore any file that starts with an underscore (e.g., _TEST BENCH_.md, _master__phb.md)
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md') && !f.startsWith('_'));
    
    // The extractor saved the Table of Contents as index.md
    if (!files.includes('index.md')) {
        throw new Error("index.md not found. Cannot determine chapter order.");
    }

    // Parse index.md to get the true chronological order of the book
    const indexPath = path.join(dirPath, 'index.md');
    const indexContent = fs.readFileSync(indexPath, 'utf-8');
    
    // Look for markdown links: [Chapter 1: Step-by-Step Characters](https://.../step-by-step)
    const linkRegex = /\[(.*?)\]\((.*?)\)/g;
    const orderedFiles = [];
    let match;

    // Push the root file first (skipping it if it's accidentally named the same as our master)
    orderedFiles.push({ slug: 'index.md', title: 'Cover & Table of Contents' });

    while ((match = linkRegex.exec(indexContent)) !== null) {
        const title = match[1];
        const url = match[2];
        const slug = url.split('/').filter(Boolean).pop() + '.md';
        
        // Ensure we only stitch files that actually downloaded successfully
        // and ignore the master file itself if we are re-running
        if (files.includes(slug) && !orderedFiles.find(f => f.slug === slug) && !slug.startsWith('_master__')) {
            orderedFiles.push({ slug, title });
        }
    }

    return orderedFiles;
}

async function runStitcher() {
    try {
        console.log(`--- Starting The Stitcher for ${TARGET_BOOK} ---`);

        // --- NEW: INTERACTIVE OVERWRITE PROTECTION ---
        if (fs.existsSync(outputFile)) {
            console.log(`\n⚠️ WARNING: Master file '_master__${TARGET_BOOK}.md' already exists in the ${TARGET_BOOK} folder.`);
            const answer = await askQuestion(`Do you want to overwrite it? (y/N): `);
            
            if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
                console.log("\nOperation aborted by user. Existing file was kept.");
                return; // Exit the script safely
            }
            console.log("\nOverwriting existing file...");
        } else {
            console.log(""); // Just for clean spacing
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
        const fileSizeInMegabytes = stats.size / (1024*1024);
        console.log(`File Size: ${fileSizeInMegabytes.toFixed(2)} MB`);

    } catch (err) {
        console.error("\nStitcher Failed:", err.message);
    }
}

runStitcher();