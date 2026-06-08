import { createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const inputFile = resolve(__dirname, '../workspace', 'logs.txt');
export const outputFile = resolve(__dirname, '../workspace', 'logs_filtered.txt');

export const TARGET_TAGS = ['[CRIT]']

const getLogContent = (line) => {
  const index = line.indexOf('] ');
  return index !== -1 ? line.substring(index) : line;
};

export async function findUniqueTags() {
  const fileStream = createReadStream(inputFile);
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });
  const tags = new Set();

  for await (const line of rl) {
    const match = line.match(/^\[.*?\] \[([A-Z]+)\]/);
    if (match && match[1]) tags.add(match[1]);
  }
  return Array.from(tags);
}

export async function filterLogs(tagsToFilter = []) {
  const fileStream = createReadStream(inputFile);
  const outStream = createWriteStream(outputFile);
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

  const seenContents = new Set();
  let count = 0;

  for await (const line of rl) {
    const isTargetTag = tagsToFilter.some(tag => line.includes(tag));
    
    if (isTargetTag) {
      const content = getLogContent(line);
      
      if (!seenContents.has(content)) {
        seenContents.add(content);
        outStream.write(line + '\n');
        count++;
      }
    }
  }

  outStream.end();
  return count;
}