/**
 * api_fetcher.js
 * FULLY AUTHENTICATED Data Extraction Engine
 * Supports paginated and non-paginated D&D Beyond API endpoints.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import 'dotenv/config'; 
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

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

const turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
turndownService.use(gfm);

// Double-Tilde Override for Strikethroughs
turndownService.addRule('strikethrough', {
    filter: ['del', 's', 'strike'],
    replacement: function (content) { return '~~' + content + '~~'; }
});

// --- RESTORED AUTHENTICATION ROUTINE ---
async function getAuthToken() {
    console.log("Authenticating with D&D Beyond Auth Service...");
    if (!cobaltSession) throw new Error("Missing COBALTSESSION in .env or config.cjs");
    
    try {
        const res = await axios.post('https://auth-service.dndbeyond.com/v1/cobalt-token', null, {
            headers: { 'Cookie': `CobaltSession=${cobaltSession}` }
        });
        console.log("✅ Authentication Successful.");
        return res.data.token;
    } catch (err) {
        throw new Error(`Authentication Failed: ${err.message}`);
    }
}

const ENDPOINTS = {
    classes: 'https://character-service.dndbeyond.com/character/v5/game-data/classes',
    spells: 'https://character-service.dndbeyond.com/character/v5/game-data/spells',
    items: 'https://character-service.dndbeyond.com/character/v5.1/game-data/items',
    feats: 'https://character-service.dndbeyond.com/character/v5/game-data/feats',
    backgrounds: 'https://character-service.dndbeyond.com/character/v5/game-data/backgrounds',
    races: 'https://character-service.dndbeyond.com/character/v5/game-data/races',
    monsters: 'https://monster-service.dndbeyond.com/v1/Monster'
};

const TARGET_TYPE = process.argv[2] || 'items'; // Default to items if no argument provided

// Translation Utility
function translateId(configArray, id) {
    if (!configArray || !Array.isArray(configArray)) return id;
    const found = configArray.find(item => item.id === id);
    return found ? found.name : id;
}

function convertToMarkdown(html) {
    if (!html) return "";
    let markdown = turndownService.turndown(html.replace(/&nbsp;|\u00A0/g, ' '));
    return markdown.replace(/^[\s\u00A0\uFEFF\xA0]+/, ''); 
}

async function runApiFetcher() {
    if (!TARGET_TYPE || !ENDPOINTS[TARGET_TYPE]) {
        console.error(`Usage: node api_fetcher.js <category>\nAvailable: ${Object.keys(ENDPOINTS).join(', ')}`);
        process.exit(1);
    }

    try {
        // --- SECURE HANDSHAKE ---
        const authToken = await getAuthToken();
        const reqHeaders = { 
            'Authorization': `Bearer ${authToken}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
        };

        const outputDir = path.join(__dirname, '..', 'sources', 'repositories', TARGET_TYPE);
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        // Dictionary Fetcher
        let ddbConfig = {};
        if (TARGET_TYPE === 'monsters') {
            try {
                console.log("Fetching DDB Configuration Map...");
                const configRes = await axios.get('https://www.dndbeyond.com/api/config/json', { headers: reqHeaders });
                ddbConfig = configRes.data || {};
            } catch (e) { console.log("! Config fetch failed."); }
        }

        let items = [];

        // ROUTE 1: Monster Pagination
        if (TARGET_TYPE === 'monsters') {
            let skip = 0, take = 100, hasMore = true;
            while (hasMore) {
                console.log(`Fetching monsters... (Skip: ${skip})`);
                const res = await axios.get(`${ENDPOINTS.monsters}?skip=${skip}&take=${take}`, { headers: reqHeaders });
                const batch = res.data.data || res.data;
                if (batch?.length > 0) { items.push(...batch); skip += take; } 
                else hasMore = false;
                if (!batch || batch.length < take) hasMore = false;
            }
        } 
        // ROUTE 2: Spell Class-Sweep 
        else if (TARGET_TYPE === 'spells') {
            console.log(`Sweeping all D&D classes for Spells (Level 20)...`);
            const uniqueSpells = new Map();
            const classIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; 
            
            for (const classId of classIds) {
                try {
                    // FIX APPLIED HERE: Added &classLevel=20
                    const res = await axios.get(`${ENDPOINTS.spells}?classId=${classId}&classLevel=20`, { headers: reqHeaders });
                    if (res.data && res.data.data) {
                        res.data.data.forEach(spell => {
                            // Automatically unwrap definitions if they exist during the sweep
                            const actualSpell = spell.definition || spell;
                            if (actualSpell.name && !uniqueSpells.has(actualSpell.name)) {
                                uniqueSpells.set(actualSpell.name, actualSpell);
                            }
                        });
                    }
                } catch (e) { /* Silently ignore deprecated classes */ }
                await new Promise(r => setTimeout(r, 250)); // Throttle
            }
            items = Array.from(uniqueSpells.values());
        } 
        // ROUTE 3: Standard Fetch
        else {
            console.log("Fetching payload...");
            const res = await axios.get(ENDPOINTS[TARGET_TYPE], { headers: reqHeaders });
            items = res.data.data || res.data;
        }

        console.log(`Processing ${items.length} items...`);
        let successCount = 0;

        for (let rawItem of items) {
            // THE UNWRAPPER: Safely target the core data
            const item = rawItem.definition || rawItem;

            if (!item || !item.name) continue;

            const lowerName = item.name.toLowerCase();
            if (lowerName.includes('test') || lowerName.includes('copy_of')) continue;

            const safeName = item.slug.replace(/[<>:"/\\|?*]+/g, '').trim(); 
            const filePath = path.join(outputDir, `${safeName}.md`);
            
            let metaData = "", desc = item.description || item.snippet || item.characteristicsDescription || "";
            
            if (TARGET_TYPE === 'monsters') {
                const size = translateId(ddbConfig.monsterSizes, item.sizeId) || "Unknown Size";
                const type = translateId(ddbConfig.monsterTypes, item.typeId) || "Unknown Type";
                
                const stats = (item.stats || []).map(s => {
                    const key = (ddbConfig.stats || []).find(st => st.id === s.statId)?.key || 'STAT';
                    return `**${key}:** ${s.value}`;
                }).join(' | ');

                const movements = (item.movements || []).map(m => {
                    const label = translateId(ddbConfig.movements, m.movementId) || 'Move';
                    return `${label.toLowerCase()} ${m.speed} ft.`;
                }).join(', ');

                metaData = `*${size} ${type}*\n\n**AC:** ${item.armorClass} | **HP:** ${item.averageHitPoints} | **CR:** ${item.challengeRatingId}\n**Speed:** ${movements}\n\n${stats}\n\n`;
                
                if (item.specialTraitsDescription) desc += `\n### Special Traits\n${item.specialTraitsDescription}`;
                desc += `\n### Actions\n${item.actionsDescription}`;
                if (item.bonusActionsDescription) desc += `\n### Bonus Actions\n${item.bonusActionsDescription}`;
                if (item.reactionsDescription) desc += `\n### Reactions\n${item.reactionsDescription}`;
                if (item.legendaryActionsDescription) desc += `\n### Legendary Actions\n${item.legendaryActionsDescription}`;
            } 
            else if (TARGET_TYPE === 'spells') {
                const levelStr = item.level === 0 ? "Cantrip" : `Level ${item.level}`;
                const ritualStr = item.ritual ? " (Ritual)" : "";

                const actTime = item.activation?.activationTime || "";
                const typeMap = {1: 'Action', 3: 'Bonus Action', 4: 'Reaction', 6: 'Minute(s)', 7: 'Hour(s)'};
                const actType = typeMap[item.activation?.activationType] || 'Action';
                
                let rangeStr = item.range?.origin || "Self";
                if (item.range?.rangeValue) rangeStr += ` (${item.range.rangeValue} ft.)`;

                const compMap = {1: 'V', 2: 'S', 3: 'M'};
                const comps = (item.components || []).map(c => compMap[c] || c).join(', ');
                const compDesc = item.componentsDescription ? ` (${item.componentsDescription})` : "";

                let durationStr = item.duration?.durationType || "Instantaneous";
                if (item.duration?.durationInterval) {
                    durationStr = `${item.duration.durationInterval} ${item.duration.durationUnit || ''}`;
                    if (item.duration.durationType === "Concentration") durationStr = `Concentration, up to ${durationStr}`;
                }

                metaData = `*${levelStr} ${item.school}${ritualStr}*\n\n**Casting Time:** ${actTime} ${actType}\n**Range:** ${rangeStr}\n**Components:** ${comps}${compDesc}\n**Duration:** ${durationStr}\n\n`;
            } 
            else {
                if (TARGET_TYPE === 'items') {
                    metaData = `**Type:** ${item.type} | **Rarity:** ${item.rarity} | **Requires Attunement:** ${item.canEquip ? 'Yes' : 'No'}\n\n`;
                } else if (TARGET_TYPE === 'races') {
                    metaData = `**Size:** ${item.size} | **Speed:** ${item.speed} ft.\n\n`;
                }
            }

            const markdownDesc = convertToMarkdown(desc);
            const finalContent = `<ENTRY type="${TARGET_TYPE.toUpperCase()}" name="${item.name}" id="${item.id || ''}">\n${metaData}${markdownDesc}\n</ENTRY>\n<JSON>\n${JSON.stringify(item)}\n</JSON>`;

            fs.writeFileSync(filePath, finalContent);
            successCount++;
        }
        console.log(`\nSuccess! Saved ${successCount} formatted items to ${outputDir}`);
    } catch (err) {
        console.error("\nAPI Extraction Failed:", err.message);
        if (err.response) console.error(`Response Code: ${err.response.status}`);
    }
}

runApiFetcher();