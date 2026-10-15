'use strict';

import Mysql, { Connection, ConnectionOptions, Pool, PoolOptions } from 'mysql2/promise';
import { BtDbConfig } from '../../BtDbConfig';
import { BtDbExecutor, BtDbQueryResult } from '../../BtDbTypes';

const MYSQL_DEFAULTS = {
    charset: 'UTF8_GENERAL_CI',
    timezone: 'local',
};

function commonOptions(config: BtDbConfig) {
    return {
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        ssl: config.ssl,
        connectTimeout: config.connectTimeout,
    };
}

export function mysqlConnectionOptions(config: BtDbConfig): ConnectionOptions {
    return { ...MYSQL_DEFAULTS, ...commonOptions(config), ...config.driverOptions };
}

export function mysqlPoolOptions(config: BtDbConfig): PoolOptions {
    return { ...MYSQL_DEFAULTS, ...commonOptions(config), connectionLimit: config.connectionLimit, ...config.driverOptions };
}

function hasInsertId(insertId: unknown): insertId is number | string {
    return (typeof insertId === 'number' && insertId !== 0)
        || (typeof insertId === 'string' && insertId !== '' && insertId !== '0');
}

export function normalizeMysqlResult(result: unknown): BtDbQueryResult {
    if (Array.isArray(result)) {
        return { rows: result, affectedRows: 0, raw: result };
    }

    const header = (result ?? {}) as { affectedRows?: number; insertId?: unknown };
    const normalized: BtDbQueryResult = { rows: [], affectedRows: header.affectedRows ?? 0, raw: result };
    if (hasInsertId(header.insertId)) {
        normalized.insertId = header.insertId;
    }
    return normalized;
}

export class MysqlConnectionExecutor implements BtDbExecutor {
    constructor(private readonly connection: Connection) {}

    async execute(sql: string, values?: any): Promise<BtDbQueryResult> {
        try {
            const [result] = await this.connection.execute(sql, values);
            return normalizeMysqlResult(result);
        } catch (exception) {
            this.connection.unprepare(sql);
            throw exception;
        }
    }

    async query(sql: string, values?: any): Promise<BtDbQueryResult> {
        const [result] = await this.connection.query(sql, values);
        return normalizeMysqlResult(result);
    }

    async close(): Promise<void> {
        await this.connection.end();
    }

    getNative(): unknown {
        return this.connection;
    }
}

export class MysqlPoolExecutor implements BtDbExecutor {
    constructor(private readonly pool: Pool) {}

    async execute(sql: string, values?: any): Promise<BtDbQueryResult> {
        const [result] = await this.pool.execute(sql, values);
        return normalizeMysqlResult(result);
    }

    async query(sql: string, values?: any): Promise<BtDbQueryResult> {
        const [result] = await this.pool.query(sql, values);
        return normalizeMysqlResult(result);
    }

    async close(): Promise<void> {
        await this.pool.end();
    }

    getNative(): unknown {
        return this.pool;
    }
}

export const mysqlDriver = {
    async connect(config: BtDbConfig): Promise<BtDbExecutor> {
        const connection = await Mysql.createConnection(mysqlConnectionOptions(config));
        return new MysqlConnectionExecutor(connection);
    },

    async createPool(config: BtDbConfig): Promise<BtDbExecutor> {
        return new MysqlPoolExecutor(Mysql.createPool(mysqlPoolOptions(config)));
    },
};
