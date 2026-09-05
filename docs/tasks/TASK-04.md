# TASK-04 — D1 설정 저장 모듈

- 상태: 대기
- 선행 작업: TASK-03
- 설계 근거: 설계 §13–16, §22, §29
- 결과 문서: [RESULT-04](../results/RESULT-04.md)
- 전체 순서: [status.md](../../status.md)

## 진행 사항

- [ ] src/db.js에 getReelConfig, upsertReelConfig, getAppSetting, setAppSetting을 구현한다.
- [ ] SQL 파라미터 바인딩과 UPSERT를 사용한다.
- [ ] 빈 메시지 저장은 enabled=0으로 처리하고 OFF 전환 시 메시지·키워드를 보존한다.

## 완료 조건 및 검증

- [ ] 신규 저장·수정·조회와 설정 없음 처리를 확인한다.
- [ ] NULL·빈 문자열·공백 메시지의 자동 OFF를 검증한다.
- [ ] OFF 후 ON 전환 시 기존 메시지·키워드가 보존되는지 확인한다.

## 기록 원칙

실제 구현·검증 후 결과 문서에 변경 파일과 검증 근거를 남긴다. 실제 API 응답이 필요한 항목은 추측으로 완료 처리하지 않는다. Secret과 사용자 원문 데이터는 기록하지 않는다.
