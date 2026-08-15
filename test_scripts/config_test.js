import fs from 'fs';

async function fetchConfig() {
    try {
        console.log("Fetching config.json...");
        const res = await fetch('https://www.dndbeyond.com/api/config/json');
        const configData = await res.json();
        
        console.log("Config Data Keys:", Object.keys(configData));
        
        fs.writeFileSync('config-data.json', JSON.stringify(configData, null, 2));
        console.log("Saved config-data.json");
        
    } catch (e) {
        console.error(e.message);
    }
}

fetchConfig();
