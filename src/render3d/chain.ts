// The path a leader has walked now lives in the game rules (src/game/trail.ts), because who can be cut out of a chain is
// decided there; the renderer uses the same class on its smoothly interpolated positions.
export { Trail, type TrailPoint } from '../game/trail.ts';
