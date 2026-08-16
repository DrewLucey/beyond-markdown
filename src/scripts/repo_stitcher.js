/**
 * repo_stitcher.js
 * Assembles atomic Markdown files into a macro-level repository,
 * dynamically grouping outputs by the ruleset defined in their XML metadata.
 */
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { getDirname } from '../utils/paths.js';
import { askQuestion } from '../utils/cli.js';

const require = createRequire(import.meta.url);
const __dirname = getDirname(import.meta.url);

const TARGET_REPO = process.argv[2] || 'spells';
const sourceDir = path.resolve(__dirname, '../sources/repositories', TARGET_REPO);

// --- BEAUTIFUL NAMING ---
// Formats 'magic-items' -> 'Magic Items'
const formattedTitle = TARGET_REPO.split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/**
 * Assembles atomic Markdown files into a macro-level repository.
 */
async function runRepoStitcher() {
    try {
        console.log(`--- Starting Repository Stitcher for: ${formattedTitle.toUpperCase()} ---`);

        if (!fs.existsSync(sourceDir)) {
            throw new Error(`Directory not found: ${sourceDir}\nRun your fetcher/extractor first.`);
        }

        // Deliberately ignore legacy _master__ outputs if they exist
        let files = fs
            .readdirSync(sourceDir)
            .filter((f) => f.endsWith('.md') && !f.startsWith('_'));

        // --- SEMANTIC SORTING FIX ---
        // Strips the DDB numerical prefix during the sort so identical items group together alphabetically
        files.sort((a, b) => {
            const nameA = a.replace(/^\d+-/, ''); // '11-actor.md' -> 'actor.md'
            const nameB = b.replace(/^\d+-/, ''); // '1789100-actor.md' -> 'actor.md'
            return nameA.localeCompare(nameB);
        });

        console.log(`Found ${files.length} items to stitch. Analyzing ruleset metadata...\n`);

        // --- DYNAMIC RULESET SORTING ---
        // Create buckets for each ruleset encountered
        const rulesetGroups = {};

        for (let i = 0; i < files.length; i++) {
            const fileName = files[i];
            const filePath = path.join(sourceDir, fileName);

            let itemText = fs.readFileSync(filePath, 'utf-8');

            // Extract the ruleset from the ENTRY XML tag
            const rulesetMatch = itemText.match(/ruleset="([^"]+)"/i);
            const ruleset = rulesetMatch ? rulesetMatch[1] : '5e'; // Default to 5e if missing

            if (!rulesetGroups[ruleset]) {
                rulesetGroups[ruleset] = [];
            }

            rulesetGroups[ruleset].push(itemText.trim());
        }

        // --- MASTER FILE GENERATION ---
        for (const ruleset in rulesetGroups) {
            const finalFileName = `${formattedTitle} (${ruleset}).md`;
            const outputFile = path.resolve(__dirname, `../sources/repositories/${finalFileName}`);

            if (fs.existsSync(outputFile)) {
                console.log(`⚠️ WARNING: Master file '${finalFileName}' already exists.`);
                const answer = await askQuestion(`Do you want to overwrite it? (y/n): `);
                if (answer.toLowerCase() !== 'y') {
                    console.log(`Skipping ${finalFileName}...\n`);
                    continue;
                }
                console.log('Overwriting existing file...');
            }

            console.log(
                `Stitching ${rulesetGroups[ruleset].length} items for ruleset [${ruleset}]...`,
            );

            // Inject the Macro-XML Wrapper with the isolated ruleset context
            let masterContent = `<DATABASE type="${TARGET_REPO.toUpperCase()}" ruleset="${ruleset}">\n\n`;
            masterContent += rulesetGroups[ruleset].join('\n\n');
            masterContent += `\n\n</DATABASE>\n`;

            fs.writeFileSync(outputFile, masterContent);

            const stats = fs.statSync(outputFile);
            const fileSizeInMegabytes = (stats.size / (1024 * 1024)).toFixed(2);
            console.log(`✔ Success! Saved to: ${finalFileName} (${fileSizeInMegabytes} MB)\n`);
        }
    } catch (err) {
        console.error(`\nStitcher Failed: ${err.message}`);
    }
}

runRepoStitcher();
