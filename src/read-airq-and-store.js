import * as db from './db.js';
import { readDeviceData } from './read-airq.js';

/**
 * Reads data from the real air-Q device, decrypts it, normalizes it and stores it in MongoDB.
 */
async function readDeviceDataAndStoreInDb() {
    let exitStatus = 1; // error

    try {
        const normalizedData = await readDeviceData();
        await db.Data.create(normalizedData);
        exitStatus = 0; // success
    } catch (e) {
        console.error('error reading device data:', e);
    }

    db.disconnect();
    process.exit(exitStatus);
}

readDeviceDataAndStoreInDb();
