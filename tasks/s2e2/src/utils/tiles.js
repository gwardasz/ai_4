export const DIRECTIONS = ["N", "E", "S", "W"];
const ROTATE_CW = { N: "E", E: "S", S: "W", W: "N" };

export const rotateConnections = (connections, times = 1) => {
  const steps = ((times % 4) + 4) % 4;
  let result = [...connections];
  for (let i = 0; i < steps; i++) {
    result = result.map((dir) => ROTATE_CW[dir]);
  }
  return [...result].sort();
};

export const normalizeConnections = (connections) =>
  [...new Set(connections)].filter((dir) => DIRECTIONS.includes(dir)).sort();
