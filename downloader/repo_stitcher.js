/**
 * repo_stitcher.js
 * Assembles compendium repositories (monsters, spells, etc.) into a master database.
 * Final: Auto-Overwrite, Beautiful Naming, & Google Drive (.md.txt) Sync
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_REPO = process.argv[2] || 'spells';
const sourceDir = path.resolve(__dirname, '../sources/repositories', TARGET_REPO);

// --- AI ARCHITECT UPGRADE: Semantic Folder Parsing ---
let repoBase = TARGET_REPO;
let ruleset = "5e"; // Default assumption

const match = TARGET_REPO.match(/^(.*?)_(\d{4})$/);
if (match) {
    repoBase = match[1];
    ruleset = match[2];
}

const formattedTitle = repoBase.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

// NOTE: Using .md.txt to bypass Google Drive's NotebookLM filter!
const finalFileName = `${formattedTitle} (${ruleset}).md.txt`;
const outputFile = path.resolve(__dirname, `../sources/repositories/${finalFileName}`);
// -----------------------------------------------------

async function runRepoStitcher() {
    try {
        console.log(`--- Starting Repository Stitcher for: ${formattedTitle} ---`);

        if (!fs.existsSync(sourceDir)) {
            throw new Error(`Directory not found: ${sourceDir}\nRun your fetcher/extractor first.`);
        }

        // Unattended Execution: Silently overwrite if exists
        if (fs.existsSync(outputFile)) {
            console.log(`\nℹ️ Overwriting existing master file: ${finalFileName}\n`);
        }

        let files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.md') && !f.endsWith('.md.txt'));
        
        files.sort((a, b) => {
            const nameA = a.replace(/^\d+-/, ''); 
            const nameB = b.replace(/^\d+-/, ''); 
            return nameA.localeCompare(nameB);
        });

        console.log(`Found ${files.length} items to stitch.\n`);

        let masterContent = `<DATABASE type="${repoBase.toUpperCase()}">\n\n`;

        for (let i = 0; i < files.length; i++) {
            const fileName = files[i];
            const filePath = path.join(sourceDir, fileName);
            
            let itemText = fs.readFileSync(filePath, 'utf-8');
            
            masterContent += itemText.trim();
            masterContent += `\n\n`; 
        }

        masterContent += `</DATABASE>\n`;

        fs.writeFileSync(outputFile, masterContent);
        console.log(`Success! Repository stitched to: ${outputFile}`);
        
        const stats = fs.statSync(outputFile);
        const fileSizeInMegabytes = (stats.size / (1024*1024)).toFixed(2);
        console.log(`File Size: ${fileSizeInMegabytes} MB`);

    } catch (error) {
        console.error(`\nStitcher Failed: ${error.message}`);
    }
}

runRepoStitcher();