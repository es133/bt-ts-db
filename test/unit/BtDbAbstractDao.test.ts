import assert from 'assert';
import { BtDbAbstractDao } from '../../src/BtDbAbstractDao';
import { BtDbData, BtDbExecutor, BtDbQueryResult } from '../../src/BtDbTypes';
import { BtDbQueryInterface } from '../../src/query/BtDbQueryInterface';

class FakeExecutor implements BtDbExecutor {
    calls: Array<{ method: string; sql: string; values: any }> = [];

    constructor(private readonly outcome: BtDbQueryResult | Error) {}

    private async respond(method: string, sql: string, values: any): Promise<BtDbQueryResult> {
        this.calls.push({ method, sql, values });
        if (this.outcome instanceof Error) {
            throw this.outcome;
        }
        return this.outcome;
    }

    execute(sql: string, values?: any) { return this.respond('execute', sql, values); }
    query(sql: string, values?: any) { return this.respond('query', sql, values); }
    async close() {}
    getNative() { return null; }
}

class Item implements BtDbData {
    id: number;
    constructor(row?: any) { this.id = row ? row.id : 0; }
    toString() { return `Item(${this.id})`; }
}

const result = (rows: any[], extra: Partial<BtDbQueryResult> = {}): BtDbQueryResult => ({ rows, affectedRows: 0, raw: null, ...extra });
const q = (sql: string, values: any[] = []): BtDbQueryInterface => ({ query: () => sql, values: () => values });

describe('BtDbAbstractDao', () => {
    let logged: any[][];
    let originalError: typeof console.error;

    beforeEach(() => {
        logged = [];
        originalError = console.error;
        console.error = (...args: any[]) => { logged.push(args); };
    });

    afterEach(() => {
        console.error = originalError;
    });

    it('execute returns rows and uses executor.execute', async () => {
        const executor = new FakeExecutor(result([{ id: 1 }]));
        const rows = await new BtDbAbstractDao(executor).execute('SELECT ?', [1]);
        assert.deepStrictEqual(rows, [{ id: 1 }]);
        assert.deepStrictEqual(executor.calls, [{ method: 'execute', sql: 'SELECT ?', values: [1] }]);
    });

    it('query uses executor.query', async () => {
        const executor = new FakeExecutor(result([{ id: 1 }]));
        await new BtDbAbstractDao(executor).query('SELECT 1');
        assert.strictEqual(executor.calls[0].method, 'query');
    });

    it('execute and query return null for an empty result', async () => {
        const dao = new BtDbAbstractDao(new FakeExecutor(result([])));
        assert.strictEqual(await dao.execute('SELECT 1'), null);
        assert.strictEqual(await dao.query('SELECT 1'), null);
    });

    it('fetchRawData runs the query interface through execute', async () => {
        const executor = new FakeExecutor(result([{ id: 3 }]));
        assert.deepStrictEqual(await new BtDbAbstractDao(executor).fetchRawData(q('SELECT ?', [3])), [{ id: 3 }]);
        assert.deepStrictEqual(executor.calls[0], { method: 'execute', sql: 'SELECT ?', values: [3] });
    });

    it('fetchSingle builds the first row, or an empty instance when there is none', async () => {
        const found = await new BtDbAbstractDao(new FakeExecutor(result([{ id: 5 }, { id: 6 }]))).fetchSingle(Item, q('S'));
        assert.ok(found instanceof Item);
        assert.strictEqual((found as Item).id, 5);

        const empty = await new BtDbAbstractDao(new FakeExecutor(result([]))).fetchSingle(Item, q('S'));
        assert.ok(empty instanceof Item);
        assert.strictEqual((empty as Item).id, 0);
    });

    it('fetchArray builds every row, or [] when there is none', async () => {
        const items = await new BtDbAbstractDao(new FakeExecutor(result([{ id: 1 }, { id: 2 }]))).fetchArray(Item, q('S'));
        assert.deepStrictEqual(items.map(item => (item as Item).id), [1, 2]);
        assert.deepStrictEqual(await new BtDbAbstractDao(new FakeExecutor(result([]))).fetchArray(Item, q('S')), []);
    });

    it('modify returns the full normalized result', async () => {
        const outcome = result([], { affectedRows: 1, insertId: 9 });
        assert.deepStrictEqual(await new BtDbAbstractDao(new FakeExecutor(outcome)).modify(q('INSERT')), outcome);
    });

    it('rethrows the original driver error and logs query and params', async () => {
        const boom = Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
        const dao = new BtDbAbstractDao(new FakeExecutor(boom));
        await assert.rejects(dao.modify(q('INSERT ?', [1])), (error) => error === boom);
        assert.deepStrictEqual(logged, [['DB Error', boom], ['QUERY: ', 'INSERT ?'], ['PARAMS: ', [1]]]);
    });

    it('returns empty values without an executor', async () => {
        const dao = new BtDbAbstractDao(null);
        assert.strictEqual(await dao.execute('S'), null);
        assert.strictEqual(await dao.query('S'), null);
        assert.strictEqual(await dao.modify(q('I')), null);
        assert.deepStrictEqual(await dao.fetchArray(Item, q('S')), []);
        assert.strictEqual(((await dao.fetchSingle(Item, q('S'))) as Item).id, 0);
    });
});
