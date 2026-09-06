import {
  DEFAULT_FOLLOW_PROMPT_MESSAGE,
  DEFAULT_FOLLOW_RETRY_MESSAGE,
  getAppSetting,
  getReelConfigs,
  setAppSetting,
  upsertReelConfig
} from "./db.js";
import { getMediaList } from "./instagram.js";
import {
  createAdminSession,
  expiredSessionCookie,
  hasSameOrigin,
  isAdminAuthenticated,
  sessionCookie,
  verifyAdminPassword
} from "./auth.js";

const PAGE_SIZES = new Set([20, 50, 100]);

export async function handleAdminApi(request, url, env) {
  try {
    if (url.pathname === "/api/admin/login") {
      return handleLogin(request, env);
    }

    if (!await isAdminAuthenticated(request, env.ADMIN_PASSWORD)) {
      return jsonResponse(
        { error: "인증이 필요합니다." },
        401
      );
    }

    if (url.pathname === "/api/admin/logout") {
      return handleLogout(request);
    }

    if (url.pathname === "/api/admin/reels") {
      if (request.method !== "GET") {
        return methodNotAllowed("GET");
      }

      requireDatabase(env.DB);
      return getReels(url, env);
    }

    const reelMatch = url.pathname.match(
      /^\/api\/admin\/reels\/([^/]+)$/
    );

    if (reelMatch) {
      if (request.method !== "PUT") {
        return methodNotAllowed("PUT");
      }

      requireSameOrigin(request);
      requireDatabase(env.DB);
      return saveReel(
        decodeURIComponent(reelMatch[1]),
        request,
        env
      );
    }

    if (url.pathname === "/api/admin/settings") {
      requireDatabase(env.DB);

      if (request.method === "GET") {
        return getSettings(env);
      }

      if (request.method === "PUT") {
        requireSameOrigin(request);
        return saveSettings(request, env);
      }

      return methodNotAllowed("GET, PUT");
    }

    return jsonResponse({ error: "Not Found" }, 404);
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status);
    }

    console.error("Admin request failed");
    return jsonResponse(
      { error: "요청 처리 중 오류가 발생했습니다." },
      500
    );
  }
}

async function handleLogin(request, env) {
  if (request.method !== "POST") {
    return methodNotAllowed("POST");
  }

  requireSameOrigin(request);

  if (!env.ADMIN_PASSWORD) {
    throw new HttpError(
      503,
      "관리자 비밀번호가 설정되지 않았습니다."
    );
  }

  const body = await readJsonBody(request, 4096);

  if (
    typeof body.password !== "string" ||
    body.password.length > 1024 ||
    !await verifyAdminPassword(
      body.password,
      env.ADMIN_PASSWORD
    )
  ) {
    return jsonResponse(
      { error: "비밀번호가 올바르지 않습니다." },
      401
    );
  }

  const token = await createAdminSession(env.ADMIN_PASSWORD);
  const response = jsonResponse({ ok: true });
  response.headers.set("Set-Cookie", sessionCookie(token));
  return response;
}

function handleLogout(request) {
  if (request.method !== "POST") {
    return methodNotAllowed("POST");
  }

  requireSameOrigin(request);
  const response = jsonResponse({ ok: true });
  response.headers.set("Set-Cookie", expiredSessionCookie());
  return response;
}

async function getReels(url, env) {
  const limitText = url.searchParams.get("limit") ?? "20";
  const limit = Number(limitText);

  if (!PAGE_SIZES.has(limit) || String(limit) !== limitText) {
    throw new HttpError(400, "limit은 20, 50, 100만 가능합니다.");
  }

  const after = url.searchParams.get("after") ?? undefined;

  if (after && after.length > 2048) {
    throw new HttpError(400, "cursor가 너무 깁니다.");
  }

  const mediaPage = await getMediaList(env, { after, limit });
  const configs = await getReelConfigs(
    env.DB,
    mediaPage.data.map((media) => media.id)
  );
  const data = mediaPage.data.map((media) => {
    const config = configs.get(media.id);

    return {
      reelId: media.id,
      title: titleFromCaption(media.caption),
      timestamp: media.timestamp,
      enabled: config?.enabled ?? 0,
      autoDmMessage: config?.autoDmMessage ?? "",
      commentKeywords: config?.commentKeywords ?? ""
    };
  });

  return jsonResponse({
    data,
    paging: {
      after: mediaPage.paging.hasNext
        ? mediaPage.paging.after
        : null,
      hasNext: mediaPage.paging.hasNext
    },
    pageSize: limit
  });
}

async function saveReel(reelId, request, env) {
  if (!/^\d{1,64}$/.test(reelId)) {
    throw new HttpError(400, "릴스 ID 형식이 올바르지 않습니다.");
  }

  const body = await readJsonBody(request);

  if (
    ![true, false, 1, 0].includes(body.enabled) ||
    typeof body.autoDmMessage !== "string" ||
    typeof body.commentKeywords !== "string"
  ) {
    throw new HttpError(400, "릴스 설정 형식이 올바르지 않습니다.");
  }

  if (body.autoDmMessage.length > 10000) {
    throw new HttpError(400, "DM 메시지는 10,000자 이하여야 합니다.");
  }

  if (body.commentKeywords.length > 2000) {
    throw new HttpError(400, "댓글 키워드는 2,000자 이하여야 합니다.");
  }

  const saved = await upsertReelConfig(env.DB, {
    reelId,
    enabled: body.enabled,
    autoDmMessage: body.autoDmMessage,
    commentKeywords: body.commentKeywords
  });

  return jsonResponse({ data: saved });
}

async function getSettings(env) {
  const commentKeywords =
    await getAppSetting(env.DB, "COMMENT_KEYWORDS") ?? "";
  const followPromptMessage =
    await getAppSetting(env.DB, "FOLLOW_PROMPT_MESSAGE") ??
    DEFAULT_FOLLOW_PROMPT_MESSAGE;
  const followRetryMessage =
    await getAppSetting(env.DB, "FOLLOW_RETRY_MESSAGE") ??
    DEFAULT_FOLLOW_RETRY_MESSAGE;

  return jsonResponse({
    data: {
      commentKeywords,
      followPromptMessage,
      followRetryMessage
    }
  });
}

async function saveSettings(request, env) {
  const body = await readJsonBody(request);

  if (
    typeof body.commentKeywords !== "string" ||
    body.commentKeywords.length > 2000 ||
    typeof body.followPromptMessage !== "string" ||
    !body.followPromptMessage.trim() ||
    body.followPromptMessage.length > 10000 ||
    typeof body.followRetryMessage !== "string" ||
    !body.followRetryMessage.trim() ||
    body.followRetryMessage.length > 10000
  ) {
    throw new HttpError(
      400,
      "공통 설정 형식이 올바르지 않습니다."
    );
  }

  const commentKeywords = await setAppSetting(
    env.DB,
    "COMMENT_KEYWORDS",
    body.commentKeywords
  );
  const followPromptMessage = await setAppSetting(
    env.DB,
    "FOLLOW_PROMPT_MESSAGE",
    body.followPromptMessage
  );
  const followRetryMessage = await setAppSetting(
    env.DB,
    "FOLLOW_RETRY_MESSAGE",
    body.followRetryMessage
  );

  return jsonResponse({
    data: {
      commentKeywords,
      followPromptMessage,
      followRetryMessage
    }
  });
}

function titleFromCaption(caption) {
  const firstLine = caption.split(/\r?\n/, 1)[0].trim();
  return firstLine || "(제목 없음)";
}

async function readJsonBody(request, maxBytes = 65536) {
  const contentType = request.headers.get("Content-Type") ?? "";

  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "JSON 요청만 지원합니다.");
  }

  const contentLength = Number(
    request.headers.get("Content-Length") ?? 0
  );

  if (contentLength > maxBytes) {
    throw new HttpError(413, "요청 본문이 너무 큽니다.");
  }

  const text = await request.text();

  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new HttpError(413, "요청 본문이 너무 큽니다.");
  }

  try {
    const value = JSON.parse(text);

    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("invalid object");
    }

    return value;
  } catch {
    throw new HttpError(400, "JSON 형식이 올바르지 않습니다.");
  }
}

function requireDatabase(db) {
  if (!db) {
    throw new HttpError(503, "데이터베이스가 연결되지 않았습니다.");
  }
}

function requireSameOrigin(request) {
  if (!hasSameOrigin(request)) {
    throw new HttpError(403, "요청 출처를 확인할 수 없습니다.");
  }
}

function methodNotAllowed(allow) {
  const response = jsonResponse(
    { error: "Method Not Allowed" },
    405
  );
  response.headers.set("Allow", allow);
  return response;
}

function jsonResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function adminPageResponse() {
  return new Response(ADMIN_HTML, {
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'none'; connect-src 'self'; " +
        "script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
        "img-src 'self' data:; frame-ancestors 'none'; " +
        "base-uri 'none'; form-action 'self'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

const ADMIN_HTML = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Instagram 자동 DM 관리</title>
  <style>
    :root { color-scheme: light; --ink: #17202a; --muted: #65758b;
      --line: #dce2ea; --brand: #405de6; --danger: #b42318;
      --ok: #087443; --surface: #fff; --bg: #f5f7fa; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    button, input, select, textarea { font: inherit; }
    button { border: 0; border-radius: 8px; padding: 9px 14px;
      color: #fff; background: var(--brand); cursor: pointer; font-weight: 700; }
    button:disabled { cursor: wait; opacity: .55; }
    button.secondary { color: var(--ink); background: #e8ecf2; }
    input, select, textarea { width: 100%; border: 1px solid var(--line);
      border-radius: 8px; padding: 9px 10px; background: #fff; color: var(--ink); }
    textarea { min-height: 92px; resize: vertical; line-height: 1.45; }
    .shell { max-width: 1500px; margin: 0 auto; padding: 28px 20px 48px; }
    .card { background: var(--surface); border: 1px solid var(--line);
      border-radius: 14px; box-shadow: 0 8px 28px rgba(23,32,42,.06); }
    .login { max-width: 400px; margin: 12vh auto; padding: 28px; }
    .login h1 { margin: 0 0 8px; font-size: 24px; }
    .login p { color: var(--muted); margin: 0 0 22px; }
    .login form { display: grid; gap: 12px; }
    .topbar { display: flex; align-items: center; justify-content: space-between;
      gap: 16px; margin-bottom: 20px; }
    .topbar h1 { margin: 0; font-size: 25px; }
    .settings { margin-bottom: 18px; }
    .settings summary { padding: 18px; cursor: pointer; font-weight: 800; }
    .settings-panel { display: grid;
      grid-template-columns: repeat(3, minmax(240px, 1fr)) auto;
      gap: 12px; align-items: end; padding: 0 18px 18px; }
    .settings-panel .status { grid-column: 1 / -1; }
    label { display: grid; gap: 7px; font-size: 14px; font-weight: 700; }
    .controls { display: flex; justify-content: space-between; align-items: center;
      gap: 12px; margin: 16px 0 10px; }
    .size { display: flex; align-items: center; gap: 8px; color: var(--muted); }
    .size select { width: auto; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; min-width: 1160px; border-collapse: collapse; }
    th, td { border-bottom: 1px solid var(--line); padding: 13px 10px;
      text-align: left; vertical-align: top; }
    th { background: #f8fafc; color: var(--muted); font-size: 13px; }
    .toggle { width: 52px; height: 28px; accent-color: var(--brand); }
    .title { max-width: 250px; font-weight: 700; overflow-wrap: anywhere; }
    .date, .id { color: var(--muted); font-size: 13px; white-space: nowrap; }
    .message { min-width: 280px; }
    .keywords { min-width: 190px; }
    .row-status { min-height: 20px; margin-top: 6px; font-size: 12px; }
    .status { min-height: 24px; color: var(--muted); }
    .error { color: var(--danger); } .success { color: var(--ok); }
    .empty { padding: 48px 18px; text-align: center; color: var(--muted); }
    .pagination { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 16px; }
    .pagination button { min-width: 40px; color: var(--ink); background: #e8ecf2; }
    .pagination button.current { color: #fff; background: var(--brand); }
    [hidden] { display: none !important; }
    @media (max-width: 680px) {
      .shell { padding: 18px 12px 36px; }
      .settings-panel { grid-template-columns: 1fr; }
      .topbar { align-items: flex-start; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section id="login" class="card login" hidden>
      <h1>자동 DM 관리</h1>
      <p>관리자 비밀번호로 로그인하세요.</p>
      <form id="login-form">
        <label>비밀번호
          <input id="password" type="password" autocomplete="current-password" required>
        </label>
        <button type="submit">로그인</button>
        <div id="login-status" class="status" role="status"></div>
      </form>
    </section>

    <section id="app" hidden>
      <header class="topbar">
        <div><h1>Instagram 자동 DM 관리</h1></div>
        <button id="logout" class="secondary" type="button">로그아웃</button>
      </header>

      <details class="card settings">
        <summary>공통 설정</summary>
        <div class="settings-panel">
          <label>공통 댓글 키워드
            <input id="common-keywords" maxlength="2000" placeholder="자료,신청">
          </label>
          <label>최초 팔로우 확인 안내
            <textarea id="common-follow-prompt" maxlength="10000"></textarea>
          </label>
          <label>미팔로우 재확인 안내
            <textarea id="common-follow-retry" maxlength="10000"></textarea>
          </label>
          <button id="save-settings" type="button">공통 설정 저장</button>
          <div id="settings-status" class="status" role="status"></div>
        </div>
      </details>

      <div class="controls">
        <div id="list-status" class="status" role="status"></div>
        <label class="size">페이지당
          <select id="page-size">
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>
      </div>

      <section class="card table-wrap">
        <table>
          <thead><tr>
            <th>사용</th><th>제목</th><th>올린 날짜</th><th>릴스 ID</th>
            <th>최종 자동 DM 메시지</th><th>댓글 키워드</th><th>저장</th>
          </tr></thead>
          <tbody id="reels"></tbody>
        </table>
        <div id="empty" class="empty" hidden>표시할 릴스가 없습니다.</div>
      </section>
      <nav id="pagination" class="pagination" aria-label="릴스 페이지"></nav>
    </section>
  </main>

  <script>
    "use strict";
    var state = { page: 1, size: 20, cursors: [null], hasNext: false };
    var login = document.getElementById("login");
    var app = document.getElementById("app");
    var tbody = document.getElementById("reels");
    var empty = document.getElementById("empty");

    async function api(path, options) {
      var response = await fetch(path, Object.assign({
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" }
      }, options || {}));
      var payload = await response.json().catch(function () { return {}; });
      if (response.status === 401 && path !== "/api/admin/login") {
        showLogin();
      }
      if (!response.ok) {
        throw new Error(payload.error || "요청에 실패했습니다.");
      }
      return payload;
    }

    function showLogin() {
      login.hidden = false;
      app.hidden = true;
      document.getElementById("password").focus();
    }

    function showApp() {
      login.hidden = true;
      app.hidden = false;
    }

    function setStatus(id, message, kind) {
      var node = document.getElementById(id);
      node.textContent = message || "";
      node.className = "status" + (kind ? " " + kind : "");
    }

    document.getElementById("login-form").addEventListener("submit", async function (event) {
      event.preventDefault();
      setStatus("login-status", "로그인 중입니다.");
      try {
        await api("/api/admin/login", {
          method: "POST",
          body: JSON.stringify({ password: document.getElementById("password").value })
        });
        document.getElementById("password").value = "";
        showApp();
        await loadAll();
      } catch (error) {
        setStatus("login-status", error.message, "error");
      }
    });

    document.getElementById("logout").addEventListener("click", async function () {
      try { await api("/api/admin/logout", { method: "POST", body: "{}" }); }
      finally { showLogin(); }
    });

    document.getElementById("save-settings").addEventListener("click", async function () {
      setStatus("settings-status", "저장 중입니다.");
      try {
        var payload = await api("/api/admin/settings", {
          method: "PUT",
          body: JSON.stringify({
            commentKeywords: document.getElementById("common-keywords").value,
            followPromptMessage: document.getElementById("common-follow-prompt").value,
            followRetryMessage: document.getElementById("common-follow-retry").value
          })
        });
        document.getElementById("common-keywords").value = payload.data.commentKeywords;
        document.getElementById("common-follow-prompt").value = payload.data.followPromptMessage;
        document.getElementById("common-follow-retry").value = payload.data.followRetryMessage;
        setStatus("settings-status", "저장했습니다.", "success");
      } catch (error) {
        setStatus("settings-status", error.message, "error");
      }
    });

    document.getElementById("page-size").addEventListener("change", function (event) {
      state.size = Number(event.target.value);
      state.page = 1;
      state.cursors = [null];
      loadReels();
    });

    async function loadAll() {
      var settings = await api("/api/admin/settings");
      document.getElementById("common-keywords").value = settings.data.commentKeywords;
      document.getElementById("common-follow-prompt").value = settings.data.followPromptMessage;
      document.getElementById("common-follow-retry").value = settings.data.followRetryMessage;
      await loadReels();
    }

    async function loadReels() {
      setStatus("list-status", "릴스를 불러오는 중입니다.");
      tbody.replaceChildren();
      empty.hidden = true;
      var cursor = state.cursors[state.page - 1];
      var path = "/api/admin/reels?limit=" + state.size;
      if (cursor) path += "&after=" + encodeURIComponent(cursor);
      try {
        var payload = await api(path);
        state.hasNext = payload.paging.hasNext;
        if (state.hasNext && payload.paging.after) {
          state.cursors[state.page] = payload.paging.after;
        } else {
          state.cursors.splice(state.page);
        }
        renderRows(payload.data);
        renderPagination();
        empty.hidden = payload.data.length !== 0;
        setStatus("list-status", payload.data.length + "개 릴스를 표시합니다.");
      } catch (error) {
        if (!login.hidden) return;
        setStatus("list-status", error.message, "error");
      }
    }

    function renderRows(rows) {
      var fragment = document.createDocumentFragment();
      rows.forEach(function (row) {
        var tr = document.createElement("tr");
        var enabled = document.createElement("input");
        enabled.type = "checkbox";
        enabled.className = "toggle";
        enabled.checked = row.enabled === 1;
        addCell(tr, enabled);
        addTextCell(tr, row.title, "title");
        addTextCell(tr, formatDate(row.timestamp), "date");
        addTextCell(tr, row.reelId, "id");

        var message = messageInput(row.autoDmMessage);
        addCell(tr, message);

        var keywords = document.createElement("input");
        keywords.className = "keywords";
        keywords.maxLength = 2000;
        keywords.value = row.commentKeywords;
        keywords.placeholder = "비우면 공통 키워드 사용";
        addCell(tr, keywords);

        var save = document.createElement("button");
        save.type = "button";
        save.textContent = "저장";
        var status = document.createElement("div");
        status.className = "row-status";
        save.addEventListener("click", async function () {
          save.disabled = true;
          status.textContent = "저장 중";
          status.className = "row-status";
          try {
            var payload = await api("/api/admin/reels/" + encodeURIComponent(row.reelId), {
              method: "PUT",
              body: JSON.stringify({
                enabled: enabled.checked,
                autoDmMessage: message.value,
                commentKeywords: keywords.value
              })
            });
            enabled.checked = payload.data.enabled === 1;
            message.value = payload.data.autoDmMessage;
            keywords.value = payload.data.commentKeywords;
            status.textContent = "저장됨";
            status.className = "row-status success";
          } catch (error) {
            status.textContent = error.message;
            status.className = "row-status error";
          } finally {
            save.disabled = false;
          }
        });
        var action = document.createElement("div");
        action.append(save, status);
        addCell(tr, action);
        fragment.appendChild(tr);
      });
      tbody.replaceChildren(fragment);
    }

    function messageInput(value) {
      var input = document.createElement("textarea");
      input.className = "message";
      input.maxLength = 10000;
      input.value = value || "";
      return input;
    }

    function addCell(row, child) {
      var cell = document.createElement("td");
      cell.appendChild(child);
      row.appendChild(cell);
    }

    function addTextCell(row, value, className) {
      var cell = document.createElement("td");
      cell.className = className || "";
      cell.textContent = value || "";
      row.appendChild(cell);
    }

    function formatDate(value) {
      if (!value) return "-";
      var date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR");
    }

    function renderPagination() {
      var nav = document.getElementById("pagination");
      var fragment = document.createDocumentFragment();
      var lastPage = Math.max(state.page, state.cursors.length);
      addPageButton(fragment, "이전", state.page - 1, state.page === 1);
      for (var page = 1; page <= lastPage; page += 1) {
        addPageButton(fragment, String(page), page, false, page === state.page);
      }
      addPageButton(fragment, "다음", state.page + 1, !state.hasNext);
      nav.replaceChildren(fragment);
    }

    function addPageButton(parent, label, page, disabled, current) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.disabled = disabled;
      if (current) {
        button.className = "current";
        button.setAttribute("aria-current", "page");
      }
      button.addEventListener("click", function () {
        state.page = page;
        loadReels();
      });
      parent.appendChild(button);
    }

    loadAll().then(showApp).catch(showLogin);
  </script>
</body>
</html>`;
