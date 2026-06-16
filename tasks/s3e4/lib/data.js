import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

const parseCsvLine = (line) => {
  const idx = line.lastIndexOf(",");
  return { name: line.slice(0, idx), code: line.slice(idx + 1) };
};

const readCsv = (filename) =>
  fs
    .readFileSync(path.join(DATA_DIR, filename), "utf8")
    .trim()
    .split("\n")
    .slice(1);

export const loadData = () => {
  const items = readCsv("items.csv").map(parseCsvLine);
  const cities = readCsv("cities.csv").map(parseCsvLine);
  const connections = readCsv("connections.csv").map((line) => {
    const [itemCode, cityCode] = line.split(",");
    return { itemCode, cityCode };
  });

  const cityByCode = new Map(cities.map((c) => [c.code, c.name]));
  const itemByCode = new Map(items.map((i) => [i.code, i.name]));
  const citiesByItem = new Map();

  for (const { itemCode, cityCode } of connections) {
    if (!citiesByItem.has(itemCode)) citiesByItem.set(itemCode, new Set());
    citiesByItem.get(itemCode).add(cityCode);
  }

  return { items, cityByCode, itemByCode, citiesByItem };
};
