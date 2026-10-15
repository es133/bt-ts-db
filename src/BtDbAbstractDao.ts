'use strict';

import { BtDbData, BtDbDataConstructor, BtDbExecutor, BtDbModifyResult, BtDbQueryResult } from './BtDbTypes';
import { BtDbQueryInterface } from './query/BtDbQueryInterface';

export class BtDbAbstractDao {

    protected client: BtDbExecutor | null;

    constructor (executor: BtDbExecutor | null) {
        this.client = executor || null;
    }

    async execute(sql: string, values?: any): Promise<any[] | null> {
        return this.rowsOrNull(await this.run('execute', sql, values));
    }

    async query(sql: string, values?: any): Promise<any[] | null> {
        return this.rowsOrNull(await this.run('query', sql, values));
    }

    async fetchRawData(queryInterface: BtDbQueryInterface): Promise<any[] | null> {
        return this.execute(queryInterface.query(), queryInterface.values());
    }

    async modify(queryInterface: BtDbQueryInterface): Promise<BtDbModifyResult | null> {
        return this.run('execute', queryInterface.query(), queryInterface.values());
    }

    async fetchSingle(constructor: BtDbDataConstructor, queryInterface: BtDbQueryInterface): Promise<BtDbData> {
        const rows = await this.fetchRawData(queryInterface);
        return rows ? new constructor(rows[0]) : new constructor();
    }

    async fetchArray(constructor: BtDbDataConstructor, queryInterface: BtDbQueryInterface): Promise<Array<BtDbData>> {
        const rows = await this.fetchRawData(queryInterface);
        return rows ? rows.map(row => new constructor(row)) : [];
    }

    private rowsOrNull(result: BtDbQueryResult | null): any[] | null {
        return result && result.rows.length > 0 ? result.rows : null;
    }

    private async run(method: 'execute' | 'query', sql: string, values?: any): Promise<BtDbQueryResult | null> {
        if (!this.client) {
            return null;
        }
        try {
            return await this.client[method](sql, values);
        } catch (exception) {
            console.error('DB Error', exception);
            console.error('QUERY: ', sql);
            console.error('PARAMS: ', values);
            throw exception;
        }
    }
}
