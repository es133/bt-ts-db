'use strict';

import { Pool, PoolConnection } from 'mysql2/promise';

export class BtMysqlConnectionPool {

    protected connectionPool?: Pool;

    constructor (connectionPool: Pool, showPoolState: boolean = false) {
        if (!connectionPool) {
            console.error('Invalid connection pool');
            return;
        }

        this.connectionPool = connectionPool;
        if (showPoolState) {
            this.connectionPool.on('acquire', (connection) => {
                console.log('Connection %d acquired', connection.threadId);
            });
            this.connectionPool.on('connection', (connection) => {
                console.log('Connection %d created', connection.threadId);
            });
            this.connectionPool.on('enqueue', () => {
                console.log('Waiting for available connection slot');
            });
            this.connectionPool.on('release', (connection) => {
                console.log('Connection %d released', connection.threadId);
            });
        }
    }

    async getConnection(): Promise<PoolConnection | null> {
        return this.connectionPool ? await this.connectionPool.getConnection() : null;
    }

    async execute(query: string, value: any): Promise<any> {
        if (this.connectionPool) {
            const [rows, fields] = await this.connectionPool.execute(query, value);
            return [rows, fields];
        }
    }

    async query(query: string, value: any): Promise<any> {
        if (this.connectionPool) {
            const [rows, fields] = await this.connectionPool.query(query, value);
            return [rows, fields];
        }
    }

    async disconnectPool(): Promise<void> {
        if (this.connectionPool) {
            await this.connectionPool.end();
        }
    }
}
