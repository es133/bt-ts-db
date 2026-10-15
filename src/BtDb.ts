'use strict';

import { BtDbConfig } from './BtDbConfig';
import { BtDbExecutor } from './BtDbTypes';
import { loadDriver } from './driver/BtDbDriver';

export class BtDb {
    constructor () {}

    static async buildConnection(config: BtDbConfig): Promise<BtDbExecutor> {
        const driver = await loadDriver(config.client);
        return driver.connect(config);
    }

    static async buildConnectionPool(config: BtDbConfig): Promise<BtDbExecutor> {
        const driver = await loadDriver(config.client);
        return driver.createPool(config);
    }
}

export * from './BtDbTypes';
export * from './BtDbConfig';
export { BtDbAbstractDao } from './BtDbAbstractDao';
export { BtDbQueryInterface } from './query/BtDbQueryInterface';
