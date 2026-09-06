# RESULT-05 — Instagram API 분리와 릴스 응답 검증

- 연결 작업: [TASK-05](../tasks/TASK-05.md)
- 상태: 진행 중
- 작성일: 2026-09-06

## 구현 결과

기존 Private Reply 호출을 `src/instagram.js`로 옮겼다. 요청 URL, Bearer 인증, `recipient.comment_id`, `message.text`, 실패 응답 처리 형식은 기존 동작을 유지한다.

같은 모듈에 `/me/media` 목록 조회를 추가했다. `fields`에는 `id`, `caption`, `media_type`, `media_product_type`, `timestamp`를 요청하고, `after` cursor와 1~100 범위의 `limit`을 지원한다. 반환 데이터는 릴스 후보만 추려 timestamp 최신순으로 정규화하며 응답의 앞·뒤 cursor와 다음 페이지 여부를 함께 반환한다.

API의 `limit`은 필터링 전 미디어 조회 개수다. 일반 게시물이 섞이면 반환되는 릴스 수가 요청한 `limit`보다 적을 수 있으므로 화면 표시 개수와 동일하다고 가정하지 않는다.

## 변경 파일

- `src/instagram.js`
- `src/index.js`
- `docs/tasks/TASK-05.md`
- `docs/results/RESULT-05.md`
- `status.md`
- `README.md`

## 검증 결과

| 검증 항목 | 환경·명령 또는 절차 | 기대 결과 | 실제 결과 | 판정 |
| --- | --- | --- | --- | --- |
| Private Reply 회귀 | 실제 댓글 Webhook 수신 후 DM 확인 | 기존과 같은 요청으로 DM이 발송됨 | 전체 구현 후 실행 예정 | 대기 |
| 릴스 필터 | 일반 게시물과 릴스가 섞인 계정에서 목록 조회 | 릴스만 반환되고 caption·timestamp가 보존됨 | 전체 구현 후 실행 예정 | 대기 |
| 다음 페이지 | 다음 cursor가 있는 응답에서 `after`로 재조회 | 중복 없이 다음 미디어 페이지가 조회됨 | 전체 구현 후 실행 예정 | 대기 |
| 마지막 페이지 | `paging.next`가 없는 응답 조회 | `hasNext=false`로 반환됨 | 전체 구현 후 실행 예정 | 대기 |
| 빈 목록 | 미디어가 없는 응답 조회 | 빈 배열과 `hasNext=false`로 반환됨 | 전체 구현 후 실행 예정 | 대기 |
| 페이지 크기 | 20·50·100으로 각각 조회 | 입력 범위가 적용되며 릴스 수를 강제로 채우지 않음 | 전체 구현 후 실행 예정 | 대기 |

## 실제 환경 확인

사용자의 요청에 따라 이번 단계에서는 배포, 실제 Meta API 호출, 자동 테스트를 실행하지 않았다. 응답 증거는 최종 실제 기능 테스트에서 Secret, 계정 ID, 댓글 내용, caption 원문을 제거한 뒤 기록한다.

## 남은 문제와 후속 작업

- `media_product_type === "REELS"`가 실제 계정 응답에서 릴스를 정확히 식별하는지 확인해야 한다.
- `paging.cursors.after`와 `paging.next`의 실제 구조를 확인한 뒤 TASK-09·10에서 페이지 번호별 cursor 기록 방식을 확정해야 한다.
- API 요청 `limit`만으로 화면의 릴스 20·50·100개를 항상 채울 수 없다. 실제 응답에서 일반 게시물 혼합 비율과 다음 cursor 동작을 확인하고 추가 페이지 수집 여부를 결정한다.
- 팔로우 상태 조회는 TASK-06에서 구현하되 실제 판정 결과는 최종 기능 테스트에서 확인한다.

## 완료 판정

- [ ] TASK의 실제 응답 관련 완료 조건 확인
- [x] 변경 내용과 보류한 검증 항목 기록
- [x] Secret 및 개인정보 미포함 확인
- [x] TASK 상태와 status.md 동시 갱신
