export const validateBBox = (bbox) => {
  const { x1, y1, x2, y2 } = bbox ?? {};
  for (const value of [x1, y1, x2, y2]) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1000) {
      throw new Error(`Invalid bbox coordinate: ${value}. Expected numbers 0–1000.`);
    }
  }
  if (x1 >= x2 || y1 >= y2) {
    throw new Error(`Invalid bbox: x1 must be < x2 and y1 must be < y2. Got ${JSON.stringify(bbox)}`);
  }
  return { x1, y1, x2, y2 };
};
