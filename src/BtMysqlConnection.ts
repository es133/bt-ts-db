'use strict';

import { Connection, ConnectionOptions } from 'mysql2/promise';

export class BtMysqlConnection {

    protected connection?: Connection;

    constructor (connection: Connection) {
        if (!connection) {
            console.error('Invalid parameters');
            return;
        }
        this.connection = connection;
    }

    getConnection(): Connection | null {
        return this.connection ?? null;
    }

    async disconnectGraceful(): Promise<void> {
        if (this.connection) {
            await this.connection.end();
        }
    }

    disconnectImmediate(): void {
        if (this.connection) {
            this.connection.destroy();
        }
    }

    async execute(query: string, value: any): Promise<any> {
        try {
            if (this.connection) {
                const [rows, fields] = await this.connection.execute(query, value);
                return [rows, fields];
            }
        } catch (exception) {
            this.connection?.unprepare(query);
            throw exception;
        }
    }

    async executeOnce(query: string, value: any): Promise<any> {
        if (this.connection) {
            const [rows, fields] = await this.connection.execute(query, value);
            this.connection.unprepare(query);
            return [rows, fields];
        }
    }

    async query(query: string, value: any): Promise<any> {
        if (this.connection) {
            const [rows, fields] = await this.connection.query(query, value);
            return [rows, fields];
        }
    }

    connectionOption(): ConnectionOptions | null {
        return this.connection ? this.connection.config : null;
    }

    enableNamePlaceHolder(): void {
        if (this.connection) {
            this.connection.config.namedPlaceholders = true;
        }
    }

    disableNamePlaceHolder(): void {
        if (this.connection) {
            this.connection.config.namedPlaceholders = false;
        }
    }
}
