import assert from 'assert';
import { BtDbConfig } from '../../src/BtDbConfig';

describe('BtDbConfig', () => {
    it('accepts mysql and pg', () => {
        assert.strictEqual(new BtDbConfig({ client: 'mysql' }).client, 'mysql');
        assert.strictEqual(new BtDbConfig({ client: 'pg' }).client, 'pg');
    });

    it('rejects an unknown client', () => {
        assert.throws(
            () => new BtDbConfig({ client: 'oracle' } as any),
            /^Error: Invalid client: oracle\. Expected one of: mysql, pg$/
        );
    });

    it('rejects a missing config with a clear error instead of a TypeError', () => {
        assert.throws(
            () => new BtDbConfig(undefined as any),
            /^Error: Invalid client: undefined\. Expected one of: mysql, pg$/
        );
    });

    it('applies defaults', () => {
        const config = new BtDbConfig({ client: 'pg' });
        assert.strictEqual(config.connectionLimit, 10);
        assert.strictEqual(config.connectTimeout, 10000);
        assert.deepStrictEqual(config.driverOptions, {});
    });

    it('keeps explicit 0 and false values', () => {
        const config = new BtDbConfig({ client: 'mysql', connectionLimit: 0, connectTimeout: 0, ssl: false });
        assert.strictEqual(config.connectionLimit, 0);
        assert.strictEqual(config.connectTimeout, 0);
        assert.strictEqual(config.ssl, false);
    });

    it('copies common fields', () => {
        const config = new BtDbConfig({ client: 'mysql', host: 'h', port: 3307, user: 'u', password: 'p', database: 'd' });
        assert.deepStrictEqual(
            [config.host, config.port, config.user, config.password, config.database],
            ['h', 3307, 'u', 'p', 'd']
        );
    });

    it('copies driverOptions so later mutation does not leak in', () => {
        const driverOptions = { charset: 'utf8mb4' };
        const config = new BtDbConfig({ client: 'mysql', driverOptions });
        driverOptions.charset = 'latin1';
        assert.strictEqual(config.driverOptions.charset, 'utf8mb4');
    });
});
