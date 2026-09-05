# TASK-01 — 로컬 Worker 프로젝트화

- 상태: 완료
- 선행 작업: 없음
- 설계 근거: 설계 §2–8, §28–29, §38 STEP 1
- 결과 문서: [RESULT-01](../results/RESULT-01.md)
- 전체 순서: [status.md](../../status.md)

## 진행 사항

- [x] package.json, wrangler.jsonc, src/index.js 및 필요한 모듈을 구성한다.
- [x] worker.js를 현재 운영 기준 원본으로 보존하고 기능 변경 없이 옮긴다.
- [x] Worker 이름 instagram-dm-auto-reply와 기존 URL, 환경변수·Secret을 유지한다.

## 완료 조건 및 검증

- [x] 기존 라우트 /, /health, /privacy, GET·POST /webhook 동작을 확인한다.
- [x] 유효·무효 HMAC, 잘못된 JSON, 비 Instagram 이벤트, 자동응답 OFF를 검증한다.
- [x] 기존 키워드 모드와 쉼표·줄바꿈 구분 동작을 그대로 보존한다.

## 기록 원칙

실제 구현·검증 후 결과 문서에 변경 파일과 검증 근거를 남긴다. 실제 API 응답이 필요한 항목은 추측으로 완료 처리하지 않는다. Secret과 사용자 원문 데이터는 기록하지 않는다.
