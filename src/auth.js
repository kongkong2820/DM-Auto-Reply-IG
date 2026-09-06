const SESSION_COOKIE = "admin_session";
const SESSION_VERSION = "v1";
const SESSION_SECONDS = 60 * 60 * 8;
const encoder = new TextEncoder();

export async function verifyAdminPassword(
  candidate,
  configuredPassword
) {
  if (
    typeof candidate !== "string" ||
    !configuredPassword
  ) {
    return false;
  }

  const [candidateDigest, configuredDigest] =
    await Promise.all([
      crypto.subtle.digest("SHA-256", encoder.encode(candidate)),
      crypto.subtle.digest(
        "SHA-256",
        encoder.encode(configuredPassword)
      )
    ]);

  return equalBytes(
    new Uint8Array(candidateDigest),
    new Uint8Array(configuredDigest)
  );
}

export async function createAdminSession(
  configuredPassword,
  now = Date.now()
) {
  if (!configuredPassword) {
    throw new Error("ADMIN_PASSWORD is not configured");
  }

  const expiresAt = Math.floor(now / 1000) + SESSION_SECONDS;
  const nonce = randomHex(16);
  const payload = `${SESSION_VERSION}.${expiresAt}.${nonce}`;
  const signature = await sign(payload, configuredPassword);

  return `${payload}.${signature}`;
}

export async function isAdminAuthenticated(
  request,
  configuredPassword,
  now = Date.now()
) {
  if (!configuredPassword) {
    return false;
  }

  const token = readCookie(
    request.headers.get("Cookie"),
    SESSION_COOKIE
  );

  if (!token) {
    return false;
  }

  const parts = token.split(".");

  if (parts.length !== 4) {
    return false;
  }

  const [version, expiresText, nonce, suppliedSignature] = parts;
  const expiresAt = Number(expiresText);

  if (
    version !== SESSION_VERSION ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Math.floor(now / 1000) ||
    !/^[0-9a-f]{32}$/.test(nonce) ||
    !/^[0-9a-f]{64}$/.test(suppliedSignature)
  ) {
    return false;
  }

  const payload = `${version}.${expiresText}.${nonce}`;
  const expectedSignature = await sign(
    payload,
    configuredPassword
  );

  return equalHex(expectedSignature, suppliedSignature);
}

export function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; Path=/; ` +
    `Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; ` +
    "SameSite=Strict";
}

export function expiredSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; ` +
    "HttpOnly; Secure; SameSite=Strict";
}

export function hasSameOrigin(request) {
  const origin = request.headers.get("Origin");

  if (!origin) {
    return false;
  }

  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function sign(payload, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payload)
    )
  );

  return bytesToHex(signature);
}

function readCookie(header, name) {
  for (const part of (header ?? "").split(";")) {
    const separator = part.indexOf("=");

    if (separator === -1) {
      continue;
    }

    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }

  return null;
}

function randomHex(size) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function bytesToHex(bytes) {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function equalHex(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  return equalBytes(encoder.encode(left), encoder.encode(right));
}

function equalBytes(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }

  return difference === 0;
}
