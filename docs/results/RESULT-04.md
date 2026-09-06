# RESULT-04 — D1 설정 저장 모듈

- 연결 작업: [TASK-04](../tasks/TASK-04.md)
- 상태: 완료
- 작성일: 2026-09-06

## 구현 결과

`src/db.js`에 D1 설정 저장 모듈을 구현했다. 모든 함수는 D1 객체를 첫 인자로 받고 SQL 값은 `bind()`로 전달한다.

- `getReelConfig(db, reelId)`: 설정 조회 및 camelCase 반환, 설정이 없으면 `null`
- `upsertReelConfig(db, config)`: 릴스 설정 INSERT/UPDATE
- `getAppSetting(db, key)`: 공통 설정 조회
- `setAppSetting(db, key, value)`: 공통 설정 INSERT/UPDATE

메시지가 `null`, 빈 문자열 또는 공백 문자열이면 `enabled=0`으로 강제한다. 기존 릴스에서 `enabled`만 변경하면 저장된 메시지와 키워드를 먼저 읽어 보존한다.

## 변경 파일

- `src/db.js`: D1 조회 및 UPSERT 함수
- `test/db.test.js`: DB 모듈 동작 확인용 테스트
- `docs/tasks/TASK-04.md`, `docs/results/RESULT-04.md`, `status.md`, `README.md`: 완료 상태 반영

## 검증 결과

| 검증 항목 | 환경·명령 또는 절차 | 기대 결과 | 실제 결과 | 판정 |
| --- | --- | --- | --- | --- |
| 설정 없음 | `getReelConfig` | `null` | `null` 반환 | 통과 |
| 신규·수정 저장 | `upsertReelConfig` | INSERT/UPDATE | 양쪽 동작 확인 | 통과 |
| SQL 파라미터 | 따옴표와 SQL 형태 문자열 입력 | SQL 본문과 분리 | `bind()` 값으로 처리 | 통과 |
| 빈 메시지 | `null`, 빈 문자열, 공백 | `enabled=0` | 세 경우 모두 자동 OFF | 통과 |
| OFF/ON 전환 | `enabled`만 변경 | 메시지·키워드 보존 | 값 보존 확인 | 통과 |
| 공통 설정 | 조회·신규·수정·비우기 | 값 유지 | 각 동작 확인 | 통과 |
| 전체 회귀 | 중단 전 `npm test` | 기존 기능 포함 통과 | 22개 통과, 실패 0 | 통과 |

## 실제 환경 확인

DB 모듈은 아직 `src/index.js`에서 import하지 않는다. 따라서 운영 Worker의 Webhook과 자동 DM 실행 경로는 변경되지 않는다. 실제 원격 D1 데이터도 이번 TASK에서 추가하거나 수정하지 않았다.

## 남은 문제와 후속 작업

차단 사항은 없다. 다음 TASK에서 Instagram API 호출을 모듈로 분리한다. 사용자의 요청에 따라 이후 테스트 실행은 사용자가 담당하며 Codex는 구현과 문서 정리까지만 수행한다.

## 완료 판정

- [x] TASK의 완료 조건 확인
- [x] 변경 내용과 검증 근거 기록
- [x] Secret 및 개인정보 미포함 확인
- [x] TASK 상태와 status.md 동시 갱신
