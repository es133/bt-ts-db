import { BtDbClient } from './BtDbTypes';

const CLIENTS: ReadonlyArray<BtDbClient> = ['mysql', 'pg'];

export type BtDbConfigOptions = {
    client: BtDbClient;
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    connectionLimit?: number;
    connectTimeout?: number;
    ssl?: any;
    driverOptions?: Record<string, any>;
};

export class BtDbConfig {
    readonly client: BtDbClient;
    readonly host?: string;
    readonly port?: number;
    readonly user?: string;
    readonly password?: string;
    readonly database?: string;
    readonly ssl?: any;
    readonly connectionLimit: number;
    readonly connectTimeout: number;
    readonly driverOptions: Record<string, any>;

    constructor(options: BtDbConfigOptions) {
        if (!options || !CLIENTS.includes(options.client)) {
            throw new Error(`Invalid client: ${String(options?.client)}. Expected one of: ${CLIENTS.join(', ')}`);
        }

        this.client = options.client;
        this.host = options.host;
        this.port = options.port;
        this.user = options.user;
        this.password = options.password;
        this.database = options.database;
        this.ssl = options.ssl;
        this.connectionLimit = options.connectionLimit ?? 10;
        this.connectTimeout = options.connectTimeout ?? 10000;
        this.driverOptions = { ...(options.driverOptions ?? {}) };
    }
}
