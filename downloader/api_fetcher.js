import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm'; 

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Load Configuration
const configPath = path.resolve(__dirname, '../config.cjs');
const config = require(configPath);

const turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
turndownService.use(gfm);

// Double-Tilde Override for Strikethroughs
turndownService.addRule('strikethrough', {
    filter: ['del', 's', 'strike'],
    replacement: function (content) { return '~~' + content + '~~'; }
});

const ENDPOINTS = {
    spells: 'https://character-service.dndbeyond.com/character/v5/game-data/spells',
    items: 'https://character-service.dndbeyond.com/character/v5.1/game-data/items',
    feats: 'https://character-service.dndbeyond.com/character/v5/game-data/feats',
    backgrounds: 'https://character-service.dndbeyond.com/character/v5/game-data/backgrounds',
    races: 'https://character-service.dndbeyond.com/character/v5/game-data/races',
    monsters: 'https://monster-service.dndbeyond.com/v1/Monster'
};

const TARGET_TYPE = process.argv[2];

function convertToMarkdown(html) {
    if (!html) return "";
    let cleanHtml = html.replace(/&nbsp;|\u00A0/g, ' ');
    return turndownService.turndown(cleanHtml);
}

// HELPER: Translates numerical IDs into English names using the DDB Config Map
function translateId(configArray, id) {
    if (!configArray) return id;
    const found = configArray.find(item => item.id === id);
    return found ? found.name : id;
}

async function runApiFetcher() {
    if (!TARGET_TYPE || !ENDPOINTS[TARGET_TYPE]) {
        console.error("Usage: node api_fetcher.js <category>");
        console.error(`Available categories: ${Object.keys(ENDPOINTS).join(', ')}`);
        process.exit(1);
    }

    const endpoint = ENDPOINTS[TARGET_TYPE];
    const outputDir = path.join(__dirname, '..', 'sources', 'repositories', TARGET_TYPE);
    
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`\n--- Starting Direct API Extraction for ${TARGET_TYPE.toUpperCase()} ---`);
    console.log(`Targeting: ${endpoint}`);

    const reqHeaders = { 
        'Cookie': `CobaltSession=${config.cobaltSession || process.env.COBALTSESSION}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Accept': 'application/json'
    };

    try {
        let items = [];
        let ddbConfig = {};

        // --- FETCH THE "ROSETTA STONE" CONFIG MAP FOR MONSTERS ---
        if (TARGET_TYPE === 'monsters') {
            console.log("Fetching DDB Configuration Map (Rosetta Stone)...");
            try {
                const configRes = await axios.get('https://www.dndbeyond.com/api/config/json', { headers: reqHeaders });
                ddbConfig = configRes.data || {};
            } catch (e) {
                console.log("! Warning: Could not fetch config map. Enums will remain as numbers.");
            }
        }

        // --- MONSTER PAGINATION LOGIC ---
        if (TARGET_TYPE === 'monsters') {
            let skip = 0;
            const take = 100;
            let hasMore = true;
            
            while (hasMore) {
                console.log(`Fetching monsters... (Skip: ${skip}, Take: ${take})`);
                const res = await axios.get(`${endpoint}?skip=${skip}&take=${take}`, { headers: reqHeaders });
                
                const batch = res.data.data || res.data; 
                if (batch && batch.length > 0) {
                    items.push(...batch);
                    skip += take;
                } else {
                    hasMore = false;
                }
                
                if (!batch || batch.length < take) {
                    hasMore = false;
                }
            }
        } 
        // --- STANDARD CHARACTER SERVICE DATA ---
        else {
            console.log(`Fetching payload...`);
            const res = await axios.get(endpoint, { headers: reqHeaders });
            items = res.data.data || res.data;
        }

        if (!items || items.length === 0) {
            console.error("! API returned no data. Check your CobaltSession token.");
            process.exit(1);
        }

        console.log(`Payload received. Processing ${items.length} items...`);

        let successCount = 0;

        for (const item of items) {
            if (!item || !item.name) continue;

            const lowerName = item.name.toLowerCase();
            if (lowerName.includes('test') || lowerName.includes('copy_of')) continue;

            const safeName = item.name.replace(/[<>:"/\\|?*]+/g, '').trim(); 
            const filePath = path.join(outputDir, `${safeName}.md`);
            
            let descriptionHtml = "";
            let metaData = "";

            // --- ENHANCED MONSTER FORMATTING ---
            if (TARGET_TYPE === 'monsters') {
                // Translate IDs via Config Map
                const size = translateId(ddbConfig.creatureSizes || ddbConfig.monsterSizes, item.sizeId) || "Unknown Size";
                const type = translateId(ddbConfig.monsterTypes, item.typeId) || "Unknown Type";
                const align = translateId(ddbConfig.alignments, item.alignmentId) || "Unknown Alignment";
                const cr = translateId(ddbConfig.challengeRatings, item.challengeRatingId) || item.challengeRatingId;

                const hpDice = item.hitPointDice ? item.hitPointDice.diceString : '';
                const acDesc = item.armorClassDescription ? item.armorClassDescription : '';
                
                // 1. Dynamic Core Stats via Rosetta Stone
                let statString = "";
                if (item.stats && item.stats.length > 0) {
                    statString = item.stats.map(s => {
                        let statName = translateId(ddbConfig.stats, s.statId) || 'STAT';
                        // Shorten "Strength" to "STR" based on the key if available
                        const statObj = (ddbConfig.stats || []).find(st => st.id === s.statId);
                        if (statObj && statObj.key) statName = statObj.key;
                        
                        return `**${statName}:** ${s.value}`;
                    }).join(' | ');
                }

                // 2. Dynamic Speed / Movement via Rosetta Stone
                let speedString = "30 ft.";
                if (item.movements && item.movements.length > 0) {
                    speedString = item.movements.map(m => {
                        let label = translateId(ddbConfig.movements, m.movementId) || '';
                        let speed = `${m.speed} ft.`;
                        return label.toLowerCase() === 'walk' ? speed : `${label.toLowerCase()} ${speed}`;
                    }).join(', ');
                }

                // 3. Saving Throws
                let savesString = "";
                if (item.savingThrows && item.savingThrows.length > 0) {
                    const saves = item.savingThrows.map(s => {
                        const statObj = (ddbConfig.stats || []).find(st => st.id === s.statId);
                        return statObj ? statObj.key : 'Unknown';
                    }).join(', ');
                    savesString = `**Saving Throws:** ${saves}\n`;
                }

                // 4. Languages (Translated via Rosetta Stone)
                let langString = "--";
                if (item.languages && item.languages.length > 0) {
                    langString = item.languages.map(l => {
                        let name = translateId(ddbConfig.languages, l.languageId) || "Unknown";
                        return l.notes ? `${name} ${l.notes}` : name;
                    }).join(', ');
                }

                // Build the Header Block
                metaData = `*${size} ${type}, ${align}*\n\n`;
                metaData += `**Armor Class:** ${item.armorClass} ${acDesc}\n`;
                metaData += `**Hit Points:** ${item.averageHitPoints} (${hpDice})\n`;
                metaData += `**Speed:** ${speedString}\n\n`;
                metaData += `${statString}\n\n`;
                metaData += savesString;
                
                // Add Pre-compiled Strings if they exist
                if (item.skillsHtml) metaData += `**Skills:** ${item.skillsHtml.replace(/<[^>]*>?/gm, '')}\n`;
                if (item.sensesHtml) metaData += `**Senses:** ${item.sensesHtml.replace(/<[^>]*>?/gm, '')}\n`;
                if (item.conditionImmunitiesHtml) metaData += `**Condition Immunities:** ${item.conditionImmunitiesHtml.replace(/<[^>]*>?/gm, '')}\n`;
                
                metaData += `**Languages:** ${langString}\n`;
                metaData += `**Challenge Rating:** ${cr}\n\n`;
                
                // Build the Body Block
                let desc = item.characteristicsDescription || "";
                if (item.specialTraitsDescription) desc += `\n### Special Traits\n${item.specialTraitsDescription}`;
                if (item.actionsDescription) desc += `\n### Actions\n${item.actionsDescription}`;
                if (item.bonusActionsDescription) desc += `\n### Bonus Actions\n${item.bonusActionsDescription}`;
                if (item.reactionsDescription) desc += `\n### Reactions\n${item.reactionsDescription}`;
                if (item.legendaryActionsDescription) desc += `\n### Legendary Actions\n${item.legendaryActionsDescription}`;
                if (item.mythicActionsDescription) desc += `\n### Mythic Actions\n${item.mythicActionsDescription}`;
                
                descriptionHtml = desc;
            } 
            // --- SPELL/ITEM FORMATTING ---
            else {
                descriptionHtml = item.description || item.snippet || item.grantedModifiers?.[0]?.description || "";
                if (TARGET_TYPE === 'spells') {
                    metaData = `**Level:** ${item.level} | **School:** ${item.school} | **Casting Time:** ${item.activation?.activationTime} ${item.activation?.activationType === 1 ? 'Action' : 'Bonus Action'}\n\n`;
                } else if (TARGET_TYPE === 'items') {
                    metaData = `**Type:** ${item.type} | **Rarity:** ${item.rarity} | **Requires Attunement:** ${item.canEquip ? 'Yes' : 'No'}\n\n`;
                }
            }

            const markdownDesc = convertToMarkdown(descriptionHtml);
            
            const finalContent = `<ENTRY type="${TARGET_TYPE.toUpperCase()}" name="${item.name}" id="${item.id}">\n${metaData}${markdownDesc}\n</ENTRY>`;

            fs.writeFileSync(filePath, finalContent);
            successCount++;
        }

        console.log(`\nSuccess! Saved ${successCount} formatted items to ${outputDir}`);

    } catch (err) {
        console.error("\nAPI Extraction Failed:", err.message);
        if (err.response && err.response.status === 403) {
            console.error("D&D Beyond returned a 403 Forbidden. Your CobaltSession might be expired or the endpoint requires additional headers.");
        }
    }
}

runApiFetcher();