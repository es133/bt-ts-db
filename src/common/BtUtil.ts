'use strict';

import fs from 'fs';

export class BtUtil {
    static loadJson(jsonFilePath: string): any {
        if (!jsonFilePath) {
            throw new Error('Json file path missing.');
        }

        try {
            return JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'));
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    static hasInvalidKey(keys: Array<string>, jsonObject: Record<string, any>): boolean {
        return Object.keys(jsonObject).some(jsonKey => !keys.includes(jsonKey));
    }
}
