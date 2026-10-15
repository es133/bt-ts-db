# bt-ts-db

- [mysql2](https://github.com/sidorares/node-mysql2), [node-postgres](https://node-postgres.com/) wrapping library for typescript
- 같은 API(연결 · 풀 · Dao)로 MySQL과 PostgreSQL을 사용합니다. SQL은 각 DB 문법으로 작성합니다 (MySQL `?`, PostgreSQL `$1`).

### Installation

- Create `.npmrc` in project root directory
  ```
  @es133:registry=https://npm.pkg.github.com/
  //npm.pkg.github.com/:_authToken={YOUR GITHUB PAT(Personal Access Token)}
  ```
- Install the package and the driver for your DB
  ```
  npm install @es133/bt-ts-db mysql2   # MySQL
  npm install @es133/bt-ts-db pg       # PostgreSQL
  ```

### How to Use

```typescript
import { BtDb, BtDbConfig, BtDbAbstractDao } from '@es133/bt-ts-db';

const config = new BtDbConfig({
    client: 'mysql',                 // or 'pg'
    host: 'localhost',
    port: 3306,
    user: 'user',
    password: 'password',
    database: 'db_name',
    connectionLimit: 20,
    driverOptions: { charset: 'utf8mb4', timezone: 'Z' },   // passed to the driver as is
});

const pool = await BtDb.buildConnectionPool(config);   // or BtDb.buildConnection(config)
const dao = new BtDbAbstractDao(pool);

const rows = await dao.execute('SELECT * FROM member WHERE id = ?', [1]);   // null when empty
await pool.close();
```

#### Query objects and data classes

```typescript
import { BtDbData, BtDbQueryInterface } from '@es133/bt-ts-db';

class MemberDbData implements BtDbData {
    id = 0;
    name: string | null = null;
    constructor(row?: any) {
        if (row) {
            this.id = row.id;
            this.name = row.name;
        }
    }
    toString() { return `MemberDbData(${this.id})`; }
}

const byId = (id: number): BtDbQueryInterface => ({
    query: () => 'SELECT * FROM member WHERE id = ?',
    values: () => [id],
});

const member = <MemberDbData>await dao.fetchSingle(MemberDbData, byId(1));   // empty instance when not found
const members = await dao.fetchArray(MemberDbData, byId(1));                 // [] when not found
```

#### Insert / update / delete

`modify()` returns `{ rows, affectedRows, insertId?, raw }`.

- MySQL: `insertId` holds the AUTO_INCREMENT id.
- PostgreSQL: there is no `insertId`; use `RETURNING`.

```typescript
const result = await dao.modify({
    query: () => 'INSERT INTO member (name) VALUES ($1) RETURNING id',
    values: () => ['alice'],
});
const newId = result?.rows[0].id;
```

#### Driver specific features

`getNative()` returns the underlying mysql2 / pg connection or pool.

Connection errors emitted by the driver outside a query (e.g. a dropped idle pg connection) are logged with `console.error` so they do not crash the process. Attach your own listener via `getNative()` if you need different handling.

#### In case using NestJS

```typescript
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { BtDb, BtDbConfig, BtDbExecutor } from '@es133/bt-ts-db';

@Injectable()
export class DbClientService implements OnModuleDestroy {
    private pool: Promise<BtDbExecutor>;

    constructor() {
        this.pool = BtDb.buildConnectionPool(new BtDbConfig({ client: 'pg', host: 'localhost', database: 'db_name' }));
    }

    client(): Promise<BtDbExecutor> {
        return this.pool;
    }

    async onModuleDestroy() {
        await (await this.pool).close();
    }
}
```

### Test

```
npm test                      # unit tests, no DB needed

docker compose up -d --wait   # MySQL 8 (13306), PostgreSQL 16 (15432)
MYSQL_HOST=127.0.0.1 MYSQL_PORT=13306 MYSQL_USER=bt_test MYSQL_PASSWD=bt_test MYSQL_NAME=bt_test \
PG_HOST=127.0.0.1 PG_PORT=15432 PG_USER=bt_test PG_PASSWD=bt_test PG_NAME=bt_test \
npm run test:integration      # a DB without env vars is skipped
docker compose down
```

### Migration from bt-ts-mysql (v1, v2)

| v1 / v2 | v3 |
|---|---|
| `BtMysql.buildConnectionPool(config, showPoolState)` | `BtDb.buildConnectionPool(new BtDbConfig({ client: 'mysql', ... }))` |
| `BtMysqlConfig` MySQL options (`charset`, `typeCast`, ...) | `BtDbConfig({ driverOptions: { ... } })` |
| `disconnectGraceful()` / `disconnectPool()` | `close()` |
| `executeOnce`, `enableNamePlaceHolder`, pool `getConnection()` | `getNative()` |
| `BtMysqlModifyResult` | `BtDbModifyResult` (`affectedRows`, `insertId?`, `rows`, `raw`) |
