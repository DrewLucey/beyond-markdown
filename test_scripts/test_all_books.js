import { execSync } from 'child_process';

const slugs = ['dmg-2014', 'cos', 'tcoe', 'hcs', 'phb-2024', 'fraif', 'rthw', 'vtmbbb'];

for (const slug of slugs) {
    console.log(`\n============================`);
    console.log(`Testing book: ${slug}`);
    console.log(`============================`);
    try {
        console.log(`Running extract.js for ${slug}...`);
        execSync(`node src/scripts/extract.js ${slug}`, { stdio: 'inherit' });
        
        console.log(`\nRunning stitcher.js for ${slug}...`);
        execSync(`node src/scripts/stitcher.js ${slug}`, { stdio: 'inherit' });
    } catch (e) {
        console.error(`Failed on ${slug}: ${e.message}`);
    }
}
console.log("\n✅ All testing complete.");
