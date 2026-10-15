import assert from 'assert';
import { BtDb, BtDbAbstractDao, BtDbClient, BtDbConfig, BtDbExecutor, BtDbQueryInterface } from '../../src/BtDb';

type Dialect = {
    client: BtDbClient;
    envPrefix: string;
    createTable(table: string): string;
    insert(table: string): string;
    selectById(table: string): string;
    updateName(table: string): string;
    deleteById(table: string): string;
};

const dialects: Dialect[] = [
    {
        client: 'mysql',
        envPrefix: 'MYSQL',
        createTable: (t) => `CREATE TABLE ${t} (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(50) NOT NULL)`,
        insert: (t) => `INSERT INTO ${t} (name) VALUES (?)`,
        selectById: (t) => `SELECT id, name FROM ${t} WHERE id = ?`,
        updateName: (t) => `UPDATE ${t} SET name = ? WHERE id = ?`,
        deleteById: (t) => `DELETE FROM ${t} WHERE id = ?`,
    },
    {
        client: 'pg',
        envPrefix: 'PG',
        createTable: (t) => `CREATE TABLE ${t} (id SERIAL PRIMARY KEY, name VARCHAR(50) NOT NULL)`,
        insert: (t) => `INSERT INTO ${t} (name) VALUES ($1) RETURNING id`,
        selectById: (t) => `SELECT id, name FROM ${t} WHERE id = $1`,
        updateName: (t) => `UPDATE ${t} SET name = $1 WHERE id = $2`,
        deleteById: (t) => `DELETE FROM ${t} WHERE id = $1`,
    },
];

function configFor(dialect: Dialect): BtDbConfig | null {
    const env = (key: string) => process.env[`${dialect.envPrefix}_${key}`];
    if (!env('HOST')) {
        return null;
    }
    return new BtDbConfig({
        client: dialect.client,
        host: env('HOST'),
        port: env('PORT') ? Number(env('PORT')) : undefined,
        user: env('USER'),
        password: env('PASSWD'),
        database: env('NAME'),
    });
}

const q = (sql: string, values: any[] = []): BtDbQueryInterface => ({ query: () => sql, values: () => values });

for (const dialect of dialects) {
    describe(`integration: ${dialect.client}`, function () {
        // A unique table name keeps the test away from any existing table.
        const table = `bt_db_it_${Date.now()}`;
        let config: BtDbConfig | null = null;
        let pool: BtDbExecutor | null = null;
        let dao: BtDbAbstractDao;
        let id = 0;

        before(async function () {
            config = configFor(dialect);
            if (!config) {
                this.skip();
                return;
            }
            pool = await BtDb.buildConnectionPool(config);
            dao = new BtDbAbstractDao(pool);
            await pool.query(dialect.createTable(table));
        });

        after(async function () {
            if (pool) {
                await pool.query(`DROP TABLE IF EXISTS ${table}`);
                await pool.close();
            }
        });

        it('inserts a row and reports its id', async () => {
            const result = await dao.modify(q(dialect.insert(table), ['alice']));
            assert.ok(result);
            assert.strictEqual(result.affectedRows, 1);
            id = Number(dialect.client === 'mysql' ? result.insertId : result.rows[0].id);
            assert.ok(id > 0);
        });

        it('selects the row', async () => {
            const rows = await dao.execute(dialect.selectById(table), [id]);
            assert.ok(rows);
            assert.strictEqual(rows.length, 1);
            assert.strictEqual(rows[0].name, 'alice');
        });

        it('updates the row', async () => {
            const result = await dao.modify(q(dialect.updateName(table), ['bob', id]));
            assert.strictEqual(result?.affectedRows, 1);
            const rows = await dao.execute(dialect.selectById(table), [id]);
            assert.strictEqual(rows?.[0].name, 'bob');
        });

        it('deletes the row', async () => {
            const result = await dao.modify(q(dialect.deleteById(table), [id]));
            assert.strictEqual(result?.affectedRows, 1);
            assert.strictEqual(await dao.execute(dialect.selectById(table), [id]), null);
        });

        it('works over a single connection', async () => {
            const connection = await BtDb.buildConnection(config as BtDbConfig);
            try {
                const rows = await new BtDbAbstractDao(connection).query('SELECT 1 AS one');
                assert.strictEqual(Number(rows?.[0].one), 1);
            } finally {
                await connection.close();
            }
        });
    });
}
