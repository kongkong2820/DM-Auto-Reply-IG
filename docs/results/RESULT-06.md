# RESULT-06 — 팔로우 조회 실제 검증과 구현

- 연결 작업: [TASK-06](../tasks/TASK-06.md)
- 상태: 진행 중
- 작성일: 2026-09-06

## 구현 결과

`src/instagram.js`에 `checkFollowStatus(commenterId, env)`를 추가했다. 사용자 프로필에서 `is_user_follow_business`를 요청하고 값이 명시적으로 `true`일 때만 발송 가능으로 반환한다. false, 권한·consent 오류, 잘못된 응답, 네트워크 오류는 모두 false로 처리하는 Fail Closed 방식이다.

## 변경 파일

- `src/instagram.js`
- `docs/tasks/TASK-06.md`
- `docs/results/RESULT-06.md`

## 검증 결과

| 검증 항목 | 환경·명령 또는 절차 | 기대 결과 | 실제 결과 | 판정 |
| --- | --- | --- | --- | --- |
| 팔로워 | 팔로우 중인 계정의 commenterId로 조회 | `true` 확인 | 통합 테스트 예정 | 대기 |
| 비팔로워 | 팔로우하지 않는 계정으로 조회 | `false` 확인, 미발송 | 통합 테스트 예정 | 대기 |
| 신규 계정 | 기존 DM 상호작용 없는 계정으로 조회 | 응답 또는 consent 오류 확인, 불명확하면 미발송 | 통합 테스트 예정 | 대기 |
| API 오류 | 만료·권한 부족 등의 실패 응답 | 예외가 발송 경로로 전파되지 않고 false | 통합 테스트 예정 | 대기 |

## 실제 환경 확인

실제 Meta API 호출은 사용자 요청에 따라 보류했다. 현재 필드와 권한은 실제 세 계정 응답으로 확정해야 한다.

## 남은 문제와 후속 작업

실제 계정에서 `is_user_follow_business`를 조회할 수 없으면 모든 댓글이 안전하게 미발송된다. 우회 발송과 B 방식은 구현하지 않았다.

## 완료 판정

- [ ] 실제 응답 관련 완료 조건 확인
- [x] 구현 내용과 보류 검증 기록
- [x] Secret 및 개인정보 미포함 확인
- [x] TASK 상태와 status.md 동시 갱신
