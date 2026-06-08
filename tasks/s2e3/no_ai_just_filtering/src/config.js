const HUB_BASE_URL = process.env.HUB_BASE_URL?.trim().replace(/\/+$/, "");
if (!HUB_BASE_URL) {
  throw new Error("Missing HUB_BASE_URL in environment (.env). Set HUB_BASE_URL=https://<host>.");
}

export const VERIFY_URL = `${HUB_BASE_URL}/verify`;
export const TASK_NAME = "failure";