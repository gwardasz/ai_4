import { mkdir, rm, copyFile } from "fs/promises";
import { resolve, relative } from "path";
import { fileURLToPath } from "url";
import { sandbox } from "../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "../");

export const initializeSandbox = async () => {
  await rm(sandbox.root, { recursive: true, force: true });
  await mkdir(sandbox.root, { recursive: true });
  
  const sourcePath = resolve(__dirname, "../../data/suspects.json"); 
  const destPath = resolveSandboxPath("suspects.json");
  
  try {
    await copyFile(sourcePath, destPath);
    console.log("✅ File suspects.json copied to sandbox.");
  } catch (error) {
    console.warn(`⚠️ Warning: Failed to copy suspects.json. Ensure the file exists at: ${sourcePath}`);
    console.warn(`Details: ${error.message}`);
  }
};

export const resolveSandboxPath = (relativePath) => {
  const resolved = resolve(sandbox.root, relativePath);
  const rel = relative(sandbox.root, resolved);

  if (rel.startsWith("..") || resolve(rel) === resolved) {
    throw new Error(`Access denied: path "${relativePath}" is outside sandbox`);
  }

  return resolved;
};
