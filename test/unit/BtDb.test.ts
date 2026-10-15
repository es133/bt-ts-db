import assert from 'assert';
import { execFileSync } from 'child_process';
import path from 'path';
import { BtDb, BtDbConfig } from '../../src/BtDb';

describe('BtDb', () => {
    it('does not load mysql2 or pg when only the entry is imported', () => {
        const root = path.resolve(__dirname, '../..');
        const fixture = path.join(__dirname, 'fixtures', 'load-entry.js');
        const output = execFileSync(process.execPath, [fixture], { cwd: root }).toString();
        assert.deepStrictEqual(JSON.parse(output), []);
    });

    it('builds a mysql pool through the mysql driver without connecting', async () => {
        const pool = await BtDb.buildConnectionPool(new BtDbConfig({ client: 'mysql', host: '127.0.0.1', port: 1 }));
        assert.strictEqual((pool.getNative() as { constructor: { name: string } }).constructor.name, 'PromisePool');
        await pool.close();
    });

    it('builds a pg pool through the pg driver without connecting', async () => {
        const pool = await BtDb.buildConnectionPool(new BtDbConfig({ client: 'pg', host: '127.0.0.1', port: 1 }));
        assert.strictEqual((pool.getNative() as { constructor: { name: string } }).constructor.name, 'BoundPool');
        await pool.close();
    });
});
