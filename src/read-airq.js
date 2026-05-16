import cryptoJs from 'crypto-js';
import fetch from 'node-fetch';
import { setTimeout as delay } from 'node:timers/promises';
import winston from 'winston';

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.simple()),
    transports: [new winston.transports.Console()],
    exitOnError: false,
});

/**
 * Gets the base URL for the air-Q device from the AIRQ environment variable.
 *
 * @returns {string} The base URL for the air-Q device
 */
function getBaseUrl() {
    if (!process.env.AIRQ) {
        throw new Error('AIRQ is not set');
    }

    return 'http://' + process.env.AIRQ + '/';
}

/**
 * Gets the air-Q device password from the AIRQ_PASS environment variable.
 *
 * @returns {string} The password used to decrypt the device response
 */
function getAirqPass() {
    if (!process.env.AIRQ_PASS) {
        throw new Error('AIRQ_PASS is not set');
    }

    return process.env.AIRQ_PASS;
}

/**
 * Decrypts the content of the air-Q device response using the provided password,
 * see https://docs.air-q.com/html/en/entschl%C3%BCsseln.html
 *
 * @param {string} msgb64
 * @param {string} airqpass
 * @returns {Record<string, unknown>}
 */
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
    const decrypted = cryptoJs.AES.decrypt(cryptoJs.enc.Base64.stringify(ciphertext), key, {
        iv: iv,
    });
    return JSON.parse(decrypted.toString(cryptoJs.enc.Utf8));
}

/**
 * @typedef {{
 *   content: string,
 * }} AirQDataResponse
 */

/**
 * @typedef {{
 *   [key: string]: unknown,
 *   device_id: string,
 *   status: string,
 *   dateutc: Date,
 *   typ_ps?: unknown,
 * }} NormalizedData
 */

/**
 * @typedef {{
 *   [key: string]: unknown,
 *   device_id?: unknown,
 *   status?: unknown,
 *   dateutc?: Date,
 *   typ_ps?: unknown,
 * }} NormalizedDataDraft
 */

/**
 * Normalizes air-Q data for storing in MongoDB, normalizing includes
 * * values wich are an array with two elements are converted to a single value and an additional error bar value
 * * DeviceID, Status and TypPS are snake cased
 * * status is converted to String if it not already is a String
 * * timestamp is converted to corresponding Date object
 *
 * @param {Record<string, unknown>} data Measured data from airQ according to https://docs.air-q.com/html/en/datenlesen.html
 * @returns {NormalizedData} the normalized data object
 */
function normalizeData(data) {
    /** @type {NormalizedDataDraft} */
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
            normalized['dateutc'] = new Date(/** @type {string | number | Date} */ (data[key]));
        } else if (key === 'TypPS') {
            normalized['typ_ps'] = data[key];
        } else {
            normalized[key] = data[key];
        }
    }

    if (typeof normalized['status'] != 'string') {
        normalized['status'] = JSON.stringify(normalized['status']);
    }
    return /** @type {NormalizedData} */ (normalized);
}

/**
 * Returns true when the normalized device response is missing all required fields.
 *
 * @param {NormalizedDataDraft} data
 * @returns {boolean}
 */
function isMissingRequiredDeviceData(data) {
    return data.device_id == null && data.status == null && data.dateutc == null;
}

/**
 * Reads the raw encrypted response from the real air-Q device.
 * @returns {Promise<AirQDataResponse>}
 */
async function readRawDeviceData() {
    const resolvedBaseUrl = getBaseUrl();

    logger.info('calling ' + resolvedBaseUrl + 'data');
    const response = await fetch(resolvedBaseUrl + 'data', {
        compress: true,
    });

    if (response.status !== 200) {
        throw new Error(`error getting data: ${response.status} ${response.statusText}`);
    }

    return /** @type {AirQDataResponse} */ (await response.json());
}
/**
 * Decrypts and normalizes a raw air-Q device response.
 *
 * @param {AirQDataResponse} data
 * @param {string} [airqPass]
 * @returns {NormalizedData}
 */
export function normalizeDeviceDataResponse(data, airqPass = getAirqPass()) {
    logger.debug('data: ', data);

    try {
        const normalizedData = normalizeData(decryptData(data.content, airqPass));
        logger.debug('content: ', normalizedData);
        return normalizedData;
    } catch (e) {
        logger.info('response content:', data.content);
        throw e;
    }
}

/**
 * Reads data from the real air-Q device, decrypts it and normalizes it for storing in MongoDB.
 *
 * @returns {Promise<NormalizedData>}
 */
export async function readDeviceData() {
    const maxReadAttempts = 3;

    for (let attempt = 1; attempt <= maxReadAttempts; attempt++) {
        const normalizedData = normalizeDeviceDataResponse(await readRawDeviceData());

        if (!isMissingRequiredDeviceData(normalizedData)) {
            return normalizedData;
        }

        logger.warn(`device response missing required fields on attempt ${attempt} of ${maxReadAttempts}`);

        if (attempt < maxReadAttempts) {
            await delay(1000);
        }
    }

    throw new Error(`device response missing required fields after ${maxReadAttempts} attempts`);
}
