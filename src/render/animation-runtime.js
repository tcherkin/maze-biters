import {createLiveSnakeRenderer} from './live-snake.js?v=1.02.11.00';
import {createLiveScorpion} from './live-scorpion.js?v=1.02.16.00';
import {createLiveMouthService} from './live-mouth.js?v=1.02.16.00';
import {loadFantasyPlayerArt,drawFantasySource} from './fantasy-player-art.js?v=1.02.15.03';
import {loadDragonKinArt} from './dragon-kin-art.js?v=1.02.15.01';
import {createContactRuntime, snakeContactShape} from '../engine/contact-runtime.js?v=1.02.06.00';

globalThis.MazeBitersLiveFactory = Object.freeze({
  create(options) {
    const mouth = createLiveMouthService(options);
    const snake = createLiveSnakeRenderer({...options,intakePose:(entity,t,poseOptions)=>mouth.intakePose(entity,t,poseOptions)});
    const scorpion = createLiveScorpion(options);
    const contacts = createContactRuntime();
    const errors = [];
    let prepared = false;
    let preparationGeneration = 0;
    let consumptionEndsAt = 0;
    let playerArt=null,playerArtGeneration=0,legacyPlayers=null;
    let hunterArt=null,hunterArtGeneration=0;
    const legacyHunterGroups=new WeakMap();
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
    async function preparePlayerArt(groups,quality='HD') {
        const generation=++playerArtGeneration,profile=String(quality).toLowerCase();
        legacyPlayers ||= groups.player;
        if(playerArt?.profile===profile&&groups.player===playerArt.groups)return true;
        try {
          const next=await loadFantasyPlayerArt(profile,{makeCanvas:options.makeCanvas});
          if(generation!==playerArtGeneration)return false;
          groups.legacyPlayer=legacyPlayers;
          groups.player=next.groups;groups.fantasyPlayerArtBytes=next.decodedBytes;
          playerArt=next;return true;
        }catch(error){
          if(generation!==playerArtGeneration)return false;
          groups.player=legacyPlayers;groups.fantasyPlayerArtBytes=0;playerArt=null;
          return safe('fantasy-player-art',()=>{throw error;});
        }
    }
    async function prepareHunterArt(groups,quality='HD'){
      const generation=++hunterArtGeneration,profile=String(quality).toLowerCase();
      if(!legacyHunterGroups.has(groups))legacyHunterGroups.set(groups,groups.legacyHunter||groups.hunter);
      const legacyHunters=legacyHunterGroups.get(groups);
      if(hunterArt?.profile===profile&&groups.hunter===hunterArt.groups)return true;
      try{
        const next=await loadDragonKinArt(profile,{makeCanvas:options.makeCanvas});
        if(generation!==hunterArtGeneration)return false;
        groups.legacyHunter=legacyHunters;
        groups.hunter=next.groups;groups.dragonKinArtBytes=next.decodedBytes;
        hunterArt=next;return true;
      }catch(error){
        if(generation!==hunterArtGeneration)return false;
        groups.hunter=legacyHunters;groups.dragonKinArtBytes=0;hunterArt=null;
        return safe('dragon-kin-art',()=>{throw error;});
      }
    }
    return {
      async preparePlayerArt(groups,quality='HD'){
        // Both families settle before the existing engine prepares its mouth
        // cache. Each loader owns its generation and independent fallback.
        const results=await Promise.all([preparePlayerArt(groups,quality),prepareHunterArt(groups,quality)]);
        return results.every(Boolean);
      },
      prepareHunterArt,
      drawPlayerSource(...args){return drawFantasySource(...args);},
      contacts,
      consumptionEndAt() { return consumptionEndsAt; },
      contactReady() { return options.prepareCharacterContacts!==false && prepared && !!snake.getCollisionArt()?.contours && mouth.ready && scorpion.stats.ready; },
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
      drawMouthIntake(ctx,player,t,descriptor,visual) {
        return safe('snake-mouth-intake',()=>snake.drawMouthIntake(ctx,player,t,{mouth,descriptor,visual}));
      },
      drawGhosts(ctx, t, snakeContext=ctx) {
        safe('snake-ghosts', () => snake.drawGhosts(snakeContext, t));
        safe('scorpion-ghosts', () => scorpion.drawGhosts(ctx, t));
      },
      reset() { consumptionEndsAt = 0; snake.reset(); scorpion.reset(); mouth.reset?.(); contacts.reset(); options.resetContacts?.(); options.resetVisuals?.(); },
      diagnostics() {
        const snakeStats=snake.stats(), scorpionStats=scorpion.diagnostics(), mouthStats=mouth.stats;
        return {prepared:prepared&&snakeStats.ready&&scorpionStats.ready&&mouthStats.ready,
          errors: errors.slice(), playerArt:playerArt?{profile:playerArt.profile,size:playerArt.size,revision:playerArt.artRevision,decodedBytes:playerArt.decodedBytes}:null,
          hunterArt:hunterArt?{profile:hunterArt.profile,size:hunterArt.size,revision:hunterArt.artRevision,decodedBytes:hunterArt.decodedBytes}:null,
          snake: snakeStats, scorpion: scorpionStats, mouth: mouthStats, contacts:contacts.diagnostics()};
      }
    };
  }
});
