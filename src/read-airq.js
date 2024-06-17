import cryptoJs from 'crypto-js';
import fetch from 'node-fetch';
import winston from 'winston';

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.simple()),
    transports: [new winston.transports.Console()],
    exitOnError: false,
});

import * as db from './db.js';

const BASE_URL = 'http://' + process.env.AIRQ + '/';

// see https://docs.air-q.com/html/en/entschl%C3%BCsseln.html
function decryptData(msgb64, airqpass) {
    if (airqpass.length < 32) {
        for (let i = airqpass.length; i < 32; i++) {
            airqpass += '0';
        }
    } else if (airqpass.length > 32) {
        airqpass = airqpass.substring(0, 32);
    }
    const key = cryptoJs.enc.Utf8.parse(airqpass);
    const ciphertext = cryptoJs.enc.Base64.parse(msgb64);
    const iv = ciphertext.clone();
    iv.sigBytes = 16;
    iv.clamp();
    ciphertext.words.splice(0, 4); // delete 4 words = 16 bytes
    ciphertext.sigBytes -= 16;
    const decrypted = cryptoJs.AES.decrypt({ ciphertext: ciphertext }, key, {
        iv: iv,
    });
    return JSON.parse(decrypted.toString(cryptoJs.enc.Utf8));
}

/**
 * Normalizes air-Q data for storing in MongoDB, normalizing includes
 * * values wich are an array with two elements are converted to a single value and an additional error bar value
 * * DeviceID, Status and TypPS are snake cased
 * * timestamp is converted to corresponding Date object
 *
 * @param data - Measured data from airQ according to https://docs.air-q.com/html/en/datenlesen.html
 * @returns the normalized data object
 */
function normalizeData(data) {
    const normalized = {};

    for (const key in data) {
        if (Array.isArray(data[key]) && data[key].length === 2) {
            const [value, errorBar] = data[key];
            normalized[key] = value;
            normalized[`${key}_errorbar`] = errorBar;
        } else if (key === 'DeviceID') {
            normalized['device_id'] = data[key];
        } else if (key === 'Status') {
            normalized['status'] = data[key];
        } else if (key === 'timestamp') {
            normalized['dateutc'] = new Date(data[key]);
        } else if (key === 'TypPS') {
            normalized['typ_ps'] = data[key];
        } else {
            normalized[key] = data[key];
        }
    }
    return normalized;
}

async function readData() {
    logger.info('calling ' + BASE_URL + 'data');
    const response = await fetch(BASE_URL + 'data', {
        compress: true,
    });

    let exitStatus = 1; // error
    if (response.status !== 200) {
        logger.error(`error getting data: ${response.status} ${response.statusText}`);
    } else {
        try {
            const data = await response.json();
            logger.debug('data: ', data);

            const normalizedData = normalizeData(decryptData(data.content, process.env.AIRQ_PASS));
            logger.debug('content: ', normalizedData);
            await db.Data.create(normalizedData);
            exitStatus = 0; // success
        } catch (e) {
            logger.error('error parsing response:', e);
        }
    }

    logger.info('done, waiting to finish ...');
    db.disconnect();
    process.exit(exitStatus);
}

readData();
