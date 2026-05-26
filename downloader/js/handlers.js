/**
 * js/handlers.js
 * Handles DOM surgery to ensure technical fidelity before Markdown conversion.
 */
export function processContent($, $content, sectionUrl, category = 'GENERAL') {
    // 1. NOISE SANITIZATION
    $content.find('style, script, aside.secondary-content, .p-article-byline, .p-article-header, .p-article-header-mobile, .p-article-header-full, .p-article-header-desktop, #comments, .comments, .b-comments').remove();

    // 1.2 ACCESSIBILITY SCRUBBER
    // Removes screen-reader specific text that becomes redundant in Markdown
    $content.find('.visually-hidden, .sr-only').each((_, el) => {
        const $el = $(el);
        if ($el.text().trim().toLowerCase().includes('crossed-out')) {
            $el.remove();
        }
    });

    // 1.5 THE COMMENT GUILLOTINE
    const $commentsHeader = $content.find('h1, h2, h3, h4, h5, h6, header').filter((_, el) => {
        return $(el).text().trim().toLowerCase() === 'comments';
    });

    if ($commentsHeader.length > 0) {
        let $target = $commentsHeader.first();
        while ($target.parent().length > 0 && $target.parent()[0] !== $content[0]) {
            $target = $target.parent();
        }
        $target.nextAll().remove();
        $target.remove();
    }

    $content.find('p, div, span, strong, em').filter((_, el) => {
        const text = $(el).text().toLowerCase();
        return text.includes('when posting, please be sure') && text.includes('terms of service');
    }).remove();

    // 2. ACTION ICONS
    $content.find('.ddb-action-icon--action, [data-original-title="Action"], [aria-label="Action"]').replaceWith(' <strong>[Action]</strong> ');
    $content.find('.ddb-action-icon--bonus-action, [data-original-title="Bonus Action"], [aria-label="Bonus Action"]').replaceWith(' <strong>[Bonus Action]</strong> ');
    $content.find('.ddb-action-icon--reaction, [data-original-title="Reaction"], [aria-label="Reaction"]').replaceWith(' <strong>[Reaction]</strong> ');
    $content.find('.ddb-action-icon--legendary-action, [data-original-title="Legendary Action"], [aria-label="Legendary Action"]').replaceWith(' <strong>[Legendary Action]</strong> ');

    // 3. THE FOOTNOTE INLINER
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

    // 4. AI-OPTIMIZED STATBLOCK FORMATTER
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

    // 4.5 TAG FORMATTER (Fixes squished and fragmented tags)
    // Extracts tags, normalizes the label, and rebuilds as a single inline paragraph
    $content.find('.tags').each((_, container) => {
        const $container = $(container);
        
        // Extract the tags and remove them from the DOM
        const tags = [];
        $container.find('.tag').each((_, tag) => {
            const tagText = $(tag).text().replace(/\s+/g, ' ').trim();
            if (tagText) tags.push(tagText);
            $(tag).remove();
        });

        // Convert any remaining block-level elements (like <div class="label">) into spans 
        // to prevent Turndown from forcefully injecting line breaks
        $container.find('div, p').each((_, el) => {
            const $el = $(el);
            $el.replaceWith(`<span>${$el.html()}</span>`);
        });

        // Get the cleaned up label HTML
        const labelHtml = $container.html().replace(/&nbsp;|\u00A0/g, ' ').replace(/\s+/g, ' ').trim();

        if (tags.length > 0 || labelHtml) {
            const space = labelHtml && !labelHtml.endsWith(' ') ? ' ' : '';
            $container.replaceWith(`<p>${labelHtml}${space}${tags.join(', ')}</p>`);
        }
    });

    // 5. ADVENTURE MUNCHER UPGRADES
    const blockquoteSelectors = [
        '.compendium-blockquote', 
        '.p-article-blockquote', 
        '.admin-block',
        'aside'
    ];
    
    $content.find(blockquoteSelectors.join(', ')).each((_, el) => {
        const $el = $(el);

        const $firstChild = $el.children().first();
        if ($firstChild.length > 0 && $firstChild[0].tagName.toLowerCase() === 'p') {
            const text = $firstChild.text().trim();
            const wordCount = text.split(/\s+/).length;
            const endsWithPunctuation = /[.!?]$/.test(text);
            
            if (wordCount <= 12 && !endsWithPunctuation && text.length > 0) {
                $firstChild.replaceWith(`<h4>${$firstChild.html()}</h4>`);
            }
        }

        $el.replaceWith(`<blockquote>${$el.html()}</blockquote>`);
    });

    $content.find('a.lightbox').each((_, el) => {
        const $a = $(el);
        const highResUrl = $a.attr('href') || $a.attr('data-imageurl');
        const altText = $a.find('img').attr('alt') || 'Image';
        if (highResUrl) $a.replaceWith(`<img src="${highResUrl}" alt="${altText}">`);
    });

    // --- NESTED BOLD PREVENTER & LINK PRESERVER ---
    $content.find('.tooltip-hover, .m-spell-hover, .monster-tooltip, .magic-item-tooltip, .rollable').each((_, el) => {
        const $el = $(el);
        let text = $el.text().trim();
        const href = $el.attr('href'); // Will be undefined if the tooltip is on a span
        
        // Check if we need to add bolding (prevent **** nested bolding)
        if ($el.closest('strong, b, h1, h2, h3, h4, h5, h6').length === 0) {
            text = `<strong>${text}</strong>`;
        }

        // If it has a valid destination link, preserve the anchor!
        if (href && !href.startsWith('#')) {
            $el.replaceWith(`<a href="${href}">${text}</a>`);
        } else {
            $el.replaceWith(text);
        }
    });

    $content.find('a:contains("View Cover Art")').remove();

    // 6. IMAGE METADATA BINDING
    $content.find('figure, .compendium-art').each((_, el) => {
        const $wrapper = $(el);
        const $img = $wrapper.find('img').first();
        
        if ($img.length > 0) {
            let altParts = [];
            
            const $caption = $wrapper.find('figcaption');
            if ($caption.length > 0) {
                const text = $caption.text().replace(/\s+/g, ' ').trim();
                if (text) altParts.push(text);
                $caption.remove(); 
            }
            
            const $artist = $wrapper.find('.artist-credit');
            if ($artist.length > 0) {
                const text = $artist.text().replace(/\s+/g, ' ').trim();
                if (text) altParts.push(`(Artist: ${text})`);
                $artist.remove(); 
            }

            if (altParts.length === 0 || (altParts.length === 1 && altParts[0].startsWith('(Artist:'))) {
                 let baseAlt = $img.attr('alt') || $img.attr('title') || '';
                 baseAlt = baseAlt.trim();
                 if (baseAlt && baseAlt !== 'Image') {
                     altParts.unshift(baseAlt);
                 }
            }

            if (altParts.length > 0) {
                $img.attr('alt', altParts.join(' '));
            } else {
                $img.attr('alt', 'Image'); 
            }
        }
    });

    $content.find('.artist-credit, figcaption').remove();

    // 7. SUBSTANCE SCRUBBER
    while ($content.contents().length > 0) {
        const first = $content.contents().first();
        const hasText = first.text().replace(/\u00A0/g, ' ').trim().length > 0;
        const hasMedia = first.find('img, table, iframe').length > 0;
        const isHeader = /^h[1-6]$/i.test(first[0].tagName || '');
        if (hasText || hasMedia || isHeader) break; 
        first.remove();
    }

    // 8. HEADER DE-DUPLICATION
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

    // 9. UNIVERSAL STAT BLOCK SURGERY
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

    // 9.5. SINGLE-COLUMN "CARD" TABLE UNWRAPPER
    $content.find('table').each((_, table) => {
        const $table = $(table);
        const $ths = $table.find('th');
        const $tds = $table.find('td');

        if ($ths.length === 1 && $tds.length === 1) {
            const title = $ths.text().trim();
            const $cell = $tds.first();

            $cell.find('strong').each((_, el) => {
                const $strong = $(el);
                $strong.find('br').remove();
                let text = $strong.text().trim();
                
                if (text && !text.endsWith(':')) {
                    $strong.text(text + ': ');
                } else if (text) {
                    $strong.text(text + ' ');
                }
            });

            let cellHtml = $cell.html() || '';
            cellHtml = cellHtml.replace(/<\/strong>\s*<br\s*\/?>/gi, '</strong> ');
            cellHtml = cellHtml.replace(/<br\s*\/?>/gi, '</p><p>');
            cellHtml = cellHtml.replace(/<p>\s*<\/p>/gi, '');

            $table.replaceWith(`<div>\n<p><strong>${title}</strong></p>\n<p>${cellHtml}</p>\n</div>`);
        }
    });

    // 9.6. MULTI-ROW SINGLE-COLUMN TABLE UNWRAPPER
    // Flattens tables that act as vertical lists (max 1 column wide but multiple rows)
    $content.find('table').each((_, table) => {
        const $table = $(table);
        
        // Calculate the maximum number of columns in any row
        let maxCols = 0;
        $table.find('tr').each((_, tr) => {
            const cols = $(tr).children('th, td').length;
            if (cols > maxCols) maxCols = cols;
        });

        // If the table never exceeds 1 column, unwrap it completely
        if (maxCols === 1 && $table.find('th, td').length > 1) {
            let combinedHtml = '';
            
            // Preserve captions (like the Ability Score Summary header)
            const $caption = $table.find('caption');
            if ($caption.length > 0) {
                combinedHtml += $caption.html();
            }

            // Extract and stack each row's content
            $table.find('tr').each((_, tr) => {
                const $cell = $(tr).children('th, td').first();
                if ($cell.length > 0) {
                    let cellHtml = $cell.html().trim();
                    
                    // If the cell is just a bold category name, ensure it spaces nicely
                    if ($cell.children().length === 1 && $cell.children('strong, b').length === 1) {
                        combinedHtml += `<p><strong>${$cell.text().trim()}</strong></p>`;
                    } else {
                        // Otherwise, drop the complex HTML in a div to prevent table formatting
                        combinedHtml += `<div>${cellHtml}</div>`;
                    }
                }
            });

            $table.replaceWith(`<div>${combinedHtml}</div>`);
        }
    });

    // 9.75 PSEUDO-LIST CONVERTER (.hangingIndent)
    $content.find('div.hangingIndent, div.condensed-group.hangingIndent').each((_, el) => {
        const $div = $(el);
        const $children = $div.children('p, div');
        
        if ($children.length > 0) {
            const $ul = $('<ul></ul>');
            $children.each((_, child) => {
                const $child = $(child);
                let content = $child.html() || '';
                
                content = content.replace(/&nbsp;|\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
                
                if (content) {
                    $ul.append(`<li>${content}</li>`);
                }
            });
            $div.replaceWith($ul);
        }
    });

    // 9.8 ORPHANED LIST TUCKER 
    $content.find('ol > ul, ol > ol, ul > ul, ul > ol').each((_, sublist) => {
        const $sublist = $(sublist);
        const $prevLi = $sublist.prev('li');
        if ($prevLi.length > 0) {
            $prevLi.append($sublist);
        }
    });

    // 9.85 CONDENSED GROUP TIGHTENER (The Double-Newline Fix)
    // Flattens paragraphs inside non-list .condensed-group divs into a single 
    // paragraph separated by <br> so Turndown stacks them tightly.
    $content.find('div.condensed-group:not(.hangingIndent)').each((_, el) => {
        const $div = $(el);
        const $children = $div.children('p');
        if ($children.length > 0) {
            let combinedHtml = [];
            $children.each((_, p) => {
                combinedHtml.push($(p).html().trim());
            });
            $div.replaceWith(`<p>${combinedHtml.join('<br>')}</p>`);
        }
    });

    // 10. TABLE PRE-PROCESSING & FLATTENING
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

        // 11. LINK RESOLUTION (WITH SCOPED INTERNAL ANCHORS)
    $content.find('a, img').each((_, el) => {
        const isAnchor = $(el).is('a');
        const attr = isAnchor ? 'href' : 'src';
        let val = $(el).attr(attr);
        
        if (!val) return;

        // 1. Normalize all relative URLs to absolute first
        if (val.startsWith('/')) {
            val = 'https://www.dndbeyond.com' + val;
            $(el).attr(attr, val);
        }

        if (isAnchor) {
            // 2. Sourcebook links MUST remain absolute here so stitcher.js can read the manifest!
            if (val.includes('/sources/')) {
                return; // Do NOT strip sourcebook links to hashes.
            }

            // 3. Identify Compendium Links
            const isCompendium = val.includes('/spells/') || val.includes('/monsters/') || val.includes('/magic-items/') || val.includes('/species/') || val.includes('/feats/') || val.includes('/backgrounds/') || val.includes('/equipment/');
            
            if (isCompendium) {
                if (!val.includes('#')) {
                    const parts = val.split('/');
                    const lastPart = parts.pop().split('?')[0]; 
                    
                    // Extract the DDB ID from the URL slug
                    const linkIdMatch = lastPart.match(/^(\d+)-/);
                    if (linkIdMatch) {
                        const entityId = linkIdMatch[1];
                        let cleanName = lastPart.replace(/^\d+-/, '').replace(/-/g, '').replace(/[^a-zA-Z0-9]/g, '');
                        cleanName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
                        
                        $(el).attr('href', `#${cleanName}-${entityId}`);
                    }
                } else {
                    // For compendium links with hashes, keep the hash for internal routing
                    const hash = val.substring(val.indexOf('#'));
                    $(el).attr('href', hash);
                }
            } 
        } else {
            // Handle relative image sources
            if (!val.startsWith('http') && !val.startsWith('data:')) {
                $(el).attr('src', 'https://www.dndbeyond.com' + val);
            }
        }
    });

    $('a:empty').remove();
    return $content.html();
}