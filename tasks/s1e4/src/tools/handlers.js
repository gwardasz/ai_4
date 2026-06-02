import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { fetchDoc } from "../services/docs-api.js";
import { submitDeclaration } from "../services/verify-api.js";
import { fsRead } from "../fs/read.js";
import { fsSearch } from "../fs/search.js";
import { fsWrite } from "../fs/write.js";
import { vision } from "../vision.js";
import { resolveInWorkspace, SandboxError } from "../utils/paths.js";

const MIME_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp"
};

const mimeFor = (path) => MIME_TYPES[extname(path).toLowerCase()] ?? "image/jpeg";

// Wykrywa flage {FLG:...} w dowolnym miejscu odpowiedzi serwisu.
const findFlag = (value) => {
  const match = /\{\{?FLG:[^}]+\}?\}/i.exec(JSON.stringify(value ?? ""));
  return match ? match[0] : null;
};

// Handlery sa cienkie: deleguja do warstw i ujednolicaja ksztalt odpowiedzi.
// recoveryHints / hint podpowiada modelowi nastepny krok (wg lekcji).
export const handlers = {
  async http_fetch({ url }) {
    try {
      const { savedPath, kind, text, contentType } = await fetchDoc(url);
      return {
        success: true,
        data: { path: savedPath, kind, contentType, ...(text !== undefined ? { text } : {}) },
        recoveryHints:
          kind === "image"
            ? `Saved image to ${savedPath}. Use understand_image on this path to read its contents.`
            : kind === "binary"
              ? `Saved binary to ${savedPath}. It is not text; if it is a document image, try understand_image.`
              : `Saved ${savedPath}. Follow any links you find with another http_fetch (relative paths are allowed).`
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        recoveryHints: "Check the URL/path. It must point to the SPK documentation host. Retry with a corrected URL."
      };
    }
  },

  fs_read(args) {
    return fsRead(args);
  },

  fs_search(args) {
    return fsSearch(args);
  },

  fs_write(args) {
    return fsWrite(args);
  },

  async understand_image({ image_path, question }) {
    let absolute;
    try {
      absolute = resolveInWorkspace(image_path);
    } catch (error) {
      if (error instanceof SandboxError) {
        return { success: false, message: error.message, recoveryHints: "Pass an image path relative to the workspace (download it first with http_fetch)." };
      }
      throw error;
    }

    try {
      const buffer = await readFile(absolute);
      const answer = await vision({
        imageBase64: buffer.toString("base64"),
        mimeType: mimeFor(image_path),
        question
      });
      return {
        success: true,
        data: { image_path, answer },
        recoveryHints: "If you need more detail, ask understand_image another, more specific question about the same image."
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        recoveryHints: "Make sure the image was downloaded with http_fetch and the path is correct."
      };
    }
  },

  async submit_declaration({ declaration }) {
    if (typeof declaration !== "string" || !declaration.trim()) {
      return { success: false, message: "Empty declaration.", recoveryHints: "Provide the full declaration text formatted exactly as the template." };
    }

    try {
      const { ok, status, data } = await submitDeclaration(declaration);
      const flag = findFlag(data);

      if (flag) {
        return { success: true, data, flag, recoveryHints: "Task solved. Report the flag and stop." };
      }

      return {
        success: ok,
        data,
        recoveryHints: ok
          ? "Submission accepted but no flag detected. Re-check the response message for further instructions."
          : `Rejected (status ${status}). Read the response message carefully — it indicates what to fix in the declaration — then submit again.`
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        recoveryHints: error.kind === "config"
          ? "AI_DEVS_API_KEY is missing in the environment; it cannot be fixed by retrying."
          : "Transient issue reaching the verification service. You may retry the same submission once."
      };
    }
  }
};
