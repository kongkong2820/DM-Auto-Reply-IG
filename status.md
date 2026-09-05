# 개발 진행 현황

기준일: 2026-09-05

## 현재 상태

TASK-01을 완료해 현재 Cloudflare에 배포된 소스인 `worker.js`를 `src/index.js` 진입점으로 옮겼다. package.json, 잠금 파일, Wrangler 설정, 로컬 환경변수 예시와 회귀 테스트를 구성했다. Node 테스트 13개와 Wrangler dry-run 및 로컬 라우트 smoke test가 통과했다. 원격 배포는 수행하지 않았으며 로컬 폴더에는 아직 `.git`이 없다.

설계 문서에는 실제 댓글 → DM 성공 이력이 있다. 이번 작업에서 운영 환경을 재검증한 것은 아니다. 현재 코드는 환경변수 기반이며 D1·관리자 인증/UI·팔로우 확인이 없다. 기존 키워드 파서는 쉼표와 줄바꿈을 허용하며 contains 모드가 아니면 정확히 일치해야 한다. TASK-01에서는 이를 보존하고 TASK-07에서 새 정책으로 전환한다.

## 진행 순서

| 순서 | 작업 | 선행 작업 | 상태 | 결과 |
| --- | --- | --- | --- | --- |
| 01 | [로컬 Worker 프로젝트화](docs/tasks/TASK-01.md) | 없음 | 완료 | [RESULT-01](docs/results/RESULT-01.md) |
| 02 | [GitHub 및 기존 Worker 배포 연결](docs/tasks/TASK-02.md) | TASK-01 | 대기 | [RESULT-02](docs/results/RESULT-02.md) |
| 03 | [D1 생성과 초기 마이그레이션](docs/tasks/TASK-03.md) | TASK-02 | 대기 | [RESULT-03](docs/results/RESULT-03.md) |
| 04 | [D1 설정 저장 모듈](docs/tasks/TASK-04.md) | TASK-03 | 대기 | [RESULT-04](docs/results/RESULT-04.md) |
| 05 | [Instagram API 분리와 릴스 응답 검증](docs/tasks/TASK-05.md) | TASK-04 | 대기 | [RESULT-05](docs/results/RESULT-05.md) |
| 06 | [팔로우 조회 실제 검증과 구현](docs/tasks/TASK-06.md) | TASK-05 | 대기 | [RESULT-06](docs/results/RESULT-06.md) |
| 07 | [Webhook을 D1 기반 발송으로 전환](docs/tasks/TASK-07.md) | TASK-04, TASK-06 | 대기 | [RESULT-07](docs/results/RESULT-07.md) |
| 08 | [관리자 로그인과 세션 보호](docs/tasks/TASK-08.md) | TASK-07 | 대기 | [RESULT-08](docs/results/RESULT-08.md) |
| 09 | [관리자 릴스·공통 설정 API](docs/tasks/TASK-09.md) | TASK-04, TASK-05, TASK-08 | 대기 | [RESULT-09](docs/results/RESULT-09.md) |
| 10 | [관리자 웹 화면](docs/tasks/TASK-10.md) | TASK-09 | 대기 | [RESULT-10](docs/results/RESULT-10.md) |
| 11 | [통합 검증과 기존 환경변수 정리](docs/tasks/TASK-11.md) | TASK-10 | 대기 | [RESULT-11](docs/results/RESULT-11.md) |
| 12 | [운영 토큰 교체와 최종 인수인계](docs/tasks/TASK-12.md) | TASK-11 | 대기 | [RESULT-12](docs/results/RESULT-12.md) |

## 다음 진행 사항

1. TASK-02에서 Git 저장소를 초기화하고 연결할 GitHub 저장소를 확인한다.
2. 커밋 대상에서 `정보`, Secret, 로컬 Wrangler 상태가 제외되는지 확인한다.
3. GitHub와 기존 Worker의 Builds 연결 설정을 확인하고 기존 URL 및 댓글 → DM을 재검증한다.

## 검증이 필요한 결정

- 릴스 판별 필드와 cursor 구조는 실제 응답을 확인한 뒤 정한다.
- 팔로우 조회는 팔로워·비팔로워·DM 상호작용 없는 신규 계정으로 실테스트한다. 실패하면 발송하지 않는다.
- 로그인 API는 세션 발급 진입점이므로 사전 세션 없이 비밀번호를 검증하며, 나머지 관리자 API는 세션으로 보호한다.
- 신규 릴스는 기본 OFF이므로 D1 전환 전 발송할 릴스의 설정을 준비한다.
- 기존 환경변수는 D1 기반 통합 검증 이후 제거한다. 노출된 토큰 교체는 운영 전 필수이며 보안상 필요하면 앞당긴다.

## 상태 기록 규칙

상태는 대기 / 진행 중 / 차단 / 완료로 관리한다. RESULT는 TASK와 같은 번호로 연결하고 미실행 항목을 성공으로 기록하지 않는다. 차단된 작업은 필요한 정보와 재개 조건을 기록한다.

## 범위

[설계 문서](instagram_dm_auto_reply_design.md)를 요구사항 기준으로 사용한다. 사용자별 1회 제한, DEDUP_KV, 댓글·작성자·릴스 원본 DB 저장, B 방식 안내 DM, 외부 서버/DB, React/Next.js는 추가하지 않는다.
