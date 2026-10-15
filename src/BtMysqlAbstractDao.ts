'use strict';

import { BtMysqlConnection } from './BtMysqlConnection';
import { BtMysqlData, BtMysqlDataConstructor, BtMysqlModifyResult } from './BtMysqlData';
import { BtMysqlConnectionPool } from './BtMysqlConnectionPool';
import { BtMysqlQueryInterface } from './query/BtMysqlQueryInterface';

export class BtMysqlAbstractDao {

    protected client: BtMysqlConnection | BtMysqlConnectionPool | null;

    constructor (connector: BtMysqlConnection | BtMysqlConnectionPool) {
        this.client = connector || null;
    }

    async execute(query: string, value: any) :Promise<any> {
        try {
            if (this.client) {
                const [rows] = await this.client.execute(query, value);
                if (rows && Array.isArray(rows) && rows.length > 0) {
                    return rows;
                }
            }
            return null;
        } catch (exception) {
            this.logError(exception, query, value);
            throw exception;
        }
    }

    async query(query: string, value: any) :Promise<any> {
        try {
            if (this.client) {
                const [rows] = await this.client.query(query, value);
                if (rows && Array.isArray(rows) && rows.length > 0) {
                    return rows;
                }
            }
            return null;
        } catch (exception) {
            this.logError(exception, query, value);
            throw exception;
        }
    }

    async fetchRawData(queryInterface: BtMysqlQueryInterface) :Promise<any> {
        return this.execute(queryInterface.query(), queryInterface.values());
    }

    async modify(queryInterface: BtMysqlQueryInterface) :Promise<BtMysqlModifyResult | null> {
        try {
            if (this.client) {
                const [rows] = await this.client.execute(queryInterface.query(), queryInterface.values());
                return <BtMysqlModifyResult>rows;
            }
            return null;
        } catch (exception) {
            this.logError(exception, queryInterface.query(), queryInterface.values());
            throw exception;
        }
    }

    async fetchSingle(constructor: BtMysqlDataConstructor, queryInterface: BtMysqlQueryInterface) :Promise<BtMysqlData> {
        const rows = await this.execute(queryInterface.query(), queryInterface.values());
        return rows ? new constructor(rows[0]) : new constructor();
    }

    async fetchArray(constructor: BtMysqlDataConstructor, queryInterface: BtMysqlQueryInterface) :Promise<Array<BtMysqlData>> {
        const rows = await this.execute(queryInterface.query(), queryInterface.values());
        return rows ? rows.map((row: any) => new constructor(row)) : [];
    }

    private logError(exception: unknown, query: string, value: any): void {
        console.error('DB Error', exception);
        console.error('QUERY: ', query);
        console.error('PARAMS: ', value);
    }
}
