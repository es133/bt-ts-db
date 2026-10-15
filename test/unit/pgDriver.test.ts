import assert from 'assert';
import { Client, Pool } from 'pg';
import { BtDbConfig } from '../../src/BtDbConfig';
import {
    PgClientExecutor,
    PgPoolExecutor,
    createPgClient,
    createPgPool,
    normalizePgResult,
    pgClientConfig,
    pgPoolConfig,
} from '../../src/driver/pg/BtPgDriver';

describe('pg driver', () => {
    describe('config mapping', () => {
        const config = new BtDbConfig({
            client: 'pg', host: 'h', port: 5433, user: 'u', password: 'p', database: 'd', connectionLimit: 20,
        });

        it('maps common fields and connectTimeout', () => {
            const clientConfig = pgClientConfig(config);
            assert.strictEqual(clientConfig.host, 'h');
            assert.strictEqual(clientConfig.port, 5433);
            assert.strictEqual(clientConfig.user, 'u');
            assert.strictEqual(clientConfig.password, 'p');
            assert.strictEqual(clientConfig.database, 'd');
            assert.strictEqual(clientConfig.connectionTimeoutMillis, 10000);
        });

        it('maps connectionLimit to max for pools only', () => {
            assert.strictEqual(pgPoolConfig(config).max, 20);
            assert.strictEqual('max' in pgClientConfig(config), false);
        });

        it('lets driverOptions override common fields', () => {
            const poolConfig = pgPoolConfig(new BtDbConfig({
                client: 'pg', connectionLimit: 20, driverOptions: { max: 5, idleTimeoutMillis: 1000 },
            }));
            assert.strictEqual(poolConfig.max, 5);
            assert.strictEqual(poolConfig.idleTimeoutMillis, 1000);
        });
    });

    describe('normalizePgResult', () => {
        it('maps rows and rowCount and never sets insertId', () => {
            const raw = { rows: [{ id: 1 }], rowCount: 1 };
            assert.deepStrictEqual(normalizePgResult(raw), { rows: [{ id: 1 }], affectedRows: 1, raw });
        });

        it('treats a null rowCount and missing rows as empty', () => {
            const raw = { rowCount: null };
            assert.deepStrictEqual(normalizePgResult(raw), { rows: [], affectedRows: 0, raw });
        });
    });

    describe('executors', () => {
        it('PgClientExecutor passes sql and values to query() for both execute and query', async () => {
            const calls: Array<[string, any]> = [];
            const fake = { query: async (sql: string, values: any) => { calls.push([sql, values]); return { rows: [], rowCount: 0 }; } };
            const executor = new PgClientExecutor(fake as unknown as Client);
            await executor.execute('SELECT $1', [1]);
            await executor.query('SELECT 2');
            assert.deepStrictEqual(calls, [['SELECT $1', [1]], ['SELECT 2', undefined]]);
        });

        it('PgClientExecutor rethrows the original error', async () => {
            const boom = Object.assign(new Error('dup'), { code: '23505' });
            const fake = { query: async () => { throw boom; } };
            await assert.rejects(new PgClientExecutor(fake as unknown as Client).execute('INSERT'), (error) => error === boom);
        });

        it('PgPoolExecutor closes with end() and exposes the native pool', async () => {
            let ended = false;
            const fake = { end: async () => { ended = true; } };
            const executor = new PgPoolExecutor(fake as unknown as Pool);
            await executor.close();
            assert.strictEqual(ended, true);
            assert.strictEqual(executor.getNative(), fake);
        });
    });
    describe('error listeners', () => {
        // pg emits 'error' on idle pool clients and dropped connections;
        // without a listener Node's EventEmitter throws and the process exits.
        const config = new BtDbConfig({ client: 'pg', host: '127.0.0.1' });

        it('attaches an error listener to the pool', async () => {
            const pool = createPgPool(config);
            try {
                assert.ok(pool.listenerCount('error') > 0);
                assert.doesNotThrow(() => pool.emit('error', new Error('idle client lost')));
            } finally {
                await pool.end();
            }
        });

        it('attaches an error listener to the single client', () => {
            const client = createPgClient(config);
            assert.ok(client.listenerCount('error') > 0);
            assert.doesNotThrow(() => client.emit('error', new Error('connection lost')));
        });
    });
});
