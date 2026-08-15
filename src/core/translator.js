import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure sources folder exists
const configDir = path.resolve(__dirname, '../../sources');
if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

const CONFIG_PATH = path.join(configDir, 'config.json');
const CONFIG_URL = 'https://www.dndbeyond.com/api/config/json';

let ddbConfig = null;

export async function loadConfig() {
    if (ddbConfig) return ddbConfig;

    if (fs.existsSync(CONFIG_PATH)) {
        console.log("Translator: Loading config from cache...");
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        ddbConfig = JSON.parse(raw);
        return ddbConfig;
    }

    console.log("Translator: Fetching config from API...");
    const res = await fetch(CONFIG_URL);
    if (!res.ok) throw new Error("Failed to fetch DDB config");
    ddbConfig = await res.json();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(ddbConfig, null, 2));
    return ddbConfig;
}

// Universal lookup function
export function translate(dictKey, id, fallback = '') {
    if (!ddbConfig) return fallback;
    const dictionary = ddbConfig[dictKey];
    if (!dictionary || !Array.isArray(dictionary)) return fallback;
    
    const found = dictionary.find(item => item.id === id);
    return found ? found.name : fallback;
}

// Specialized lookups based on MCP docs
export function getAlignment(id) { return translate('alignments', id, 'Unknown Alignment'); }
export function getSize(id) { return translate('creatureSizes', id, 'Unknown Size'); }
export function getMonsterType(id) { return translate('monsterTypes', id, 'Unknown Type'); }

export function getChallengeRating(id) { 
    if (!ddbConfig) return 'Unknown CR';
    const found = ddbConfig.challengeRatings?.find(item => item.id === id);
    if (!found) return 'Unknown CR';
    let val = found.value;
    if (val === 0.125) val = "1/8";
    else if (val === 0.25) val = "1/4";
    else if (val === 0.5) val = "1/2";
    return `${val} (${found.xp} XP)`; 
}

export function getSense(id) { return translate('senses', id, 'Sense'); }
export function getMovement(id) { return translate('movements', id, 'Move'); }
export function getStat(id) { return translate('stats', id, 'STAT').substring(0, 3).toUpperCase(); }
export function getSkill(id) { return translate('abilitySkills', id, 'Skill'); }

