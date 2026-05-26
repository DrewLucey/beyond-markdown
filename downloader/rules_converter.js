/**
 * rules_converter.js
 * Programmatic, one-time conversion script for 2014 vs 2024 rule variants.
 * Usage: node downloader/rules_converter.js <category> <direction>
 * Example: node downloader/rules_converter.js species 2014to2024
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY = process.argv[2];
const DIRECTION = process.argv[3]; // '2014to2024' or '2024to2014'

if (!CATEGORY || !DIRECTION) {
    console.error("Usage: node rules_converter.js <category> <direction>");
    console.error("Example: node rules_converter.js species 2014to2024");
    process.exit(1);
}

const inputDir = path.resolve(__dirname, `../sources/repositories/${CATEGORY}`);
const outputSuffix = DIRECTION === '2014to2024' ? '2024' : '2014';
const outputDir = path.resolve(__dirname, `../sources/repositories/${CATEGORY}_${outputSuffix}`);

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Programmatic Weapon Mastery Dictionary Map
const WEAPON_MASTERY_MAP = {
    'dagger': 'Nick',
    'light hammer': 'Nick',
    'scimitar': 'Nick',
    'sickle': 'Nick',
    'club': 'Slow',
    'javelin': 'Slow',
    'spear': 'Slow',
    'longsword': 'Sap',
    'mace': 'Sap',
    'quarterstaff': 'Topple',
    'battleaxe': 'Topple',
    'trident': 'Topple',
    'warhammer': 'Topple',
    'greatsword': 'Graze',
    'maul': 'Topple',
    'halberd': 'Cleave',
    'shortbow': 'Vex',
    'longbow': 'Slow',
    'hand crossbow': 'Vex',
    'light crossbow': 'Vex'
};

function convertWording(text, direction) {
    let result = text;
    if (direction === '2014to2024') {
        // 1. Programmatic Exhaustion translation tracking
        result = result.replace(/exhaustion level 1/gi, "Exhaustion (1 Stack: -1 to D20 tests/DCs)");
        result = result.replace(/exhaustion level 2/gi, "Exhaustion (2 Stacks: -2 to D20 tests/DCs, Speed halved)");
        result = result.replace(/exhaustion level 3/gi, "Exhaustion (3 Stacks: -3 to D20 tests/DCs)");
        result = result.replace(/exhaustion level 4/gi, "Exhaustion (4 Stacks: -4 to D20 tests/DCs)");
        result = result.replace(/exhaustion level 5/gi, "Exhaustion (5 Stacks: -5 to D20 tests/DCs, Speed reduced to 0)");
        result = result.replace(/exhaustion level 6/gi, "Exhaustion (6 Stacks: Death)");
        
        // 2. Standard Short Rest mechanical updates
        result = result.replace(/after a short rest/gi, "after a Short Rest (minimum 1 hour of downtime)");
    } else {
        // Reverse translation mapping (2024 back to 2014)
        result = result.replace(/Exhaustion \(\d+ Stack.*?\)/gi, "Exhaustion level 1");
    }
    return result;
}

function processConversion() {
    if (!fs.existsSync(inputDir)) {
        console.error(`Input repository source directory not found: ${inputDir}`);
        console.error(`Make sure you have run the fetch/extract script for "${CATEGORY}" first.`);
        return;
    }

    const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.md') && !f.startsWith('_'));
    console.log(`--- Running Rule Conversion Mapping for ${CATEGORY.toUpperCase()} (${DIRECTION}) ---`);
    console.log(`Scanning ${files.length} files in ${inputDir}...`);
    
    let convertedCount = 0;

    files.forEach(file => {
        const filePath = path.join(inputDir, file);
        let content = fs.readFileSync(filePath, 'utf-8');

        // Parse outer XML wrapper bounds cleanly to avoid corrupting the header
        const entryMatch = content.match(/<ENTRY([^>]*)>([\s\S]*?)<\/ENTRY>/);
        if (!entryMatch) {
            console.warn(`  > Skipped ${file} (No valid <ENTRY> wrapper found)`);
            return;
        }

        let attrs = entryMatch[1];
        let innerBody = entryMatch[2];

        if (DIRECTION === '2014to2024') {
            // Rule A: Strip out hardcoded ASIs from species profiles so Backgrounds can capture them
            if (CATEGORY === 'species' || CATEGORY === 'races') {
                innerBody = innerBody.replace(/\*\*Ability Score Increase\*\*.*?(\n|$)/gi, '');
                innerBody = "> **[MIGRATION ALERT]:** *Ability Score Increases must be selected via custom 2024 background profiles.*\n\n" + innerBody;
            }

            // Rule B: Inject programmatically calculated Weapon Masteries into equipment lines
            if (CATEGORY === 'items' || CATEGORY === 'equipment') {
                Object.keys(WEAPON_MASTERY_MAP).forEach(weapon => {
                    // Match the specific weapon name precisely to avoid false positives
                    const regex = new RegExp(`name="${weapon}"`, 'i');
                    if (content.match(regex)) {
                        innerBody = `> **Weapon Mastery (2024):** ${WEAPON_MASTERY_MAP[weapon]}\n\n` + innerBody;
                    }
                });
            }
            
            // Adjust semantic wording structures (Exhaustion, Short Rests, etc.)
            innerBody = convertWording(innerBody, '2014to2024');

        } else {
            // Inverse conversion routine (2024 back to 2014)
            innerBody = convertWording(innerBody, '2024to2014');
        }

        // Rebuild file package output
        const finalOutput = `<ENTRY${attrs}>\n${innerBody.trim()}\n</ENTRY>\n`;
        fs.writeFileSync(path.join(outputDir, file), finalOutput);
        convertedCount++;
    });

    console.log(`\n✅ Done! Saved ${convertedCount} programmatically converted copies to:`);
    console.log(`📁 ${outputDir}`);
}

processConversion();