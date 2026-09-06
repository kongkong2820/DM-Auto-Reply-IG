# TASK-11 — 통합 검증과 기존 환경변수 정리

- 상태: 진행 중
- 선행 작업: TASK-10
- 설계 근거: 설계 §6, §33–35, §38 STEP 11, §43
- 결과 문서: [RESULT-11](../results/RESULT-11.md)
- 전체 순서: [status.md](../../status.md)

## 진행 사항

- [ ] 설계 §43 완료 조건을 통합 검증하고 근거를 RESULT에 기록한다.
- [x] /health를 D1·Instagram 설정 상태 기준으로 변경하며 Secret 값을 반환하지 않는다.
- [x] 댓글 직후 빠른 답장으로 사용자 상호작용을 만든 뒤 팔로우를 확인하도록 변경한다.
- [x] 릴스별 최초 팔로우 안내와 미팔로우 재확인 안내를 D1·관리자 화면에 추가한다.
- [ ] Meta Webhook에서 `messages` 필드를 구독한다.
- [ ] D1 기반 동작 확인 후 PRIVATE_REPLY_MESSAGE, Runtime COMMENT_KEYWORDS, KEYWORD_MATCH_MODE를 제거한다.

## 완료 조건 및 검증

- [ ] 실제 댓글 → 최초 버튼 → 팔로워 확인 → 서로 다른 최종 DM 발송을 검증한다.
- [ ] 비팔로워·조회 실패 시 재확인 버튼, 빈 메시지·OFF·fallback 및 contains 규칙을 재검증한다.
- [ ] 기존 Webhook·배포·관리자 기능을 유지하고 health마다 외부 API를 호출하지 않는다.

## 기록 원칙

실제 구현·검증 후 결과 문서에 변경 파일과 검증 근거를 남긴다. 실제 API 응답이 필요한 항목은 추측으로 완료 처리하지 않는다. Secret과 사용자 원문 데이터는 기록하지 않는다.

코드와 로컬 예제 환경의 기존 Runtime Variable 의존은 제거했다. Cloudflare 운영 변수 삭제와 통합 검증은 전체 구현을 배포한 뒤 수행한다.
