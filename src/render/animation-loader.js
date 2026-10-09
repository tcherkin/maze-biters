// Load presentation services before the unchanged classic engine bootstrap.
// A failed optional cache must never prevent the maze/game from starting.
try {
  await import('./animation-runtime.js?v=1.02.03.00');
} catch (error) {
  globalThis.__mazeBitersAnimationLoadError = String(error?.stack || error);
  console.error('Animation integration could not load; native renderer retained.', error);
}
await import('../engine/game.js?v=1.02.03.00');
