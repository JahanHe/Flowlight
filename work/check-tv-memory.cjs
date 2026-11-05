// The TV renderer now stores half canvases and small material textures. Inspect the current
// allocation contract, including all cloud palettes, 12 fonts, seconds, flips and context loss.
require('./check-tv-render-budget.cjs');
