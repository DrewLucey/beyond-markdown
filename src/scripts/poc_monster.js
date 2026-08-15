import { getSessionToken } from '../utils/auth.js';
import { loadConfig, getAlignment, getSize, getMonsterType, getChallengeRating, getSense, getMovement, getStat, getSkill } from '../core/translator.js';
import fs from 'fs';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
turndownService.use(gfm);

// Rule: Capture Heading IDs and Build Hierarchical Namespaces
turndownService.addRule('headingIds', {
    filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    replacement: function (content, node) {
        const level = parseInt(node.nodeName.charAt(1));
        const prefix = '#'.repeat(level);
        
        let baseId = node.getAttribute("id");
        if (!baseId) {
            let rawText = content.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
            rawText = rawText.replace(/[*_~`]/g, "");
            baseId = rawText.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
            if (!baseId) baseId = `autoheading${level}`;
        }
        
        const cleanContent = content.replace(/\[\]\(.*?\)/g, "").trim();
        
        // This relies on a global variable or passing it through; for POC we hardcode the monster slug
        const monsterSlug = global.CURRENT_MONSTER_SLUG || 'monster';
        const finalId = `${monsterSlug}:${baseId}`;
        
        return `\n\n${prefix} ${cleanContent} {#${finalId}}\n\n`;
    }
});

async function runMonsterPOC() {
    try {
        console.log("--- Starting RAG-Optimized Monster Translation POC ---");
        
        await loadConfig();
        
        const MONSTER_SEARCH = "Adult Red Dragon";
        console.log(`Fetching monster: ${MONSTER_SEARCH}`);
        
        const res = await fetch(`https://monster-service.dndbeyond.com/v1/Monster?search=${encodeURIComponent(MONSTER_SEARCH)}&take=1`);
        if (!res.ok) throw new Error("Failed to fetch monster");
        const json = await res.json();
        
        const monster = json.data[0];
        if (!monster) throw new Error("Monster not found");
        
        // Dump raw for debugging
        fs.writeFileSync('../../scratch/raw_monster.json', JSON.stringify(monster, null, 2));
        
        console.log(`Found: ${monster.name} (ID: ${monster.id})`);
        
        // Ensure slug is globally available for Turndown
        const slug = monster.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        global.CURRENT_MONSTER_SLUG = slug;
        
        // 3. Translate IDs into readable markdown
        let markdown = `# ${monster.name} {#monster:${slug}}\n\n`;
        markdown += `*${getSize(monster.sizeId)} ${getMonsterType(monster.typeId)}, ${getAlignment(monster.alignmentId)}*\n\n`;
        markdown += `**Armor Class:** ${monster.armorClass} ${monster.armorClassDescription ? `(${monster.armorClassDescription})` : ''}\n`;
        markdown += `**Hit Points:** ${monster.averageHitPoints} (${monster.hitPointDice.diceString})\n`;
        
        const speedList = (monster.movements || []).map(m => `${getMovement(m.movementId)} ${m.speed} ft.`).join(', ');
        markdown += `**Speed:** ${speedList || '0 ft.'}\n\n`;
        
        const statStr = (monster.stats || []).map(s => `**${getStat(s.statId)}:** ${s.value}`).join(' | ');
        markdown += `${statStr}\n\n`;
        
        // FIX: Handle skill value/bonus safely
        const skills = (monster.skills || []).map(s => {
            const val = s.value !== null ? s.value : s.additionalBonus;
            const sign = val >= 0 ? '+' : '';
            return `${getSkill(s.skillId)} ${sign}${val}`;
        }).join(', ');
        if (skills) markdown += `**Skills:** ${skills}\n`;
        
        const senses = (monster.senses || []).map(s => `${getSense(s.senseId)} ${s.notes || ''}`.trim()).join(', ');
        const pp = monster.passivePerception ? `Passive Perception ${monster.passivePerception}` : '';
        markdown += `**Senses:** ${[senses, pp].filter(Boolean).join(', ')}\n`;
        
        markdown += `**Challenge:** ${getChallengeRating(monster.challengeRatingId)}\n\n`;
        
        if (monster.specialTraitsDescription) {
            markdown += `### Special Traits\n${turndownService.turndown(monster.specialTraitsDescription)}\n\n`;
        }
        if (monster.actionsDescription) {
            markdown += `### Actions\n${turndownService.turndown(monster.actionsDescription)}\n\n`;
        }
        if (monster.legendaryActionsDescription) {
            markdown += `### Legendary Actions\n${turndownService.turndown(monster.legendaryActionsDescription)}\n\n`;
        }
        
        // RAG Optimization: XML Wrapping
        const finalOutput = `<ENTRY type="MONSTER" name="${monster.name}" source="Monster Service">\n\n${markdown.trim()}\n\n</ENTRY>`;
        
        const outputPath = '../../poc_output.md';
        fs.writeFileSync(outputPath, finalOutput);
        console.log(`\n✅ RAG-Optimized POC Complete! Output saved to: ${outputPath}`);
        
    } catch (e) {
        console.error("POC Failed:", e.message);
    }
}

runMonsterPOC();
