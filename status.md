# 개발 진행 현황

기준일: 2026-09-06

## 현재 상태

TASK-01부터 TASK-04까지 완료했고 TASK-05부터 TASK-11은 구현 및 운영 검증 중이다. GitHub `main` push와 Cloudflare 자동 배포가 연결되어 있으며 관리자 로그인·API·화면, D1 설정, health와 Webhook이 운영 Worker에 배포되어 있다.

실제 테스트에서 댓글만 작성한 사용자는 팔로우 조회가 code 230으로 실패하고, 사용자가 먼저 DM 상호작용을 하면 조회와 발송이 성공함을 확인했다. 이를 반영해 댓글에는 최초 안내와 빠른 답장 버튼을 보내고 버튼 선택 후 팔로우를 확인하는 흐름을 구현·배포했다. `is_user_follow_business === true`일 때만 최종 메시지를 보내며 나머지는 재확인 안내를 보낸다.

## 진행 순서

| 순서 | 작업 | 선행 작업 | 상태 | 결과 |
| --- | --- | --- | --- | --- |
| 01 | [로컬 Worker 프로젝트화](docs/tasks/TASK-01.md) | 없음 | 완료 | [RESULT-01](docs/results/RESULT-01.md) |
| 02 | [GitHub 및 기존 Worker 배포 연결](docs/tasks/TASK-02.md) | TASK-01 | 완료 | [RESULT-02](docs/results/RESULT-02.md) |
| 03 | [D1 생성과 초기 마이그레이션](docs/tasks/TASK-03.md) | TASK-02 | 완료 | [RESULT-03](docs/results/RESULT-03.md) |
| 04 | [D1 설정 저장 모듈](docs/tasks/TASK-04.md) | TASK-03 | 완료 | [RESULT-04](docs/results/RESULT-04.md) |
| 05 | [Instagram API 분리와 릴스 응답 검증](docs/tasks/TASK-05.md) | TASK-04 | 진행 중 | [RESULT-05](docs/results/RESULT-05.md) |
| 06 | [팔로우 조회 실제 검증과 구현](docs/tasks/TASK-06.md) | TASK-05 | 진행 중 | [RESULT-06](docs/results/RESULT-06.md) |
| 07 | [Webhook을 D1 기반 발송으로 전환](docs/tasks/TASK-07.md) | TASK-04, TASK-06 | 진행 중 | [RESULT-07](docs/results/RESULT-07.md) |
| 08 | [관리자 로그인과 세션 보호](docs/tasks/TASK-08.md) | TASK-07 | 진행 중 | [RESULT-08](docs/results/RESULT-08.md) |
| 09 | [관리자 릴스·공통 설정 API](docs/tasks/TASK-09.md) | TASK-04, TASK-05, TASK-08 | 진행 중 | [RESULT-09](docs/results/RESULT-09.md) |
| 10 | [관리자 웹 화면](docs/tasks/TASK-10.md) | TASK-09 | 진행 중 | [RESULT-10](docs/results/RESULT-10.md) |
| 11 | [통합 검증과 기존 환경변수 정리](docs/tasks/TASK-11.md) | TASK-10 | 진행 중 | [RESULT-11](docs/results/RESULT-11.md) |
| 12 | [운영 토큰 교체와 최종 인수인계](docs/tasks/TASK-12.md) | TASK-11 | 대기 | [RESULT-12](docs/results/RESULT-12.md) |

## 다음 진행 사항

1. Meta Webhook에서 `messages` 필드를 구독한다.
2. 관리자 화면에서 릴스별 안내 문구 2종을 확인·저장한다.
3. 같은 릴스·키워드로 팔로워와 비팔로워 흐름을 하나씩 실제 확인한다.
4. 성공 후 운영 Runtime Variable 3개를 제거하고 TASK-05부터 TASK-11을 완료 처리한다.
5. TASK-12에서 운영 토큰 교체와 최종 인수인계를 진행한다.

## 검증이 필요한 결정

- 릴스 조회는 `media_product_type`과 `after` cursor를 기준으로 우선 구현했으며 실제 응답으로 확정해야 한다.
- 팔로우 조회는 빠른 답장 선택으로 사용자 상호작용을 만든 뒤 실행한다. 조회 실패와 비팔로워는 최종 메시지 대신 재확인 안내를 보낸다.
- 로그인 API는 세션 발급 진입점이므로 사전 세션 없이 비밀번호를 검증하며, 나머지 관리자 API는 세션으로 보호한다.
- 신규 릴스는 기본 OFF이므로 D1 전환 전 발송할 릴스의 설정을 준비한다.
- 운영의 `PRIVATE_REPLY_MESSAGE`, `COMMENT_KEYWORDS`, `KEYWORD_MATCH_MODE`는 D1 기반 통합 검증 이후 제거한다. 노출된 토큰 교체는 운영 전 필수이며 보안상 필요하면 앞당긴다.

## 상태 기록 규칙

상태는 대기 / 진행 중 / 차단 / 완료로 관리한다. RESULT는 TASK와 같은 번호로 연결하고 미실행 항목을 성공으로 기록하지 않는다. 차단된 작업은 필요한 정보와 재개 조건을 기록한다.

## 범위

[설계 문서](instagram_dm_auto_reply_design.md)를 요구사항 기준으로 사용한다. 사용자별 1회 제한, DEDUP_KV, 댓글·작성자·릴스 원본 DB 저장, 외부 서버/DB, React/Next.js는 추가하지 않는다. 빠른 답장 기반 팔로우 확인은 2026-09-06 설계 변경으로 포함한다.
