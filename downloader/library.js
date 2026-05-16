import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.resolve(__dirname, '../config.cjs');
const config = require(configPath);

// Default to owned & shared library
const LIBRARY_URL = 'https://www.dndbeyond.com/en/library?ownership=owned-shared';

async function crawlLibrary() {
    try {
        console.log(`--- Crawling Library for Available Sources ---`);
        
        const response = await axios.get(LIBRARY_URL, {
            headers: { 'Cookie': `CobaltSession=${config.cobaltSession}` }
        });

        const $ = cheerio.load(response.data);
        const sources = [];

        // DDB Next.js Source Card Selector
        $('[data-testid="sourceCard"]').each((_, el) => {
            const $card = $(el);
            const $link = $card.find('a[class*="sourceTitle"]'); // Matches SourceCard_sourceTitle__u_1x2
            
            const title = $link.text().trim();
            const relativeUrl = $link.attr('href');
            
            // Check status (Purchased, Shared, Free)
            const status = $card.find('[class*="sourceSubtitle"]').text().trim();

            if (title && relativeUrl) {
                sources.push({
                    title,
                    url: `https://www.dndbeyond.com${relativeUrl}`,
                    status: status || 'Unknown'
                });
            }
        });

        if (sources.length === 0) {
            console.warn("! No sources found. Check your CobaltSession or Library URL.");
        } else {
            console.log(`\nDiscovered ${sources.length} sources:\n`);
            sources.forEach((s, i) => {
                console.log(`[${i + 1}] ${s.title} (${s.status})`);
                console.log(`    URL: ${s.url}\n`);
            });
        }

    } catch (error) {
        console.error("Library Crawl Failed:", error.message);
    }
}

crawlLibrary();