import fs from 'fs';
import { convertWording } from './rules_converter.js';

const sourceFile = process.argv[2];
const targetRuleset = process.argv[3]; // '2014' or '2024'
const destinationFile = process.argv[4];

if (!sourceFile || !targetRuleset || !destinationFile) {
    console.error(
        'Usage: node file_converter.js <source_file> <target_ruleset> <destination_file>',
    );
    process.exit(1);
}

const direction = targetRuleset === '2024' ? '2014to2024' : '2024to2014';

try {
    console.log(`Reading: ${sourceFile}`);
    let content = fs.readFileSync(sourceFile, 'utf-8');

    // Update all XML ruleset tags
    const entryMatch = content.match(/(<[A-Z]+[^>]*ruleset=")([^"]+)(")/i);
    if (entryMatch) {
        const rulesetLabel = targetRuleset === '2024' ? '5.5e' : '5e';
        content = content.replace(/(<[A-Z]+[^>]*ruleset=")([^"]+)(")/gi, `$1${rulesetLabel}$3`);
        console.log(`Updated XML ruleset attributes to ${rulesetLabel}`);
    }

    // Optional: Add migration alert for mechanics if going to 2024
    if (direction === '2014to2024' && content.match(/<ENTRY[^>]*chapter="species"/i)) {
        content = content.replace(/\*\*Ability Score Increase\*\*.*?(\n|$)/gi, '');
        // Inject below header if possible
        content = content.replace(
            /^(#\s+.*?\n\n)/m,
            `$1> **[MIGRATION ALERT]:** *Ability Score Increases must be selected via custom 2024 background profiles.*\n\n`,
        );
    }

    console.log(`Applying ${direction} wording translation...`);
    content = convertWording(content, direction);

    fs.writeFileSync(destinationFile, content);
    console.log(`Successfully wrote converted file to: ${destinationFile}`);
} catch (error) {
    console.error(`Conversion failed: ${error.message}`);
    process.exit(1);
}
