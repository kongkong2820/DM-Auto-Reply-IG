import {
  adminPageResponse,
  handleAdminApi
} from "./admin.js";
import { handleWebhook } from "./webhook.js";

const worker = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return Response.json({
        service: "Instagram Comment Auto DM",
        status: "ready",
        autoReply: env.ENABLE_AUTO_REPLY === "true"
      });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      const databaseConfigured = Boolean(env.DB);
      const instagramConfigured = Boolean(
        /^v\d+\.\d+$/.test(env.GRAPH_API_VERSION) &&
        env.INSTAGRAM_ACCOUNT_ID &&
        env.INSTAGRAM_ACCESS_TOKEN
      );

      return Response.json({
        ok: databaseConfigured && instagramConfigured,
        autoReply: env.ENABLE_AUTO_REPLY === "true",
        databaseConfigured,
        instagramConfigured,
        adminConfigured: Boolean(env.ADMIN_PASSWORD)
      });
    }

    if (url.pathname === "/privacy" && request.method === "GET") {
      return privacyPolicyResponse();
    }

    if (url.pathname === "/admin" && request.method === "GET") {
      return adminPageResponse();
    }

    if (url.pathname.startsWith("/api/admin/")) {
      return handleAdminApi(request, url, env);
    }

    if (url.pathname === "/webhook") {
      return handleWebhook(request, url, env, ctx);
    }

    return new Response("Not Found", { status: 404 });
  }
};

function privacyPolicyResponse() {
  const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>개인정보처리방침 | Instagram Comment Auto DM</title>
    <style>
      body { max-width: 760px; margin: 48px auto; padding: 0 20px;
        font-family: sans-serif; line-height: 1.7; color: #202124; }
      h1, h2 { line-height: 1.35; } h2 { margin-top: 32px; }
    </style>
  </head>
  <body>
    <h1>Instagram Comment Auto DM 개인정보처리방침</h1>
    <p>시행일: 2026년 9월 6일</p>
    <h2>1. 처리하는 정보</h2>
    <p>서비스는 댓글 자동 DM 제공 과정에서 Instagram 댓글 작성자의
      앱 범위 식별자, 댓글 ID와 내용 및 게시물 ID를 일시적으로 처리할 수
      있습니다. 관리자 로그인에는 개인 식별정보를 담지 않은 서명 세션
      쿠키를 사용합니다.</p>
    <h2>2. 처리 목적</h2>
    <p>설정된 댓글 조건과 팔로우 여부를 확인하고 조건에 맞는 작성자에게
      비공개 메시지를 전송하며 관리자 접근을 보호하기 위해 처리합니다.</p>
    <h2>3. 보관 및 파기</h2>
    <p>댓글 내용과 작성자 정보는 데이터베이스에 저장하지 않습니다.
      관리자 세션 쿠키는 로그아웃하거나 최대 8시간이 지나면 만료됩니다.</p>
    <h2>4. 제3자 서비스</h2>
    <p>서비스 제공에 Meta Instagram API와 Cloudflare Workers 및 D1을
      이용합니다. 처리 정보는 서비스 제공 목적 외에 판매하거나 임의로
      제공하지 않습니다.</p>
    <h2>5. 삭제 요청</h2>
    <p>개인정보 처리 또는 삭제 요청은 본 서비스를 제공하는 Instagram
      계정의 DM으로 접수할 수 있습니다.</p>
    <h2>6. 방침 변경</h2>
    <p>방침이 변경되면 이 페이지에 변경 내용과 시행일을 게시합니다.</p>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "public, max-age=3600",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; " +
        "frame-ancestors 'none'; base-uri 'none'",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export default worker;
