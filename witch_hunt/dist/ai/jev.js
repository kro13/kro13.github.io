import { directionOf } from '../geo.js';
import { chooseWitchMove as chooseHeuristicWitchMove } from './ai.js';
import { JEV_URL } from './jev-config.js';
function jevUrl() {
    if (typeof window !== 'undefined') {
        const fromWindow = window.JEV_URL;
        if (fromWindow) {
            return fromWindow;
        }
    }
    return JEV_URL;
}
function fallbackMove(input) {
    return chooseHeuristicWitchMove(input.options, input.hunter, input.boardSize, input.hunterMaxStep);
}
async function askJev(input) {
    const response = await fetch(jevUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });
    if (!response.ok) {
        throw new Error(`Jev server ${response.status}`);
    }
    const body = await response.json();
    const direction = body && typeof body === 'object' && 'direction' in body
        ? body.direction
        : undefined;
    if (typeof direction !== 'string' || direction.length === 0) {
        throw new Error('Jev server returned no direction');
    }
    return direction;
}
export async function chooseWitchMove(input) {
    if (input.options.length === 0) {
        return { ...input.witch };
    }
    if (input.options.length === 1 || input.mustStay) {
        return { ...input.options[0] };
    }
    const allowed = new Set(input.options.map((pos) => directionOf(input.witch, pos)));
    try {
        const picked = await askJev(input);
        if (!allowed.has(picked)) {
            console.warn('Jev picked an illegal witch direction; using heuristic', picked);
            return fallbackMove(input);
        }
        const dest = input.options.find((pos) => directionOf(input.witch, pos) === picked);
        return dest ? { ...dest } : fallbackMove(input);
    }
    catch (error) {
        console.warn('Jev witch move failed; using heuristic', error);
        return fallbackMove(input);
    }
}
//# sourceMappingURL=jev.js.map