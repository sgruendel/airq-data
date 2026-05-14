import assert from 'node:assert/strict';
import test from 'node:test';

import cryptoJs from 'crypto-js';

import { normalizeDeviceDataResponse } from '../../src/read-airq.js';

/**
 * @param {Record<string, unknown>} payload
 * @param {string} airqPass
 * @returns {string}
 */
function encryptDevicePayload(payload, airqPass) {
    let normalizedPass = airqPass;

    if (normalizedPass.length < 32) {
        normalizedPass = normalizedPass.padEnd(32, '0');
    } else if (normalizedPass.length > 32) {
        normalizedPass = normalizedPass.substring(0, 32);
    }

    const key = cryptoJs.enc.Utf8.parse(normalizedPass);
    const iv = cryptoJs.enc.Hex.parse('000102030405060708090a0b0c0d0e0f');
    const encrypted = cryptoJs.AES.encrypt(JSON.stringify(payload), key, { iv: iv });
    const combined = iv.clone().concat(encrypted.ciphertext);

    return cryptoJs.enc.Base64.stringify(combined);
}

test('normalizeDeviceDataResponse converts decrypted device data into normalized values', () => {
    const encryptedContent = encryptDevicePayload(
        {
            DeviceID: 'airq-device',
            Status: { ok: true },
            TypPS: 'sample',
            humidity: [43.5, 0.2],
            timestamp: '2026-05-14T12:00:00.000Z',
        },
        'secret',
    );

    const normalizedData = normalizeDeviceDataResponse({ content: encryptedContent }, 'secret');

    assert.equal(normalizedData.device_id, 'airq-device');
    assert.equal(normalizedData.status, '{"ok":true}');
    assert.equal(normalizedData.typ_ps, 'sample');
    assert.equal(normalizedData.humidity, 43.5);
    assert.equal(normalizedData.humidity_errorbar, 0.2);
    assert.ok(normalizedData.dateutc instanceof Date);
    assert.equal(normalizedData.dateutc.toISOString(), '2026-05-14T12:00:00.000Z');
});
