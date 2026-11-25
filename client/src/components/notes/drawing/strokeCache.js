import { cleanStroke } from './geometry';

// Stored strokes are checked once and the result reused, so paths aren't rebuilt for
// strokes that didn't change.
const cleaned = new WeakMap();
export function clean(stroke) {
    if (stroke && typeof stroke === 'object' && cleaned.has(stroke)) return cleaned.get(stroke);
    const result = cleanStroke(stroke);
    if (result) cleaned.set(result, result);
    if (stroke && typeof stroke === 'object' && result) cleaned.set(stroke, result);
    return result;
}

export const cleanList = (raw) => (Array.isArray(raw) ? raw.map(clean).filter(Boolean) : []);
