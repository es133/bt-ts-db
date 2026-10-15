'use strict';

import { Client, ClientConfig, Pool, PoolConfig } from 'pg';
import { BtDbConfig } from '../../BtDbConfig';
import { BtDbExecutor, BtDbQueryResult } from '../../BtDbTypes';

function commonConfig(config: BtDbConfig) {
    return {
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        ssl: config.ssl,
        connectionTimeoutMillis: config.connectTimeout,
    };
}

export function pgClientConfig(config: BtDbConfig): ClientConfig {
    return { ...commonConfig(config), ...config.driverOptions };
}

export function pgPoolConfig(config: BtDbConfig): PoolConfig {
    return { ...commonConfig(config), max: config.connectionLimit, ...config.driverOptions };
}

export function normalizePgResult(result: { rows?: any[]; rowCount?: number | null }): BtDbQueryResult {
    return { rows: result.rows ?? [], affectedRows: result.rowCount ?? 0, raw: result };
}

export class PgClientExecutor implements BtDbExecutor {
    constructor(private readonly client: Client) {}

    async execute(sql: string, values?: any): Promise<BtDbQueryResult> {
        return normalizePgResult(await this.client.query(sql, values));
    }

    async query(sql: string, values?: any): Promise<BtDbQueryResult> {
        return this.execute(sql, values);
    }

    async close(): Promise<void> {
        await this.client.end();
    }

    getNative(): unknown {
        return this.client;
    }
}

export class PgPoolExecutor implements BtDbExecutor {
    constructor(private readonly pool: Pool) {}

    async execute(sql: string, values?: any): Promise<BtDbQueryResult> {
        return normalizePgResult(await this.pool.query(sql, values));
    }

    async query(sql: string, values?: any): Promise<BtDbQueryResult> {
        return this.execute(sql, values);
    }

    async close(): Promise<void> {
        await this.pool.end();
    }

    getNative(): unknown {
        return this.pool;
    }
}

export const pgDriver = {
    async connect(config: BtDbConfig): Promise<BtDbExecutor> {
        const client = new Client(pgClientConfig(config));
        await client.connect();
        return new PgClientExecutor(client);
    },

    async createPool(config: BtDbConfig): Promise<BtDbExecutor> {
        return new PgPoolExecutor(new Pool(pgPoolConfig(config)));
    },
};
