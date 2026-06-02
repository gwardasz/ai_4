import { resolve } from "node:path";
import { resolveModelForProvider } from "../../../config.js";

// Centralna konfiguracja agenta sendit. Bez efektow ubocznych przy imporcie.

export const MAX_TOOL_ROUNDS = Number(process.env.MAX_TOOL_ROUNDS ?? 40);
export const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";
export const LOG_CONSOLE = process.env.LOG_CONSOLE ?? "all";

export const model = resolveModelForProvider("gpt-5-mini");  // gpt-5.2
export const visionModel = resolveModelForProvider("gpt-5-mini");  // gpt-5.2
export const maxOutputTokens = 16384;

// Adres huba czytamy z .env (poza repo); .env jest ladowany przez wspolny config powyzej.
const HUB_BASE_URL = process.env.HUB_BASE_URL?.trim().replace(/\/+$/, "");
if (!HUB_BASE_URL) {
  throw new Error("Missing HUB_BASE_URL in environment (.env). Set HUB_BASE_URL=https://<host>.");
}

// Dokumentacja SPK oraz endpoint weryfikacji - wyprowadzone z bazowego adresu huba.
export const DOC_BASE_URL = `${HUB_BASE_URL}/dane/doc/`;
export const DOC_ENTRY_URL = `${HUB_BASE_URL}/dane/doc/index.md`;
export const VERIFY_URL = `${HUB_BASE_URL}/verify`;
export const TASK_NAME = "sendit";

// Sandbox: agent operuje wylacznie w tym katalogu.
export const WORKSPACE_ROOT = resolve(import.meta.dirname, "..", "workspace");

// Dane przesylki z tresci zadania - jedno zrodlo prawdy, wstrzykiwane do instrukcji.
export const shipment = {
  sender: "450202122",
  origin: "Gdańsk",
  destination: "Żarnowiec",
  weightKg: 2800,
  budgetPP: 0,
  contents: "kasety z paliwem do reaktora",
  specialRemarks: "brak"
};

export const instructions = `You are an autonomous logistics-documentation agent. Your single goal is to produce a correct shipment declaration for the "System Przesyłek Konduktorskich" (SPK) and submit it until it is accepted.

## GOAL
Fill in the SPK transport declaration EXACTLY according to the template found in the documentation, then submit it. You succeed only when the verification service returns a flag in the form {FLG:...}.

## SHIPMENT DATA (authoritative — do not invent other values)
- Sender ID (nadawca): ${shipment.sender}
- Origin (punkt nadawczy): ${shipment.origin}
- Destination (punkt docelowy): ${shipment.destination}
- Weight: ${shipment.weightKg} kg (2,8 tony)
- Budget: ${shipment.budgetPP} PP — the shipment MUST be free or financed by the System
- Contents (zawartość): ${shipment.contents}
- Special remarks (uwagi specjalne): ${shipment.specialRemarks} — DO NOT add any special remarks

## AVAILABLE TOOLS & HOW TO USE FILES
- The documentation lives at remote URLs. You cannot "see" a URL directly — first download it with http_fetch, which saves it into the local workspace and returns a local path.
- Start by fetching the entry document, then follow every link you find (regulations, fee tables, route lists, declaration template, attachments).
- Some documents are NOT text — they are images. For an image, use understand_image on its local path to read its contents (ask precise questions).
- Use fs_read to read saved files and fs_search to locate files or content across the workspace.
- Use fs_write to keep working notes or draft versions of the declaration if helpful.
- Submit the finished declaration with submit_declaration.

## RULES & CONSTRAINTS
- Read the WHOLE documentation, not only the entry file. Categories, fees, route codes and the declaration template may be spread across several files/attachments.
- Determine the correct route code for ${shipment.origin} → ${shipment.destination} from the connection network / route list.
- The budget is 0 PP: identify which shipment category is financed by the System (or free) and use it.
- Resolve any abbreviation you don't understand using the documentation.
- The declaration format is STRICT: reproduce the template's field order, labels, separators and formatting EXACTLY. Output the full declaration text, nothing extra.
- Add NO special remarks.

## RECOVERY
- If submit_declaration is rejected, read the returned error message carefully — it contains hints about what to fix. Adjust the declaration and submit again.
- If a tool reports an error or hint, act on it before retrying.

Work autonomously. When the flag is returned, report it and stop.`;
