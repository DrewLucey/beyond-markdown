import fs from 'fs';

async function investigateAPI() {
    try {
        console.log("Fetching rule-data...");
        const res = await fetch('https://character-service.dndbeyond.com/character/v5/rule-data');
        const ruleData = await res.json();
        
        console.log("Rule Data Keys:", Object.keys(ruleData.data));
        
        fs.writeFileSync('rule-data.json', JSON.stringify(ruleData.data, null, 2));
        console.log("Saved rule-data.json");
        
    } catch (e) {
        console.error(e.message);
    }
}

investigateAPI();
