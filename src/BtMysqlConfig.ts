import { ConnectionOptions, PoolOptions } from 'mysql2';

// Options reference: https://sidorares.github.io/node-mysql2/docs
export class BtMysqlConfig {
    //Connection options
    protected host?: string;
    protected port?: number;
    protected localAddress?: string;
    protected socketPath?: string;
    protected user?: string;
    protected password?: string;
    protected database?: string;
    protected charset?: string;
    protected timezone?: string;
    protected connectTimeout?: number;
    protected stringifyObjects?: boolean;
    protected insecureAuth?: boolean;
    protected typeCast?: boolean;
    protected queryFormat?: any;
    protected supportBigNumbers?: boolean;
    protected bigNumberStrings?: boolean;
    protected dateStrings?: boolean;
    protected debug?: boolean;
    protected trace?: boolean;
    protected multipleStatements?: boolean;
    protected namedPlaceholders?: boolean;
    protected flags?: string[];
    protected ssl?: any;

    //Pool options
    protected waitForConnections?: boolean;
    protected connectionLimit?: number;
    protected queueLimit?: number;

    constructor(config: any) {
        this.host = config?.host;
        this.port = config?.port;
        this.localAddress = config?.localAddress;
        this.socketPath = config?.socketPath;
        this.user = config?.user;
        this.password = config?.password;
        this.database = config?.database;
        this.charset = config?.charset ?? 'UTF8_GENERAL_CI';
        this.timezone = config?.timezone ?? 'local';
        this.connectTimeout = config?.connectTimeout ?? 10000;
        this.stringifyObjects = config?.stringifyObjects ?? false;
        this.insecureAuth = config?.insecureAuth ?? false;
        this.typeCast = config?.typeCast ?? true;
        this.queryFormat = config?.queryFormat;
        this.supportBigNumbers = config?.supportBigNumbers ?? false;
        this.bigNumberStrings = config?.bigNumberStrings ?? false;
        this.dateStrings = config?.dateStrings ?? false;
        this.debug = config?.debug ?? false;
        this.trace = config?.trace ?? true;
        this.multipleStatements = config?.multipleStatements ?? false;
        this.namedPlaceholders = config?.namedPlaceholders ?? false;
        this.flags = config?.flags;
        this.ssl = config?.ssl;

        this.waitForConnections = config?.waitForConnections ?? true;
        this.connectionLimit = config?.connectionLimit ?? 10;
        this.queueLimit = config?.queueLimit ?? 0;
    }

    public enableDebug(): void {
        this.debug = true;
    }

    public connectionOptions(): ConnectionOptions {
        return {
            host: this.host,
            port: this.port,
            localAddress: this.localAddress,
            socketPath: this.socketPath,
            user: this.user,
            password: this.password,
            database: this.database,
            charset: this.charset,
            timezone: this.timezone,
            connectTimeout: this.connectTimeout,
            stringifyObjects: this.stringifyObjects,
            insecureAuth: this.insecureAuth,
            typeCast: this.typeCast,
            queryFormat: this.queryFormat,
            supportBigNumbers: this.supportBigNumbers,
            bigNumberStrings: this.bigNumberStrings,
            dateStrings: this.dateStrings,
            debug: this.debug,
            trace: this.trace,
            multipleStatements: this.multipleStatements,
            namedPlaceholders: this.namedPlaceholders,
            flags: this.flags,
            ssl: this.ssl,
        };
    }

    public poolOptions(): PoolOptions {
        const options: PoolOptions = this.connectionOptions();
        options.waitForConnections = this.waitForConnections;
        options.connectionLimit = this.connectionLimit;
        options.queueLimit = this.queueLimit;
        return options;
    }
}
