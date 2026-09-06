# Instagram Comment Auto DM 프로젝트 설계 및 인수인계

작성 기준일: 2026-09-05

## 2026-09-06 설계 변경: 빠른 답장 기반 팔로우 확인

실제 API 검증에서 댓글만 작성한 사용자는 consent가 없어
`is_user_follow_business` 조회가 code 230으로 실패했고, 사용자가 먼저 DM을
보낸 뒤에는 같은 조회와 최종 DM 발송이 성공했다. 따라서 §24의 A 방식과
§26의 B 방식 미구현 결정은 아래 흐름으로 대체한다.

```text
키워드 댓글
→ 최초 팔로우 확인 안내 + 빠른 답장 버튼
→ 사용자가 버튼 선택
→ messages Webhook에서 사용자 ID와 릴스 ID 확인
→ 팔로워면 기존 최종 자동 DM 발송
→ 비팔로워 또는 조회 실패면 재확인 안내 + 빠른 답장 버튼
→ 사용자가 팔로우 후 버튼을 다시 선택하면 다시 조회
```

최초 안내 문구와 미팔로우 재확인 문구는 모든 릴스에 공통으로 적용하며
D1 `app_settings`에서 관리한다. 관리자 화면에서는 자주 변경하지 않는 공통
설정을 접고 펼칠 수 있게 제공한다.
버튼 payload에는 릴스 ID만 넣으며 댓글 작성자 정보나 진행 상태는 저장하지
않는다. Meta Webhook은 기존 `comments`와 함께 `messages`를 구독해야 한다.

이 문서는 현재 Cloudflare Worker로 구현된 Instagram 댓글 자동 DM 기능을 VSCode + Codex에서 이어서 개발할 수 있도록 정리한 인수인계 문서다.

---

# 1. 프로젝트 목적

Instagram 릴스 댓글을 이용해 팔로우 및 댓글 참여를 유도하고, 조건을 만족한 사용자에게 릴스별로 설정된 자동 DM을 보내는 기능을 만든다.

관리자는 소스 수정 없이 웹 관리 페이지에서 다음을 관리할 수 있어야 한다.

- 내가 올린 릴스 목록 조회
- 릴스별 자동 DM 사용 여부
- 릴스별 자동 DM 메시지
- 릴스별 댓글 키워드
- 공통 댓글 키워드
- 최신순 조회
- 페이지 번호 방식 탐색
- 페이지당 20 / 50 / 100개 선택

릴스 자체 데이터는 DB에 저장하지 않는다. 관리자 페이지를 열 때 Instagram API에서 릴스 목록을 조회하고, D1에 저장된 릴스별 설정을 `reel_id` 기준으로 매핑해 보여준다.

---

# 2. 현재 구현된 상황

## 2.1 Cloudflare Worker

현재 Worker 이름:

```text
instagram-dm-auto-reply
```

현재 기본 URL:

```text
https://instagram-dm-auto-reply.kongkong2820.workers.dev
```

현재 엔드포인트:

```text
GET  /
GET  /health
GET  /privacy
GET  /webhook
POST /webhook
```

### GET /

서비스 상태를 JSON으로 반환한다.

### GET /health

현재 설정 상태를 JSON으로 반환한다.

기존 구현에서는 다음을 확인한다.

- `ENABLE_AUTO_REPLY`
- `COMMENT_KEYWORDS`
- `PRIVATE_REPLY_MESSAGE`

향후 `COMMENT_KEYWORDS`와 `PRIVATE_REPLY_MESSAGE`는 D1 구조로 변경되므로 `/health`도 수정해야 한다.

### GET /privacy

개인정보처리방침 HTML을 반환한다.

현재 댓글 내용과 작성자 정보는 별도 DB에 저장하지 않는다고 명시되어 있다.

### GET /webhook

Meta Webhook 검증용이다.

사용 값:

```text
hub.mode
hub.verify_token
hub.challenge
```

`VERIFY_TOKEN`과 일치하면 challenge를 반환한다.

### POST /webhook

현재 처리 흐름:

```text
Webhook 수신
↓
x-hub-signature-256 HMAC 검증
↓
JSON 파싱
↓
payload.object === "instagram" 확인
↓
댓글 이벤트 추출
↓
키워드 매칭
↓
내 계정 댓글 제외
↓
Private Reply API 호출
```

실제 댓글 처리는 `ctx.waitUntil(...)`로 백그라운드 처리하고 Webhook에는 먼저 200을 반환한다.

---

# 3. 현재 Webhook에서 추출하는 값

현재 코드에서 다음 값을 추출한다.

```text
commentId
text
commenterId
username
mediaId
```

특히 향후 릴스별 설정에 사용할 `mediaId`는 이미 추출 중이다.

현재 코드 개념:

```javascript
events.push({
  commentId,
  text,
  commenterId: candidate.value.from?.id,
  username: candidate.value.from?.username,
  mediaId: candidate.value.media?.id
});
```

향후 이 `mediaId`를 D1의 `reel_id`와 매핑한다.

---

# 4. 현재 자동 DM 기능 상태

현재 Instagram Private Reply 호출 형태:

```text
POST https://graph.instagram.com/{GRAPH_API_VERSION}/{INSTAGRAM_ACCOUNT_ID}/messages
```

개념적인 요청:

```json
{
  "recipient": {
    "comment_id": "COMMENT_ID"
  },
  "message": {
    "text": "DM MESSAGE"
  }
}
```

실제 테스트로 다음 전체 파이프라인이 성공했다.

```text
다른 계정에서 키워드 댓글 작성
↓
Meta comments Webhook 수신
↓
Cloudflare Worker 200 응답
↓
Instagram Private Reply API 호출
↓
실제 Instagram DM 수신
```

즉 현재 댓글 → Webhook → DM 기본 흐름은 정상 동작한다.

---

# 5. 현재 Meta / Instagram 설정 상태

완료된 항목:

- Meta 앱 생성
- Instagram API 설정
- Instagram Tester 등록
- `nailyways` Tester 초대 수락
- 앱 Publish
- `comments` Webhook 필드 구독
- `nailyways` 계정 Webhook 구독 활성화
- Webhook Callback URL 검증 성공
- 실제 댓글 Webhook 수신 성공
- 실제 Private Reply DM 발송 성공

현재 API에서 `/me`로 확인한 Instagram 계정:

```text
id: 28266419789684644
username: nailyways
```

실제 API 호출에는 위 `INSTAGRAM_ACCOUNT_ID`를 사용한다.

Meta UI 다른 화면에서 보이는 별도 ID와 혼동하지 않는다.

---

# 6. 현재 환경변수 / Secret

현재 또는 기존 사용 값:

```text
ENABLE_AUTO_REPLY
GRAPH_API_VERSION
INSTAGRAM_ACCESS_TOKEN
INSTAGRAM_ACCOUNT_ID
KEYWORD_MATCH_MODE
META_APP_SECRET
PRIVATE_REPLY_MESSAGE
VERIFY_TOKEN
COMMENT_KEYWORDS
```

향후 유지:

```text
ENABLE_AUTO_REPLY
GRAPH_API_VERSION
INSTAGRAM_ACCESS_TOKEN
INSTAGRAM_ACCOUNT_ID
META_APP_SECRET
VERIFY_TOKEN
ADMIN_PASSWORD
```

향후 제거:

```text
PRIVATE_REPLY_MESSAGE
COMMENT_KEYWORDS
KEYWORD_MATCH_MODE
```

이유:

```text
PRIVATE_REPLY_MESSAGE
→ 릴스별 메시지를 D1에서 관리하므로 불필요

COMMENT_KEYWORDS
→ 공통 키워드도 D1 관리자 화면에서 관리

KEYWORD_MATCH_MODE
→ contains 방식으로 고정
```

`ADMIN_PASSWORD`는 Cloudflare Secret으로 관리한다.

---

# 7. 중요 주의사항

## 7.1 META_APP_SECRET

Webhook 서명 검증용 `META_APP_SECRET`은 현재 프로젝트에서 실제 동작한 기준으로 Instagram API 설정 화면의 Instagram App Secret을 사용한다.

과거 generic Meta App Basic Settings App Secret을 사용했을 때 Webhook POST가 401이었고, Instagram API 설정의 App Secret으로 교체 후 200 및 실제 DM 발송이 성공했다.

현재 동작 중인 Secret의 출처를 임의로 바꾸지 않는다.

## 7.2 Instagram Access Token

과거 테스트 과정에서 Access Token이 대화에 한 번 노출된 적이 있다.

운영 전 반드시:

```text
새 Instagram Access Token 발급
↓
Cloudflare INSTAGRAM_ACCESS_TOKEN 갱신
```

한다.

실제 토큰/Secret/비밀번호를 GitHub에 절대 커밋하지 않는다.

---

# 8. 중복 처리 정책

과거 `DEDUP_KV` 로직은 제거했다.

현재 의도한 동작:

```text
A가 새 댓글 → A에게 DM
B가 새 댓글 → B에게 DM
A가 다시 새 댓글 → A에게 다시 DM
```

사용자별 1회 제한 요구사항은 없다.

`DEDUP_KV`는 사용하지 않는다.

---

# 9. 확정된 신규 요구사항

관리자 웹에서 내가 올린 릴스 목록을 조회한다.

표시 항목:

```text
자동 DM 사용 여부
제목
올린 날짜
릴스 ID
자동 DM 메시지
댓글 키워드
```

정렬:

```text
최신순
```

릴스 제목은 별도 제목 필드를 사용하지 않고 `caption`의 첫 줄을 사용한다.

caption이 없거나 첫 줄이 비어 있으면:

```text
(제목 없음)
```

으로 표시한다.

---

# 10. 릴스 데이터 저장 정책

릴스 목록 자체는 DB에 저장하지 않는다.

```text
Instagram API
→ 릴스 원본 데이터

Cloudflare D1
→ 릴스별 자동 DM 설정
```

관리자 페이지에서 `reel_id` 기준으로 합친다.

DB에 설정이 없는 신규 릴스도 Instagram에서 조회되면 화면에는 나타나야 한다.

DB 설정이 없는 경우 기본값:

```text
enabled = 0
autoDmMessage = ""
commentKeywords = ""
```

---

# 11. Cloudflare D1 설계

## 11.1 reel_dm_config

```sql
CREATE TABLE reel_dm_config (
    reel_id TEXT PRIMARY KEY,
    auto_dm_message TEXT,
    comment_keywords TEXT,
    enabled INTEGER NOT NULL DEFAULT 0
);
```

컬럼 의미:

```text
reel_id
- Instagram 릴스 ID
- Primary Key

auto_dm_message
- 해당 릴스에서 보낼 자동 DM 문구
- 링크 포함 가능

comment_keywords
- 해당 릴스 전용 댓글 키워드
- 쉼표 구분
- 비어 있으면 공통 키워드 사용

enabled
- 자동 DM 사용 여부
- 1 = 사용
- 0 = 미사용
```

예:

```text
reel_id              auto_dm_message              comment_keywords   enabled
-------------------------------------------------------------------------------
18011111111111111    자료 보내드릴게요... URL      자료,꿀팁          1
18022222222222222    신청 방법입니다... URL        신청               1
18033333333333333    NULL                         NULL               0
```

---

# 12. 공통 설정 DB

공통 댓글 키워드도 Runtime Variable이 아니라 D1에서 관리한다.

## 12.1 app_settings

```sql
CREATE TABLE app_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT
);
```

예:

```text
setting_key        setting_value
--------------------------------
COMMENT_KEYWORDS   자료,신청
```

향후 공통 설정이 추가되어도 같은 테이블을 사용할 수 있다.

---

# 13. 자동 DM 사용 여부 정책

`enabled`는 별도 컬럼으로 관리한다.

```text
1 = 사용
0 = 미사용
```

OFF로 바꿔도 기존 메시지와 키워드는 보존한다.

```text
enabled = 0
auto_dm_message 유지
comment_keywords 유지
```

다시 ON 하면 기존 값을 재사용한다.

---

# 14. DM 메시지 공백 처리

관리자가 `auto_dm_message`를 비운 상태로 저장하면:

```text
enabled = 0
```

으로 자동 처리한다.

추가 방어 로직도 둔다.

Webhook 처리 시:

```text
enabled == 1
```

이어도 `auto_dm_message`가 NULL / 빈 문자열 / 공백 문자열이면 DM을 보내지 않는다.

즉 저장 시 한 번, 발송 시 한 번 총 두 번 방어한다.

---

# 15. 댓글 키워드 정책

릴스별 키워드는 쉼표로 구분한다.

예:

```text
자료,신청,꿀팁
```

처리:

```text
split(",")
trim()
빈 값 제거
소문자 정규화
contains 매칭
```

줄바꿈은 구분자로 사용하지 않는다.

키워드 매칭 방식은 `contains`로 고정한다.

예:

```text
키워드 = 자료
```

다음은 모두 매칭:

```text
자료
자료주세요
자료 주세요
저도 자료 부탁드려요
```

---

# 16. 공통 키워드 fallback

릴스별 `comment_keywords`가 다음이면:

```text
NULL
""
"   "
```

D1의:

```text
app_settings.COMMENT_KEYWORDS
```

를 사용한다.

공통 키워드도 비어 있으면 자동 DM을 보내지 않는다.

릴스별 키워드가 있으면 공통 키워드는 사용하지 않는다.

---

# 17. 관리자 페이지

예상 주소:

```text
/admin
```

화면 개념:

```text
[공통 댓글 키워드]
자료,신청                                  [저장]

페이지당 [20 ▼]

┌────┬────────────┬──────────┬────────────┬───────────────┬────────────┬──────┐
│사용│ 제목       │ 올린 날짜│ 릴스 ID    │ 자동 DM 메시지 │ 댓글 키워드 │ 저장 │
├────┼────────────┼──────────┼────────────┼───────────────┼────────────┼──────┤
│ ON │ 릴스 제목  │2026-09-05│180123...   │textarea       │자료,신청    │ 저장 │
│OFF │ 다른 릴스  │2026-09-03│180456...   │textarea       │             │ 저장 │
└────┴────────────┴──────────┴────────────┴───────────────┴────────────┴──────┘

< 1 2 3 4 5 >
```

초기 버전은 실용적인 DataTable 형태로 만든다.

---

# 18. 페이지네이션

UI는 페이지 번호 방식으로 한다.

페이지당 표시 개수:

```text
20
50
100
```

기본:

```text
20
```

Instagram API 자체는 cursor 기반 pagination일 수 있으므로 내부 구현은 실제 API 응답의 cursor를 사용하고, 관리자 화면에는 페이지 번호 형태로 보여준다.

릴스 목록을 D1에 저장해서 페이지네이션하지 않는다.

실제 cursor 구조는 API 응답을 확인한 뒤 구현한다. 추측하지 않는다.

---

# 19. 관리자 인증

현재 사용자와 아내만 사용할 예정이므로 단순 비밀번호 인증을 사용한다.

비밀번호:

```text
ADMIN_PASSWORD
```

Cloudflare Secret으로 관리한다.

흐름:

```text
/admin
↓
로그인
↓
ADMIN_PASSWORD 검증
↓
세션 쿠키 발급
↓
관리 페이지
```

세션 쿠키 최소 설정:

```text
HttpOnly
Secure
SameSite=Strict
```

실제 비밀번호를 HTML/JavaScript에 하드코딩하거나 브라우저로 전달하지 않는다.

---

# 20. 관리자 API 설계

예상 엔드포인트:

```text
GET  /admin
POST /api/admin/login
POST /api/admin/logout

GET  /api/admin/reels
PUT  /api/admin/reels/{reelId}

GET  /api/admin/settings
PUT  /api/admin/settings
```

모든 `/api/admin/*` 요청에는 인증을 적용한다.

구현하면서 URL 구조는 단순화 가능하지만 역할은 유지한다.

---

# 21. GET /api/admin/reels

역할:

```text
Instagram API에서 릴스 조회
+
D1 reel_dm_config 조회
+
reel_id 기준 매핑
+
관리자 화면용 JSON 반환
```

응답 예:

```json
{
  "data": [
    {
      "reelId": "18092915897428830",
      "title": "초보 블로거 체험단 신청 꿀팁",
      "timestamp": "2026-09-05T12:30:00+0000",
      "enabled": 1,
      "autoDmMessage": "자료 보내드릴게요...",
      "commentKeywords": "자료,꿀팁"
    },
    {
      "reelId": "18012345678901234",
      "title": "다른 릴스",
      "timestamp": "2026-09-03T10:00:00+0000",
      "enabled": 0,
      "autoDmMessage": "",
      "commentKeywords": ""
    }
  ]
}
```

---

# 22. 릴스별 설정 저장

저장 데이터:

```text
reel_id
enabled
auto_dm_message
comment_keywords
```

D1 UPSERT 사용.

```text
없음 → INSERT
있음 → UPDATE
```

메시지가 비어 있으면 `enabled = 0`으로 강제 저장한다.

OFF로 저장하는 경우 메시지/키워드는 삭제하지 않는다.

---

# 23. 최종 댓글 자동 DM 흐름

```text
Instagram 댓글 발생
↓
POST /webhook
↓
Webhook HMAC 서명 검증
↓
payload.object === "instagram" 확인
↓
commentId / text / commenterId / mediaId 추출
↓
내 계정 댓글이면 종료
↓
D1에서 reel_id = mediaId 설정 조회
↓
설정 없음 → 종료
↓
enabled != 1 → 종료
↓
auto_dm_message 비어 있음 → 종료
↓
릴스별 comment_keywords 확인
↓
비어 있으면 app_settings.COMMENT_KEYWORDS 사용
↓
키워드 없음 → 종료
↓
contains 방식 매칭
↓
불일치 → 종료
↓
팔로우 여부 확인
↓
팔로워로 확인되지 않음 → 종료
↓
팔로워로 확인됨
↓
해당 릴스의 auto_dm_message 발송
```

---

# 24. 팔로우 확인 정책 - 현재 확정안 A

향후 B 방식이 더 좋은 UX일 수 있지만 현재는 구현 범위를 단순화하기 위해 A 방식으로 확정한다.

정책:

```text
팔로우 여부 조회 성공 + 팔로워
→ DM 발송

팔로우 여부 조회 성공 + 비팔로워
→ DM 미발송

팔로우 여부 조회 불가 / 오류 / consent 문제
→ DM 미발송
```

즉 Fail Closed 방식이다.

`팔로워임을 확인할 수 없으면 보내지 않는다`.

---

# 25. 팔로우 확인 관련 미검증 사항

`is_user_follow_business` 기반 팔로우 확인 가능성이 검토되었지만, 댓글만 남긴 신규 사용자에 대해서는 User Consent 문제 때문에 프로필 조회가 실패할 수 있다.

따라서 구현 전에 반드시 실제 환경에서 테스트해야 한다.

테스트 대상:

```text
1. nailyways를 팔로우 중인 계정
2. nailyways를 팔로우하지 않은 계정
3. 이전 DM 상호작용이 없는 신규 계정
```

현재 프로젝트의 실제:

```text
INSTAGRAM_ACCESS_TOKEN
+
Webhook commenterId
```

를 이용해 응답을 확인한다.

추측해서 구현하지 않는다.

실패 시 우회 발송하지 않는다.

---

# 26. 향후 고려 가능한 B 방식 - 현재 미구현

나중에 필요하면 다음 흐름을 검토할 수 있다.

```text
키워드 댓글
↓
최초 Private Reply로 안내
↓
사용자가 DM에서 상호작용
↓
User Consent 확보
↓
팔로우 여부 확인
↓
팔로워면 최종 자료 DM
```

기능적으로는 B 방식이 더 나을 수 있으나 현재 범위에서는 제외한다.

---

# 27. D1 Binding

향후 Cloudflare Worker에 D1 binding 추가.

권장 binding name:

```text
DB
```

코드:

```javascript
env.DB
```

DB 이름 예:

```text
instagram-dm-db
```

실제 이름은 생성 시 정한다.

---

# 28. 권장 프로젝트 구조

Dashboard 단일 파일 방식에서 로컬 프로젝트 방식으로 전환한다.

```text
instagram-dm-auto-reply/
├─ src/
│  ├─ index.js
│  ├─ webhook.js
│  ├─ instagram.js
│  ├─ db.js
│  ├─ admin.js
│  ├─ auth.js
│  └─ utils.js
├─ migrations/
│  └─ 0001_init.sql
├─ package.json
├─ wrangler.jsonc
├─ .gitignore
└─ README.md
```

필요 이상으로 파일을 세분화하지 않는다.

---

# 29. 파일별 역할

## src/index.js

Worker entry point와 라우팅.

## src/webhook.js

- 댓글 이벤트 추출
- D1 릴스 설정 조회
- 키워드 매칭
- 팔로우 확인
- Private Reply 실행

## src/instagram.js

Instagram Graph API 호출.

예상 함수:

```text
getMediaList()
checkFollowStatus()
sendPrivateReply()
```

## src/db.js

D1 처리.

예상 함수:

```text
getReelConfig()
upsertReelConfig()
getAppSetting()
setAppSetting()
```

## src/admin.js

관리자 HTML 및 관리자 API.

## src/auth.js

관리자 로그인 및 세션 검증.

---

# 30. GitHub 배포 구조

향후 Dashboard 편집기에서 직접 코드를 수정하는 방식은 중단한다.

배포 구조:

```text
VSCode + Codex
↓
Git
↓
GitHub
↓
Cloudflare Workers Builds
↓
기존 instagram-dm-auto-reply Worker 자동 배포
```

목표는 기존 Worker URL을 그대로 유지하는 것이다.

```text
https://instagram-dm-auto-reply.kongkong2820.workers.dev
```

URL을 유지하면 Meta Webhook Callback URL도 바꿀 필요가 없다.

---

# 31. GitHub에 절대 커밋하지 않을 값

```text
INSTAGRAM_ACCESS_TOKEN
META_APP_SECRET
VERIFY_TOKEN
ADMIN_PASSWORD
```

`.env.example` 같은 파일에는 변수명만 작성한다.

```text
INSTAGRAM_ACCESS_TOKEN=
META_APP_SECRET=
VERIFY_TOKEN=
ADMIN_PASSWORD=
```

실제 값은 Cloudflare Secret으로 유지한다.

---

# 32. 기존 코드에서 변경할 부분

## 제거 예정

```text
PRIVATE_REPLY_MESSAGE 사용
Runtime Variable COMMENT_KEYWORDS 의존
KEYWORD_MATCH_MODE
DEDUP_KV 관련 코드
```

## 변경 후 흐름

현재:

```text
댓글 키워드 매칭
→ PRIVATE_REPLY_MESSAGE 발송
```

향후:

```text
mediaId
→ D1 릴스 설정 조회
→ enabled
→ auto_dm_message
→ 릴스별 키워드 또는 공통 키워드
→ contains
→ 팔로우 확인
→ 릴스별 auto_dm_message 발송
```

---

# 33. /health 수정 방향

기존 `/health`는 Runtime Variable의 키워드/메시지 존재 여부를 본다.

향후 예:

```json
{
  "ok": true,
  "autoReply": true,
  "databaseConfigured": true,
  "instagramConfigured": true
}
```

D1 연결 여부를 가볍게 검사할 수 있다.

매 health 요청마다 Instagram 외부 API를 호출할 필요는 없다.

---

# 34. 개인정보 저장 원칙

D1에는 다음 설정 데이터만 저장한다.

```text
릴스 ID
자동 DM 메시지
릴스별 댓글 키워드
자동 DM 사용 여부
공통 설정
```

댓글 작성자 개인정보나 댓글 내역을 D1에 저장하지 않는다.

관리자 세션 쿠키 관련 내용은 필요 시 개인정보처리방침을 보완한다.

---

# 35. 에러 처리 원칙

애매하면 보내지 않는다.

다음 상황에서는 DM 미발송:

```text
D1 오류
릴스 설정 없음
enabled = 0
DM 메시지 없음
키워드 없음
키워드 불일치
팔로우 여부 확인 실패
비팔로워
Instagram API 오류
```

오류는 Cloudflare Logs에 기록하되 민감정보는 로그에 출력하지 않는다.

로그 금지:

```text
Access Token
App Secret
Verify Token
Admin Password
Authorization Header 전체
```

---

# 36. 관리자 UI 원칙

관리자 페이지는 사용자와 아내가 사용하는 내부 관리 도구다.

우선순위:

```text
1. 단순함
2. 한 화면에서 보기 쉬움
3. 빠른 수정
4. 모바일에서도 최소 사용 가능
5. 불필요한 프론트엔드 프레임워크 도입 금지
```

초기 필수 기능:

```text
공통 키워드 관리
릴스 최신순 목록
enabled ON/OFF
DM 메시지 편집
댓글 키워드 편집
행별 저장
페이지 번호
20 / 50 / 100 선택
```

검색/정렬/대량수정 등은 현재 필수 아님.

---

# 37. 아직 실제 확인이 필요한 항목

다음은 구현 전에 실제 API 응답을 확인한다.

## Instagram 릴스 필터

`/me/media` 조회 자체는 이미 성공했다.

하지만 릴스만 정확히 추리기 위한 `media_type`, `media_product_type` 값은 실제 응답을 확인하고 구현한다.

## Instagram pagination

UI는 페이지 번호 방식으로 확정됐지만 실제 cursor 구조는 API 응답을 확인한다.

## 팔로우 확인

실제 `commenterId`로 테스트 후 구현한다.

---

# 38. 앞으로 Codex가 해야 할 일

## STEP 1. 현재 Worker 로컬 프로젝트화

현재 Dashboard Worker를 VSCode 프로젝트로 가져온다.

기능 변경 없이 기존 상태를 그대로 재현한다.

확인:

```text
기존 Worker name 유지
기존 workers.dev URL 유지
기존 Runtime Variables/Secrets 유지
Webhook 정상
댓글 → DM 정상
```

---

## STEP 2. GitHub 연결

```text
VSCode
→ GitHub
→ Cloudflare 자동 배포
```

확인:

```text
Secret이 GitHub에 없음
기존 Worker로 배포됨
/health 정상
댓글 → DM 기존 기능 정상
```

---

## STEP 3. D1 생성 및 연결

D1 생성 후 Worker에 `DB` binding 추가.

초기 migration:

```sql
CREATE TABLE reel_dm_config (
    reel_id TEXT PRIMARY KEY,
    auto_dm_message TEXT,
    comment_keywords TEXT,
    enabled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE app_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT
);
```

기존 `COMMENT_KEYWORDS` 값은 D1 초기값으로 이전한다.

D1 적용이 정상 확인된 후 Runtime Variable의 `COMMENT_KEYWORDS`를 제거한다.

---

## STEP 4. DB 모듈 구현

필요 함수:

```text
getReelConfig(reelId)
upsertReelConfig(...)
getAppSetting(key)
setAppSetting(key, value)
```

SQL parameter binding을 사용한다.

---

## STEP 5. Instagram API 모듈 분리

기존 Private Reply 호출을 `instagram.js`로 분리한다.

추가 대상:

```text
릴스 목록 조회
pagination
팔로우 상태 조회
```

팔로우 조회는 실제 테스트 전 확정 구현하지 않는다.

---

## STEP 6. 팔로우 조회 실테스트

실제 다른 Instagram 계정에서 댓글을 작성하고 Webhook의 `commenterId`를 확보한다.

다음 경우를 테스트한다.

```text
팔로우 계정
비팔로우 계정
기존 DM 상호작용 없는 계정
```

결과 정책:

```text
true → 발송 가능
false → 미발송
조회 실패 → 미발송
```

---

## STEP 7. Webhook을 D1 기반으로 변경

새 흐름:

```text
댓글
→ mediaId
→ reel_dm_config
→ enabled
→ auto_dm_message
→ 릴스별 키워드 / 공통 키워드
→ contains
→ 팔로우 확인
→ Private Reply
```

---

## STEP 8. 관리자 인증

`ADMIN_PASSWORD` Cloudflare Secret 사용.

로그인 + 세션 쿠키 + 모든 관리자 API 보호.

---

## STEP 9. 관리자 릴스 목록 API

Instagram에서 릴스 조회 후 D1 설정과 매핑.

최신순.

반환 필드:

```text
title
timestamp
reelId
enabled
autoDmMessage
commentKeywords
```

---

## STEP 10. 관리자 UI

필수:

```text
공통 키워드 관리
릴스 목록
enabled ON/OFF
DM 메시지
댓글 키워드
행별 저장
페이지 번호
20 / 50 / 100
```

---

## STEP 11. 기존 Runtime Variable 정리

정상 작동 확인 후 제거:

```text
PRIVATE_REPLY_MESSAGE
COMMENT_KEYWORDS
KEYWORD_MATCH_MODE
```

먼저 삭제하지 않는다.

---

## STEP 12. 운영 전 Secret 정리

과거 노출된 Instagram Access Token 폐기.

새 토큰 발급 후 Cloudflare Secret 갱신.

GitHub history에도 Secret이 없는지 확인한다.

---

# 39. 현재 범위에서 하지 말 것

Codex가 임의로 다음을 추가하지 않는다.

```text
사용자별 DM 1회 제한
DEDUP_KV 재도입
댓글 작성자 DB 저장
릴스 목록 DB 저장
비팔로워 안내 DM(B 방식)
별도 외부 DB
별도 서버
React / Next.js 등 과도한 프론트엔드 도입
```

요구사항에 없는 기능은 임의 구현하지 않는다.

Meta API 동작을 추측하지 않는다.

---

# 40. 확정 비즈니스 규칙

```text
RULE 1
릴스별 자동 DM 설정은 D1에 저장한다.

RULE 2
릴스 목록 자체는 DB에 저장하지 않는다.

RULE 3
관리자 페이지 접속 시 Instagram에서 릴스를 조회한다.

RULE 4
Instagram 릴스와 D1 설정은 reel_id로 매핑한다.

RULE 5
enabled = 0이면 DM을 보내지 않는다.

RULE 6
auto_dm_message가 비어 있으면 DM을 보내지 않는다.

RULE 7
릴스별 comment_keywords가 있으면 해당 값을 사용한다.

RULE 8
릴스별 comment_keywords가 비어 있으면 공통 COMMENT_KEYWORDS를 사용한다.

RULE 9
키워드는 쉼표 구분이다.

RULE 10
키워드 매칭은 contains다.

RULE 11
키워드가 매칭돼도 팔로워로 확인되지 않으면 DM을 보내지 않는다.

RULE 12
팔로우 여부 조회 실패 시 DM을 보내지 않는다.

RULE 13
같은 사용자가 새 댓글을 다시 달면 다시 처리할 수 있다.

RULE 14
사용자별 1회 제한은 없다.

RULE 15
릴스 제목은 caption 첫 줄이다.

RULE 16
관리자 목록은 최신순이다.

RULE 17
관리자 UI는 페이지 번호 방식이다.

RULE 18
페이지당 20 / 50 / 100개를 선택할 수 있다.

RULE 19
자동 DM을 OFF해도 기존 메시지와 키워드는 유지한다.

RULE 20
메시지를 비우고 저장하면 enabled = 0으로 강제한다.

RULE 21
공통 키워드는 D1에서 관리한다.

RULE 22
관리자 비밀번호는 Cloudflare Secret으로 관리한다.

RULE 23
배포는 GitHub → Cloudflare 자동 배포 구조로 전환한다.

RULE 24
현재 팔로우 검증은 A 방식만 구현한다.

RULE 25
비팔로워 안내 DM 후 재검증하는 B 방식은 현재 구현하지 않는다.
```

---

# 41. 목표 아키텍처

```text
┌──────────────────────────────┐
│          Instagram           │
│                              │
│  릴스 목록          댓글 이벤트 │
└───────┬────────────────┬─────┘
        │                │
        │                ▼
        │       ┌───────────────────┐
        │       │ Meta Webhook      │
        │       └─────────┬─────────┘
        │                 │
        ▼                 ▼
┌─────────────────────────────────────┐
│       Cloudflare Worker             │
│                                     │
│  /admin                             │
│  /api/admin/reels                   │
│  /api/admin/settings                │
│  /webhook                           │
│                                     │
│  Instagram API Client               │
│  Admin Auth                         │
│  Webhook Handler                    │
│  D1 Repository                      │
└─────────────────┬───────────────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │    Cloudflare D1    │
        │                     │
        │ reel_dm_config      │
        │ app_settings        │
        └─────────────────────┘
```

---

# 42. Codex 개발 원칙

1. 기존 정상 동작을 깨지 않게 단계별로 수정한다.
2. 한 단계가 정상 동작하는 것을 확인한 뒤 다음 단계로 간다.
3. Meta API 동작을 추측하지 않는다.
4. 실제 응답 구조가 필요하면 테스트 결과를 먼저 확인한다.
5. Secret 값을 코드/Git에 넣지 않는다.
6. D1에는 릴스 설정만 저장한다.
7. 팔로우 확인 실패 시 DM을 보내지 않는다.
8. 현재는 B 방식의 팔로우 안내 DM을 구현하지 않는다.
9. 관리자 화면은 단순하고 실용적으로 만든다.
10. 요구사항 외 기능을 임의 추가하지 않는다.

---

# 43. 1차 완료 조건

```text
[ ] 기존 Meta Webhook 검증 정상
[ ] 실제 댓글 Webhook 정상
[ ] GitHub → 기존 Worker 자동 배포 정상
[ ] D1 연결 정상
[ ] 관리자 로그인 정상
[ ] Instagram 릴스 최신순 조회
[ ] caption 첫 줄 제목 표시
[ ] 페이지당 20 / 50 / 100 선택
[ ] 페이지 번호 이동
[ ] 릴스별 enabled 저장
[ ] 릴스별 DM 메시지 저장
[ ] 릴스별 댓글 키워드 저장
[ ] 공통 댓글 키워드 저장
[ ] 릴스별 키워드 우선 적용
[ ] 빈 릴스별 키워드 → 공통 키워드 fallback
[ ] contains 키워드 매칭
[ ] enabled=0이면 미발송
[ ] 메시지 비어 있으면 미발송
[ ] 메시지를 비우고 저장하면 자동 OFF
[ ] 팔로워 확인 성공 + 팔로워일 때만 DM
[ ] 비팔로워 미발송
[ ] 팔로우 조회 실패 시 미발송
[ ] 릴스별 서로 다른 DM 메시지 발송
[ ] PRIVATE_REPLY_MESSAGE 제거
[ ] Runtime Variable COMMENT_KEYWORDS 제거
[ ] KEYWORD_MATCH_MODE 제거
[ ] 운영용 새 Instagram Access Token 적용
```

---

# 44. 권장 진행 순서

```text
1. 현재 Worker 로컬 프로젝트화
2. GitHub 연결
3. 기존 댓글 → DM 기능 재검증
4. D1 생성/바인딩
5. DB schema 생성
6. 팔로우 API 실테스트
7. Webhook을 D1 기반으로 변경
8. 관리자 인증 구현
9. 관리자 API 구현
10. 관리자 UI 구현
11. Runtime Variable 정리
12. 운영 Access Token 교체
```

이 문서를 기준으로 VSCode + Codex에서 이어서 개발한다.
