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

const ENDPOINTS = {
    spells: 'https://character-service.dndbeyond.com/character/v5/game-data/spells',
    items: 'https://character-service.dndbeyond.com/character/v5/game-data/items',
    feats: 'https://character-service.dndbeyond.com/character/v5/game-data/feats',
    backgrounds: 'https://character-service.dndbeyond.com/character/v5/game-data/backgrounds',
    races: 'https://character-service.dndbeyond.com/character/v5/game-data/races'
};

const TARGET_TYPE = process.argv[2] || 'spells';

async function getAuthToken() {
    console.log("Authenticating with D&D Beyond Auth Service...");
    try {
        const res = await axios.post('https://auth-service.dndbeyond.com/v1/cobalt-token', null, {
            headers: { 'Cookie': `CobaltSession=${config.cobaltSession}` }
        });
        return res.data.token;
    } catch (err) {
        throw new Error(`Authentication Failed: ${err.message}`);
    }
}

function convertToMarkdown(htmlString) {
    if (!htmlString) return "";
    let markdown = turndownService.turndown(htmlString);
    return markdown.replace(/^[\s\u00A0\uFEFF\xA0]+/, ''); 
}

async function runApiFetcher() {
    if (!ENDPOINTS[TARGET_TYPE]) {
        console.error(`Unknown target type: ${TARGET_TYPE}. Valid options: spells, items, feats, backgrounds, races.`);
        return;
    }

    try {
        const token = await getAuthToken();
        console.log(`Token acquired. Downloading ${TARGET_TYPE} database...`);

        let items = [];

        // THE FIX: Class-Sweep Logic for Spells
        if (TARGET_TYPE === 'spells') {
            console.log(`Note: Spells require class-specific querying. Sweeping all D&D classes...`);
            const uniqueSpells = new Map();
            // Standard Class IDs in DDB (1=Bard, 2=Cleric, 3=Druid, etc.)
            const classIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; 
            
            for (const classId of classIds) {
                try {
                    const response = await axios.get(`${ENDPOINTS.spells}?classId=${classId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    
                    if (response.data && response.data.data) {
                        response.data.data.forEach(spell => {
                            if (spell.name && !uniqueSpells.has(spell.name)) {
                                uniqueSpells.set(spell.name, spell);
                            }
                        });
                    }
                } catch (e) {
                    // Silently ignore if a specific classId happens to be deprecated or empty
                }
                // Mild throttling to protect your CobaltSession
                await new Promise(res => setTimeout(res, 250));
            }
            items = Array.from(uniqueSpells.values());
            
        } else {
            // Standard fetch for feats, items, backgrounds, etc.
            const response = await axios.get(ENDPOINTS[TARGET_TYPE], {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            items = response.data.data;
        }

        console.log(`Successfully aggregated ${items.length} ${TARGET_TYPE}. Formatting...`);

        const outputDir = path.resolve(__dirname, '../sources/repositories', TARGET_TYPE);
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        let successCount = 0;
        for (const item of items) {
            if (!item.name) continue;

            // JUNK FILTER: Skips homebrew test files
            const lowerName = item.name.toLowerCase();
            if (lowerName.includes('test') || lowerName.includes('copy_of')) continue;

            const safeName = item.name.replace(/[<>:"/\\|?*]+/g, ''); 
            const filePath = path.join(outputDir, `${safeName}.md`);
            
            const descriptionHtml = item.description || item.snippet || item.grantedModifiers?.[0]?.description || "";
            const markdownDesc = convertToMarkdown(descriptionHtml);

            let metaData = "";
            if (TARGET_TYPE === 'spells') {
                metaData = `**Level:** ${item.level} | **School:** ${item.school} | **Casting Time:** ${item.activation?.activationTime} ${item.activation?.activationType === 1 ? 'Action' : 'Bonus Action'}\n\n`;
            } else if (TARGET_TYPE === 'items') {
                metaData = `**Type:** ${item.type} | **Rarity:** ${item.rarity} | **Requires Attunement:** ${item.canEquip ? 'Yes' : 'No'}\n\n`;
            }

            const finalContent = `<ENTRY type="${TARGET_TYPE.toUpperCase()}" name="${item.name}">\n${metaData}${markdownDesc}\n</ENTRY>`;

            fs.writeFileSync(filePath, finalContent);
            successCount++;
        }

        console.log(`Success! Saved ${successCount} formatted ${TARGET_TYPE} to ${outputDir}`);

    } catch (err) {
        console.error("API Fetcher Failed:", err.message);
    }
}

runApiFetcher();