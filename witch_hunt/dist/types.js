export const DEFAULT_CONFIG = {
    boardSize: 5,
    maxTurns: 25,
    witchStayInterval: 5,
};
export const DIRECTIONS = [
    { key: 'N', dx: 0, dy: -1 },
    { key: 'NE', dx: 1, dy: -1 },
    { key: 'E', dx: 1, dy: 0 },
    { key: 'SE', dx: 1, dy: 1 },
    { key: 'S', dx: 0, dy: 1 },
    { key: 'SW', dx: -1, dy: 1 },
    { key: 'W', dx: -1, dy: 0 },
    { key: 'NW', dx: -1, dy: -1 },
    { key: 'STAY', dx: 0, dy: 0 },
];
export const DIR_BY_KEY = Object.fromEntries(DIRECTIONS.map((d) => [d.key, d]));
//# sourceMappingURL=types.js.map