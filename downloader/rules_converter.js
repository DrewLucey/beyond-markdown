/**
 * rules_converter.js
 * Programmatic, one-time conversion script for 2014 vs 2024 rule variants.
 * Usage: node downloader/rules_converter.js <category_or_slug> <target_ruleset>
 * Example: node downloader/rules_converter.js species 2024
 * Example: node downloader/rules_converter.js cos 5.5e
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY = process.argv[2];
const RAW_TARGET = process.argv[3]; // '5e', '2014', '5.5e', or '2024'

if (!CATEGORY || !RAW_TARGET) {
    console.error("Usage: node rules_converter.js <category_or_slug> <target_ruleset>");
    console.error("Example: node rules_converter.js species 2024");
    process.exit(1);
}

const normalizedTarget = RAW_TARGET.toLowerCase();
let TARGET_RULESET = '';
let DIRECTION = '';

// Map user shorthand to internal routing logic
if (normalizedTarget === '5e' || normalizedTarget === '2014') {
    TARGET_RULESET = '2014';
    DIRECTION = '2024to2014';
} else if (normalizedTarget === '5.5e' || normalizedTarget === '2024') {
    TARGET_RULESET = '2024';
    DIRECTION = '2014to2024';
} else {
    console.error("Invalid target ruleset. Please use '5e', '2014', '5.5e', or '2024'.");
    process.exit(1);
}

// --- CHECK FOR ALREADY CONVERTED SLUGS ---
if (CATEGORY.endsWith('-x-2014') || CATEGORY.endsWith('-x-2024')) {
    console.log(`\n✅ The source "${CATEGORY}" is already a converted variant.`);
    console.log(`No conversion necessary!\n`);
    process.exit(0);
}

// --- DETERMINE MODE (REPO VS SOURCEBOOK) AND LOAD MAP ---
const mapFilePath = path.resolve(__dirname, '../sources/ruleset_map.json');
let rulesMap = {};
let mapEntry = null;

if (fs.existsSync(mapFilePath)) {
    try {
        rulesMap = JSON.parse(fs.readFileSync(mapFilePath, 'utf-8'));
        mapEntry = rulesMap[CATEGORY];
        
        if (mapEntry && mapEntry.ruleset) {
            let mapRuleset = mapEntry.ruleset.toLowerCase();
            let normalizedMapRuleset = (mapRuleset.includes('5.5') || mapRuleset.includes('2024')) ? '2024' : '2014';
            
            if (normalizedMapRuleset === TARGET_RULESET) {
                console.log(`\n✅ The source "${CATEGORY}" is already formatted for the ${TARGET_RULESET} ruleset.`);
                console.log(`No conversion necessary!\n`);
                process.exit(0);
            }
        }
    } catch (e) {
        console.warn("Could not parse ruleset_map.json for ruleset validation.");
    }
}

let mode = 'unknown';
const repoDir = path.resolve(__dirname, `../sources/repositories/${CATEGORY}`);
if (fs.existsSync(repoDir) && fs.statSync(repoDir).isDirectory()) {
    mode = 'repo';
} else {
    mode = 'sourcebook';
}

// --- DYNAMIC URN CROSS-REFERENCE MAPPING ---
const URN_MAP_2014_TO_2024 = {};
const URN_MAP_2024_TO_2014 = {};

function buildUrnMap() {
    const reposDir = path.resolve(__dirname, '../sources/repositories');
    if (!fs.existsSync(reposDir)) return;

    // Grab all raw repo folders, ignoring our generated converted variants (e.g. species_2024)
    const categories = fs.readdirSync(reposDir).filter(f => {
        const fullPath = path.join(reposDir, f);
        return fs.statSync(fullPath).isDirectory() && !f.includes('_');
    });
    
    let matchedPairs = 0;

    categories.forEach(cat => {
        const catDir = path.join(reposDir, cat);
        const files = fs.readdirSync(catDir).filter(f => f.endsWith('.md') && !f.startsWith('_'));
        const nameToRefs = {};

        files.forEach(file => {
            const content = fs.readFileSync(path.join(catDir, file), 'utf-8');
            const entryMatch = content.match(/<ENTRY([^>]*)>/);
            if (!entryMatch) return;
            
            const attrs = entryMatch[1];
            const nameMatch = attrs.match(/name="([^"]+)"/i);
            const rulesetMatch = attrs.match(/ruleset="([^"]+)"/i);
            // Matches the URN in the header: {#ref:category:slug}
            const urnMatch = content.match(/\{#(ref:[^:]+:[^}]+)\}/i);

            if (nameMatch && rulesetMatch && urnMatch) {
                // Standardize the name (strip "(Legacy)" so 2014 and 2024 items match perfectly)
                let name = nameMatch[1].toLowerCase().replace(/\s*\(legacy\)/gi, '').trim();
                let ruleset = rulesetMatch[1].toLowerCase();
                ruleset = (ruleset.includes('5.5') || ruleset.includes('2024')) ? '2024' : '2014';
                let urn = urnMatch[1].toLowerCase();

                if (!nameToRefs[name]) nameToRefs[name] = {};
                nameToRefs[name][ruleset] = urn;
            }
        });

        // Pair them up in our global translation dictionaries
        for (const [name, refs] of Object.entries(nameToRefs)) {
            if (refs['2014'] && refs['2024']) {
                URN_MAP_2014_TO_2024[refs['2014']] = refs['2024'];
                URN_MAP_2024_TO_2014[refs['2024']] = refs['2014'];
                matchedPairs++;
            }
        }
    });

    console.log(`\n🔍 Dynamically mapped ${matchedPairs} cross-version URN links from local repositories!`);
}

// Trigger the map build immediately
buildUrnMap();

// Programmatic Weapon Mastery Dictionary Map (Complete SRD 5.2.1 List)
const WEAPON_MASTERY_MAP = {
    'club': 'Slow', 'dagger': 'Nick', 'greatclub': 'Push', 'handaxe': 'Vex', 
    'javelin': 'Slow', 'light hammer': 'Nick', 'mace': 'Sap', 'quarterstaff': 'Topple', 
    'sickle': 'Nick', 'spear': 'Sap', 'light crossbow': 'Slow', 'dart': 'Vex', 
    'shortbow': 'Vex', 'sling': 'Slow', 'battleaxe': 'Topple', 'flail': 'Sap', 
    'glaive': 'Graze', 'greataxe': 'Cleave', 'greatsword': 'Graze', 'halberd': 'Cleave', 
    'lance': 'Topple', 'longsword': 'Sap', 'maul': 'Topple', 'morningstar': 'Sap', 
    'pike': 'Push', 'rapier': 'Vex', 'scimitar': 'Nick', 'shortsword': 'Vex', 
    'trident': 'Topple', 'war pick': 'Sap', 'warhammer': 'Topple', 'whip': 'Slow',
    'blowgun': 'Vex', 'hand crossbow': 'Vex', 'heavy crossbow': 'Push', 'longbow': 'Slow',
    'musket': 'Slow', 'pistol': 'Vex'
};

// Omitted Monsters Mapping (SRD 5.2.1)
const OMITTED_MONSTERS = {
    'duergar': 'Spy', 'drow': 'Priest Acolyte', 'elf, drow': 'Priest Acolyte',
    'deep gnome': 'Scout', 'svirfneblin': 'Scout', 'gnome, deep (svirfneblin)': 'Scout',
    'lizardfolk': 'Scout', 'orc': 'Tough'
};

// Renamed Monsters Mapping (SRD 5.2.1)
const RENAMED_MONSTERS = {
    'azer': 'Azer Sentinel', 'bugbear': 'Bugbear Warrior', 'centaur': 'Centaur Trooper',
    'gnoll': 'Gnoll Warrior', 'goblin': 'Goblin Warrior', 'hobgoblin': 'Hobgoblin Warrior',
    'kobold': 'Kobold Warrior', 'merfolk': 'Merfolk Skirmisher', 'minotaur': 'Minotaur of Baphomet',
    'acolyte': 'Priest Acolyte', 'sahuagin': 'Sahuagin Warrior', 'thug': 'Tough',
    'veteran': 'Warrior Veteran', 'quipper': 'Piranha', 'sea horse': 'Seahorse',
    'flying sword': 'Animated Flying Sword', 'rug of smothering': 'Animated Rug of Smothering',
    'cult fanatic': 'Cultist Fanatic', 'half-red dragon veteran': 'Half-Dragon',
    'gynosphinx': 'Sphinx of Lore', 'androsphinx': 'Sphinx of Valor',
    'tribal warrior': 'Warrior Infantry', 'giant sea horse': 'Giant Seahorse',
    'giant poisonous snake': 'Giant Venomous Snake', 'swarm of quippers': 'Swarm of Piranhas',
    'swarm of poisonous snakes': 'Swarm of Venomous Snakes', 'poisonous snake': 'Venomous Snake'
};

// Dictionary of Regex Replacements for SRD 5.2.1 wording updates
const GLOSSARY_TERMS_2024 = [
    { rx: /\bMelee Weapon Attack:/gi, rep: "Melee Attack Roll:" },
    { rx: /\bRanged Weapon Attack:/gi, rep: "Ranged Attack Roll:" },
    { rx: /\bMelee or Ranged Weapon Attack:/gi, rep: "Melee or Ranged Attack Roll:" },
    { rx: /\bMelee Spell Attack:/gi, rep: "Melee Spell Attack Roll:" },
    { rx: /\bRanged Spell Attack:/gi, rep: "Ranged Spell Attack Roll:" },
    { rx: /\bexhaustion level 1\b/gi, rep: "Exhaustion (1 Stack: -1 to D20 tests/DCs)" },
    { rx: /\bexhaustion level 2\b/gi, rep: "Exhaustion (2 Stacks: -2 to D20 tests/DCs, Speed halved)" },
    { rx: /\bexhaustion level 3\b/gi, rep: "Exhaustion (3 Stacks: -3 to D20 tests/DCs)" },
    { rx: /\bexhaustion level 4\b/gi, rep: "Exhaustion (4 Stacks: -4 to D20 tests/DCs)" },
    { rx: /\bexhaustion level 5\b/gi, rep: "Exhaustion (5 Stacks: -5 to D20 tests/DCs, Speed reduced to 0)" },
    { rx: /\bexhaustion level 6\b/gi, rep: "Exhaustion (6 Stacks: Death)" },
    { rx: /\bFeeblemind\b/gi, rep: "Befuddlement" },
    { rx: /\bBranding Smite\b/gi, rep: "Shining Smite" },
    { rx: /\barrow of slaying\b/gi, rep: "Ammunition of Slaying" },
    { rx: /\bOrb of Dragonkind\b/gi, rep: "Dragon Orb" },
    { rx: /\biron bands of binding\b/gi, rep: "Iron Bands" },
    { rx: /\bDeck of Many Things\b/gi, rep: "Mysterious Deck" },
    { rx: /\bdrow poison\b/gi, rep: "Spider's Sting" },
    { rx: /\bpoison darts\b/gi, rep: "Poisoned darts" },
    { rx: /\bpoison needle\b/gi, rep: "Poisoned needle" },
    { rx: /\brolling sphere\b/gi, rep: "Rolling stone" },
    { rx: /\bWay of the Open Hand\b/gi, rep: "Warrior of the Open Hand" },
    { rx: /\bImproved Divine Smite\b/gi, rep: "Radiant Strikes" },
    { rx: /\bDraconic Bloodline\b/gi, rep: "Draconic Sorcery" },
    { rx: /\bSchool of Evocation\b/gi, rep: "Evoker" },
    { rx: /\bInspiration\b(?! Point)/g, rep: "Heroic Inspiration" }, 
    { rx: /\bKi(?= point| feature|\b)/gi, rep: "Focus" },
    { rx: /\bRace\b/g, rep: "Species" },
    { rx: /\bRaces\b/g, rep: "Species" },
    { rx: /\bSubrace\b/g, rep: "Subspecies" },
    { rx: /\bRacial\b/g, rep: "Species" },
    
    // Condition & Glossary Upgrades (Contextual Injection)
    // Uses negative lookahead to ignore Proper Nouns/Titles (e.g. "Invisible Mountain") and avoids double parenthesis injections.
    { rx: /\bSurprised\b(?!(?:[\s\*_"'”’])+(?:[A-Z][a-z]|\())/gi, rep: "$& (Disadvantage on Initiative)" },
    { rx: /\bHeavily Obscured\b(?!(?:[\s\*_"'”’])+(?:[A-Z][a-z]|\())/gi, rep: "$& (Blinded condition)" },
    { rx: /\bLightly Obscured\b(?!(?:[\s\*_"'”’])+(?:[A-Z][a-z]|\())/gi, rep: "$& (Disadvantage on Perception)" },
    { rx: /\bStable\b(?!(?:[\s\*_"'”’])+(?:[A-Z][a-z]|\())/gi, rep: "$& (0 HP, breathing, no death saves needed)" },
    { rx: /\bIncapacitated\b(?!(?:[\s\*_"'”’])+(?:[A-Z][a-z]|\())/gi, rep: "$& (Can't take Actions or Reactions, Concentration broken)" },
    { rx: /\bInvisible\b(?!(?:[\s\*_"'”’])+(?:[A-Z][a-z]|\())/gi, rep: "$& (Concealed, attacks have Advantage, enemy attacks have Disadvantage)" },

    { rx: /\ba short rest\b/gi, rep: "a Short Rest" },
    { rx: /\ba long rest\b/gi, rep: "a Long Rest" },
    { rx: /\barmor proficiency\b/gi, rep: "Armor Training" },
    { rx: /\bHit Dice\b/gi, rep: "Hit Point Dice" },
    { rx: /\bUse an Object action\b/gi, rep: "Utilize Action" },
    { rx: /\bCast a Spell action\b/gi, rep: "Magic Action" },
    { rx: /\bWalking Speed\b/gi, rep: "Speed" },
    { rx: /\bbonus action\b/g, rep: "Bonus Action" },
    { rx: /\breaction\b/g, rep: "Reaction" },
    { rx: /\btemporary hit points\b/g, rep: "Temporary Hit Points" },
    { rx: /\bhit points\b/g, rep: "Hit Points" },
    { rx: /\bsaving throw\b/g, rep: "Saving Throw" },
    { rx: /\bdifficulty class\b/g, rep: "Difficulty Class" },
    { rx: /\bpassive perception\b/g, rep: "Passive Perception" },
    { rx: /\bproficiency bonus\b/g, rep: "Proficiency Bonus" }
];

function convertWording(text, direction) {
    let result = text;
    if (direction === '2014to2024') {
        GLOSSARY_TERMS_2024.forEach(({ rx, rep }) => {
            result = result.replace(rx, rep);
        });
    } else {
        result = result.replace(/Exhaustion \(\d+ Stack.*?\)/gi, "Exhaustion level 1");
        result = result.replace(/Heroic Inspiration/gi, "Inspiration");
        result = result.replace(/Species/gi, "Race");
        result = result.replace(/Focus point/gi, "Ki point");
        result = result.replace(/Armor Training/gi, "Armor Proficiency");
    }

    // --- URN CROSS-REFERENCE REPLACEMENTS ---
    // Surgically swaps internal `ref:` tags across your generated files based on our dynamic map
    const urnMap = direction === '2014to2024' ? URN_MAP_2014_TO_2024 : URN_MAP_2024_TO_2014;
    
    // Finds and captures (#ref:category:slug) or {#ref:category:slug}
    result = result.replace(/([({])#(ref:[a-z0-9-]+:[a-z0-9-]+)([)}])/gi, (match, prefix, urn, suffix) => {
        const urnLower = urn.toLowerCase();
        if (urnMap[urnLower]) {
            return `${prefix}#${urnMap[urnLower]}${suffix}`;
        }
        return match; 
    });

    return result;
}

function processConversion() {
    console.log(`--- Running Rule Conversion Mapping for ${CATEGORY.toUpperCase()} (${DIRECTION}) ---`);

    if (mode === 'repo') {
        // --- REPOSITORY (ATOMIC FILES) CONVERSION ---
        const outputDir = path.resolve(__dirname, `../sources/repositories/${CATEGORY}_${TARGET_RULESET}`);
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        const files = fs.readdirSync(repoDir).filter(f => f.endsWith('.md') && !f.startsWith('_'));
        console.log(`Mode: REPOSITORY. Scanning ${files.length} files in ${repoDir}...`);
        
        let convertedCount = 0;

        files.forEach(file => {
            const filePath = path.join(repoDir, file);
            let content = fs.readFileSync(filePath, 'utf-8');

            const entryMatch = content.match(/<ENTRY([^>]*)>([\s\S]*?)<\/ENTRY>/);
            if (!entryMatch) {
                console.warn(`  > Skipped ${file} (No valid <ENTRY> wrapper found)`);
                return;
            }

            let attrs = entryMatch[1];
            let innerBody = entryMatch[2];

            if (DIRECTION === '2014to2024') {
                if (CATEGORY === 'species' || CATEGORY === 'races') {
                    innerBody = innerBody.replace(/\*\*Ability Score Increase\*\*.*?(\n|$)/gi, '');
                    innerBody = "> **[MIGRATION ALERT]:** *Ability Score Increases must be selected via custom 2024 background profiles.*\n\n" + innerBody;
                }
                if (CATEGORY === 'items' || CATEGORY === 'equipment') {
                    Object.keys(WEAPON_MASTERY_MAP).forEach(weapon => {
                        const regex = new RegExp(`name="${weapon}"`, 'i');
                        if (content.match(regex)) {
                            innerBody = `> **Weapon Mastery (2024):** ${WEAPON_MASTERY_MAP[weapon]}\n\n` + innerBody;
                        }
                    });
                }
                if (CATEGORY === 'monsters') {
                    const nameMatch = attrs.match(/name="([^"]+)"/i);
                    if (nameMatch) {
                        const mName = nameMatch[1].toLowerCase();
                        if (OMITTED_MONSTERS[mName]) {
                            innerBody = `> **[MIGRATION ALERT]:** *This monster stat block was omitted in the 2024 SRD 5.2.1. The official recommended replacement is the **${OMITTED_MONSTERS[mName]}**.*\n\n` + innerBody;
                        } else if (RENAMED_MONSTERS[mName]) {
                            innerBody = `> **[MIGRATION ALERT]:** *This creature was renamed to **${RENAMED_MONSTERS[mName]}** in the 2024 SRD 5.2.1.*\n\n` + innerBody;
                        }
                    }
                }
                innerBody = convertWording(innerBody, '2014to2024');
            } else {
                innerBody = convertWording(innerBody, '2024to2014');
            }

            let updatedAttrs = attrs;
            if (TARGET_RULESET === '2024') updatedAttrs = attrs.replace(/ruleset="[^"]+"/i, 'ruleset="2024"');
            else if (TARGET_RULESET === '2014') updatedAttrs = attrs.replace(/ruleset="[^"]+"/i, 'ruleset="2014"');

            const finalOutput = `<ENTRY${updatedAttrs}>\n${innerBody.trim()}\n</ENTRY>\n`;
            fs.writeFileSync(path.join(outputDir, file), finalOutput);
            convertedCount++;
        });

        console.log(`\n✅ Done! Saved ${convertedCount} programmatically converted copies to:`);
        console.log(`📁 ${outputDir}`);

    } else if (mode === 'sourcebook') {
        // --- SOURCEBOOK (STITCHED MACRO FILE) CONVERSION ---
        if (!mapEntry) {
            console.error(`Could not find "${CATEGORY}" in ruleset_map.json. Cannot convert sourcebook.`);
            process.exit(1);
        }

        const safeTitle = mapEntry.title.replace(/[<>:"/\\|?*]+/g, '').trim();
        const escapedTitle = safeTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Matches exact clean title, optionally followed by a ruleset marker like (5e) or (2024), ending in .md
        const titleRegex = new RegExp(`^${escapedTitle}(?: \\(.*\\))?\\.md$`, 'i');
        
        let sourceFile = null;
        let foundDir = null;

        // Search the root and ruleset-specific subdirectories
        const searchDirs = [
            path.resolve(__dirname, '../sources'),
            path.resolve(__dirname, '../sources/5e'),
            path.resolve(__dirname, '../sources/5.5e')
        ];

        for (const dir of searchDirs) {
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
                const match = files.find(f => titleRegex.test(f));
                if (match) {
                    sourceFile = match;
                    foundDir = dir;
                    break;
                }
            }
        }

        if (!sourceFile) {
            console.error(`Could not find a stitched file matching "${mapEntry.title}" in sources/, sources/5e/, or sources/5.5e/`);
            console.error(`Ensure you have run the stitcher on this sourcebook first.`);
            process.exit(1);
        }

        const filePath = path.join(foundDir, sourceFile);
        console.log(`Mode: SOURCEBOOK. Processing stitched macro file: ${sourceFile}`);
        
        let content = fs.readFileSync(filePath, 'utf-8');
        
        // Apply prose translation
        content = convertWording(content, DIRECTION);

        // --- UPDATE INTERNAL HEADING IDS AND LINKS TO THE NEW SLUG ---
        const newSlug = `${CATEGORY}-x-${TARGET_RULESET}`;
        const safeCategory = CATEGORY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Replace heading anchors: {#cos: or {#cos}
        const headingAnchorRegex = new RegExp(`\\{#${safeCategory}(:|\\})`, 'gi');
        content = content.replace(headingAnchorRegex, `{#${newSlug}$1`);
        
        // Replace link references: (#cos: or (#cos) or (#cos space)
        const linkAnchorRegex = new RegExp(`\\(#${safeCategory}(:|\\)|\\s)`, 'gi');
        content = content.replace(linkAnchorRegex, `(#${newSlug}$1`);

        // Update <SOURCEBOOK id="COS"> to <SOURCEBOOK id="COS-x-2024">
        const sourcebookTagRegex = new RegExp(`(<SOURCEBOOK[^>]*id=")${safeCategory}(")`, 'i');
        content = content.replace(sourcebookTagRegex, `$1${newSlug}$2`);

        // Update ruleset="5e" to ruleset="5.5e" within SOURCEBOOK tag
        const newRulesetName = TARGET_RULESET === '2024' ? '5.5e' : '5e';
        content = content.replace(/(<SOURCEBOOK[^>]*ruleset=")[^"]+(")/i, `$1${newRulesetName}$2`);
        // ------------------------------------------------------------------

        // Save to new file named with the new ruleset version
        const newFileName = `${mapEntry.title} (${newRulesetName}).md`;
        const newOutDir = path.resolve(__dirname, `../sources/${newRulesetName}`);
        
        if (!fs.existsSync(newOutDir)) fs.mkdirSync(newOutDir, { recursive: true });
        
        const newFilePath = path.join(newOutDir, newFileName);
        
        fs.writeFileSync(newFilePath, content);

        console.log(`\n✅ Done! Successfully converted sourcebook prose and internal links.`);
        console.log(`📁 Saved to: ${newFilePath}`);
    }
}

processConversion();