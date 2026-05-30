/**
 * stitcher.js
 * Assembles atomic Markdown files into a macro-level repository.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import readline from 'readline';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_REPO = process.argv[2] || 'spells';
const sourceDir = path.resolve(__dirname, '../sources/repositories', TARGET_REPO);
const outputFile = path.resolve(__dirname, `../sources/repositories/_master__${TARGET_REPO}.md`);

function askQuestion(query) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

async function runRepoStitcher() {
    try {
        console.log(`--- Starting Repository Stitcher for: ${TARGET_REPO.toUpperCase()} ---`);

        if (!fs.existsSync(sourceDir)) {
            throw new Error(`Directory not found: ${sourceDir}\nRun your fetcher/extractor first.`);
        }

        if (fs.existsSync(outputFile)) {
            console.log(`\n⚠️ WARNING: Master file '_master__${TARGET_REPO}.md' already exists.`);
            const answer = await askQuestion(`Do you want to overwrite it? (y/n): `);
            if (answer.toLowerCase() !== 'y') {
                console.log("Stitching aborted by user. Existing file was kept.");
                return; 
            }
            console.log("\nOverwriting existing file...");
        }

        let files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.md') && !f.startsWith('_'));
        
        // --- SEMANTIC SORTING FIX ---
        // Strips the DDB numerical prefix during the sort so identical items group together alphabetically
        files.sort((a, b) => {
            const nameA = a.replace(/^\d+-/, ''); // '123-Aasimar.md' -> 'Aasimar.md'
            const nameB = b.replace(/^\d+-/, ''); // '999-Aasimar.md' -> 'Aasimar.md'
            return nameA.localeCompare(nameB);
        });

        console.log(`Found ${files.length} items to stitch.\n`);

        // --- AI ARCHITECT UPGRADE: Macro-XML Wrapper ---
        let masterContent = `<DATABASE type="${TARGET_REPO.toUpperCase()}">\n\n`;

        for (let i = 0; i < files.length; i++) {
            const fileName = files[i];
            const filePath = path.join(sourceDir, fileName);
            
            let itemText = fs.readFileSync(filePath, 'utf-8');
            
            // Individual items already have <ENTRY> tags from the bulk_extractor
            masterContent += itemText.trim();
            masterContent += `\n\n`; 
        }

        masterContent += `</DATABASE>\n`;
        // -----------------------------------------------

        fs.writeFileSync(outputFile, masterContent);
        console.log(`Success! Repository stitched to: ${outputFile}`);
        
        const stats = fs.statSync(outputFile);
        const fileSizeInMegabytes = (stats.size / (1024*1024)).toFixed(2);
        console.log(`File Size: ${fileSizeInMegabytes} MB`);

    } catch (err) {
        console.error(`\nStitcher Failed: ${err.message}`);
    }
}

runRepoStitcher();