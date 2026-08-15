/**
 * test_fetch.js
 * Fetches exactly 2 items for Spells, Monsters, and Items to review Markdown layout.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import 'dotenv/config';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { loadConfig, getAlignment, getSize, getMonsterType, getChallengeRating, getSense, getMovement, getStat, getSkill } from './src/core/translator.js';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.resolve(__dirname, 'config.cjs');
const config = require(configPath);
const cobaltSession = config.cobaltSession || '';

const turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
turndownService.use(gfm);

async function getAuthToken() {
    const res = await axios.post('https://auth-service.dndbeyond.com/v1/cobalt-token', null, {
        headers: { Cookie: `CobaltSession=${cobaltSession}` },
    });
    return res.data.token;
}

const reqHeaders = { 'User-Agent': 'Mozilla/5.0' };

async function fetchAndFormat(type, url) {
    console.log(`Fetching 2 ${type}...`);
    const res = await axios.get(url, { headers: reqHeaders });
    let rawItems = res.data.data || res.data;
    if (!Array.isArray(rawItems)) rawItems = [rawItems];
    
    // Pick the first 2
    let items = rawItems.slice(0, 2);
    let output = '';

    for (let rawItem of items) {
        const item = rawItem.definition || rawItem;
        if (!item || !item.name) continue;

        const safeName = item.name.replace(/[<>:"/\\|?*]+/g, '').trim();
        let metaData = '';
        let desc = item.description || item.snippet || item.characteristicsDescription || '';

        if (item.avatarUrl || item.largeAvatarUrl) {
            const imgUrl = item.largeAvatarUrl || item.avatarUrl;
            metaData += `![${safeName}](${imgUrl})\n\n`;
        }

        if (type === 'monsters') {
            const size = getSize(item.sizeId);
            const monsterType = getMonsterType(item.typeId);
            const cr = getChallengeRating(item.challengeRatingId);

            const stats = (item.stats || []).map(s => `**${getStat(s.statId)}:** ${s.value}`).join(' | ');
            const movements = (item.movements || []).map(m => `${getMovement(m.movementId)} ${m.speed} ft.`).join(', ');

            metaData += `*${size} ${monsterType}*\n\n**AC:** ${item.armorClass} | **HP:** ${item.averageHitPoints} | **CR:** ${cr}\n**Speed:** ${movements}\n\n${stats}\n\n`;

            if (item.specialTraitsDescription) desc += `\n### Special Traits\n${item.specialTraitsDescription}`;
            desc += `\n### Actions\n${item.actionsDescription}`;
            if (item.bonusActionsDescription) desc += `\n### Bonus Actions\n${item.bonusActionsDescription}`;
            if (item.reactionsDescription) desc += `\n### Reactions\n${item.reactionsDescription}`;
            if (item.legendaryActionsDescription) desc += `\n### Legendary Actions\n${item.legendaryActionsDescription}`;
        } else if (type === 'spells') {
            const levelStr = item.level === 0 ? 'Cantrip' : `Level ${item.level}`;
            const ritualStr = item.ritual ? ' (Ritual)' : '';
            const actTime = item.activation?.activationTime || '';
            const actType = ['Action','','Bonus Action','Reaction','','Minute(s)','Hour(s)'][item.activation?.activationType] || 'Action';
            
            let rangeStr = item.range?.origin || 'Self';
            if (item.range?.rangeValue) rangeStr += ` (${item.range.rangeValue} ft.)`;

            const comps = (item.components || []).map(c => ['V','S','M'][c-1] || c).join(', ');
            const compDesc = item.componentsDescription ? ` (${item.componentsDescription})` : '';

            let durationStr = item.duration?.durationType || 'Instantaneous';
            if (item.duration?.durationInterval) {
                durationStr = `${item.duration.durationInterval} ${item.duration.durationUnit || ''}`;
                if (item.duration.durationType === 'Concentration') durationStr = `Concentration, up to ${durationStr}`;
            }

            metaData += `*${levelStr} ${item.school}${ritualStr}*\n\n**Casting Time:** ${actTime} ${actType}\n**Range:** ${rangeStr}\n**Components:** ${comps}${compDesc}\n**Duration:** ${durationStr}\n\n`;
        }

        let markdownDesc = turndownService.turndown(desc.replace(/&nbsp;|\u00A0/g, ' '));
        output += `\n<ENTRY type="${type.toUpperCase()}" name="${item.name}" id="${item.id || ''}" isHomebrew="${item.isHomebrew || false}">\n${metaData}${markdownDesc}\n</ENTRY>\n\n`;
    }
    fs.writeFileSync(`scratch/test_${type}.md`, output);
    console.log(`Saved scratch/test_${type}.md`);
}

async function run() {
    await loadConfig();
    reqHeaders.Authorization = `Bearer ${await getAuthToken()}`;
    await fetchAndFormat('spells', 'https://character-service.dndbeyond.com/character/v5/game-data/always-known-spells?classId=8&classLevel=20&sharingSetting=2');
    await fetchAndFormat('monsters', 'https://monster-service.dndbeyond.com/v1/Monster?skip=0&take=2');
}
run();
