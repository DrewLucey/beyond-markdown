/**
 * js/handlers.js
 * Handles DOM surgery to ensure technical fidelity before Markdown conversion.
 */
export function processContent($, $content, sectionUrl, category = 'GENERAL') {
    // 1. NOISE SANITIZATION
    $content.find('style, script, aside.secondary-content, .p-article-byline, .p-article-header, .p-article-header-mobile, .p-article-header-full, .p-article-header-desktop, #comments, .comments, .b-comments').remove();

    // 2. ACTION ICONS (2024 Redesign Fix)
    $content.find('.ddb-action-icon--action, [data-original-title="Action"], [aria-label="Action"]').replaceWith(' <strong>[Action]</strong> ');
    $content.find('.ddb-action-icon--bonus-action, [data-original-title="Bonus Action"], [aria-label="Bonus Action"]').replaceWith(' <strong>[Bonus Action]</strong> ');
    $content.find('.ddb-action-icon--reaction, [data-original-title="Reaction"], [aria-label="Reaction"]').replaceWith(' <strong>[Reaction]</strong> ');
    $content.find('.ddb-action-icon--legendary-action, [data-original-title="Legendary Action"], [aria-label="Legendary Action"]').replaceWith(' <strong>[Legendary Action]</strong> ');

    // 3. THE FOOTNOTE INLINER (The "Unresolved Pointer" Fix)
    // Hunts down dangling asterisks at the bottom of spells and prepares them for inlining
    let footnoteText = "";
    $content.find('p, div, span, em, i, li').each((_, el) => {
        const $el = $(el);
        if ($el.children('p, div, ul').length === 0) { 
            const text = $el.text().trim();
            const match = text.match(/^\*\s*[-–]?\s*(.+)/);
            if (match) {
                footnoteText = match[1].trim();
                if (footnoteText.startsWith('(') && footnoteText.endsWith(')')) {
                    footnoteText = footnoteText.slice(1, -1);
                }
                $el.remove(); 
            }
        }
    });

    const statBlockWrappers = [
        '.ddb-statblock-item', 
        '.tooltip-body-statblock-item', 
        '.mon-stat-block__stat-block',
        '.spell-details__parameter',
        '.mon-stat-block__tidbit'
    ];

    if (footnoteText) {
        $content.find(statBlockWrappers.join(', ')).each((_, el) => {
            const $value = $(el).find('[class*="-value"], [class*="-data"]');
            if ($value.length > 0 && $value.text().includes('*')) {
                const newHtml = $value.html().split('*').join(` (${footnoteText})`);
                $value.html(newHtml);
            }
        });
    }

    // 4. AI-OPTIMIZED STATBLOCK FORMATTER (**Label:** Value)
    $content.find(statBlockWrappers.join(', ')).each((_, el) => {
        const $el = $(el);
        const $label = $el.find('[class*="-label"]');
        const $value = $el.find('[class*="-value"], [class*="-data"]');
        
        if ($label.length > 0 && $value.length > 0) {
            const labelText = $label.text().trim().replace(/:$/, '');
            let valueHtml = $value.html() ? $value.html().trim() : '';
            
            const $extra = $el.find('[class*="-extra"]');
            if ($extra.length > 0) valueHtml += ' ' + ($extra.html() ? $extra.html().trim() : '');

            $el.replaceWith(`<p><strong>${labelText}:</strong> ${valueHtml}</p>`);
        }
    });

    // 5. ADVENTURE MUNCHER UPGRADES
    $content.find('.compendium-blockquote, .p-article-blockquote, .admin-block').each((_, el) => {
        const $el = $(el);
        $el.replaceWith(`<blockquote>${$el.html()}</blockquote>`);
    });

    $content.find('a.lightbox').each((_, el) => {
        const $a = $(el);
        const highResUrl = $a.attr('href') || $a.attr('data-imageurl');
        const altText = $a.find('img').attr('alt') || 'Image';
        if (highResUrl) $a.replaceWith(`<img src="${highResUrl}" alt="${altText}">`);
    });

    $content.find('.tooltip-hover, .m-spell-hover, .monster-tooltip, .magic-item-tooltip, .rollable').each((_, el) => {
        const $el = $(el);
        $el.replaceWith(`<strong>${$el.text().trim()}</strong>`);
    });

    $content.find('a:contains("View Cover Art")').remove();

    // 6. SUBSTANCE SCRUBBER
    while ($content.contents().length > 0) {
        const first = $content.contents().first();
        const hasText = first.text().replace(/\u00A0/g, ' ').trim().length > 0;
        const hasMedia = first.find('img, table, iframe').length > 0;
        const isHeader = /^h[1-6]$/i.test(first[0].tagName || '');
        if (hasText || hasMedia || isHeader) break; 
        first.remove();
    }

    // 7. HEADER DE-DUPLICATION
    const h1 = $content.find('h1').first();
    if (h1.length > 0) {
        const h1Text = h1.text().replace(/\u00A0/g, ' ').trim().toLowerCase();
        $content.find('h2, h3, h4').each((_, el) => {
            const $el = $(el);
            if ($el.text().replace(/\u00A0/g, ' ').trim().toLowerCase() === h1Text || $el.text().trim() === "") {
                $el.remove();
            }
        });
    }

    // 8. UNIVERSAL STAT BLOCK SURGERY (Unrestricted by category)
    // A. Attribute Grid (STR, DEX, CON) - AI Optimized Format

    // Format 1: Compendium & Adventure Sourcebooks (.mon-stat-block__attributes)
    $content.find('.mon-stat-block__attributes').each((_, el) => {
        const $attrBlock = $(el);
        let attributesHtml = '';
        
        $attrBlock.find('.mon-stat-block__attribute').each((_, attr) => {
            const $attr = $(attr);
            const label = $attr.find('.mon-stat-block__attribute-label').text().trim();
            const val = $attr.find('.mon-stat-block__attribute-data-value').text().trim();
            const extra = $attr.find('.mon-stat-block__attribute-data-extra').text().trim();
            
            if (label && val) {
                attributesHtml += `<p><strong>${label}:</strong> ${val} ${extra}</p>`;
            }
        });

        if (attributesHtml) {
            $attrBlock.replaceWith(`<div>${attributesHtml}</div>`);
        }
    });

    // Format 2: Standalone Monster Database Pages (.ability-block)
    $content.find('.ability-block').each((_, el) => {
        const $attrBlock = $(el);
        let attributesHtml = '';
        
        $attrBlock.find('.ability-block__stat').each((_, attr) => {
            const $attr = $(attr);
            const label = $attr.find('.ability-block__heading').text().trim();
            const score = $attr.find('.ability-block__score').text().trim();
            const modifier = $attr.find('.ability-block__modifier').text().trim();
            
            if (label && score) {
                attributesHtml += `<p><strong>${label}:</strong> ${score} ${modifier}</p>`;
            }
        });

        if (attributesHtml) {
            $attrBlock.replaceWith(`<div>${attributesHtml}</div>`);
        }
    });

    // B. Section Headers (Traits, Actions, Bonus Actions, Legendary Actions)
    const headerSelectors = [
        '.mon-stat-block__description-block-heading', 
        '.mon-stat-block__description-heading', 
        '.ddb-statblock-section-heading',
        '.monster-header'
    ];
    
    $content.find(headerSelectors.join(', ')).each((_, el) => {
        const $el = $(el);
        $el.replaceWith(`<h3>${$el.text().trim()}</h3>`);
    });

    // 9. TABLE PRE-PROCESSING & FLATTENING
    $content.find('table').each((_, table) => {
        const $table = $(table);
        const $caption = $table.find('caption');
        if ($caption.length > 0) {
            const captionText = $caption.text().trim();
            if (captionText) $table.before(`\n\n<strong>${captionText}</strong>\n`); 
            $caption.remove();
        }
        $table.find('colgroup, col').remove();

        $table.find('td, th').each((_, cell) => {
            const $cell = $(cell);
            $cell.find('br').replaceWith(' ');
            let blocks = $cell.find('p, div, section, h1, h2, h3, h4, h5, h6');
            while (blocks.length > 0) {
                blocks.each((_, b) => { $(b).replaceWith($(b).contents()); });
                blocks = $cell.find('p, div, section, h1, h2, h3, h4, h5, h6');
            }
            let flatHtml = $cell.html().replace(/\|+/g, '\\|').replace(/[\n\r\t]+/g, ' ').trim();
            $cell.html(flatHtml);
        });

        const rows = $table.find('tr');
        const grid = [];
        rows.each((rowIndex, tr) => {
            if (!grid[rowIndex]) grid[rowIndex] = [];
            let colIndex = 0;
            $(tr).find('td, th').each((_, cell) => {
                const $cell = $(cell);
                const rowspan = parseInt($cell.attr('rowspan')) || 1;
                const colspan = parseInt($cell.attr('colspan')) || 1;
                const content = $cell.html().trim();
                while (grid[rowIndex][colIndex]) colIndex++;
                for (let r = 0; r < rowspan; r++) {
                    for (let c = 0; r + rowIndex < rows.length && c < colspan; c++) {
                        if (!grid[rowIndex + r]) grid[rowIndex + r] = [];
                        grid[rowIndex + r][colIndex + c] = content;
                    }
                }
                colIndex += colspan;
            });
        });

        const $newTable = $('<table></table>');
        grid.forEach((row, r) => {
            const $tr = $('<tr></tr>');
            row.forEach(cellContent => {
                const tag = r === 0 ? '<th></th>' : '<td></td>';
                $tr.append($(tag).html(cellContent));
            });
            if (r === 0) $newTable.append($('<thead></thead>').append($tr));
            else $newTable.append($tr);
        });
        $table.replaceWith($newTable);
    });

    // 10. LINK RESOLUTION
    $content.find('a, img').each((_, el) => {
        const attr = $(el).is('a') ? 'href' : 'src';
        const val = $(el).attr(attr);
        if (val && !val.startsWith('#') && !val.startsWith('http')) {
            try { $(el).attr(attr, new URL(val, 'https://www.dndbeyond.com').href); } catch (e) {}
        }
    });

    $('a:empty').remove();
    return $content.html();
}