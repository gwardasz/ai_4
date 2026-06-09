const MAIL_ID_KEYS = ["messageID", "messageId", "rowID", "rowId", "id"];

export const isMailRecord = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return MAIL_ID_KEYS.some((key) => value[key] != null && value[key] !== "");
};

export const extractMailId = (mail) => {
  if (!isMailRecord(mail)) return null;
  for (const key of MAIL_ID_KEYS) {
    if (mail[key] != null && mail[key] !== "") {
      return String(mail[key]);
    }
  }
  return null;
};

export const normalizeMessages = (data) => {
  if (!data) return [];

  if (Array.isArray(data.items)) return data.items.filter(isMailRecord);
  if (Array.isArray(data.messages)) return data.messages.filter(isMailRecord);
  if (Array.isArray(data)) return data.filter(isMailRecord);
  if (isMailRecord(data)) return [data];

  return [];
};

export const pickMailBody = (messages, fallbackHit = null) => {
  const first = messages.find(isMailRecord);
  if (first) return first;
  if (isMailRecord(fallbackHit)) return fallbackHit;
  return null;
};

export const getMailText = (savedOrBody) => {
  if (!savedOrBody || typeof savedOrBody !== "object") return null;
  if (typeof savedOrBody.bodyText === "string") return savedOrBody.bodyText;
  if (typeof savedOrBody.body?.message === "string") return savedOrBody.body.message;
  if (typeof savedOrBody.message === "string" && isMailRecord(savedOrBody)) {
    return savedOrBody.message;
  }
  return null;
};

export const buildSavedMail = ({ id, query, metadata, body, fetchedAt }) => {
  const bodyRecord = isMailRecord(body) ? body : null;
  const saved = {
    id: String(id),
    fetchedAt: fetchedAt ?? new Date().toISOString(),
    body: bodyRecord,
    bodyText: getMailText({ body: bodyRecord })
  };

  if (query != null) saved.query = query;
  if (metadata && isMailRecord(metadata)) saved.metadata = metadata;

  return saved;
};
