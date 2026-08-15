/**
 * bulk_api_fetcher.js
 * Unified API Data Extraction Engine
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
import * as prettier from 'prettier';
import { loadConfig, getAlignment, getSize, getMonsterType, getChallengeRating, getSense, getMovement, getStat, getSkill } from '../core/translator.js';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Load Configuration
const configPath = path.resolve(__dirname, '../config.cjs');
let config = {};
try { config = require(configPath); } catch (e) { }

const cobaltSession = process.env.COBALTSESSION || config.cobaltSession || '';

const turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
turndownService.use(gfm);
turndownService.addRule('strikethrough', {
    filter: ['del', 's', 'strike'],
    replacement: content => '~~' + content + '~~'
});

async function getAuthToken() {
    console.log('Authenticating with D&D Beyond Auth Service...');
    if (!cobaltSession) throw new Error('Missing COBALTSESSION in .env or config.cjs');
    try {
        const res = await axios.post('https://auth-service.dndbeyond.com/v1/cobalt-token', null, {
            headers: { Cookie: `CobaltSession=${cobaltSession}` },
        });
        return res.data.token;
    } catch (err) {
        throw new Error(`Authentication Failed: ${err.message}`);
    }
}

const ENDPOINTS = {
    classes: 'https://character-service.dndbeyond.com/character/v5/game-data/classes',
    subclasses: 'https://character-service.dndbeyond.com/character/v5/game-data/subclasses',
    spells: 'https://character-service.dndbeyond.com/character/v5/game-data/spells',
    items: 'https://character-service.dndbeyond.com/character/v5.1/game-data/items',
    feats: 'https://character-service.dndbeyond.com/character/v5/game-data/feats',
    backgrounds: 'https://character-service.dndbeyond.com/character/v5/game-data/backgrounds',
    races: 'https://character-service.dndbeyond.com/character/v5/game-data/races',
    monsters: 'https://monster-service.dndbeyond.com/v1/Monster',
};

const TARGET_TYPE = process.argv[2] || 'items';
const INCLUDE_HOMEBREW = process.argv.includes('--homebrew');
let CUSTOM_OUT_DIR = null;
const outIndex = process.argv.indexOf('--out');
if (outIndex > -1 && process.argv.length > outIndex + 1) {
    CUSTOM_OUT_DIR = process.argv[outIndex + 1];
}

function convertToMarkdown(html) {
    if (!html) return '';
    let markdown = turndownService.turndown(html.replace(/&nbsp;|\u00A0/g, ' '));
    return markdown.replace(/^[\s\u00A0\uFEFF\xA0]+/, '');
}

async function runBulkApiFetcher() {
    if (!TARGET_TYPE || !ENDPOINTS[TARGET_TYPE]) {
        console.error(`Usage: node bulk_api_fetcher.js <category> [--homebrew] [--out <path>]\nAvailable: ${Object.keys(ENDPOINTS).join(', ')}`);
        process.exit(1);
    }

    try {
        await loadConfig();
        const authToken = await getAuthToken();
        const reqHeaders = {
            Authorization: `Bearer ${authToken}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        };

        const outputDir = CUSTOM_OUT_DIR 
            ? path.join(CUSTOM_OUT_DIR, TARGET_TYPE) 
            : path.join(__dirname, '..', 'sources', 'repositories', TARGET_TYPE);
            
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        let items = [];
        console.log(`Starting bulk fetch for: ${TARGET_TYPE.toUpperCase()} (Homebrew: ${INCLUDE_HOMEBREW})`);

        if (TARGET_TYPE === 'monsters') {
            let skip = 0, take = 100, hasMore = true;
            const homebrewFlag = INCLUDE_HOMEBREW ? 't' : 'f';
            while (hasMore) {
                console.log(`Fetching monsters... (Skip: ${skip})`);
                const res = await axios.get(`${ENDPOINTS.monsters}?skip=${skip}&take=${take}&showHomebrew=${homebrewFlag}`, { headers: reqHeaders });
                const batch = res.data.data || res.data;
                if (batch?.length > 0) {
                    items.push(...batch);
                    skip += take;
                } else hasMore = false;
                if (!batch || batch.length < take) hasMore = false;
            }
        } else if (TARGET_TYPE === 'spells' || TARGET_TYPE === 'subclasses') {
            console.log(`Sweeping all D&D classes for ${TARGET_TYPE}...`);
            const uniqueItems = new Map();
            const classIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 252717, 357975];
            const hbParam = INCLUDE_HOMEBREW ? '&includeCustomItems=true' : '';

            for (const classId of classIds) {
                try {
                    let url = TARGET_TYPE === 'spells' 
                        ? `${ENDPOINTS.spells}?classId=${classId}&classLevel=20${hbParam}`
                        : `${ENDPOINTS.subclasses}?baseClassId=${classId}${hbParam}`;
                    
                    const res = await axios.get(url, { headers: reqHeaders });
                    if (res.data && res.data.data) {
                        res.data.data.forEach((item) => {
                            const actualItem = item.definition || item;
                            const key = TARGET_TYPE === 'spells' ? actualItem.name : actualItem.slug;
                            if (key && !uniqueItems.has(key)) {
                                uniqueItems.set(key, actualItem);
                            }
                        });
                    }
                } catch (e) { }
                await new Promise(r => setTimeout(r, 250)); 
            }
            items = Array.from(uniqueItems.values());
        } else {
            console.log('Fetching payload...');
            const hbParam = INCLUDE_HOMEBREW ? '?includeCustomItems=true' : '';
            const res = await axios.get(`${ENDPOINTS[TARGET_TYPE]}${hbParam}`, { headers: reqHeaders });
            items = res.data.data || res.data;
        }

        console.log(`Processing ${items.length} items...`);
        let successCount = 0;

        for (let rawItem of items) {
            const item = rawItem.definition || rawItem;
            if (!item || !item.name) continue;

            const lowerName = item.name.toLowerCase();
            if (lowerName.includes('test') || lowerName.includes('copy_of')) continue;

            const safeName = item.name.replace(/[<>:"/\\|?*]+/g, '').trim();
            const slug = item.slug || safeName.toLowerCase().replace(/\s+/g, '-');
            const filePath = path.join(outputDir, `${safeName}.md`);
            
            let metaData = '';
            let descMarkdown = convertToMarkdown(item.description || item.snippet || item.characteristicsDescription || '');

            if (item.avatarUrl || item.largeAvatarUrl) {
                const imgUrl = item.largeAvatarUrl || item.avatarUrl;
                metaData += `![${safeName}](${imgUrl})\n\n`;
            }

            if (TARGET_TYPE === 'monsters') {
                const size = getSize(item.sizeId);
                const type = getMonsterType(item.typeId);
                const cr = getChallengeRating(item.challengeRatingId);

                const stats = (item.stats || []).map(s => `**${getStat(s.statId)}:** ${s.value}`).join(' | ');
                const movements = (item.movements || []).map(m => `${getMovement(m.movementId)} ${m.speed} ft.`).join(', ');

                metaData += `*${size} ${type}*\n\n**AC:** ${item.armorClass} | **HP:** ${item.averageHitPoints} | **CR:** ${cr}\n**Speed:** ${movements}\n\n${stats}\n\n`;

                if (item.specialTraitsDescription) descMarkdown += `\n\n### Special Traits {#${TARGET_TYPE}:${slug}:traits}\n${convertToMarkdown(item.specialTraitsDescription)}`;
                descMarkdown += `\n\n### Actions {#${TARGET_TYPE}:${slug}:actions}\n${convertToMarkdown(item.actionsDescription)}`;
                if (item.bonusActionsDescription) descMarkdown += `\n\n### Bonus Actions {#${TARGET_TYPE}:${slug}:bonus-actions}\n${convertToMarkdown(item.bonusActionsDescription)}`;
                if (item.reactionsDescription) descMarkdown += `\n\n### Reactions {#${TARGET_TYPE}:${slug}:reactions}\n${convertToMarkdown(item.reactionsDescription)}`;
                if (item.legendaryActionsDescription) descMarkdown += `\n\n### Legendary Actions {#${TARGET_TYPE}:${slug}:legendary-actions}\n${convertToMarkdown(item.legendaryActionsDescription)}`;
            } else if (TARGET_TYPE === 'spells') {
                const levelStr = item.level === 0 ? 'Cantrip' : `Level ${item.level}`;
                const ritualStr = item.ritual ? ' (Ritual)' : '';
                const actTime = item.activation?.activationTime || '';
                let actType = ['Action','','Bonus Action','Reaction','','Minute(s)','Hour(s)'][item.activation?.activationType] || 'Action';
                
                if (actTime === 1) actType = actType.replace('(s)', '');
                else actType = actType.replace('(s)', 's');

                let rangeStr = item.range?.origin || 'Self';
                if (item.range?.rangeValue) rangeStr += ` (${item.range.rangeValue} ft.)`;

                const comps = (item.components || []).map(c => ['V','S','M'][c-1] || c).join(', ');
                const compDesc = item.componentsDescription ? ` (${item.componentsDescription})` : '';

                let durationStr = item.duration?.durationType || 'Instantaneous';
                if (item.duration?.durationInterval) {
                    let durUnit = item.duration.durationUnit || '';
                    if (item.duration.durationInterval > 1 && !durUnit.endsWith('s')) durUnit += 's';
                    durationStr = `${item.duration.durationInterval} ${durUnit}`;
                    if (item.duration.durationType === 'Concentration') durationStr = `Concentration, up to ${durationStr}`;
                }

                metaData += `*${levelStr} ${item.school}${ritualStr}*\n\n**Casting Time:** ${actTime} ${actType}\n**Range:** ${rangeStr}\n**Components:** ${comps}${compDesc}\n**Duration:** ${durationStr}\n\n`;
            } else if (TARGET_TYPE === 'items') {
                metaData += `**Type:** ${item.type} | **Rarity:** ${item.rarity} | **Requires Attunement:** ${item.canEquip ? 'Yes' : 'No'}\n\n`;
            } else if (TARGET_TYPE === 'races' || TARGET_TYPE === 'species') {
                metaData += `**Size:** ${item.size} | **Speed:** ${item.speed} ft.\n\n`;
            }

            const finalContent = `<ENTRY type="${TARGET_TYPE.toUpperCase()}" name="${item.name.replace(/"/g, '&quot;')}" id="${item.id || ''}" isHomebrew="${item.isHomebrew || false}">\n${metaData}${descMarkdown}\n</ENTRY>`;

            fs.writeFileSync(filePath, finalContent);
            successCount++;
        }
        console.log(`\nSuccess! Saved ${successCount} formatted items to ${outputDir}`);
    } catch (err) {
        console.error('\nAPI Extraction Failed:', err.message);
    }
}

runBulkApiFetcher();
