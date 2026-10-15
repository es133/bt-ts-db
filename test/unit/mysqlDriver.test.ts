import assert from 'assert';
import { Connection, Pool } from 'mysql2/promise';
import { BtDbConfig } from '../../src/BtDbConfig';
import {
    MysqlConnectionExecutor,
    MysqlPoolExecutor,
    mysqlConnectionOptions,
    mysqlPoolOptions,
    normalizeMysqlResult,
} from '../../src/driver/mysql/BtMysqlDriver';

describe('mysql driver', () => {
    describe('options mapping', () => {
        const config = new BtDbConfig({
            client: 'mysql', host: 'h', port: 3307, user: 'u', password: 'p', database: 'd', connectionLimit: 20,
        });

        it('applies mysql defaults and maps common fields', () => {
            const options = mysqlConnectionOptions(config);
            assert.strictEqual(options.charset, 'UTF8_GENERAL_CI');
            assert.strictEqual(options.timezone, 'local');
            assert.strictEqual(options.host, 'h');
            assert.strictEqual(options.port, 3307);
            assert.strictEqual(options.user, 'u');
            assert.strictEqual(options.password, 'p');
            assert.strictEqual(options.database, 'd');
            assert.strictEqual(options.connectTimeout, 10000);
        });

        it('maps connectionLimit for pools only', () => {
            assert.strictEqual(mysqlPoolOptions(config).connectionLimit, 20);
            assert.strictEqual('connectionLimit' in mysqlConnectionOptions(config), false);
        });

        it('lets driverOptions override defaults and common fields', () => {
            const options = mysqlPoolOptions(new BtDbConfig({
                client: 'mysql', host: 'h', connectionLimit: 20,
                driverOptions: { charset: 'utf8mb4', typeCast: false, connectionLimit: 5, host: 'other' },
            }));
            assert.strictEqual(options.charset, 'utf8mb4');
            assert.strictEqual(options.typeCast, false);
            assert.strictEqual(options.connectionLimit, 5);
            assert.strictEqual(options.host, 'other');
        });
    });

    describe('normalizeMysqlResult', () => {
        it('treats a row array as a SELECT result', () => {
            const rows = [{ id: 1 }, { id: 2 }];
            assert.deepStrictEqual(normalizeMysqlResult(rows), { rows, affectedRows: 0, raw: rows });
        });

        it('maps a ResultSetHeader', () => {
            const header = { affectedRows: 2, insertId: 7 };
            assert.deepStrictEqual(normalizeMysqlResult(header), { rows: [], affectedRows: 2, insertId: 7, raw: header });
        });

        it('omits insertId when it is 0, "0" or null', () => {
            for (const insertId of [0, '0', null]) {
                const result = normalizeMysqlResult({ affectedRows: 1, insertId });
                assert.strictEqual('insertId' in result, false, `insertId=${String(insertId)}`);
            }
        });

        it('keeps a big-number string insertId as is', () => {
            assert.strictEqual(normalizeMysqlResult({ affectedRows: 1, insertId: '9007199254740993' }).insertId, '9007199254740993');
        });
    });

    describe('MysqlConnectionExecutor', () => {
        it('normalizes the first element returned by execute()', async () => {
            const fake = { execute: async () => [[{ id: 1 }], []] };
            const result = await new MysqlConnectionExecutor(fake as unknown as Connection).execute('SELECT 1');
            assert.deepStrictEqual(result.rows, [{ id: 1 }]);
        });

        it('unprepares the statement and rethrows the original error when execute fails', async () => {
            const boom = Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
            const unprepared: string[] = [];
            const fake = {
                execute: async () => { throw boom; },
                unprepare: (sql: string) => { unprepared.push(sql); },
            };
            const executor = new MysqlConnectionExecutor(fake as unknown as Connection);
            await assert.rejects(executor.execute('INSERT INTO t VALUES (?)', [1]), (error) => error === boom);
            assert.deepStrictEqual(unprepared, ['INSERT INTO t VALUES (?)']);
        });

        it('closes with end() and exposes the native connection', async () => {
            let ended = false;
            const fake = { end: async () => { ended = true; } };
            const executor = new MysqlConnectionExecutor(fake as unknown as Connection);
            await executor.close();
            assert.strictEqual(ended, true);
            assert.strictEqual(executor.getNative(), fake);
        });
    });

    describe('MysqlPoolExecutor', () => {
        it('normalizes query() results and closes with end()', async () => {
            let ended = false;
            const fake = { query: async () => [{ affectedRows: 3, insertId: 0 }, undefined], end: async () => { ended = true; } };
            const executor = new MysqlPoolExecutor(fake as unknown as Pool);
            const result = await executor.query('DELETE FROM t');
            assert.strictEqual(result.affectedRows, 3);
            assert.strictEqual('insertId' in result, false);
            await executor.close();
            assert.strictEqual(ended, true);
        });
    });
});
