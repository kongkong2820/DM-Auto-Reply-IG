# TASK-02 — GitHub 및 기존 Worker 배포 연결

- 상태: 진행 중
- 선행 작업: TASK-01
- 설계 근거: 설계 §30–31, §38 STEP 2
- 결과 문서: [RESULT-02](../results/RESULT-02.md)
- 전체 순서: [status.md](../../status.md)

## 진행 사항

- [x] Git 저장소와 대상 GitHub 저장소를 확인하고 연결한다.
- [ ] Cloudflare Workers Builds를 기존 Worker에 연결한다.
- [x] 배포 전 Secret 제외와 복구 가능한 기존 소스·설정을 확인한다.

## 완료 조건 및 검증

- [ ] GitHub에서 기존 Worker로 배포되고 기존 URL을 유지한다.
- [ ] /health, Webhook 검증 및 실제 댓글 → DM을 재검증한다.
- [x] 커밋 대상과 이력에 실제 Secret이 없는지 확인한다.

## 기록 원칙

실제 구현·검증 후 결과 문서에 변경 파일과 검증 근거를 남긴다. 실제 API 응답이 필요한 항목은 추측으로 완료 처리하지 않는다. Secret과 사용자 원문 데이터는 기록하지 않는다.
