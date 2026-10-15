'use strict';

import { BtDbConfig } from '../BtDbConfig';
import { BtDbClient, BtDbExecutor } from '../BtDbTypes';

export interface BtDbDriver {
    connect(config: BtDbConfig): Promise<BtDbExecutor>;
    createPool(config: BtDbConfig): Promise<BtDbExecutor>;
}

const DRIVER_PACKAGES: Record<BtDbClient, string> = {
    mysql: 'mysql2',
    pg: 'pg',
};

export function toDriverLoadError(error: unknown, pkg: string): unknown {
    const candidate = error as { code?: unknown; message?: unknown } | null | undefined;
    const missingPackage = new RegExp(`Cannot find module '${pkg}(/[^']*)?'`);
    if (candidate && candidate.code === 'MODULE_NOT_FOUND'
        && typeof candidate.message === 'string' && missingPackage.test(candidate.message)) {
        return new Error(`Driver package "${pkg}" is not installed. Run: npm install ${pkg}`);
    }
    return error;
}

// Drivers are imported lazily so that only the package for the chosen client has to be installed.
export async function loadDriver(client: BtDbClient): Promise<BtDbDriver> {
    try {
        if (client === 'mysql') {
            return (await import('./mysql/BtMysqlDriver')).mysqlDriver;
        }
        return (await import('./pg/BtPgDriver')).pgDriver;
    } catch (error) {
        throw toDriverLoadError(error, DRIVER_PACKAGES[client]);
    }
}
