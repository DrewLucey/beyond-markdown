/**
 * index.js
 * The central Interactive Terminal UI (TUI) for the Beyond-Markdown pipeline.
 */
import inquirer from 'inquirer';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to spawn scripts and pipe their output directly to the terminal
function runScript(scriptPath, args = []) {
    return new Promise((resolve, reject) => {
        console.log(`\nExecuting: node ${path.basename(scriptPath)} ${args.join(' ')}\n`);
        
        const child = spawn('node', [scriptPath, ...args], { stdio: 'inherit' });

        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Process exited with code ${code}`));
        });
    });
}

// Helper to read owned books from the library map
function getOwnedSourcebooks() {
    const mapFilePath = path.join(__dirname, 'sources', 'ruleset_map.json');
    if (!fs.existsSync(mapFilePath)) return [];
    
    try {
        const map = JSON.parse(fs.readFileSync(mapFilePath, 'utf-8'));
        const owned = [];
        for (const [slug, data] of Object.entries(map)) {
            if (data.isOwned) {
                owned.push({ name: `${data.title} (${data.ruleset})`, value: slug });
            }
        }
        return owned.sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
        return [];
    }
}

async function mainMenu() {
    console.clear();
    console.log("Beyond-Markdown Pipeline Orchestrator");
    console.log("---------------------------------------\n");

    const { action } = await inquirer.prompt([
        {
            type: 'select',
            name: 'action',
            message: 'Select an operation:',
            choices: [
                { name: '1. Extract Sourcebook/Adventure', value: 'extract_single' },
                { name: '2. Extract ALL Sourcebooks/Adventures', value: 'extract_all' },
                { name: '3. Extract Rules', value: 'extract_rules' },
                { name: '4. Convert Sourcebook/Adventure - 5e (2014) <-> 5.5e (2024)', value: 'convert' },
                { name: '5. Extract a Character', value: 'character' },
                new inquirer.Separator(),
                { name: 'Exit', value: 'exit' }
            ]
        }
    ]);

    try {
        switch (action) {
            case 'extract_single':
                await handleExtractSingle();
                break;
            case 'extract_all':
                await handleExtractAll();
                break;
            case 'extract_rules':
                await handleExtractRules();
                break;
            case 'convert':
                await handleConvert();
                break;
            case 'character':
                await handleCharacter();
                break;
            case 'exit':
                console.log("\nExiting.\n");
                process.exit(0);
        }
    } catch (err) {
        console.error(`\nExecution Failed: ${err.message}`);
    }

    // Loop back to main menu after task completion
    console.log("\n---------------------------------------");
    const { continueChoice } = await inquirer.prompt([
        { type: 'confirm', name: 'continueChoice', message: 'Return to Main Menu?', default: true }
    ]);
    
    if (continueChoice) mainMenu();
    else process.exit(0);
}

// --- SUB-MENUS & PROMPTS ---

async function handleExtractSingle() {
    const choices = getOwnedSourcebooks();
    
    if (choices.length === 0) {
        console.log("\nNo owned sourcebooks found. Please run 'node downloader/library.js' first to map your library.\n");
        return;
    }

    const { slug } = await inquirer.prompt([
        { 
            type: 'select', 
            name: 'slug', 
            message: 'Select the sourcebook to extract and stitch:',
            choices: choices
        }
    ]);
    
    await runScript(path.join(__dirname, 'downloader/extract.js'), [slug]);
    await runScript(path.join(__dirname, 'downloader/stitcher.js'), [slug]);
}

async function handleExtractAll() {
    const choices = getOwnedSourcebooks();
    
    if (choices.length === 0) {
        console.log("\nNo owned sourcebooks found. Please run 'node downloader/library.js' first to map your library.\n");
        return;
    }

    const { confirm } = await inquirer.prompt([
        { 
            type: 'confirm', 
            name: 'confirm', 
            message: `Are you sure you want to extract and stitch ALL ${choices.length} sourcebooks? This will take significant time.`, 
            default: false 
        }
    ]);

    if (!confirm) return;

    for (const choice of choices) {
        console.log(`\n--- Processing: ${choice.name} ---`);
        try {
            await runScript(path.join(__dirname, 'downloader/extract.js'), [choice.value]);
            await runScript(path.join(__dirname, 'downloader/stitcher.js'), [choice.value]);
        } catch (e) {
            console.error(`Failed processing ${choice.value}: ${e.message}`);
        }
    }
}

async function handleExtractRules() {
    const { category } = await inquirer.prompt([
        { 
            type: 'select', 
            name: 'category', 
            message: 'Select the rules repository to extract and stitch:',
            choices: [
                { name: 'Classes', value: 'classes' },
                { name: 'Backgrounds', value: 'backgrounds' },
                { name: 'Species', value: 'species' },
                { name: 'Feats', value: 'feats' },
                { name: 'Spells', value: 'spells' },
                { name: 'Equipment', value: 'equipment' },
                { name: 'Magic Items', value: 'magic-items' },
                { name: 'Monsters', value: 'monsters' }
            ]
        }
    ]);
    
    await runScript(path.join(__dirname, 'downloader/bulk_extract.js'), [category]);
    await runScript(path.join(__dirname, 'downloader/repo_stitcher.js'), [category]);
}

async function handleConvert() {
    const { target, ruleset } = await inquirer.prompt([
        { type: 'input', name: 'target', message: 'Enter the category or book slug to convert (e.g., species, cos):' },
        { type: 'select', name: 'ruleset', message: 'Target Ruleset:', choices: ['2024', '2014'] }
    ]);
    
    if (!target) return;
    await runScript(path.join(__dirname, 'downloader/rules_converter.js'), [target.trim(), ruleset]);
}

async function handleCharacter() {
    await runScript(path.join(__dirname, 'downloader/character_compiler.js'));
}

// --- STARTUP LOGIC ---
async function init() {
    console.clear();
    console.log("Beyond-Markdown Pipeline Orchestrator");
    console.log("---------------------------------------\n");
    console.log("Initializing: Updating library metadata...\n");
    
    try {
        await runScript(path.join(__dirname, 'downloader/library.js'));
    } catch (err) {
        console.error(`\nFailed to update library metadata: ${err.message}\n`);
    }
    
    console.log("\n---------------------------------------");
    await inquirer.prompt([
        { type: 'input', name: 'enter', message: 'Press Enter to continue to the Main Menu...' }
    ]);
    
    mainMenu();
}

// Start the app
init();