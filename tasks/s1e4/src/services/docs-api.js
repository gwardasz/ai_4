import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname } from "node:path";
import { DOC_BASE_URL, WORKSPACE_ROOT } from "../config.js";
import { resolveInWorkspace, toWorkspaceRelative, SandboxError } from "../utils/paths.js";

const BASE = new URL(DOC_BASE_URL);

const TEXT_EXTENSIONS = new Set([".md", ".txt", ".json", ".csv", ".html", ".htm", ".xml", ".yaml", ".yml", ".js", ".css"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"]);

// Klasyfikacja zasobu: tekst (mozemy zwrocic tresc), obraz (-> understand_image) lub inne binaria.
const classify = (contentType, ext) => {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.startsWith("image/") || IMAGE_EXTENSIONS.has(ext)) return "image";
  if (ct.startsWith("text/") || ct.includes("json") || ct.includes("markdown") || ct.includes("xml") || TEXT_EXTENSIONS.has(ext)) {
    return "text";
  }
  return "binary";
};

// Zamienia URL (pelny lub wzgledny) na bezpieczna sciezke w obrebie workspace.
// Zachowuje strukture sciezki wzgledem bazy dokumentacji, by linki rozwiazywaly sie poprawnie.
const localPathFor = (url) => {
  let relative;
  if (url.pathname.startsWith(BASE.pathname)) {
    relative = url.pathname.slice(BASE.pathname.length);
  } else {
    relative = url.pathname.replace(/^\/+/, "");
  }
  relative = relative.replace(/\/+$/, "");
  if (!relative) relative = "index";
  return resolveInWorkspace(relative);
};

/**
 * Pobiera plik dokumentacji do workspace.
 * @param {string} input - pelny URL lub sciezka/nazwa wzgledem bazy dokumentacji.
 * @returns {Promise<{ savedPath: string, kind: "text"|"image"|"binary", text?: string, contentType: string }>}
 */
export const fetchDoc = async (input) => {
  let url;
  try {
    url = new URL(input, DOC_BASE_URL);
  } catch {
    throw new Error(`Invalid URL: ${input}`);
  }

  if (url.host !== BASE.host) {
    throw new Error(`Refusing to fetch from a different host: ${url.host}. Only ${BASE.host} documentation is allowed.`);
  }

  const response = await fetch(url, { headers: { "User-Agent": "ai-devs-sendit-agent" } });
  if (!response.ok) {
    throw new Error(`Fetch failed (${response.status}) for ${url.href}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const ext = extname(url.pathname).toLowerCase();
  const kind = classify(contentType, ext);

  const absolute = localPathFor(url);
  if (!absolute.startsWith(WORKSPACE_ROOT)) {
    throw new SandboxError("Resolved path is outside the workspace.");
  }
  await mkdir(dirname(absolute), { recursive: true });

  if (kind === "text") {
    const text = await response.text();
    await writeFile(absolute, text, "utf-8");
    return { savedPath: toWorkspaceRelative(absolute), kind, text, contentType };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(absolute, buffer);
  return { savedPath: toWorkspaceRelative(absolute), kind, contentType };
};
