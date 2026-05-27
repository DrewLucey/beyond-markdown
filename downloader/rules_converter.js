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

// Programmatic Weapon Mastery Dictionary Map (Complete SRD 5.2.1 List)
const WEAPON_MASTERY_MAP = {
    // Simple Melee
    'club': 'Slow', 'dagger': 'Nick', 'greatclub': 'Push', 'handaxe': 'Vex', 
    'javelin': 'Slow', 'light hammer': 'Nick', 'mace': 'Sap', 'quarterstaff': 'Topple', 
    'sickle': 'Nick', 'spear': 'Sap',
    // Simple Ranged
    'light crossbow': 'Slow', 'dart': 'Vex', 'shortbow': 'Vex', 'sling': 'Slow',
    // Martial Melee
    'battleaxe': 'Topple', 'flail': 'Sap', 'glaive': 'Graze', 'greataxe': 'Cleave', 
    'greatsword': 'Graze', 'halberd': 'Cleave', 'lance': 'Topple', 'longsword': 'Sap', 
    'maul': 'Topple', 'morningstar': 'Sap', 'pike': 'Push', 'rapier': 'Vex', 
    'scimitar': 'Nick', 'shortsword': 'Vex', 'trident': 'Topple', 'war pick': 'Sap', 
    'warhammer': 'Topple', 'whip': 'Slow',
    // Martial Ranged
    'blowgun': 'Vex', 'hand crossbow': 'Vex', 'heavy crossbow': 'Push', 'longbow': 'Slow',
    // Firearms
    'musket': 'Slow', 'pistol': 'Vex'
};

// Omitted Monsters Mapping (SRD 5.2.1)
const OMITTED_MONSTERS = {
    'duergar': 'Spy',
    'drow': 'Priest Acolyte',
    'elf, drow': 'Priest Acolyte',
    'deep gnome': 'Scout',
    'svirfneblin': 'Scout',
    'gnome, deep (svirfneblin)': 'Scout',
    'lizardfolk': 'Scout',
    'orc': 'Tough'
};

// Renamed Monsters Mapping (SRD 5.2.1)
const RENAMED_MONSTERS = {
    'azer': 'Azer Sentinel',
    'bugbear': 'Bugbear Warrior',
    'centaur': 'Centaur Trooper',
    'gnoll': 'Gnoll Warrior',
    'goblin': 'Goblin Warrior',
    'hobgoblin': 'Hobgoblin Warrior',
    'kobold': 'Kobold Warrior',
    'merfolk': 'Merfolk Skirmisher',
    'minotaur': 'Minotaur of Baphomet',
    'acolyte': 'Priest Acolyte',
    'sahuagin': 'Sahuagin Warrior',
    'thug': 'Tough',
    'veteran': 'Warrior Veteran',
    'quipper': 'Piranha',
    'sea horse': 'Seahorse',
    'flying sword': 'Animated Flying Sword',
    'rug of smothering': 'Animated Rug of Smothering',
    'cult fanatic': 'Cultist Fanatic',
    'half-red dragon veteran': 'Half-Dragon',
    'gynosphinx': 'Sphinx of Lore',
    'androsphinx': 'Sphinx of Valor',
    'tribal warrior': 'Warrior Infantry',
    'giant sea horse': 'Giant Seahorse',
    'giant poisonous snake': 'Giant Venomous Snake',
    'swarm of quippers': 'Swarm of Piranhas',
    'swarm of poisonous snakes': 'Swarm of Venomous Snakes',
    'poisonous snake': 'Venomous Snake'
};

// Dictionary of Regex Replacements for SRD 5.2.1 wording updates
const GLOSSARY_TERMS_2024 = [
    // Action Economy & Attack Rolls
    { rx: /\bMelee Weapon Attack:/gi, rep: "Melee Attack Roll:" },
    { rx: /\bRanged Weapon Attack:/gi, rep: "Ranged Attack Roll:" },
    { rx: /\bMelee or Ranged Weapon Attack:/gi, rep: "Melee or Ranged Attack Roll:" },
    { rx: /\bMelee Spell Attack:/gi, rep: "Melee Spell Attack Roll:" },
    { rx: /\bRanged Spell Attack:/gi, rep: "Ranged Spell Attack Roll:" },

    // Exhaustion Overhaul
    { rx: /\bexhaustion level 1\b/gi, rep: "Exhaustion (1 Stack: -1 to D20 tests/DCs)" },
    { rx: /\bexhaustion level 2\b/gi, rep: "Exhaustion (2 Stacks: -2 to D20 tests/DCs, Speed halved)" },
    { rx: /\bexhaustion level 3\b/gi, rep: "Exhaustion (3 Stacks: -3 to D20 tests/DCs)" },
    { rx: /\bexhaustion level 4\b/gi, rep: "Exhaustion (4 Stacks: -4 to D20 tests/DCs)" },
    { rx: /\bexhaustion level 5\b/gi, rep: "Exhaustion (5 Stacks: -5 to D20 tests/DCs, Speed reduced to 0)" },
    { rx: /\bexhaustion level 6\b/gi, rep: "Exhaustion (6 Stacks: Death)" },
    
    // Items, Spells, and Gear Renames
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

    // System Renames (Classes & Mechanics)
    { rx: /\bWay of the Open Hand\b/gi, rep: "Warrior of the Open Hand" },
    { rx: /\bImproved Divine Smite\b/gi, rep: "Radiant Strikes" },
    { rx: /\bDraconic Bloodline\b/gi, rep: "Draconic Sorcery" },
    { rx: /\bSchool of Evocation\b/gi, rep: "Evoker" },
    { rx: /\bInspiration\b(?! Point)/g, rep: "Heroic Inspiration" }, // Ignores Bardic Inspiration
    { rx: /\bKi(?= point| feature|\b)/gi, rep: "Focus" },
    { rx: /\bRace\b/g, rep: "Species" },
    { rx: /\bRaces\b/g, rep: "Species" },
    { rx: /\bSubrace\b/g, rep: "Subspecies" },
    { rx: /\bRacial\b/g, rep: "Species" },

    // Condition & Glossary Upgrades (Contextual Injection)
    { rx: /\bSurprised\b/gi, rep: "Surprised (Disadvantage on Initiative)" },
    { rx: /\bHeavily Obscured\b/gi, rep: "Heavily Obscured (Blinded condition)" },
    { rx: /\bLightly Obscured\b/gi, rep: "Lightly Obscured (Disadvantage on Perception)" },
    { rx: /\bStable\b/g, rep: "Stable (0 HP, breathing, no death saves needed)" },
    { rx: /\bIncapacitated\b/g, rep: "Incapacitated (Can't take Actions or Reactions, Concentration broken)" },
    { rx: /\bInvisible\b/g, rep: "Invisible (Concealed, attacks have Advantage, enemy attacks have Disadvantage)" },

    // Rest Mechanics
    { rx: /\ba short rest\b/gi, rep: "a Short Rest" },
    { rx: /\ba long rest\b/gi, rep: "a Long Rest" },

    // General Terminology & Capitalizations (SRD 5.2.1 Rules)
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
                    const regex = new RegExp(`name="${weapon}"`, 'i');
                    if (content.match(regex)) {
                        innerBody = `> **Weapon Mastery (2024):** ${WEAPON_MASTERY_MAP[weapon]}\n\n` + innerBody;
                    }
                });
            }

            // Rule C: Safely intercept Monster Migrations (prevents accidental prose replacement)
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
            
            // Adjust semantic wording structures, spell names, and capitalizations
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