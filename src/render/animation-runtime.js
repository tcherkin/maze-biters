import {createLiveSnakeRenderer} from './live-snake.js?v=1.02.03.00';
import {createLiveScorpion} from './live-scorpion.js?v=1.02.03.00';
import {createLiveMouthService} from './live-mouth.js?v=1.02.03.00';
import {createContactRuntime, snakeContactShape} from '../engine/contact-runtime.js?v=1.02.03.00';

globalThis.MazeBitersLiveFactory = Object.freeze({
  create(options) {
    const snake = createLiveSnakeRenderer(options);
    const scorpion = createLiveScorpion(options);
    const mouth = createLiveMouthService(options);
    const contacts = createContactRuntime();
    const errors = [];
    let prepared = false;
    let preparationGeneration = 0;
    let consumptionEndsAt = 0;
    const safe = (name, action) => {
      try { return action(); }
      catch (error) {
        if (!errors.some(item => item.name === name)) {
          errors.push({name, message: String(error?.message || error)});
          console.error(`Animation ${name}: native fallback retained`, error);
        }
        return false;
      }
    };
    function mouthEvent(player, plan, t, duration = 90) {
      if (Number.isFinite(plan?.endAt)) consumptionEndsAt = Math.max(consumptionEndsAt, plan.endAt);
      if (!player) return;
      const start = plan?.visualStart ?? t + .35 * Math.max(0, player.moveDuration || 0);
      mouth.bite(player, start, plan?.duration ?? duration, t);
    }
    function guarded(name, service) {
      const methods = new Map();
      return new Proxy({}, {get(target, key) {
        const value = service[key];
        if (typeof value !== 'function') return value;
        if (!methods.has(key)) methods.set(key, (...args) => safe(`${name}.${String(key)}`,
          () => value.apply(service, args)));
        return methods.get(key);
      }});
    }
    return {
      contacts,
      consumptionEndAt() { return consumptionEndsAt; },
      contactReady() { return prepared && !!snake.getCollisionArt()?.contours && mouth.ready && scorpion.stats.ready; },
      snakeShape(entity,t,out) { return snakeContactShape(snake,entity,t,out); },
      snake: guarded('snake', snake), scorpion: guarded('scorpion', scorpion), mouth: guarded('mouth', mouth),
      async prepare(groups) {
        const generation = ++preparationGeneration;
        let succeeded = true;
        for (const [name, service, args] of [['snake', snake, []], ['scorpion', scorpion, []], ['mouth', mouth, [groups]]]) {
          try {
            const result = await service.prepare(...args);
            if (generation !== preparationGeneration) return false;
            if (result === false) throw Error(`${name} animation cache unavailable`);
          }
          catch (error) {
            if (generation !== preparationGeneration) return false;
            succeeded = false; safe(name, () => { throw error; });
          }
        }
        prepared = succeeded;
        return succeeded;
      },
      snakeBite(kind, entity, token, player, t, created = [], index = -1) {
        const plan = safe(`snake-${kind}`, () => kind === 'tail'
          ? snake.biteTail(entity, token, {t, player})
          : kind === 'split' ? snake.split(entity, created, token, {t, index, player})
          : snake.consume(entity, token, {t, player}));
        mouthEvent(player, plan, t, kind === 'head' ? 140 : 85);
      },
      scorpionBite(entity, player, t, atTail) {
        const plan = safe('scorpion-bite', () => scorpion.consume(entity, player, t, {atTail}));
        mouthEvent(player, plan, t, atTail ? 220 : 140);
      },
      characterBite(player, t, duration = 90) { mouthEvent(player, null, t, duration); },
      drawGhosts(ctx, t) {
        safe('snake-ghosts', () => snake.drawGhosts(ctx, t));
        safe('scorpion-ghosts', () => scorpion.drawGhosts(ctx, t));
      },
      reset() { consumptionEndsAt = 0; snake.reset(); scorpion.reset(); mouth.reset?.(); contacts.reset(); options.resetContacts?.(); },
      diagnostics() {
        const snakeStats=snake.stats(), scorpionStats=scorpion.diagnostics(), mouthStats=mouth.stats;
        return {prepared:prepared&&snakeStats.ready&&scorpionStats.ready&&mouthStats.ready,
          errors: errors.slice(), snake: snakeStats, scorpion: scorpionStats, mouth: mouthStats, contacts:contacts.diagnostics()};
      }
    };
  }
});
