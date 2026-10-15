'use strict';

import Mysql from 'mysql2/promise';
import { BtMysqlConnection } from './BtMysqlConnection';
import { BtMysqlConnectionPool } from './BtMysqlConnectionPool';
import { BtMysqlConfig } from './BtMysqlConfig';

export class BtMysql {
    constructor () {}

    static async buildConnection(config: BtMysqlConfig) :Promise<BtMysqlConnection> {
        const connection = await Mysql.createConnection(config.connectionOptions());
        await connection.connect();
        return new BtMysqlConnection(connection);
    }

    static async buildConnectionPool(config: BtMysqlConfig, showPoolState :boolean = false) :Promise<BtMysqlConnectionPool> {
        const connectionPool = Mysql.createPool(config.poolOptions());
        return new BtMysqlConnectionPool(connectionPool, showPoolState);
    }
}

export * from './BtMysqlData';
export { BtMysqlConfig } from './BtMysqlConfig';
export { BtMysqlConnectionPool } from './BtMysqlConnectionPool';
export { BtMysqlConnection } from './BtMysqlConnection';
export { BtMysqlAbstractDao } from './BtMysqlAbstractDao';
export { BtMysqlQueryInterface } from './query/BtMysqlQueryInterface';
