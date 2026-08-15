import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import axios from "axios";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.resolve(__dirname, '../../config.cjs');
const config = require(configPath);

async function verify() {
    try {
        console.log("Fetching Spells...");
        const spellRes = await axios.get("https://character-service.dndbeyond.com/character/v5/game-data/always-known-spells?classId=8&classLevel=20&sharingSetting=2");
        const spellData = spellRes.data.data[0];
        
        fs.writeFileSync("spell_sample.json", JSON.stringify(spellData, null, 2));
        console.log("Spell Keys:", Object.keys(spellData?.definition || {}));
    } catch (e) {
        console.error("Error:", e.message);
    }
}
verify();
