# DB 중립화 (MySQL + PostgreSQL) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MySQL 전용 래퍼(`BtMysql*`)를 MySQL·PostgreSQL 공용 래퍼(`BtDb*`, 패키지 `@es133/bt-ts-db` v3.0.0)로 바꾸고 원격 `es133/bt-ts-mysql`에 반영한다.

**Architecture:** 공통 계층(`BtDbConfig`, `BtDbTypes`, `BtDbAbstractDao`, `BtDb`)은 드라이버를 모른다. `driver/BtDbDriver.ts`의 `loadDriver(client)`가 `driver/mysql` 또는 `driver/pg` 어댑터를 동적 import로 지연 로딩하고, 어댑터가 `mysql2`/`pg` 결과를 `BtDbQueryResult`로 정규화한다. SQL 방언 변환은 하지 않는다.

**Tech Stack:** TypeScript 5 (target es2017, commonjs, strict), mysql2 3.x, pg 8.x, mocha 10 + ts-node, Docker Compose (MySQL 8, PostgreSQL 16)

**Spec:** `docs/superpowers/specs/2026-10-14-db-neutral-design.md`

## Global Constraints

- 패키지: `name: @es133/bt-ts-db`, `version: 3.0.0`, `main: dist/BtDb.js`, `types: dist/BtDb.d.ts`
- `peerDependencies`: `mysql2 ^3.11.4`, `pg ^8.11.0`, 둘 다 `peerDependenciesMeta`에서 `optional: true`
- 원격 메타데이터 유지: `repository.url: https://github.com/es133/bt-ts-mysql`, `publishConfig.registry: https://npm.pkg.github.com/`, `author: bugshot@gmail.com`, `license: "MIT"`; `private` 없음
- `mysql2`, `pg`는 `src/driver/mysql/BtMysqlDriver.ts`, `src/driver/pg/BtPgDriver.ts`에서만 import한다. 다른 어떤 `src` 파일도 이 두 드라이버 파일을 정적 import하지 않는다.
- 공개 `.d.ts`(`dist/BtDb.d.ts`와 그것이 참조하는 파일)에 `mysql2`/`pg` 타입이 나타나지 않는다 (`getNative(): unknown`).
- 기본값은 `??`로 적용한다 (`false`, `0` 보존). 설정 병합 순서: 드라이버 기본값 → 공통 필드 → `driverOptions`.
- 쿼리 에러는 드라이버 원본 에러 객체를 그대로 다시 던진다.
- 빌드 결과(`dist/`)는 커밋하지 않는다.
- 원격 push는 Task 8에서만, 기존 이력 위 일반 push로 한다. **force push 금지.** push 전 사용자 확인 필수.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`를 붙인다.

## Review Focus

1. MySQL 단일 연결 `execute` 실패 시 → `unprepare(sql)` 호출 후 **원본 에러**를 다시 던져야 한다 (Task 2 테스트).
2. `insertId`가 `0`, `'0'`, `null`(INSERT 아님 / `supportBigNumbers`) → `insertId` 키 없음, 큰 수 문자열은 그대로 유지 (Task 2 테스트).
3. 패키지 진입점만 import해도 `mysql2`/`pg`가 로드되면 안 된다 — 한쪽 드라이버만 설치한 사용자가 깨진다 (Task 5 테스트).
4. JS 사용자가 설정을 빠뜨리거나(`new BtDbConfig(undefined)`) client 오타를 내면 → `TypeError`가 아니라 `Invalid client: ...` 에러 (Task 1 테스트).
5. 드라이버의 하위 의존성(`pg-pool` 등)이 없을 때 → "pg 미설치"로 오인하지 말고 원래 에러 유지 (Task 4 테스트).

## File Structure

| 파일 | 책임 | 작업 |
|---|---|---|
| `src/BtDbTypes.ts` | 공통 타입 (`BtDbClient`, `BtDbExecutor`, `BtDbQueryResult`, `BtDbModifyResult`, `BtDbData`, `BtDbDataConstructor`) | 생성 (T1) |
| `src/BtDbConfig.ts` | 공통 설정 + client 검증 | 생성 (T1) |
| `src/driver/mysql/BtMysqlDriver.ts` | mysql2 옵션 매핑, 결과 정규화, executor, `mysqlDriver` | 생성 (T2) |
| `src/driver/pg/BtPgDriver.ts` | pg 옵션 매핑, 결과 정규화, executor, `pgDriver` | 생성 (T3) |
| `src/driver/BtDbDriver.ts` | `BtDbDriver` 인터페이스, `loadDriver`, `toDriverLoadError` | 생성 (T4) |
| `src/BtDbAbstractDao.ts` | 공통 Dao | 생성 (T5) |
| `src/query/BtDbQueryInterface.ts` | 쿼리 객체 인터페이스 | 생성 (T5) |
| `src/BtDb.ts` | 진입점 + export | 생성 (T5) |
| `src/common/BtUtil.ts` | 기존 유틸 | 변경 없음 |
| `src/BtMysql*.ts`, `src/query/BtMysqlQueryInterface.ts` | v2 구현 | 삭제 (T5) |
| `test/connection_pool.ts`, `test/single_connection.ts`, `test/test.sh` | v2 테스트 스크립트 | 삭제 (T5) |
| `test/unit/*.test.ts`, `test/unit/fixtures/load-entry.js` | 단위 테스트 | 생성 (T1–T5) |
| `test/integration/crud.test.ts`, `test/integration/.mocharc.json` | 통합 테스트 | 생성 (T6) |
| `docker-compose.yml` | 통합 테스트용 DB | 생성 (T6) |
| `package.json`, `.mocharc.json`, `.gitignore` | 패키징/테스트 설정 | 수정·생성 (T1) |
| `README.md` | 사용 문서 | 수정 (T7) |

---

### Task 1: 기준 커밋, 도구 설정, 공통 타입, BtDbConfig

**Files:**
- Modify: `.gitignore`, `package.json`
- Create: `.mocharc.json`, `src/BtDbTypes.ts`, `src/BtDbConfig.ts`
- Test: `test/unit/BtDbConfig.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `type BtDbClient = 'mysql' | 'pg'`
  - `type BtDbQueryResult = { rows: any[]; affectedRows: number; insertId?: number | string; raw: unknown }`
  - `type BtDbModifyResult = BtDbQueryResult`
  - `interface BtDbExecutor { execute(sql: string, values?: any): Promise<BtDbQueryResult>; query(sql: string, values?: any): Promise<BtDbQueryResult>; close(): Promise<void>; getNative(): unknown }`
  - `interface BtDbData { toString(): string }`, `interface BtDbDataConstructor { new(row?: any, fields?: any): BtDbData }`
  - `type BtDbConfigOptions`, `class BtDbConfig` — readonly 필드 `client, host?, port?, user?, password?, database?, ssl?, connectionLimit: number, connectTimeout: number, driverOptions: Record<string, any>`

- [ ] **Step 1: 작업 브랜치와 v2 기준 커밋**

현재 로컬 `main`은 HEAD만 `origin/main`(09c4210)에 맞춰져 있고 v2 포팅 결과는 커밋되지 않은 상태다. `.gitignore`에 빌드 결과를 추가한 뒤 v2 상태를 먼저 커밋한다.

```bash
cd /Users/eddie133/workspace/btLibrary/bt-node-mysql
git checkout -b db-neutral
printf '\n# Build output\ndist/\n\n# macOS\n.DS_Store\n' >> .gitignore
git add -A
git status --short   # dist/, node_modules/, .idea/, .DS_Store 가 목록에 없어야 함
git commit -m "refactor: port to TypeScript v2 (mysql2 3.x)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 2: package.json 교체와 의존성 설치**

`package.json` 전체를 다음으로 교체:

```json
{
  "name": "@es133/bt-ts-db",
  "version": "3.0.0",
  "description": "DB-neutral (MySQL, PostgreSQL) wrapping library for typescript",
  "main": "dist/BtDb.js",
  "types": "dist/BtDb.d.ts",
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "prepare": "npm run build",
    "test": "mocha",
    "test:integration": "mocha --config test/integration/.mocharc.json"
  },
  "peerDependencies": {
    "mysql2": "^3.11.4",
    "pg": "^8.11.0"
  },
  "peerDependenciesMeta": {
    "mysql2": {
      "optional": true
    },
    "pg": {
      "optional": true
    }
  },
  "devDependencies": {
    "@types/mocha": "^10.0.9",
    "@types/node": "^18.17.1",
    "@types/pg": "^8.11.0",
    "mocha": "^10.8.2",
    "mysql2": "^3.11.4",
    "pg": "^8.11.0",
    "ts-node": "^10.4.0",
    "typescript": "^5.6.3"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/es133/bt-ts-mysql"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com/"
  },
  "keywords": [],
  "author": "bugshot@gmail.com",
  "license": "MIT"
}
```

`.mocharc.json` 생성:

```json
{
  "require": ["ts-node/register"],
  "extension": ["ts"],
  "spec": ["test/unit/**/*.test.ts"],
  "timeout": 10000
}
```

Run: `npm install`
Expected: 에러 없이 완료 (`prepare`가 기존 src를 빌드함). `@types/pg ^8.11.0`이 해석되지 않으면 `npm view @types/pg version`으로 최신 8.x를 확인해 그 버전으로 지정한다.

- [ ] **Step 3: 실패하는 테스트 작성**

`test/unit/BtDbConfig.test.ts`:

```ts
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
```

- [ ] **Step 4: 실패 확인**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../src/BtDbConfig'`

- [ ] **Step 5: 구현**

`src/BtDbTypes.ts`:

```ts
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
```

`src/BtDbConfig.ts`:

```ts
import { BtDbClient } from './BtDbTypes';

const CLIENTS: ReadonlyArray<BtDbClient> = ['mysql', 'pg'];

export type BtDbConfigOptions = {
    client: BtDbClient;
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    connectionLimit?: number;
    connectTimeout?: number;
    ssl?: any;
    driverOptions?: Record<string, any>;
};

export class BtDbConfig {
    readonly client: BtDbClient;
    readonly host?: string;
    readonly port?: number;
    readonly user?: string;
    readonly password?: string;
    readonly database?: string;
    readonly ssl?: any;
    readonly connectionLimit: number;
    readonly connectTimeout: number;
    readonly driverOptions: Record<string, any>;

    constructor(options: BtDbConfigOptions) {
        if (!options || !CLIENTS.includes(options.client)) {
            throw new Error(`Invalid client: ${String(options?.client)}. Expected one of: ${CLIENTS.join(', ')}`);
        }

        this.client = options.client;
        this.host = options.host;
        this.port = options.port;
        this.user = options.user;
        this.password = options.password;
        this.database = options.database;
        this.ssl = options.ssl;
        this.connectionLimit = options.connectionLimit ?? 10;
        this.connectTimeout = options.connectTimeout ?? 10000;
        this.driverOptions = { ...(options.driverOptions ?? {}) };
    }
}
```

- [ ] **Step 6: 통과 확인**

Run: `npm test`
Expected: PASS — `7 passing`

- [ ] **Step 7: 커밋**

```bash
git add package.json package-lock.json .mocharc.json src/BtDbTypes.ts src/BtDbConfig.ts test/unit/BtDbConfig.test.ts
git commit -m "feat: add DB-neutral config and common types

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: MySQL 드라이버 어댑터

**Files:**
- Create: `src/driver/mysql/BtMysqlDriver.ts`
- Test: `test/unit/mysqlDriver.test.ts`

**Interfaces:**
- Consumes: `BtDbConfig`, `BtDbExecutor`, `BtDbQueryResult` (Task 1)
- Produces:
  - `mysqlConnectionOptions(config: BtDbConfig): ConnectionOptions`
  - `mysqlPoolOptions(config: BtDbConfig): PoolOptions`
  - `normalizeMysqlResult(result: unknown): BtDbQueryResult`
  - `class MysqlConnectionExecutor implements BtDbExecutor` (생성자 `(connection: Connection)`)
  - `class MysqlPoolExecutor implements BtDbExecutor` (생성자 `(pool: Pool)`)
  - `const mysqlDriver: { connect(config: BtDbConfig): Promise<BtDbExecutor>; createPool(config: BtDbConfig): Promise<BtDbExecutor> }` — Task 4의 `BtDbDriver`와 같은 모양

- [ ] **Step 1: 실패하는 테스트 작성**

`test/unit/mysqlDriver.test.ts`:

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../src/driver/mysql/BtMysqlDriver'`

- [ ] **Step 3: 구현**

`src/driver/mysql/BtMysqlDriver.ts`:

```ts
'use strict';

import Mysql, { Connection, ConnectionOptions, Pool, PoolOptions } from 'mysql2/promise';
import { BtDbConfig } from '../../BtDbConfig';
import { BtDbExecutor, BtDbQueryResult } from '../../BtDbTypes';

const MYSQL_DEFAULTS = {
    charset: 'UTF8_GENERAL_CI',
    timezone: 'local',
};

function commonOptions(config: BtDbConfig) {
    return {
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        ssl: config.ssl,
        connectTimeout: config.connectTimeout,
    };
}

export function mysqlConnectionOptions(config: BtDbConfig): ConnectionOptions {
    return { ...MYSQL_DEFAULTS, ...commonOptions(config), ...config.driverOptions };
}

export function mysqlPoolOptions(config: BtDbConfig): PoolOptions {
    return { ...MYSQL_DEFAULTS, ...commonOptions(config), connectionLimit: config.connectionLimit, ...config.driverOptions };
}

function hasInsertId(insertId: unknown): insertId is number | string {
    return (typeof insertId === 'number' && insertId !== 0)
        || (typeof insertId === 'string' && insertId !== '' && insertId !== '0');
}

export function normalizeMysqlResult(result: unknown): BtDbQueryResult {
    if (Array.isArray(result)) {
        return { rows: result, affectedRows: 0, raw: result };
    }

    const header = (result ?? {}) as { affectedRows?: number; insertId?: unknown };
    const normalized: BtDbQueryResult = { rows: [], affectedRows: header.affectedRows ?? 0, raw: result };
    if (hasInsertId(header.insertId)) {
        normalized.insertId = header.insertId;
    }
    return normalized;
}

export class MysqlConnectionExecutor implements BtDbExecutor {
    constructor(private readonly connection: Connection) {}

    async execute(sql: string, values?: any): Promise<BtDbQueryResult> {
        try {
            const [result] = await this.connection.execute(sql, values);
            return normalizeMysqlResult(result);
        } catch (exception) {
            this.connection.unprepare(sql);
            throw exception;
        }
    }

    async query(sql: string, values?: any): Promise<BtDbQueryResult> {
        const [result] = await this.connection.query(sql, values);
        return normalizeMysqlResult(result);
    }

    async close(): Promise<void> {
        await this.connection.end();
    }

    getNative(): unknown {
        return this.connection;
    }
}

export class MysqlPoolExecutor implements BtDbExecutor {
    constructor(private readonly pool: Pool) {}

    async execute(sql: string, values?: any): Promise<BtDbQueryResult> {
        const [result] = await this.pool.execute(sql, values);
        return normalizeMysqlResult(result);
    }

    async query(sql: string, values?: any): Promise<BtDbQueryResult> {
        const [result] = await this.pool.query(sql, values);
        return normalizeMysqlResult(result);
    }

    async close(): Promise<void> {
        await this.pool.end();
    }

    getNative(): unknown {
        return this.pool;
    }
}

export const mysqlDriver = {
    async connect(config: BtDbConfig): Promise<BtDbExecutor> {
        const connection = await Mysql.createConnection(mysqlConnectionOptions(config));
        return new MysqlConnectionExecutor(connection);
    },

    async createPool(config: BtDbConfig): Promise<BtDbExecutor> {
        return new MysqlPoolExecutor(Mysql.createPool(mysqlPoolOptions(config)));
    },
};
```

- [ ] **Step 4: 통과 확인**

Run: `npm test`
Expected: PASS — 이전 7개 + 이번 11개 = `18 passing`

- [ ] **Step 5: 커밋**

```bash
git add src/driver/mysql/BtMysqlDriver.ts test/unit/mysqlDriver.test.ts
git commit -m "feat: add mysql driver adapter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: PostgreSQL 드라이버 어댑터

**Files:**
- Create: `src/driver/pg/BtPgDriver.ts`
- Test: `test/unit/pgDriver.test.ts`

**Interfaces:**
- Consumes: `BtDbConfig`, `BtDbExecutor`, `BtDbQueryResult` (Task 1)
- Produces:
  - `pgClientConfig(config: BtDbConfig): ClientConfig`
  - `pgPoolConfig(config: BtDbConfig): PoolConfig`
  - `normalizePgResult(result: { rows?: any[]; rowCount?: number | null }): BtDbQueryResult`
  - `class PgClientExecutor implements BtDbExecutor` (생성자 `(client: Client)`)
  - `class PgPoolExecutor implements BtDbExecutor` (생성자 `(pool: Pool)`)
  - `const pgDriver: { connect(config): Promise<BtDbExecutor>; createPool(config): Promise<BtDbExecutor> }`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/unit/pgDriver.test.ts`:

```ts
import assert from 'assert';
import { Client, Pool } from 'pg';
import { BtDbConfig } from '../../src/BtDbConfig';
import {
    PgClientExecutor,
    PgPoolExecutor,
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
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../src/driver/pg/BtPgDriver'`

- [ ] **Step 3: 구현**

`src/driver/pg/BtPgDriver.ts`:

```ts
'use strict';

import { Client, ClientConfig, Pool, PoolConfig } from 'pg';
import { BtDbConfig } from '../../BtDbConfig';
import { BtDbExecutor, BtDbQueryResult } from '../../BtDbTypes';

function commonConfig(config: BtDbConfig) {
    return {
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        ssl: config.ssl,
        connectionTimeoutMillis: config.connectTimeout,
    };
}

export function pgClientConfig(config: BtDbConfig): ClientConfig {
    return { ...commonConfig(config), ...config.driverOptions };
}

export function pgPoolConfig(config: BtDbConfig): PoolConfig {
    return { ...commonConfig(config), max: config.connectionLimit, ...config.driverOptions };
}

export function normalizePgResult(result: { rows?: any[]; rowCount?: number | null }): BtDbQueryResult {
    return { rows: result.rows ?? [], affectedRows: result.rowCount ?? 0, raw: result };
}

export class PgClientExecutor implements BtDbExecutor {
    constructor(private readonly client: Client) {}

    async execute(sql: string, values?: any): Promise<BtDbQueryResult> {
        return normalizePgResult(await this.client.query(sql, values));
    }

    async query(sql: string, values?: any): Promise<BtDbQueryResult> {
        return this.execute(sql, values);
    }

    async close(): Promise<void> {
        await this.client.end();
    }

    getNative(): unknown {
        return this.client;
    }
}

export class PgPoolExecutor implements BtDbExecutor {
    constructor(private readonly pool: Pool) {}

    async execute(sql: string, values?: any): Promise<BtDbQueryResult> {
        return normalizePgResult(await this.pool.query(sql, values));
    }

    async query(sql: string, values?: any): Promise<BtDbQueryResult> {
        return this.execute(sql, values);
    }

    async close(): Promise<void> {
        await this.pool.end();
    }

    getNative(): unknown {
        return this.pool;
    }
}

export const pgDriver = {
    async connect(config: BtDbConfig): Promise<BtDbExecutor> {
        const client = new Client(pgClientConfig(config));
        await client.connect();
        return new PgClientExecutor(client);
    },

    async createPool(config: BtDbConfig): Promise<BtDbExecutor> {
        return new PgPoolExecutor(new Pool(pgPoolConfig(config)));
    },
};
```

- [ ] **Step 4: 통과 확인**

Run: `npm test`
Expected: PASS — `26 passing`

- [ ] **Step 5: 커밋**

```bash
git add src/driver/pg/BtPgDriver.ts test/unit/pgDriver.test.ts
git commit -m "feat: add pg driver adapter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 드라이버 로더

**Files:**
- Create: `src/driver/BtDbDriver.ts`
- Test: `test/unit/BtDbDriver.test.ts`

**Interfaces:**
- Consumes: `BtDbClient`, `BtDbExecutor` (Task 1), `mysqlDriver` (Task 2), `pgDriver` (Task 3) — **동적 import로만**
- Produces:
  - `interface BtDbDriver { connect(config: BtDbConfig): Promise<BtDbExecutor>; createPool(config: BtDbConfig): Promise<BtDbExecutor> }`
  - `toDriverLoadError(error: unknown, pkg: string): unknown`
  - `loadDriver(client: BtDbClient): Promise<BtDbDriver>`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/unit/BtDbDriver.test.ts`:

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../src/driver/BtDbDriver'`

- [ ] **Step 3: 구현**

`src/driver/BtDbDriver.ts`:

```ts
'use strict';

import { BtDbConfig } from '../BtDbConfig';
import { BtDbClient, BtDbExecutor } from '../BtDbTypes';

export interface BtDbDriver {
    connect(config: BtDbConfig): Promise<BtDbExecutor>;
    createPool(config: BtDbConfig): Promise<BtDbExecutor>;
}

const DRIVER_PACKAGES: Record<BtDbClient, string> = {
    mysql: 'mysql2',
    pg: 'pg',
};

export function toDriverLoadError(error: unknown, pkg: string): unknown {
    const candidate = error as { code?: unknown; message?: unknown } | null | undefined;
    const missingPackage = new RegExp(`Cannot find module '${pkg}(/[^']*)?'`);
    if (candidate && candidate.code === 'MODULE_NOT_FOUND'
        && typeof candidate.message === 'string' && missingPackage.test(candidate.message)) {
        return new Error(`Driver package "${pkg}" is not installed. Run: npm install ${pkg}`);
    }
    return error;
}

// Drivers are imported lazily so that only the package for the chosen client has to be installed.
export async function loadDriver(client: BtDbClient): Promise<BtDbDriver> {
    try {
        if (client === 'mysql') {
            return (await import('./mysql/BtMysqlDriver')).mysqlDriver;
        }
        return (await import('./pg/BtPgDriver')).pgDriver;
    } catch (error) {
        throw toDriverLoadError(error, DRIVER_PACKAGES[client]);
    }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test`
Expected: PASS — `32 passing`

- [ ] **Step 5: 커밋**

```bash
git add src/driver/BtDbDriver.ts test/unit/BtDbDriver.test.ts
git commit -m "feat: add lazy driver loader with install hint

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Dao, 진입점, v2 코드 제거

**Files:**
- Create: `src/BtDbAbstractDao.ts`, `src/query/BtDbQueryInterface.ts`, `src/BtDb.ts`, `test/unit/fixtures/load-entry.js`
- Delete: `src/BtMysql.ts`, `src/BtMysqlAbstractDao.ts`, `src/BtMysqlConfig.ts`, `src/BtMysqlConnection.ts`, `src/BtMysqlConnectionPool.ts`, `src/BtMysqlData.ts`, `src/query/BtMysqlQueryInterface.ts`, `test/connection_pool.ts`, `test/single_connection.ts`, `test/test.sh`
- Test: `test/unit/BtDbAbstractDao.test.ts`, `test/unit/BtDb.test.ts`

**Interfaces:**
- Consumes: Task 1 타입·설정, Task 4 `loadDriver`
- Produces:
  - `interface BtDbQueryInterface { query(): string; values(): any }`
  - `class BtDbAbstractDao` — 생성자 `(executor: BtDbExecutor | null)`; `execute(sql, values?): Promise<any[] | null>`, `query(sql, values?): Promise<any[] | null>`, `fetchRawData(q): Promise<any[] | null>`, `modify(q): Promise<BtDbModifyResult | null>`, `fetchSingle(Ctor, q): Promise<BtDbData>`, `fetchArray(Ctor, q): Promise<Array<BtDbData>>`; `protected client: BtDbExecutor | null`
  - `class BtDb` — `static buildConnection(config: BtDbConfig): Promise<BtDbExecutor>`, `static buildConnectionPool(config: BtDbConfig): Promise<BtDbExecutor>`
  - `src/BtDb.ts`의 export: `BtDb`, `BtDbTypes`의 모든 export, `BtDbConfig`, `BtDbConfigOptions`, `BtDbAbstractDao`, `BtDbQueryInterface`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/unit/BtDbAbstractDao.test.ts`:

```ts
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
```

`test/unit/fixtures/load-entry.js`:

```js
// Loads the package entry in a fresh process and prints which driver packages ended up in require.cache.
require('ts-node/register/transpile-only');
require('../../../src/BtDb');

const loaded = Object.keys(require.cache).filter((file) => /node_modules[\\/](mysql2|pg)[\\/]/.test(file));
process.stdout.write(JSON.stringify(loaded));
```

`test/unit/BtDb.test.ts`:

```ts
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
```

> mysql2 promise 풀의 클래스 이름(`PromisePool`)과 pg 풀의 클래스 이름(`BoundPool`)은 라이브러리 내부 이름이다. Step 4에서 다르게 나오면 실제 이름(`node -e "console.log(require('mysql2/promise').createPool({}).constructor.name)"`, `node -e "console.log(new (require('pg').Pool)().constructor.name)"`)으로 기대값을 맞춘다.

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../src/BtDbAbstractDao'`

- [ ] **Step 3: 구현**

`src/query/BtDbQueryInterface.ts`:

```ts
export interface BtDbQueryInterface {
    query(): string;
    values(): any;
}
```

`src/BtDbAbstractDao.ts`:

```ts
'use strict';

import { BtDbData, BtDbDataConstructor, BtDbExecutor, BtDbModifyResult, BtDbQueryResult } from './BtDbTypes';
import { BtDbQueryInterface } from './query/BtDbQueryInterface';

export class BtDbAbstractDao {

    protected client: BtDbExecutor | null;

    constructor (executor: BtDbExecutor | null) {
        this.client = executor || null;
    }

    async execute(sql: string, values?: any): Promise<any[] | null> {
        return this.rowsOrNull(await this.run('execute', sql, values));
    }

    async query(sql: string, values?: any): Promise<any[] | null> {
        return this.rowsOrNull(await this.run('query', sql, values));
    }

    async fetchRawData(queryInterface: BtDbQueryInterface): Promise<any[] | null> {
        return this.execute(queryInterface.query(), queryInterface.values());
    }

    async modify(queryInterface: BtDbQueryInterface): Promise<BtDbModifyResult | null> {
        return this.run('execute', queryInterface.query(), queryInterface.values());
    }

    async fetchSingle(constructor: BtDbDataConstructor, queryInterface: BtDbQueryInterface): Promise<BtDbData> {
        const rows = await this.fetchRawData(queryInterface);
        return rows ? new constructor(rows[0]) : new constructor();
    }

    async fetchArray(constructor: BtDbDataConstructor, queryInterface: BtDbQueryInterface): Promise<Array<BtDbData>> {
        const rows = await this.fetchRawData(queryInterface);
        return rows ? rows.map(row => new constructor(row)) : [];
    }

    private rowsOrNull(result: BtDbQueryResult | null): any[] | null {
        return result && result.rows.length > 0 ? result.rows : null;
    }

    private async run(method: 'execute' | 'query', sql: string, values?: any): Promise<BtDbQueryResult | null> {
        if (!this.client) {
            return null;
        }
        try {
            return await this.client[method](sql, values);
        } catch (exception) {
            console.error('DB Error', exception);
            console.error('QUERY: ', sql);
            console.error('PARAMS: ', values);
            throw exception;
        }
    }
}
```

`src/BtDb.ts`:

```ts
'use strict';

import { BtDbConfig } from './BtDbConfig';
import { BtDbExecutor } from './BtDbTypes';
import { loadDriver } from './driver/BtDbDriver';

export class BtDb {
    constructor () {}

    static async buildConnection(config: BtDbConfig): Promise<BtDbExecutor> {
        const driver = await loadDriver(config.client);
        return driver.connect(config);
    }

    static async buildConnectionPool(config: BtDbConfig): Promise<BtDbExecutor> {
        const driver = await loadDriver(config.client);
        return driver.createPool(config);
    }
}

export * from './BtDbTypes';
export * from './BtDbConfig';
export { BtDbAbstractDao } from './BtDbAbstractDao';
export { BtDbQueryInterface } from './query/BtDbQueryInterface';
```

- [ ] **Step 4: 통과 확인**

Run: `npm test`
Expected: PASS — `44 passing`

- [ ] **Step 5: v2 파일 삭제 후 빌드와 공개 타입 확인**

```bash
git rm -q src/BtMysql.ts src/BtMysqlAbstractDao.ts src/BtMysqlConfig.ts src/BtMysqlConnection.ts \
  src/BtMysqlConnectionPool.ts src/BtMysqlData.ts src/query/BtMysqlQueryInterface.ts \
  test/connection_pool.ts test/single_connection.ts test/test.sh
rm -rf dist && npm run build && npm test
grep -rlE "mysql2|from 'pg'|from \"pg\"" dist --include='*.d.ts'
```

Expected:
- 빌드 성공, `44 passing`
- `grep` 출력이 정확히 `dist/driver/mysql/BtMysqlDriver.d.ts`, `dist/driver/pg/BtPgDriver.d.ts` 두 줄뿐이다 (`dist/BtDb.d.ts`, `BtDbTypes.d.ts`, `BtDbConfig.d.ts`, `BtDbAbstractDao.d.ts`, `driver/BtDbDriver.d.ts`에는 없음).

- [ ] **Step 6: 커밋**

```bash
git add -A src test
git commit -m "feat: add BtDb entry and DB-neutral dao, remove v2 mysql classes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 통합 테스트와 docker-compose

**Files:**
- Create: `docker-compose.yml`, `test/integration/.mocharc.json`, `test/integration/crud.test.ts`

**Interfaces:**
- Consumes: `BtDb`, `BtDbConfig`, `BtDbAbstractDao`, `BtDbClient`, `BtDbExecutor`, `BtDbQueryInterface` (`src/BtDb.ts`)
- Produces: `npm run test:integration` (환경변수 없는 DB는 skip)

- [ ] **Step 1: docker-compose와 mocha 설정 작성**

`docker-compose.yml`:

```yaml
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: bt_test
      MYSQL_DATABASE: bt_test
      MYSQL_USER: bt_test
      MYSQL_PASSWORD: bt_test
    ports:
      - "13306:3306"
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1", "-ubt_test", "-pbt_test"]
      interval: 5s
      timeout: 5s
      retries: 30

  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: bt_test
      POSTGRES_PASSWORD: bt_test
      POSTGRES_DB: bt_test
    ports:
      - "15432:5432"
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "bt_test", "-d", "bt_test"]
      interval: 5s
      timeout: 5s
      retries: 30
```

`test/integration/.mocharc.json`:

```json
{
  "require": ["ts-node/register"],
  "extension": ["ts"],
  "spec": ["test/integration/**/*.test.ts"],
  "timeout": 30000
}
```

- [ ] **Step 2: 통합 테스트 작성**

`test/integration/crud.test.ts`:

```ts
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
```

- [ ] **Step 3: 환경변수 없이 skip 되는지 확인**

Run: `npm run test:integration`
Expected: 실패 없이 종료, 결과에 `10 pending` (두 DB 모두 skip)

- [ ] **Step 4: DB를 띄우고 실제 실행**

```bash
docker compose up -d --wait
MYSQL_HOST=127.0.0.1 MYSQL_PORT=13306 MYSQL_USER=bt_test MYSQL_PASSWD=bt_test MYSQL_NAME=bt_test \
PG_HOST=127.0.0.1 PG_PORT=15432 PG_USER=bt_test PG_PASSWD=bt_test PG_NAME=bt_test \
npm run test:integration
```

Expected: `10 passing`
Docker가 없거나 데몬이 꺼져 있으면 이 단계를 멈추고 사용자에게 알린다 (임의로 건너뛰지 않음).

- [ ] **Step 5: DB 정리와 커밋**

```bash
docker compose down
git add docker-compose.yml test/integration/.mocharc.json test/integration/crud.test.ts
git commit -m "test: add mysql/pg integration tests with docker-compose

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: README와 최종 검증

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1–6의 공개 API
- Produces: 새 README, 스펙 9장 성공 기준 검증 결과

- [ ] **Step 1: README 교체**

`README.md` 전체를 다음으로 교체:

````markdown
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
````

- [ ] **Step 2: 스펙 9장 성공 기준 검증**

```bash
rm -rf dist && npm run build && npm test
```
Expected: 빌드 성공, `44 passing`

pg 미설치 상황 확인 (끝나면 반드시 복구):

```bash
mv node_modules/pg node_modules/.pg-hidden
node -e "
const { BtDb, BtDbConfig } = require('./dist/BtDb');
(async () => {
  const pool = await BtDb.buildConnectionPool(new BtDbConfig({ client: 'mysql', host: '127.0.0.1', port: 1 }));
  await pool.close();
  console.log('mysql ok');
  try { await BtDb.buildConnectionPool(new BtDbConfig({ client: 'pg' })); console.log('UNEXPECTED: pg loaded'); }
  catch (e) { console.log(e.message); }
})();
"; mv node_modules/.pg-hidden node_modules/pg
ls node_modules/pg/package.json
```

Expected:
```
mysql ok
Driver package "pg" is not installed. Run: npm install pg
node_modules/pg/package.json
```

통합 테스트는 Task 6 Step 4 결과(`10 passing`)를 인용한다.

- [ ] **Step 3: 커밋**

```bash
git add README.md
git commit -m "docs: rewrite README for bt-ts-db v3

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 원격 저장소 반영 (사용자 확인 필수)

**Files:** 없음 (git 작업만)

**Interfaces:**
- Consumes: Task 1–7 커밋이 있는 `db-neutral` 브랜치
- Produces: `origin/main` 갱신 (force push 아님)

- [ ] **Step 1: main에 fast-forward 병합**

```bash
git fetch origin
git checkout main
git merge --ff-only db-neutral
```

Expected: fast-forward 성공. `origin/main`이 09c4210에서 바뀌어 fast-forward가 안 되면 멈추고 사용자에게 알린다.

- [ ] **Step 2: push할 내용 요약**

```bash
git log --oneline origin/main..main
git diff --stat origin/main..main
```

- [ ] **Step 3: 사용자 확인**

Step 2 출력(커밋 목록, 파일 변경 요약, 원격에서 삭제되는 파일 목록)을 사용자에게 보여 주고 **push 여부를 묻는다. 승인 전에는 push하지 않는다.**

- [ ] **Step 4: push (승인 후)**

```bash
git push origin main
```

Expected: `09c4210..<new> main -> main`. 인증 실패 시 사용자에게 `! git push origin main`을 직접 실행하도록 안내한다. `--force`는 어떤 경우에도 쓰지 않는다.

- [ ] **Step 5: 작업 브랜치 정리**

```bash
git branch -d db-neutral
git status -sb   # "## main...origin/main" 이고 차이 없음
```
