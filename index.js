/**
 * index.js
 * Master Interactive CLI for the Beyond-Markdown Pipeline
 * Updated: Auto-Auth Configuration
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import readline from 'readline';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Allow pressing ESC to exit the CLI at any prompt
process.stdin.on('keypress', (str, key) => {
    if (key && key.name === 'escape') {
        console.log(`\n\x1b[33mGoodbye!\x1b[0m`);
        process.exit(0);
    }
});

const ask = (query) => new Promise(resolve => rl.question(query, resolve));

// ANSI Terminal Colors
const colors = {
    reset: "\x1b[0m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    magenta: "\x1b[35m"
};

const configPath = path.resolve(__dirname, 'config.cjs');

async function checkAuth() {
    let hasAuth = false;
    
    // Check if config exists and has the token
    try {
        if (fs.existsSync(configPath)) {
            const config = require(configPath);
            if (config.cobaltSession || config.DNDBEYOND_COBALT_SESSION) {
                hasAuth = true;
            }
        }
    } catch (e) {
        // Silently catch require errors if the file is malformed
    }

    // Check environment variables as a fallback
    if (process.env.COBALTSESSION || process.env.DNDBEYOND_COBALT_SESSION) {
        hasAuth = true;
    }

    if (!hasAuth) {
        console.clear();
        console.log(`${colors.magenta}=================================================${colors.reset}`);
        console.log(`${colors.yellow}   ⚠️  Cobalt Session Cookie Not Found ⚠️   ${colors.reset}`);
        console.log(`${colors.magenta}=================================================${colors.reset}\n`);
        console.log(`To download your owned books from D&D Beyond, you must provide your authentication cookie.`);
        console.log(`Without it, the pipeline can only access free/SRD content.\n`);
        console.log(`${colors.cyan}How to find your cookie:${colors.reset}`);
        console.log(`1. Log in to dndbeyond.com`);
        console.log(`2. Press F12 to open Developer Tools`);
        console.log(`3. Go to Application tab -> Storage -> Cookies`);
        console.log(`4. Find and copy the value for 'CobaltSession'\n`);
        
        const token = await ask(`Paste your Cobalt Session cookie here (or press Enter to skip): `);
        
        if (token.trim()) {
            const configContent = `module.exports = {\n    cobaltSession: "${token.trim()}"\n};\n`;
            fs.writeFileSync(configPath, configContent);
            console.log(`\n${colors.green}✔ Saved successfully to config.cjs!${colors.reset}\n`);
            await ask(`Press Enter to continue to the main menu...`);
        } else {
            console.log(`\n${colors.yellow}Skipping authentication. Some downloads may fail or redirect to the marketplace.${colors.reset}\n`);
            await ask(`Press Enter to continue to the main menu...`);
        }
    }
}

function runScript(scriptPath, args = []) {
    console.log(`\n${colors.cyan}▶ Executing: node ${scriptPath} ${args.join(' ')}${colors.reset}\n`);
    spawnSync('node', [scriptPath, ...args], { stdio: 'inherit' });
    console.log(`\n${colors.green}✔ Task Complete.${colors.reset}\n`);
}

async function checkRequiredMetadata() {
    const mapPath = path.resolve(__dirname, 'sources/ruleset_map.json');
    const configJsonPath = path.resolve(__dirname, 'sources/config.json');
    
    if (!fs.existsSync(mapPath) || !fs.existsSync(configJsonPath)) {
        console.log(`\n${colors.red}⚠️  Missing Library Metadata!${colors.reset}`);
        console.log(`You must run Option 1 (Update Library Metadata) to generate your 'ruleset_map.json' and 'config.json' files before proceeding.\n`);
        await ask(`Press Enter to return to menu...`);
        return false;
    }
    return true;
}

async function showMenu() {
    console.clear();
    console.log(`${colors.magenta}=================================================${colors.reset}`);
    console.log(`${colors.green}   D&D Beyond -> NotebookLM Markdown Pipeline    ${colors.reset}`);
    console.log(`${colors.magenta}=================================================${colors.reset}\n`);
    
    console.log(`1. Update Library Metadata (Run this first to map owned books)`);
    console.log(`2. Extract & Stitch a Single Sourcebook (e.g., phb-2024)`);
    console.log(`3. Extract & Stitch a Compendium (Monsters, Spells, Items)`);
    console.log(`4. Run 2014->2024 Rules Converter on a Repository`);
    console.log(`5. BATCH CRAWL: Automatically extract & stitch ALL owned books`);
    console.log(`6. Compile a D&D Beyond Character to Markdown`);
    console.log(`0. Exit\n`);

    const choice = await ask(`Select an option (0-6): `);

    switch (choice.trim()) {
        case '1':
            runScript('downloader/library.js');
            await ask(`Press Enter to return to menu...`);
            showMenu();
            break;
        case '2':
            if (await checkRequiredMetadata()) await promptSourcebook();
            else showMenu();
            break;
        case '3':
            if (await checkRequiredMetadata()) await promptCompendium();
            else showMenu();
            break;
        case '4':
            if (await checkRequiredMetadata()) await promptConverter();
            else showMenu();
            break;
        case '5':
            if (await checkRequiredMetadata()) await batchCrawlAllBooks();
            else showMenu();
            break;
        case '6':
            await promptCharacterCompiler();
            break;
        case '0':
            console.log(`${colors.yellow}Goodbye!${colors.reset}`);
            rl.close();
            process.exit(0);
        default:
            console.log(`${colors.red}Invalid choice.${colors.reset}`);
            await ask(`Press Enter to try again...`);
            showMenu();
            break;
    }
}

async function promptSourcebook() {
    console.log(`\n${colors.yellow}--- Extract & Stitch Sourcebook ---${colors.reset}`);
    const bookUrl = await ask(`Enter the DDB URL or slug (e.g., https://www.dndbeyond.com/sources/dnd/phb-2024 or frhof): `);
    
    if (!bookUrl) return showMenu();

    let slug = bookUrl;
    if (bookUrl.includes('/')) {
        slug = bookUrl.replace(/\/$/, "").split('/').pop();
    }

    let fullUrl = bookUrl;
    
    // If the user just typed a slug, intelligently look up the exact path from the library map
    if (!bookUrl.startsWith('http')) {
        const mapPath = path.resolve(__dirname, 'sources/ruleset_map.json');
        let foundPath = false;
        
        if (fs.existsSync(mapPath)) {
            try {
                const rulesMap = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
                if (rulesMap[slug] && rulesMap[slug].path) {
                    fullUrl = `https://www.dndbeyond.com${rulesMap[slug].path}`;
                    foundPath = true;
                }
            } catch (e) {
                // Silently fallback if JSON fails to parse
            }
        }

        // If it's a completely unknown slug not in the map, guess the standard first-party path
        if (!foundPath) {
            fullUrl = `https://www.dndbeyond.com/sources/dnd/${bookUrl}`;
        }
    }

    // 1. Run Extractor
    runScript('downloader/extract.js', [fullUrl]);

    // 2. Run Stitcher
    runScript('downloader/stitcher.js', [slug]);

    await ask(`Press Enter to return to menu...`);
    showMenu();
}

async function promptCompendium() {
    console.log(`\n${colors.yellow}--- Extract & Stitch Compendium ---${colors.reset}`);
    console.log(`Available: /spells, /monsters, /magic-items, /equipment, /species`);
    const category = await ask(`Enter category (e.g., /spells): `);
    
    if (!category) return showMenu();

    const cleanCategory = category.startsWith('/') ? category : `/${category}`;
    const slug = cleanCategory.replace('/', '');

    // 1. Run Bulk Muncher
    runScript('downloader/bulk_muncher.js', [cleanCategory]);

    // 2. Run Repo Stitcher
    runScript('downloader/repo_stitcher.js', [slug]);

    await ask(`Press Enter to return to menu...`);
    showMenu();
}

async function promptConverter() {
    console.log(`\n${colors.yellow}--- Run 2014 to 2024 Rules Converter ---${colors.reset}`);
    const category = await ask(`Enter the repository to convert (e.g., spells, monsters, species): `);
    
    if (!category) return showMenu();

    runScript('downloader/rules_converter.js', [category, '2014to2024']);

    await ask(`Press Enter to return to menu...`);
    showMenu();
}

async function batchCrawlAllBooks() {
    console.log(`\n${colors.yellow}--- BATCH CRAWLER: EXTRACT ALL BOOKS ---${colors.reset}`);
    
    const mapPath = path.resolve(__dirname, 'sources/ruleset_map.json');
    const mapData = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
    
    // Filter out unowned/unshared books so we don't hit marketplace redirects
    const books = Object.entries(mapData).filter(([id, meta]) => meta.isOwned || meta.isSharedWithMe);

    console.log(`${colors.cyan}Found ${books.length} accessible books in your library metadata.${colors.reset}`);
    const confirm = await ask(`This will take a long time and download gigabytes of data. Proceed? (y/n): `);

    if (confirm.toLowerCase() !== 'y') {
        return showMenu();
    }

    for (let i = 0; i < books.length; i++) {
        const [id, meta] = books[i];
        console.log(`\n${colors.magenta}[${i + 1}/${books.length}] Crawling: ${meta.title}${colors.reset}`);
        
        const fullUrl = `https://www.dndbeyond.com${meta.path}`;
        
        try {
            // Run Extractor
            spawnSync('node', ['downloader/extract.js', fullUrl], { stdio: 'inherit' });
            
            // Run Stitcher
            spawnSync('node', ['downloader/stitcher.js', id], { stdio: 'inherit' });
            
            console.log(`${colors.green}✔ Finished ${meta.title}${colors.reset}`);
            
            console.log(`${colors.yellow}Waiting 10 seconds before next book...${colors.reset}`);
            await new Promise(r => setTimeout(r, 10000));
        } catch (err) {
            console.log(`${colors.red}Failed on ${meta.title}: ${err.message}${colors.reset}`);
        }
    }

    console.log(`\n${colors.green}🎉 BATCH CRAWL COMPLETE!${colors.reset}`);
    await ask(`Press Enter to return to menu...`);
    showMenu();
}

async function promptCharacterCompiler() {
    console.log(`\n${colors.yellow}--- Compile Character to Markdown ---${colors.reset}`);
    const input = await ask(`Enter the DDB Character ID/URL (or press Enter to select from your roster): `);
    
    if (input.trim()) {
        runScript('downloader/character_compiler.js', [input.trim()]);
    } else {
        runScript('downloader/character_compiler.js');
    }

    await ask(`Press Enter to return to menu...`);
    showMenu();
}

// Start the Application (Check auth first, then show menu)
checkAuth().then(() => showMenu());