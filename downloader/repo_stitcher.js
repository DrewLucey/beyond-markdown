import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import readline from 'readline';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target the specific repository folder
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
            const answer = await askQuestion(`Do you want to overwrite it? (y/N): `);
            if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
                console.log("\nOperation aborted by user. Existing file was kept.");
                return; 
            }
            console.log("\nOverwriting existing file...");
        }

        // Get all markdown files, ignoring any that start with an underscore (our test benches and master files)
        let files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.md') && !f.startsWith('_'));
        
        // Sort alphabetically
        files.sort((a, b) => a.localeCompare(b));

        console.log(`Found ${files.length} items to stitch.\n`);

        let masterContent = `\n`;
        masterContent += `\n\n`;

        for (let i = 0; i < files.length; i++) {
            const fileName = files[i];
            const filePath = path.join(sourceDir, fileName);
            
            // We do not need to add <ENTRY> tags here because our api_fetcher.js and bulk_extract.js already added them!
            let itemText = fs.readFileSync(filePath, 'utf-8');
            
            masterContent += itemText;
            masterContent += `\n\n`; 
        }

        fs.writeFileSync(outputFile, masterContent);
        console.log(`Success! Repository stitched to: ${outputFile}`);
        
        const stats = fs.statSync(outputFile);
        const fileSizeInMegabytes = stats.size / (1024*1024);
        console.log(`File Size: ${fileSizeInMegabytes.toFixed(2)} MB`);

    } catch (err) {
        console.error("\nStitcher Failed:", err.message);
    }
}

runRepoStitcher();