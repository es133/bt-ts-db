# DB 중립화 설계 (MySQL + PostgreSQL)

- 작성일: 2026-10-14
- 대상: `bt_node_mysql` v2.0.0 → `@es133/bt-ts-db` v3.0.0

## 1. 목표와 범위

**목표**: 앱마다 사용하는 DB(MySQL 또는 PostgreSQL)가 달라도 같은 래퍼 API(연결 · 풀 · Dao · 결과 타입)를 쓸 수 있게 한다.

**포함**
- MySQL(`mysql2`), PostgreSQL(`pg`) 드라이버 어댑터
- 공통 설정, 공통 실행 인터페이스, 공통 결과 타입
- 단위 테스트, 양쪽 DB 통합 테스트, docker-compose

**제외 (명시적 비목표)**
- SQL 방언 변환. 플레이스홀더(`?` ↔ `$1`)를 포함해 SQL은 앱이 자기 DB 문법으로 작성한다.
- 한 앱이 두 DB를 동시에 쓰는 다중 연결 관리
- 트랜잭션 API (후속 작업 후보: `transaction(fn)`)
- 타입 변환 정규화 (예: pg BIGINT → string 은 드라이버 기본 동작을 따름)
- 디렉토리명 `bt-node-mysql` 변경 (사용자가 직접 수행)

## 2. 구조

```
src/
  BtDb.ts                      // buildConnection / buildConnectionPool, 전체 export
  BtDbConfig.ts                // 공통 설정 + 검증
  BtDbTypes.ts                 // BtDbExecutor, BtDbQueryResult, BtDbModifyResult, BtDbData, BtDbDataConstructor
  BtDbAbstractDao.ts           // 공통 Dao (드라이버를 모름)
  query/BtDbQueryInterface.ts
  common/BtUtil.ts
  driver/
    BtDbDriver.ts              // BtDbDriver 인터페이스, loadDriver(client), 미설치 에러 변환
    mysql/BtMysqlDriver.ts     // mysql2: connection / pool executor, normalizeMysqlResult
    pg/BtPgDriver.ts           // pg: Client / Pool executor, normalizePgResult
```

기존 `BtMysql*` 파일은 위 파일로 대체되며 삭제한다.

## 3. 공개 API

### 3.1 설정

```ts
type BtDbClient = 'mysql' | 'pg';

new BtDbConfig({
  client: 'mysql' | 'pg',       // 필수. 그 외 값이면 생성자에서 Error
  host?, port?, user?, password?, database?,
  connectionLimit?,              // 기본 10. mysql: connectionLimit, pg: max
  connectTimeout?,               // 기본 10000(ms). mysql: connectTimeout, pg: connectionTimeoutMillis
  ssl?,
  driverOptions?: Record<string, any>   // 드라이버 고유 옵션, 드라이버 설정에 그대로 병합
});
```

- 기본값은 `??`로 적용한다 (`false`, `0` 보존).
- MySQL 기본값은 MySQL 드라이버에서 적용한다: `charset: 'UTF8_GENERAL_CI'`, `timezone: 'local'`. `driverOptions`가 우선한다.
- 병합 순서: 드라이버 기본값 → 공통 필드 매핑 → `driverOptions`.
- 기존 `enableDebug()`는 제거한다 (`driverOptions: { debug: true }`로 대체).

### 3.2 진입점

```ts
BtDb.buildConnection(config: BtDbConfig): Promise<BtDbExecutor>      // 단일 연결 (connect 완료 후 반환)
BtDb.buildConnectionPool(config: BtDbConfig): Promise<BtDbExecutor>  // 풀
```

### 3.3 실행 인터페이스

```ts
interface BtDbExecutor {
  execute(sql: string, values?: any): Promise<BtDbQueryResult>; // mysql: prepared(execute), pg: 파라미터 쿼리
  query(sql: string, values?: any): Promise<BtDbQueryResult>;   // mysql: text query, pg: execute와 동일
  close(): Promise<void>;                                       // 연결 종료 / 풀 종료
  getNative(): unknown;                                         // mysql2 Connection|Pool, pg Client|Pool
}

type BtDbQueryResult = {
  rows: any[];
  affectedRows: number;
  insertId?: number | string;
  raw: unknown;               // 드라이버 원본 결과
};

type BtDbModifyResult = BtDbQueryResult;
```

### 3.4 Dao

`BtDbAbstractDao(executor: BtDbExecutor)` — 동작은 v2와 동일:

| 메서드 | 반환 |
|---|---|
| `execute(sql, values)` / `query(sql, values)` | `rows`, 비어 있으면 `null` |
| `fetchRawData(q)` | `execute`와 동일 |
| `fetchSingle(Ctor, q)` | 첫 행으로 `new Ctor(row)`, 없으면 `new Ctor()` |
| `fetchArray(Ctor, q)` | 각 행 `new Ctor(row)` 배열, 없으면 `[]` |
| `modify(q)` | `BtDbModifyResult` |

`executor`가 없으면(null) 조회 계열은 `null`/빈 값, `modify`는 `null`을 반환한다 (v2 동작 유지).

### 3.5 제거되는 v2 기능

`executeOnce`, `enableNamePlaceHolder`/`disableNamePlaceHolder`, `connectionOption()`, `showPoolState` 이벤트 로그, 풀 `getConnection()`, `disconnectGraceful`/`disconnectImmediate`/`disconnectPool`(→ `close()`). 필요 시 `getNative()` 사용.

## 4. 드라이버 로딩

- `loadDriver(client)`가 `await import('./mysql/BtMysqlDriver')` 또는 `'./pg/BtPgDriver'`를 호출한다.
- `mysql2`, `pg`는 각 드라이버 파일에서만 import한다. 사용하지 않는 드라이버 패키지는 설치되지 않아도 된다.
- import 실패가 `MODULE_NOT_FOUND`이고 대상이 해당 드라이버 패키지이면 다음 메시지의 Error로 변환한다:
  `Driver package "<pkg>" is not installed. Run: npm install <pkg>`
  그 외 에러는 그대로 던진다. 변환 로직은 `toDriverLoadError(err, pkg)` 순수 함수로 분리한다.

## 5. 결과 정규화

`normalizeMysqlResult(result)`, `normalizePgResult(result)` 순수 함수로 구현한다.

| 입력 | rows | affectedRows | insertId |
|---|---|---|---|
| mysql 행 배열 (SELECT) | 그 배열 | 0 | undefined |
| mysql ResultSetHeader (INSERT/UPDATE/DELETE) | `[]` | `affectedRows` | `insertId`, 0이면 undefined |
| pg QueryResult | `result.rows` | `result.rowCount ?? 0` | undefined |

`raw`에는 항상 원본 결과를 담는다.

## 6. 에러 처리

- 쿼리 에러는 드라이버 원본 에러를 그대로 다시 던진다 (`err.code` 유지).
- Dao는 에러, QUERY, PARAMS를 `console.error`로 기록한다 (v2 동작 유지).
- MySQL 단일 연결의 `execute` 실패 시 `unprepare(sql)`를 호출한다 (v2 동작 유지).

## 7. 패키징

- `name: @es133/bt-ts-db`, `version: 3.0.0`, `main: dist/BtDb.js`, `types: dist/BtDb.d.ts`
- 원격 저장소(`es133/bt-ts-mysql`)의 메타데이터 유지: `repository`, `publishConfig.registry: https://npm.pkg.github.com/`, `license`, `author`
  - `license`는 원격의 `"MIT license"`를 유효한 SPDX 표기 `"MIT"`로 수정
- `private: true` 제거 (GitHub Packages 배포 대상)
- `.gitignore`에 `dist/`, `.DS_Store` 추가 (원격처럼 빌드 결과는 커밋하지 않음)
- `peerDependencies`: `mysql2 ^3.11.4`, `pg ^8.11.0`; `peerDependenciesMeta`에서 둘 다 `optional: true`
- `devDependencies`: 기존 + `mysql2`, `pg`, `@types/pg`
- 공개 `.d.ts`에는 드라이버 타입을 노출하지 않는다 (`getNative(): unknown`).
- `README.md`를 새 API 기준으로 갱신한다. 원격 README의 구성(GitHub Packages 설치용 `.npmrc` 안내, NestJS 사용 예)을 유지하고 이름과 API만 바꾼다.

## 8. 테스트

**단위 (`npm test`, DB 불필요)** — mocha + ts-node, `.mocharc.json` 추가, `test/unit/`
- `BtDbConfig`: client 검증, 드라이버별 옵션 매핑, `driverOptions` 병합 순서, `false`/`0` 보존
- `normalizeMysqlResult` / `normalizePgResult`: 5장 표의 모든 경우
- `BtDbAbstractDao`: 가짜 executor로 null/빈 결과, fetchSingle/fetchArray/modify, 에러 재전파
- `toDriverLoadError`: 메시지 변환, 무관한 에러는 그대로

**통합 (`npm run test:integration`)** — `test/integration/`
- 동일 스위트를 mysql, pg에 각각 실행: 임시 테이블 생성 → INSERT → SELECT → UPDATE → DELETE → DROP
- mysql은 `insertId`, pg는 `INSERT ... RETURNING id`의 `rows[0].id` 확인
- 환경변수 `MYSQL_HOST/MYSQL_PORT/MYSQL_USER/MYSQL_PASSWD/MYSQL_NAME`, `PG_HOST/PG_PORT/PG_USER/PG_PASSWD/PG_NAME`이 없는 DB는 skip
- `docker-compose.yml`: MySQL 8, PostgreSQL 16 (README에 접속 정보와 실행법 기재)

기존 `test/connection_pool.ts`, `test/single_connection.ts`, `test/test.sh`는 삭제한다.

## 9. 성공 기준

- `npm run build` 성공, `npm test` 통과
- docker-compose로 띄운 두 DB에서 `npm run test:integration` 통과
- `pg`를 제거한 상태에서 mysql 사용 코드가 동작하고, `client: 'pg'` 사용 시 4장의 안내 메시지가 나온다

## 10. 원격 저장소 반영

- 대상: `https://github.com/es133/bt-ts-mysql` `main` (2023-05-04 `09c4210`까지 커밋 5개)
- 방식: 로컬 저장소의 HEAD를 `origin/main`에 맞추고(작업 파일은 유지), 구현 완료 후 **기존 이력 위에 새 커밋**으로 일반 push한다. force push는 하지 않는다.
- 원격에만 있는 파일(`src/BtMysqlPoolCluster.ts` 등 `BtMysql*` 파일)은 이 커밋에서 삭제된다.
- 시점: 9장 성공 기준을 통과한 뒤. push 전에 커밋 내용(diff 요약)을 사용자에게 확인받는다.
- 저장소 이름 변경(`bt-ts-mysql` → 예: `bt-ts-db`)은 사용자가 GitHub에서 직접 한다. 변경하면 `repository.url`을 맞춘다.
