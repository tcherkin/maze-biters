// Load presentation services before the unchanged classic engine bootstrap.
// A failed optional cache must never prevent the maze/game from starting.
try {
  await import('./animation-runtime.js?v=1.02.16.00');
} catch (error) {
  globalThis.__mazeBitersAnimationLoadError = String(error?.stack || error);
  console.error('Animation integration could not load; native renderer retained.', error);
}
try {
  await import('./snake-neon.js?v=1.02.16.02');
} catch (error) {
  globalThis.__mazeBitersNeonLoadError=String(error?.stack||error);
  console.error('Snake lighting unavailable; native animation retained.',error);
}
try {
  globalThis.MazeBitersSceneVisibility = await import('./scene-visibility.js?v=1.02.07.00');
} catch (error) {
  globalThis.__mazeBitersVisibilityLoadError=String(error?.stack||error);
  console.error('Render culling unavailable; complete scene rendering retained.',error);
}
await import('../engine/game.js?v=1.02.16.02');
