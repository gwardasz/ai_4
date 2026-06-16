const STOP_WORDS = new Set([
  "do",
  "na",
  "w",
  "i",
  "oraz",
  "lub",
]);

export const normalize = (text) =>
  text
    .toLowerCase()
    .replace(/ą/g, "a")
    .replace(/ć/g, "c")
    .replace(/ę/g, "e")
    .replace(/ł/g, "l")
    .replace(/ń/g, "n")
    .replace(/ó/g, "o")
    .replace(/ś/g, "s")
    .replace(/ź/g, "z")
    .replace(/ż/g, "z");

const tokenize = (text) => {
  const normalized = normalize(text);
  return normalized
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
};

const extractVoltages = (text) => {
  const matches = text.match(/\d+\s*v/g) ?? [];
  return matches.map((m) => m.replace(/\s/g, ""));
};

export const clampOutput = (text, min = 4, max = 500) => {
  let out = text;
  while (out.length > 0 && Buffer.byteLength(out, "utf8") > max) {
    out = out.slice(0, -1);
  }
  if (Buffer.byteLength(out, "utf8") < min) {
    return "err=short";
  }
  return out;
};

const cityNamesForItem = (itemCode, data) => {
  const codes = data.citiesByItem.get(itemCode);
  if (!codes) return [];
  return [...codes]
    .map((c) => data.cityByCode.get(c))
    .filter(Boolean)
    .sort();
};

export const findItem = (query, data) => {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return clampOutput("found=0;hint=Podaj typ, moc lub napiecie (np. 48V, 400W, AGM)");
  }

  const queryVoltages = extractVoltages(normalize(query));
  const scored = [];

  for (const item of data.items) {
    const name = normalize(item.name);
    let score = 0;

    for (const token of tokens) {
      if (name.includes(token)) score += 10;
    }

    const nameVoltages = extractVoltages(name);
    for (const qv of queryVoltages) {
      if (nameVoltages.includes(qv)) score += 15;
      else if (nameVoltages.length > 0 && !nameVoltages.includes(qv)) score -= 20;
    }

    if (score > 0) scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return clampOutput("found=0;hint=Podaj typ, moc lub napiecie (np. 48V, 400W, AGM)");
  }

  const top = scored[0];
  const close = scored.filter((s) => top.score - s.score <= 5).slice(0, 3);

  if (close.length > 1) {
    const parts = close.map((s, i) => {
      const cities = cityNamesForItem(s.item.code, data);
      return `${i + 1}:code=${s.item.code}|${s.item.name}|cities=${cities.join(",")}`;
    });
    return clampOutput(`matches=${close.length};${parts.join(";")};refine=params`);
  }

  const cities = cityNamesForItem(top.item.code, data);
  return clampOutput(
    `code=${top.item.code};name=${top.item.name};cities=${cities.join(",")}`,
  );
};

export const findCitiesAll = (params, data) => {
  const codes = [...params.toUpperCase().matchAll(/[A-Z0-9]{6}/g)].map((m) => m[0]);

  if (codes.length < 2) {
    return clampOutput("error=Podaj min. 2 kody po przecinku lub spacji");
  }

  const unique = [...new Set(codes)];
  const unknown = unique.filter((c) => !data.itemByCode.has(c));
  if (unknown.length > 0) {
    return clampOutput(`error=Nieznany kod: ${unknown[0]}`);
  }

  let intersection = null;
  for (const code of unique) {
    const set = data.citiesByItem.get(code) ?? new Set();
    intersection = intersection
      ? new Set([...intersection].filter((c) => set.has(c)))
      : new Set(set);
  }

  const names = [...intersection]
    .map((c) => data.cityByCode.get(c))
    .filter(Boolean)
    .sort();

  if (names.length === 0) {
    return clampOutput("cities=none");
  }

  return clampOutput(`cities=${names.join(",")}`);
};
