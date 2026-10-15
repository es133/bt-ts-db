import assert from 'assert';
import { loadDriver, toDriverLoadError } from '../../src/driver/BtDbDriver';

function moduleNotFound(moduleName: string): Error {
    return Object.assign(
        new Error(`Cannot find module '${moduleName}'\nRequire stack:\n- /app/index.js`),
        { code: 'MODULE_NOT_FOUND' }
    );
}

describe('BtDbDriver', () => {
    describe('toDriverLoadError', () => {
        it('converts a missing mysql2 subpath import into an install hint', () => {
            const converted = toDriverLoadError(moduleNotFound('mysql2/promise'), 'mysql2') as Error;
            assert.strictEqual(converted.message, 'Driver package "mysql2" is not installed. Run: npm install mysql2');
        });

        it('converts a missing pg import into an install hint', () => {
            const converted = toDriverLoadError(moduleNotFound('pg'), 'pg') as Error;
            assert.strictEqual(converted.message, 'Driver package "pg" is not installed. Run: npm install pg');
        });

        it('keeps the original error when a transitive dependency is missing', () => {
            const original = moduleNotFound('pg-pool');
            assert.strictEqual(toDriverLoadError(original, 'pg'), original);
        });

        it('keeps unrelated errors', () => {
            const original = new Error('boom');
            assert.strictEqual(toDriverLoadError(original, 'pg'), original);
            assert.strictEqual(toDriverLoadError(undefined, 'pg'), undefined);
        });
    });

    describe('loadDriver', () => {
        it('loads the mysql driver', async () => {
            const driver = await loadDriver('mysql');
            assert.strictEqual(typeof driver.connect, 'function');
            assert.strictEqual(typeof driver.createPool, 'function');
        });

        it('loads the pg driver', async () => {
            const driver = await loadDriver('pg');
            assert.strictEqual(typeof driver.connect, 'function');
            assert.strictEqual(typeof driver.createPool, 'function');
        });
    });
});
