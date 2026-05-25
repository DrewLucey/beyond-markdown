/**
 * stitcher.js
 * Master Context Assembler
 * Upgraded to seamlessly support both indexed sourcebooks and ID-prepended data repositories.
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

const TARGET_BOOK = process.argv[2];
if (!TARGET_BOOK) {
    console.error("Usage: node stitcher.js <sourcebook_id_or_repository>");
    console.error("Examples:\n  node stitcher.js wgte\n  node stitcher.js species");
    process.exit(1);
}

// Routes directories automatically based on ecosystem patterns
const isRepository = ['spells', 'items', 'feats', 'backgrounds', 'races', 'species', 'monsters'].includes(TARGET_BOOK.toLowerCase());
const sourceDir = isRepository 
    ? path.resolve(__dirname, '../sources/repositories', TARGET_BOOK)
    : path.resolve(__dirname, '../sources', TARGET_BOOK);

const outputFile = path.resolve(__dirname, `../sources/${TARGET_BOOK}/_master__${TARGET_BOOK}.md`);

function askQuestion(query) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans); }));
}

function buildStitcherManifest(dirPath) {
    console.log(`Analyzing target directory: ${dirPath}`);
    if (!fs.existsSync(dirPath)) {
        throw new Error(`Target directory path not found: ${dirPath}`);
    }

    const manifest = [];

    // BRANCH A: Repository Engine (Dynamic file scanning to handle version duplicates and ID prefixes)
    if (isRepository) {
        console.log(" Detected master rules data repository folder. Assembling dynamic filename collection...");
        const files = fs.readdirSync(dirPath).filter(file => file.endsWith('.md') && !file.startsWith('_master__'));
        
        // Alphabetical sort ensures duplicates like 123-Aasimar.md and 456-Aasimar.md remain securely grouped next to each other
        files.sort();

        files.forEach(filename => {
            // Remove extension and strip leading identification markers for clean titles
            const titleRaw = filename.replace('.md', '').replace(/^\d+-/, '').replace(/-/g, ' ');
            const title = titleRaw.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            
            manifest.push({
                slug: filename,
                title: title
            });
        });
        return manifest;
    }

    // BRANCH B: Sourcebook Engine (Chronological sequencing relying on table of contents links)
    const indexFilePath = path.join(dirPath, 'index.md');
    if (!fs.existsSync(indexFilePath)) {
        throw new Error(`Critical Error: index.md missing. Chronological books demand an index context file.`);
    }

    console.log("Found index.md table of contents layout. Mapping reading trajectory...");
    const indexContent = fs.readFileSync(indexFilePath, 'utf-8');
    const htmlContent = marked.parse(indexContent);
    const $ = cheerio.load(htmlContent);

    const chapterSlugs = ['index.md'];
    const sourcebookId = TARGET_BOOK.toLowerCase();

    $('a').each((_, el) => {
        let href = $(el).attr('href');
        if (!href) return;
        
        if (href.includes(`/sources/${sourcebookId}/`)) {
            let cleanSlug = href.split('/sources/')[1];
            cleanSlug = cleanSlug.split('#')[0].split('?')[0]; 
            
            const slug = cleanSlug.split('/').pop();
            if (slug && slug !== sourcebookId && slug !== 'index') {
                const targetFilename = `${slug}.md`;
                if (!chapterSlugs.includes(targetFilename)) {
                    chapterSlugs.push(targetFilename);
                }
            }
        }
    });

    chapterSlugs.forEach(filename => {
        const filePath = path.join(dirPath, filename);
        if (fs.existsSync(filePath)) {
            const titleRaw = filename.replace('.md', '').replace(/-/g, ' ');
            const title = titleRaw.charAt(0).toUpperCase() + titleRaw.slice(1);
            manifest.push({ slug: filename, title: title });
        } else {
            console.warn(`[WARNING] Skipping missing entry listed in index path layout: ${filename}`);
        }
    });

    return manifest;
}

async function runStitcher() {
    try {
        const outputFolder = path.dirname(outputFile);
        if (!fs.existsSync(outputFolder)) fs.mkdirSync(outputFolder, { recursive: true });

        if (fs.existsSync(outputFile)) {
            const answer = await askQuestion(`\n⚠️ Master collection file for "${TARGET_BOOK}" exists. Overwrite? (y/n): `);
            if (answer.toLowerCase() !== 'y') {
                console.log('Stitch operational loop terminated.');
                return;
            }
            console.log('');
        }

        const manifest = buildStitcherManifest(sourceDir);
        console.log(`Manifest confirmed: ${manifest.length} relational entities indexed for assembly loops.\n`);

        // Envelop tracking definition block
        const containerTag = isRepository ? 'REPOSITORY' : 'SOURCEBOOK';
        let masterContent = `<${containerTag} id="${TARGET_BOOK.toUpperCase()}">\n\n`;

        for (let i = 0; i < manifest.length; i++) {
            const { slug, title } = manifest[i];
            const filePath = path.join(sourceDir, slug);
            
            console.log(`[${i+1}/${manifest.length}] Compiling Context Block: ${title} (${slug})`);
            
            let itemText = fs.readFileSync(filePath, 'utf-8');
            
            // XML Structural Boxing
            masterContent += `<CHAPTER id="${slug.replace('.md', '')}" title="${title}">\n\n`;
            masterContent += itemText;
            masterContent += `\n\n</CHAPTER>\n\n`;
            masterContent += `--- \n\n`; 
        }

        masterContent += `</${containerTag}>\n`;

        fs.writeFileSync(outputFile, masterContent);
        console.log(`\n✅ Success! Macro Context compiled to: ${outputFile}`);
        
        const stats = fs.statSync(outputFile);
        console.size = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`Total Compiled Matrix Volume: ${console.size} MB`);

    } catch (error) {
        console.error(`\nStitch Failure Routine Triggered: ${error.message}`);
    }
}

runStitcher();