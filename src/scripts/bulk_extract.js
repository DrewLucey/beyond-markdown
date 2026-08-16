/**
 * bulk_extract.js
 * The Ultimate Compendium Extractor.
 * Handles paginated listings, bypasses anti-bot measures, and wraps items for the central Repository Stitcher.
 */
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { processContent, formatMarkdown } from './js/handlers.js';
import { getDirname } from '../utils/paths.js';
import { getRawCobaltSession } from '../utils/auth.js';
import { createTurndownService } from '../utils/markdown.js';

const require = createRequire(import.meta.url);
const __dirname = getDirname(import.meta.url);

const turndownService = createTurndownService();
/**
 * The Ultimate Compendium Extractor.
 * Handles paginated listings, bypasses anti-bot measures, and wraps items for the central Repository Stitcher.
 */
async function runBulkPipeline() {
    const sessionToken = getRawCobaltSession();
    const reqHeaders = {
        Cookie: sessionToken ? `CobaltSession=${sessionToken}` : '',
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
    };

    const items = [];

    while (hasNext) {
        process.stdout.write(`\rScouting Page ${currentPage}...`);
        const pageUrl = `https://www.dndbeyond.com${targetPath}?filter-partnered-content=t&page=${currentPage}`;

        try {
            const res = await axios.get(pageUrl, { headers: reqHeaders });
            const $ = cheerio.load(res.data, {
                lowerCaseTags: false,
                lowerCaseAttributeNames: false,
            });

            // --- THE ANCHOR SCAVENGER ---
            const categoryBase = `${targetPath}/`;
            let foundOnPage = 0;

            $('a').each((_, el) => {
                let url = $(el).attr('href');
                if (!url) return;

                const relativeUrl = url.replace('https://www.dndbeyond.com', '');

                if (
                    relativeUrl.startsWith(categoryBase) &&
                    relativeUrl.length > categoryBase.length
                ) {
                    // Ignore pagination, comments, and explicit marketplace links
                    if (
                        relativeUrl.includes('?') ||
                        relativeUrl.includes('#') ||
                        relativeUrl.includes('/marketplace/') ||
                        url.includes('marketplace.dndbeyond.com')
                    )
                        return;

                    let name =
                        $(el).find('.listing-card__title').text().trim() ||
                        $(el).text().replace(/\s+/g, ' ').trim();
                    if (!name || name.length < 2) return;

                    if (!url.startsWith('http')) url = 'https://www.dndbeyond.com' + url;

                    // Scrape sourcebook from listing page if available (crucial for /classes)
                    let listSource = '';
                    const $card = $(el).closest('[data-collapsible-search], .listing-card');
                    if ($card.length > 0) {
                        const dataSearch = $card.attr('data-collapsible-search');
                        if (dataSearch && dataSearch.includes('|')) {
                            listSource = dataSearch.split('|')[1].trim();
                        } else {
                            const sourceDiv = $card.find('.listing-card__source').text().trim();
                            if (sourceDiv) listSource = sourceDiv;
                        }
                    }

                    // Deduplicate
                    if (!items.find((i) => i.url === url)) {
                        items.push({ name, url, listSource });
                        foundOnPage++;
                    }
                }
            });

            if (foundOnPage === 0 && items.length === 0) {
                console.log(
                    `\n  ! No items found on this page. (DDB HTML may have changed or Cloudflare blocked the request)`,
                );
            }

            hasNext = $('.b-pagination-item-next a').length > 0;
            if (hasNext) currentPage++;

            await new Promise((r) => setTimeout(r, 250)); // Throttling
        } catch (e) {
            console.error(`\nFailed to load page ${currentPage}: ${e.message}`);
            break;
        }
    }

    console.log(`\nFound ${items.length} items. Starting extraction...\n`);
    let successCount = 0;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // Fast-fail if the URL is blatantly a marketplace link
        if (item.url.includes('marketplace.dndbeyond.com') || item.url.includes('/marketplace/')) {
            console.warn(`\n  > Skipped (Unowned): ${item.name}`);
            continue;
        }

        try {
            const itemRes = await axios.get(item.url, { headers: reqHeaders });

            // Check if DDB secretly redirected us to the marketplace due to lack of ownership
            const finalUrl = itemRes.request?.res?.responseUrl || item.url;
            if (
                finalUrl.includes('marketplace.dndbeyond.com') ||
                finalUrl.includes('/marketplace/')
            ) {
                console.warn(`\n  > Skipped (Unowned Redirect): ${item.name}`);
                continue;
            }

            const $s = cheerio.load(itemRes.data, {
                lowerCaseTags: false,
                lowerCaseAttributeNames: false,
            });
            let $content = null;
            const selectors = [
                '.page-content',
                '.p-article-content',
                '.primary-content',
                'main',
                'article',
                '.container',
                '.details-container',
            ];

            for (const sel of selectors) {
                const found = $s(sel);
                if (found.length > 0) {
                    $content = found.first();
                    break;
                }
            }

            if ($content && $content.length > 0) {
                // --- SOURCE & RULESET TAGGING ---
                let sourceText = item.listSource || '';
                const sourceEl = $content
                    .find(
                        '.source, .spell-source, .monster-source, .equipment-source, .magic-item-source, .source-summary, .static-container-footer-content span',
                    )
                    .first();
                if (sourceEl.length > 0) {
                    const extractedSource = sourceEl.text().replace(/\s+/g, ' ').trim();
                    if (extractedSource) {
                        sourceText = extractedSource;
                    }
                }

                let rulesetTag = '5e';
                let foundInMap = false;

                if (sourceText) {
                    const cleanSourceTitle = sourceText.split(',')[0].trim();
                    for (const key in rulesMap) {
                        if (rulesMap[key].title === cleanSourceTitle) {
                            rulesetTag = rulesMap[key].ruleset || rulesetTag;
                            foundInMap = true;
                            break;
                        }
                    }
                }

                if (!foundInMap) {
                    if (sourceText.includes('2024')) rulesetTag = '2024';
                    else if (sourceText.includes('2014')) rulesetTag = '2014';
                }

                // --- THE BADGE SANITIZER ---
                const legacyBadge = $s('.badge, #legacy-badge');
                let finalItemName = item.name.trim();
                let isLegacyFlag = 'false';

                if (legacyBadge.length > 0) {
                    isLegacyFlag = 'true';
                    $s('.badge-tooltip, .badge-text, .badge-cta').remove();

                    if (!finalItemName.toLowerCase().includes('(legacy)')) {
                        finalItemName = `${finalItemName} (Legacy)`;
                    }
                    legacyBadge.remove();
                }

                $content.find('h1, .page-title').remove();

                // --- SINGULAR RESOLUTION ---
                const singularCategory =
                    CATEGORY_SINGULAR_MAP[targetPath] ||
                    categoryFolderName.replace(/es$/, '').replace(/s$/, '');
                const entryTypeTag = singularCategory.toUpperCase().replace(/-/g, '_'); // e.g. MAGIC_ITEM, SPELL, ITEM

                // --- DOUBLE-DOMAIN IMAGE FIX ---
                $content.find('img, a').each((_, el) => {
                    const attr = $s(el).is('img') ? 'src' : 'href';
                    let val = $s(el).attr(attr);
                    if (val && val.startsWith('//')) {
                        $s(el).attr(attr, 'https:' + val);
                    }
                });

                const cleanHtml = processContent($s, $content, item.url, entryTypeTag);
                let markdown = turndownService.turndown(cleanHtml);

                // --- ESCAPE CHARACTER FIX ---
                markdown = markdown.replace(/\\\*/g, '*');
                markdown = markdown.replace(/\\\[/g, '[');
                markdown = markdown.replace(/\\\]/g, ']');

                // --- FILE & SLUG PREPARATION ---
                const idMatchForFile = item.url.match(/\/(\d+)-/);
                const entityIdPrefix = idMatchForFile ? `${idMatchForFile[1]}-` : '';
                const safeName = item.name.replace(/[<>:"/\\|?*]+/g, '').trim();
                const finalFileName = `${entityIdPrefix}${safeName}.md`;
                const itemSlug = item.url.split('/').pop().split('?')[0].toLowerCase();

                // --- URN TITLE INJECTION ---
                const urnHeader = `# ${finalItemName} {#ref:${singularCategory}:${itemSlug}}\n\n`;
                markdown = markdown.replace(/^[\s\u00A0\uFEFF\xA0]+/, '');
                markdown = urnHeader + markdown;

                // --- NAMESPACE HEADING IDS ---
                markdown = markdown.replace(/\{#([^}]+)\}/g, (match, p1) => {
                    if (p1.startsWith('ref:')) return match;
                    return `{#${singularCategory}:${itemSlug}:${p1.toLowerCase()}}`;
                });

                // ENVELOPING FOR STITCHER
                let wrappedMarkdown = `<ENTRY type="${entryTypeTag}" name="${finalItemName}" source_url="${item.url}" source_book="${sourceText}" ruleset="${rulesetTag}" is_legacy="${isLegacyFlag}">\n\n${markdown}\n</ENTRY>`;

                // FORMAT PASS (PRETTIER)
                wrappedMarkdown = await formatMarkdown(wrappedMarkdown);

                fs.writeFileSync(path.join(outputDir, finalFileName), wrappedMarkdown);
                successCount++;
                process.stdout.write(
                    `\r[${i + 1}/${items.length}] Extracted: ${item.name.substring(0, 40).padEnd(40)}`,
                );
            }
        } catch (e) {
            console.error(`\n  > Error on ${item.name}: ${e.message}`);
        }

        await new Promise((r) => setTimeout(r, 1000)); // Throttling
    }

    console.log(`\n\nSuccess! Saved ${successCount} formatted items to ${outputDir}`);
}

runBulkPipeline();
