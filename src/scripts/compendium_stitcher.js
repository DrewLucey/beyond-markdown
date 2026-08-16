/**
 * compendium_stitcher.js
 * Assembles atomic Markdown files from a rules category into a single Master Compendium file.
 */
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { getDirname } from '../utils/paths.js';

const __dirname = getDirname(import.meta.url);

const TARGET_CATEGORY = process.argv[2];
if (!TARGET_CATEGORY) {
    console.error('Usage: node compendium_stitcher.js <category>');
    console.error('Example: node compendium_stitcher.js spells');
    process.exit(1);
}

// Check if the CLI/UI passed a specific output path
const providedOutputPath = process.argv[3];

// Resolve the directory where the atomic files were saved
const cleanCategory = TARGET_CATEGORY.replace(/^\//, ''); // e.g. "/equipment" -> "equipment"
const sourceDir = path.resolve(__dirname, `../sources/${cleanCategory}`);

const defaultOutputFile = path.resolve(__dirname, `../sources/${cleanCategory}.md.txt`);
const outputFile = providedOutputPath ? path.resolve(providedOutputPath) : defaultOutputFile;

async function runStitcher() {
    try {
        console.log(`\nStarting compendium stitching for category: ${cleanCategory}...`);
        
        if (!fs.existsSync(sourceDir)) {
            throw new Error(`Source directory not found: ${sourceDir}. Extraction must run first.`);
        }

        const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.md'));
        if (files.length === 0) {
            console.log(`No markdown files found in ${sourceDir}. Skipping stitch.`);
            process.exit(0);
        }

        console.log(`Found ${files.length} atomic files. Stitching into Master Compendium...`);

        const outputFolder = path.dirname(outputFile);
        if (!fs.existsSync(outputFolder)) fs.mkdirSync(outputFolder, { recursive: true });

        // Initialize the master document
        const capitalizedTitle = cleanCategory.charAt(0).toUpperCase() + cleanCategory.slice(1);
        let masterContent = `<COMPENDIUM type="${cleanCategory}">\n\n`;
        masterContent += `# Master ${capitalizedTitle} Database\n\n`;

        let successCount = 0;

        for (let i = 0; i < files.length; i++) {
            const filePath = path.join(sourceDir, files[i]);
            let content = fs.readFileSync(filePath, 'utf-8');

            // The content should already be wrapped in <ENTRY> tags by bulk_muncher / bulk_api_fetcher
            masterContent += content;
            masterContent += `\n\n---\n\n`;
            
            successCount++;
            if (successCount % 50 === 0) {
                process.stdout.write(`\rStitched ${successCount}/${files.length} files...`);
            }
        }
        
        process.stdout.write(`\rStitched ${successCount}/${files.length} files...\n`);

        masterContent += `</COMPENDIUM>\n`;

        fs.writeFileSync(outputFile, masterContent);
        console.log(`\nSuccess! Master Compendium saved to: ${outputFile}`);

        const stats = fs.statSync(outputFile);
        const fileSizeInMegabytes = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`File Size: ${fileSizeInMegabytes} MB\n`);

    } catch (error) {
        console.error(`\nCompendium Stitcher Failed: ${error.message}`);
        process.exit(1);
    }
}

runStitcher();
