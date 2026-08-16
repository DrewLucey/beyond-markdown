const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function test() {
    const envPath = path.join(__dirname, '../.env');
    if (!fs.existsSync(envPath)) {
        console.log('No .env found');
        return;
    }
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/^COBALT_SESSION=(.*)$/m);
    if (!match) {
        console.log('No token in .env');
        return;
    }
    const cobalt = match[1].trim();

    try {
        const res = await axios.post('https://auth-service.dndbeyond.com/v1/cobalt-token', null, {
            headers: { Cookie: `CobaltSession=${cobalt}` },
        });

        if (res.data && res.data.token) {
            console.log('Got token.');
            const payloadStr = Buffer.from(res.data.token.split('.')[1], 'base64').toString(
                'utf-8',
            );
            console.log('Payload:', payloadStr);
            const payload = JSON.parse(payloadStr);
            console.log('Keys:', Object.keys(payload));
            if (payload.user) console.log('User keys:', Object.keys(payload.user));
        } else {
            console.log('No token in response:', res.data);
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}
test();
