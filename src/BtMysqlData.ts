export interface BtMysqlData {
    toString(): string;
}

export interface BtMysqlDataConstructor {
    new(row?: any, fields?: any): BtMysqlData;
}

export type BtMysqlModifyResult = {
    fieldCount: number,
    affectedRows: number,
    insertId: number,
    info: string | null,
    serverStatus: number,
    warningStatus: number,
    changedRows: number
}
