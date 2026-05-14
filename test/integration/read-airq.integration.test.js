import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const envLocalPath = path.resolve(currentDir, '../../.env.local');

test('readDeviceData reads from the configured air-Q device', async (t) => {
    if (!existsSync(envLocalPath)) {
        t.skip('.env.local not found');
        return;
    }

    const dotenvResult = dotenv.config({ path: envLocalPath });

    if (dotenvResult.error) {
        throw dotenvResult.error;
    }

    if (!dotenvResult.parsed) {
        t.skip('.env.local could not be parsed');
        return;
    }

    if (!process.env.AIRQ) {
        t.skip('AIRQ is not set in .env.local');
        return;
    }

    if (!process.env.AIRQ_PASS) {
        t.skip('AIRQ_PASS is not set in .env.local');
        return;
    }

    const { readDeviceData } = await import('../../src/read-airq.js');
    const normalizedData = await readDeviceData();

    assert.equal(typeof normalizedData.device_id, 'string');
    assert.equal(typeof normalizedData.status, 'string');
    assert.ok(normalizedData.dateutc instanceof Date);
    assert.ok(!Number.isNaN(normalizedData.dateutc.valueOf()));
});
