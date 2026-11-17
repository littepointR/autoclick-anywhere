# Contributing to AutoClick Anywhere

Thank you for contributing to **AutoClick Anywhere**!

## Development Setup

Requirements:
- **Node.js >= 23.6.0** (uses native TypeScript type-stripping for `node --test`)

```bash
git clone https://github.com/littepointR/autoclick-anywhere.git
cd autoclick-anywhere
npm install
```

## Common Commands

```bash
npm run typecheck   # Run strict TypeScript checking (tsc --noEmit)
npm test            # Run all unit & integration tests (node --test tests/*.test.ts)
npm run build       # Generate PNG icons and bundle MV3 assets into dist/
npm run package     # Build dist/ and package release/autoclick-anywhere-v*.zip
npm run playground  # Serve dist/ locally on http://127.0.0.1:4173/playground.html
```

## Project Structure

- `src/shared/` — Types, defaults, smart DOM/Shadow-DOM/Canvas target locators, timing & storage helpers
- `src/engine/` — `DomDispatcher`, unified `ActionRunner`, and `MacroRecorder`
- `src/background/` — Manifest V3 service worker managing `chrome.debugger` CDP input sessions & shortcuts
- `src/content/` — Shadow DOM floating HUD, interactive target picker, draggable pin overlay, visual ripples
- `src/popup/` — Browser action popup UI
- `src/playground/` — Self-contained DOM + 2D Canvas + WebGL test arena
- `tests/` — Automated tests using `node:test` and `jsdom`
- `scripts/` — Icon generator, `esbuild` bundler, local playground server, and release ZIP packager

## Pull Request Guidelines

1. Ensure `npm run typecheck`, `npm test`, and `npm run build` all pass with zero errors.
2. Add or update unit tests in `tests/` when changing dispatchers, locators, runner state transitions, or recorder behavior.
3. Keep changes focused and preserve existing code style and comments.
