import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { choice, TypeSafeClient } from '@typesafe-ai/sdk';
import { chebyshev, directionOf, hunterCanReach, manhattan, samePos } from '../geo.js';
const PORT = Number(process.env.JEV_PORT) || 8787;
const CORS_ORIGIN = process.env.JEV_CORS_ORIGIN || '*';
const GAME_RULES = {
    objective: 'The hunter wins by occupying the same cell as the witch. The witch wins by still being on a different cell after the last watch.',
    hunterMovement: 'The hunter must move every turn, 1 or 2 cells orthogonally (north/south/east/west). No diagonals and no staying. Slow hunt limits this to 1 cell. hunterMaxStep is the current limit.',
    witchMovement: 'On a normal watch the witch must move exactly 1 cell in one of the 8 directions, including diagonal. She cannot stay unless this is a bound watch.',
    boundWatch: 'Every witchStayInterval-th watch (turn % witchStayInterval === 0, and turn > 0) the witch must hold still. The hunter then learns Manhattan (road) distance to her.',
    coordinates: 'The board is a square grid. Origin (0, 0) is the top-left cell. x increases east. y increases south. Cells are named like chess files: A1 is (0, 0).',
    information: 'After the witch acts, the hunter always learns the bearing of that action. The hunter does not see the witch unless they share a cell. The witch knows the hunter’s cell.',
};
const DIR_LABEL = {
    N: 'north (−y)',
    NE: 'northeast (+x, −y)',
    E: 'east (+x)',
    SE: 'southeast (+x, +y)',
    S: 'south (+y)',
    SW: 'southwest (−x, +y)',
    W: 'west (−x)',
    NW: 'northwest (−x, −y)',
    STAY: 'hold still (no cell change)',
};
const CORS = {
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};
let client;
function loadDotEnv() {
    try {
        const text = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
        for (const line of text.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }
            const eq = trimmed.indexOf('=');
            if (eq === -1) {
                continue;
            }
            const key = trimmed.slice(0, eq).replace(/^export\s+/, '').trim();
            let value = trimmed.slice(eq + 1).trim();
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            if (process.env[key] === undefined) {
                process.env[key] = value;
            }
        }
    }
    catch {
        // no .env in cwd
    }
}
function getClient() {
    if (!client) {
        client = new TypeSafeClient();
    }
    return client;
}
function cellName(pos) {
    return `${String.fromCharCode(65 + pos.x)}${pos.y + 1}`;
}
function describePos(pos) {
    return { x: pos.x, y: pos.y, cell: cellName(pos) };
}
function moveCriteria(input) {
    const criteria = {};
    for (const dest of input.options) {
        const direction = directionOf(input.witch, dest);
        const landsOnHunter = samePos(dest, input.hunter);
        const hunterCanReachNextTurn = hunterCanReach(input.hunter, dest, input.hunterMaxStep);
        const parts = [
            `Move ${DIR_LABEL[direction]} to ${cellName(dest)} (${dest.x}, ${dest.y}).`,
            `Manhattan to hunter: ${manhattan(dest, input.hunter)}.`,
            `Chebyshev to hunter: ${chebyshev(dest, input.hunter)}.`,
            landsOnHunter
                ? 'This lands on the hunter and loses immediately.'
                : hunterCanReachNextTurn
                    ? 'The hunter can reach this cell on their next turn.'
                    : 'The hunter cannot reach this cell on their next turn.',
        ];
        criteria[direction] = parts.join(' ');
    }
    return criteria;
}
async function askJev(input) {
    const criteria = moveCriteria(input);
    const possibleMoves = input.options.map((dest) => {
        const direction = directionOf(input.witch, dest);
        return {
            direction,
            destination: describePos(dest),
            manhattanToHunter: manhattan(dest, input.hunter),
            chebyshevToHunter: chebyshev(dest, input.hunter),
            hunterCanReachNextTurn: hunterCanReach(input.hunter, dest, input.hunterMaxStep),
            landsOnHunter: samePos(dest, input.hunter),
        };
    });
    const response = await getClient().systemOne({
        state: {
            rules: GAME_RULES,
            current: {
                boardSize: input.boardSize,
                turn: input.turn,
                maxTurns: input.maxTurns,
                witchStayInterval: input.witchStayInterval,
                witchMustHoldStill: input.mustStay,
                hunterMaxStep: input.hunterMaxStep,
                hunter: describePos(input.hunter),
                witch: describePos(input.witch),
                manhattanNow: manhattan(input.hunter, input.witch),
                lastManhattanPulse: input.lastManhattan,
                hunterReachableNextTurn: input.hunterReachableNextTurn.map(describePos),
                lastWatchOfHunt: input.turn >= input.maxTurns,
            },
            possibleMoves,
        },
        questions: {
            direction: choice('Which direction from `possibleMoves` should the witch take this turn to best evade the hunter? The witch wins if she is still off the hunter’s cell after watch `current.maxTurns`. Never pick a move with `landsOnHunter` true if any other option exists. Prefer destinations the hunter cannot reach next turn, off the hunter’s orthogonal lines, with more distance and room to keep moving.', criteria),
        },
    });
    return response.answers.direction.choice;
}
function send(res, status, body) {
    const json = JSON.stringify(body);
    res.writeHead(status, {
        ...CORS,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(json),
    });
    res.end(json);
}
function readBody(req) {
    return new Promise((resolveBody, reject) => {
        const chunks = [];
        req.on('data', (chunk) => {
            chunks.push(chunk);
        });
        req.on('end', () => {
            resolveBody(Buffer.concat(chunks).toString('utf8'));
        });
        req.on('error', reject);
    });
}
function isPos(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const pos = value;
    return Number.isFinite(pos.x) && Number.isFinite(pos.y);
}
function isWitchTurnInput(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const input = value;
    return isPos(input.hunter) && isPos(input.witch) && Array.isArray(input.options);
}
async function handle(req, res) {
    const url = req.url ?? '/';
    const path = url.split('?')[0];
    const isJevPath = path === '/' || path === '/jev';
    if (req.method === 'OPTIONS' && isJevPath) {
        res.writeHead(204, CORS);
        res.end();
        return;
    }
    if (req.method === 'GET' && isJevPath) {
        send(res, 200, { ok: true });
        return;
    }
    if (req.method !== 'POST' || !isJevPath) {
        send(res, 404, { error: 'Not found' });
        return;
    }
    let parsed;
    try {
        parsed = JSON.parse(await readBody(req));
    }
    catch {
        send(res, 400, { error: 'Invalid JSON' });
        return;
    }
    if (!isWitchTurnInput(parsed) || parsed.options.length === 0) {
        send(res, 400, { error: 'Invalid witch turn' });
        return;
    }
    if (parsed.options.length === 1 || parsed.mustStay) {
        send(res, 200, { direction: directionOf(parsed.witch, parsed.options[0]) });
        return;
    }
    try {
        send(res, 200, { direction: await askJev(parsed) });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Jev request failed';
        send(res, 502, { error: message });
    }
}
loadDotEnv();
createServer((req, res) => {
    void handle(req, res).catch(() => {
        send(res, 500, { error: 'Server error' });
    });
}).listen(PORT, () => {
    console.log(`Jev server http://127.0.0.1:${PORT}/jev`);
});
//# sourceMappingURL=jev-server.js.map