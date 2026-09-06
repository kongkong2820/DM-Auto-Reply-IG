# RESULT-09 — 관리자 릴스·공통 설정 API

- 연결 작업: [TASK-09](../tasks/TASK-09.md)
- 상태: 진행 중
- 작성일: 2026-09-06

## 구현 결과

인증된 관리자용 릴스 목록·저장·공통 설정 API를 구현했다. 릴스는 Instagram API에서 조회하고 D1 설정을 한 번의 `IN` 쿼리로 가져와 `reelId`로 합친다. 설정이 없는 릴스는 OFF와 빈 메시지·키워드로 반환한다.

caption 첫 줄을 제목으로 사용하며 비어 있으면 `(제목 없음)`을 반환한다. 목록은 기본 20개이며 20·50·100과 `after` cursor를 지원한다. 총 개수나 총 페이지는 Instagram 응답에서 알 수 없으므로 제공하지 않는다.

## 변경 파일

- `src/admin.js`
- `src/db.js`
- `src/index.js`
- `docs/tasks/TASK-09.md`
- `docs/results/RESULT-09.md`

## 검증 결과

| 검증 항목 | 환경·명령 또는 절차 | 기대 결과 | 실제 결과 | 판정 |
| --- | --- | --- | --- | --- |
| 릴스 목록 | GET /api/admin/reels?limit=20 | 최신 릴스와 D1 설정 매핑 | 통합 테스트 예정 | 대기 |
| 신규 릴스 | D1 설정 없는 릴스 조회 | enabled=0, 두 입력값 빈 문자열 | 통합 테스트 예정 | 대기 |
| 릴스 저장 | 정상·잘못된 입력으로 PUT | 정상 UPSERT, 오류 입력 400 | 통합 테스트 예정 | 대기 |
| 공통 설정 | GET·PUT /api/admin/settings | D1 값 조회·저장 | 통합 테스트 예정 | 대기 |
| pagination | 20·50·100, 다음·이전·끝 페이지 | cursor 기반 이동 유지 | 통합 테스트 예정 | 대기 |

## 실제 환경 확인

실제 Instagram 목록과 운영 D1 호출은 실행하지 않았다. 일반 게시물이 섞이면 한 API 페이지의 릴스 수가 선택한 page size보다 적을 수 있다.

## 남은 문제와 후속 작업

실제 `media_product_type`과 cursor 구조를 확인해야 한다. 전체 최신순은 Instagram 응답 순서에 영향을 받으므로 여러 페이지의 실제 결과도 확인한다.

## 완료 판정

- [ ] 실제 API·D1 완료 조건 확인
- [x] 구현 내용과 보류 검증 기록
- [x] Secret 및 개인정보 미포함 확인
- [x] TASK 상태와 status.md 동시 갱신
