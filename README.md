# Instagram Comment Auto DM

Instagram 릴스 댓글에 설정된 키워드가 포함되면 자동 DM을 보내는 Cloudflare Worker 프로젝트다. 앞으로 릴스별 메시지·키워드·사용 여부를 D1과 관리자 웹에서 관리하고, 팔로워로 확인된 사용자에게만 발송하도록 확장한다.

## 현재 상태

`worker.js`는 현재 Cloudflare에 올라가 있는 운영 기준 원본이고, 같은 실행 코드를 `src/index.js`에서 사용한다. 현재 구현은 환경변수 기반 키워드 매칭과 Private Reply 발송이며, D1·관리자 페이지·팔로우 확인은 아직 구현되지 않았다. 설계 문서에 기존 실제 DM 수신 성공 이력이 기록되어 있다.

- Worker 이름: `instagram-dm-auto-reply`
- 기존 URL: https://instagram-dm-auto-reply.kongkong2820.workers.dev
- 현재 라우트: `GET /`, `GET /health`, `GET /privacy`, `GET /webhook`, `POST /webhook`
- 목표 배포 흐름: 로컬 개발 → GitHub → Cloudflare Workers Builds → 기존 Worker

## 문서와 작업 순서

- [설계 및 인수인계](instagram_dm_auto_reply_design.md): 확정 요구사항과 운영 배경
- [개발 진행 현황](status.md): 순서, 의존 관계, 현재 상태
- [TASK 문서](docs/tasks/): 작업별 진행 사항과 완료 조건
- [RESULT 문서](docs/results/): TASK와 같은 번호의 구현·검증 결과

TASK-01 로컬 프로젝트화를 완료했다. 다음 작업은 [TASK-02](docs/tasks/TASK-02.md)이며, 상세 검증 결과는 [RESULT-01](docs/results/RESULT-01.md)에 있다.

## 현재 파일 구조

```text
.
├── worker.js                         # 운영 기준 원본
├── src/index.js                      # Wrangler Worker 진입점
├── test/worker.test.js               # 현재 동작 회귀 테스트
├── package.json
├── package-lock.json
├── wrangler.jsonc
├── .dev.vars.example
├── instagram_dm_auto_reply_design.md # 설계
├── status.md                         # 개발 순서 및 현황
├── docs/
│   ├── tasks/TASK-01.md … TASK-12.md
│   └── results/RESULT-01.md … RESULT-12.md
├── .gitignore
└── README.md
```

`migrations/`와 D1 바인딩은 TASK-03에서 추가한다.

## 로컬 실행과 검증

Node.js 20 이상이 필요하다.

```bash
npm install
cp .dev.vars.example .dev.vars
npm test
npm run dev
```

`.dev.vars`에는 로컬 개발에 사용할 값을 직접 입력한다. 이 파일은 Git에서 제외된다. 실제 Instagram으로 발송하지 않는 테스트에서는 `ENABLE_AUTO_REPLY=false`를 유지한다.

실제 배포 없이 Wrangler 번들만 확인하려면 다음 명령을 사용한다.

```bash
npm run deploy:check
```

`npm run deploy`는 기존 이름의 운영 Worker를 변경하므로 TASK-02에서 원격 설정과 커밋 내용을 확인한 뒤 사용한다.

## 설정 관리

| 구분 | 이름 | 관리 방침 |
| --- | --- | --- |
| Secret | INSTAGRAM_ACCESS_TOKEN, META_APP_SECRET, VERIFY_TOKEN | Cloudflare Secret으로 유지 |
| 추가 예정 Secret | ADMIN_PASSWORD | 관리자 인증 구현 시 등록 |
| 유지 변수 | ENABLE_AUTO_REPLY, GRAPH_API_VERSION, INSTAGRAM_ACCOUNT_ID | 현재 운영 설정 확인 후 유지 |
| 전환 후 제거 변수 | PRIVATE_REPLY_MESSAGE, COMMENT_KEYWORDS, KEYWORD_MATCH_MODE | D1 기반 기능 검증 후 제거 |
| 추가 예정 바인딩 | DB | Cloudflare D1 |

실제 토큰·Secret·비밀번호를 코드나 문서에 넣지 않는다. 예제 환경 파일을 추가할 때에는 변수명과 빈 값만 기록한다. 현재 동작하는 META_APP_SECRET의 출처를 임의 변경하지 않는다. 설계 문서에 기록된 과거 노출 토큰은 운영 전 교체한다.

## Git 준비

`.gitignore`에는 `정보` 파일의 한글 완성형·분해형 이름, `.env*`, `.dev.vars*`, 의존성, Wrangler 로컬 상태, 빌드 결과, 로그, 로컬 DB 등을 제외하도록 설정했다. 마이그레이션 SQL과 패키지 잠금 파일은 추적 대상으로 유지한다.

현재 Git 초기화·커밋·GitHub 업로드·자동 배포 연결은 수행하지 않았다. 첫 커밋 전 제외 규칙과 staged diff를 확인한다. `.gitignore`는 이미 추적된 파일이나 과거 커밋의 Secret을 제거하지 않는다.

## 핵심 정책

- D1에는 릴스별 설정과 공통 설정만 저장하며 릴스 원본은 Instagram API에서 조회한다.
- 메시지가 비었거나 OFF이면 발송하지 않는다. OFF 전환 시 메시지와 키워드는 보존한다.
- 목표 키워드 규칙은 쉼표 구분·contains이며, 빈 릴스별 키워드는 D1 공통 키워드를 사용한다.
- 팔로워임을 확인한 경우에만 발송한다. 조회 실패도 미발송이다. 실제 API 검증이 선행되어야 한다.
- 같은 사용자의 새 댓글은 다시 처리할 수 있으며 사용자별 1회 제한을 추가하지 않는다.
- 관리자 목록은 최신순, 제목은 caption 첫 줄, 페이지 크기는 20/50/100으로 제공한다.
