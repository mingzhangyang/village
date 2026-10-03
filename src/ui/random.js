// UI-only choices must not advance a world's deterministic simulation stream.
export const pickUi = values => values[Math.floor(Math.random() * values.length)];
