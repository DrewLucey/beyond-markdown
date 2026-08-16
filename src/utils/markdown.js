import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

/**
 * Initializes and configures the Turndown service with GFM and custom rules.
 * @returns {TurndownService} Configured TurndownService instance
 */
export function createTurndownService() {
    const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
    });

    turndownService.use(gfm);

    // Double-Tilde Override for Strikethroughs
    turndownService.addRule('strikethrough', {
        filter: ['del', 's', 'strike'],
        replacement: function (content) {
            return '~~' + content + '~~';
        },
    });

    return turndownService;
}

const turndownService = createTurndownService();

/**
 * Converts HTML to Markdown using the configured Turndown service.
 * @param {string} html - The HTML string to convert
 * @returns {string} The formatted Markdown string
 */
export function convertToMarkdown(html) {
    if (!html) return '';
    let markdown = turndownService.turndown(html.replace(/&nbsp;|\u00A0/g, ' '));
    return markdown.replace(/^[\s\u00A0\uFEFF\xA0]+/, '');
}
