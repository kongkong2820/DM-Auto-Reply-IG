const GRAPH_API_ORIGIN = "https://graph.instagram.com";
const MEDIA_FIELDS = [
  "id",
  "caption",
  "media_type",
  "media_product_type",
  "timestamp"
];

export async function getMediaList(
  env,
  {
    after,
    limit = 100
  } = {}
) {
  const version = requireGraphApiVersion(env.GRAPH_API_VERSION);
  const accessToken = requireAccessToken(env.INSTAGRAM_ACCESS_TOKEN);
  const normalizedLimit = requireLimit(limit);
  const endpoint = new URL(
    `${GRAPH_API_ORIGIN}/${version}/me/media`
  );

  endpoint.searchParams.set("fields", MEDIA_FIELDS.join(","));
  endpoint.searchParams.set("limit", String(normalizedLimit));

  if (after !== undefined && after !== null && after !== "") {
    if (typeof after !== "string") {
      throw new TypeError("after must be a string");
    }

    endpoint.searchParams.set("after", after);
  }

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const payload = await readJsonResponse(response);

  if (!Array.isArray(payload.data)) {
    throw new Error("Instagram media response is invalid");
  }

  const afterCursor = readCursor(payload.paging?.cursors?.after);
  const beforeCursor = readCursor(payload.paging?.cursors?.before);

  return {
    data: payload.data
      .filter(
        (media) =>
          media.media_product_type === "REELS" &&
          media.id !== undefined &&
          media.id !== null
      )
      .map((media) => ({
        id: String(media.id),
        caption:
          typeof media.caption === "string"
            ? media.caption
            : "",
        timestamp:
          typeof media.timestamp === "string"
            ? media.timestamp
            : "",
        mediaType:
          typeof media.media_type === "string"
            ? media.media_type
            : "",
        mediaProductType: media.media_product_type
      }))
      .sort((left, right) =>
        right.timestamp.localeCompare(left.timestamp)
      ),
    paging: {
      before: beforeCursor,
      after: afterCursor,
      hasNext: Boolean(payload.paging?.next && afterCursor)
    },
    requestedLimit: normalizedLimit
  };
}

export async function sendPrivateReply(
  commentId,
  message,
  env
) {
  const version = requireGraphApiVersion(env.GRAPH_API_VERSION);
  const accessToken = requireAccessToken(env.INSTAGRAM_ACCESS_TOKEN);

  if (!env.INSTAGRAM_ACCOUNT_ID) {
    throw new Error(
      "Instagram account credentials are not configured"
    );
  }

  const endpoint =
    `${GRAPH_API_ORIGIN}/` +
    `${version}/` +
    `${env.INSTAGRAM_ACCOUNT_ID}/messages`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      recipient: {
        comment_id: commentId
      },
      message: {
        text: message
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();

    throw new Error(
      `Instagram API error ` +
      `${response.status}: ` +
      `${detail.slice(0, 500)}`
    );
  }
}

export async function checkFollowStatus(
  commenterId,
  env
) {
  try {
    const version = requireGraphApiVersion(
      env.GRAPH_API_VERSION
    );
    const accessToken = requireAccessToken(
      env.INSTAGRAM_ACCESS_TOKEN
    );

    if (
      typeof commenterId !== "string" ||
      !commenterId.trim()
    ) {
      return false;
    }

    const endpoint = new URL(
      `${GRAPH_API_ORIGIN}/${version}/` +
      `${encodeURIComponent(commenterId.trim())}`
    );
    endpoint.searchParams.set(
      "fields",
      "is_user_follow_business"
    );

    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    const payload = await readJsonResponse(response);

    return payload.is_user_follow_business === true;
  } catch (error) {
    console.warn(
      "Instagram follow status could not be verified",
      {
        status: error?.status ?? null,
        code: error?.apiCode ?? null,
        subcode: error?.apiSubcode ?? null,
        type: error?.apiType ?? null
      }
    );
    return false;
  }
}

function requireGraphApiVersion(value) {
  if (!/^v\d+\.\d+$/.test(value)) {
    throw new Error(
      "GRAPH_API_VERSION is not configured"
    );
  }

  return value;
}

function requireAccessToken(value) {
  if (!value) {
    throw new Error(
      "Instagram account credentials are not configured"
    );
  }

  return value;
}

function requireLimit(value) {
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > 100
  ) {
    throw new TypeError(
      "limit must be an integer between 1 and 100"
    );
  }

  return value;
}

function readCursor(value) {
  return typeof value === "string" && value
    ? value
    : null;
}

async function readJsonResponse(response) {
  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `Instagram API error ${response.status}: invalid JSON`
    );
  }

  if (!response.ok) {
    const message =
      typeof payload.error?.message === "string"
        ? payload.error.message
        : "request failed";
    const code = payload.error?.code;
    const codeSuffix =
      typeof code === "number" || typeof code === "string"
        ? ` (code ${code})`
        : "";

    const error = new Error(
      `Instagram API error ${response.status}: ` +
      `${message.slice(0, 300)}${codeSuffix}`
    );
    error.status = response.status;
    error.apiCode = code ?? null;
    error.apiSubcode = payload.error?.error_subcode ?? null;
    error.apiType = payload.error?.type ?? null;
    throw error;
  }

  return payload;
}
