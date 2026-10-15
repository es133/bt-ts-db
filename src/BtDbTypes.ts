export type BtDbClient = 'mysql' | 'pg';

export type BtDbQueryResult = {
    rows: any[];
    affectedRows: number;
    insertId?: number | string;
    raw: unknown;
};

export type BtDbModifyResult = BtDbQueryResult;

export interface BtDbExecutor {
    execute(sql: string, values?: any): Promise<BtDbQueryResult>;
    query(sql: string, values?: any): Promise<BtDbQueryResult>;
    close(): Promise<void>;
    getNative(): unknown;
}

export interface BtDbData {
    toString(): string;
}

export interface BtDbDataConstructor {
    new(row?: any, fields?: any): BtDbData;
}
