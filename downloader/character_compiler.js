/**
 * character_compiler.js
 * Auto-fetches D&D Beyond characters and compiles them into AI-Ready Markdown.
 * Usage: node character_compiler.js <character_id_or_url>
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import 'dotenv/config';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Load Configuration
const configPath = path.resolve(__dirname, '../config.cjs');
let config = {};
try { 
    config = require(configPath); 
} catch (e) { 
    console.error("Config missing, falling back to process.env"); 
}

const cobaltSession = process.env.COBALTSESSION || config.cobaltSession || "";

// 2. Authentication Handshake
async function getAuthToken() {
    console.log("Authenticating with D&D Beyond Auth Service...");
    if (!cobaltSession) throw new Error("Missing COBALTSESSION in .env or config.cjs");
    
    try {
        const res = await axios.post('https://auth-service.dndbeyond.com/v1/cobalt-token', null, {
            headers: { 'Cookie': `CobaltSession=${cobaltSession}` }
        });
        return res.data.token;
    } catch (err) {
        throw new Error(`Authentication Failed: ${err.message}`);
    }
}

// Math Helper for 5e Modifiers
function getModifier(score) {
    const mod = Math.floor((score - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
}

// Maps DDB Stat IDs to Names
const STAT_MAP = {
    1: { key: 'str', name: 'STR' },
    2: { key: 'dex', name: 'DEX' },
    3: { key: 'con', name: 'CON' },
    4: { key: 'int', name: 'INT' },
    5: { key: 'wis', name: 'WIS' },
    6: { key: 'cha', name: 'CHA' }
};

// 3. Main Fetch and Compile Logic
async function runCharacterCompiler() {
    const input = process.argv[2];
    
    if (!input) {
        console.error("Usage: node character_compiler.js <character_id_or_url>");
        process.exit(1);
    }

    // Extract the numerical ID from the input string or URL
    const match = input.match(/(\d+)/);
    const characterId = match ? match[1] : null;

    if (!characterId) {
        console.error("Could not find a valid character ID in the input.");
        process.exit(1);
    }

    try {
        const authToken = await getAuthToken();
        const reqHeaders = { 
            'Authorization': `Bearer ${authToken}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
        };

        const endpoint = `https://character-service.dndbeyond.com/character/v5/character/${characterId}?includeCustomItems=true`;
        
        console.log(`Fetching Character Data for ID: ${characterId}...`);
        const res = await axios.get(endpoint, { headers: reqHeaders });
        const char = res.data.data;

        if (!char) {
            console.error("Failed to parse character data from response.");
            return;
        }

        console.log(`Successfully fetched character: ${char.name}. Compiling sheet...`);

        // --- COMPILATION LOGIC ---
        const name = char.name;
        const race = char.race.fullName;
        const background = char.background?.definition?.name || "Unknown Background";
        
        const classes = char.classes.map(c => `Level ${c.level} ${c.definition.name}`).join(' / ');
        const hp = char.baseHitPoints + (char.bonusHitPoints || 0) + (char.overrideHitPoints || 0);

        // Calculate Final Ability Scores (Base + Modifiers)
        let finalStats = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
        char.stats.forEach(s => finalStats[s.id] = s.value);
        
        const allModifiers = [
            ...(char.modifiers.race || []),
            ...(char.modifiers.class || []),
            ...(char.modifiers.feat || []),
            ...(char.modifiers.background || []),
            ...(char.modifiers.item || [])
        ];

        allModifiers.forEach(mod => {
            if (mod.type === 'bonus' && mod.subType.includes('-score')) {
                const statKey = mod.subType.split('-')[0]; 
                const statId = Object.keys(STAT_MAP).find(k => STAT_MAP[k].key === statKey);
                if (statId && mod.value) {
                    finalStats[statId] += mod.value;
                }
            }
        });

        // Build the Markdown String
        let md = `# ${name}\n`;
        md += `**${classes} | ${race} | ${background}**\n\n`;
        md += `**HP:** ${hp} | **Speed:** ${char.race.weightSpeeds?.normal?.walk || 30} ft.\n\n`;

        md += `### Core Attributes\n`;
        for (let i = 1; i <= 6; i++) {
            const score = finalStats[i];
            md += `* **${STAT_MAP[i].name}:** ${score} (${getModifier(score)})\n`;
        }

        md += `\n### Features & Traits\n`;
        if (char.race.racialTraits) {
            char.race.racialTraits.forEach(rt => {
                if (!rt.definition.hideInSheet) {
                    md += `* **${rt.definition.name}:** ${rt.definition.snippet || 'See rulebook.'}\n`;
                }
            });
        }

        char.classes.forEach(c => {
            c.definition.classFeatures.forEach(cf => {
                if (cf.requiredLevel <= c.level) {
                    const activeFeature = char.classes[0].classFeatures.find(f => f.definition.id === cf.id);
                    if (activeFeature && !activeFeature.definition.hideInSheet) {
                        const snippet = activeFeature.definition.snippet || activeFeature.definition.summary || 'See rulebook.';
                        md += `* **${cf.name}:** ${snippet.replace(/<[^>]*>?/gm, '')}\n`;
                    }
                }
            });
        });

        if (char.feats) {
            char.feats.forEach(feat => {
                md += `* **Feat: ${feat.definition.name}:** ${feat.definition.snippet?.replace(/<[^>]*>?/gm, '') || 'See rulebook.'}\n`;
            });
        }

        md += `\n### Inventory\n`;
        if (char.inventory) {
            char.inventory.forEach(item => {
                md += `* ${item.definition.name} (x${item.quantity})\n`;
            });
        }

        const spells = [
            ...(char.spells.race || []),
            ...(char.spells.class || []),
            ...(char.spells.feat || [])
        ];

        if (spells.length > 0) {
            md += `\n### Known Spells\n`;
            spells.forEach(spellWrapper => {
                const spell = spellWrapper.definition || spellWrapper;
                md += `* **${spell.name}** (Level ${spell.level})\n`;
            });
        }

        // Save File
        const outputPath = path.resolve(__dirname, `../sources/characters/${name.replace(/\s+/g, '_')}.md`);
        if (!fs.existsSync(path.dirname(outputPath))) fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        
        fs.writeFileSync(outputPath, md);
        console.log(`✅ Success! Rendered Character Sheet to ${outputPath}`);

    } catch (err) {
        console.error("Extraction Failed:", err.message);
        if (err.response && err.response.status === 403) {
            console.error("403 Forbidden: Ensure your CobaltSession token is valid and active.");
        }
    }
}

runCharacterCompiler();