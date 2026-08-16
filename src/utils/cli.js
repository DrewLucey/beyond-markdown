import readline from 'readline';

/**
 * Prompts the user with a question in the terminal and returns the answer.
 * @param {string} query - The question to ask
 * @returns {Promise<string>} The user's input
 */
export function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) =>
        rl.question(query, (ans) => {
            rl.close();
            resolve(ans);
        }),
    );
}
