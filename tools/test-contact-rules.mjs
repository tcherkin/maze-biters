import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/engine/game.js', import.meta.url), 'utf8');
const baseline = readFileSync(new URL('./baseline/game-v1.01.94.00.js', import.meta.url), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
function declaration(text, name) {
  const start = text.search(new RegExp(`\\bfunction\\s+${name}\\s*\\(`));
  assert.ok(start >= 0, `Missing ${name}`);
  for (let end = text.indexOf('}', start); end >= 0; end = text.indexOf('}', end + 1)) {
    const candidate = text.slice(start, end + 1);
    try { new vm.Script(candidate); return candidate; } catch {}
  }
  throw Error(`Unterminated ${name}`);
}
const snakeFunctions = ['snakeBiteFragments', 'snakeHeadContactIsSafe', 'powerEatSnakeHead', 'checkSnakeContact'];
const physicalFunctions = ['physicalContactActive', 'resolveSnakePartContact', 'checkPhysicalSnakeContact', 'eatHunter', 'checkPhysicalHunterContact',
  'killScorpion', 'checkPhysicalScorpionContact', 'isCompetitiveMode', 'canPlayerEatPlayer', 'playerWinsContactPriority',
  'eatCompetingPlayer', 'checkPhysicalPlayerContact', 'playerContactBlocksMovement', 'resolvePlayerContact',
  'reactionAssistForwardHazard', 'reactionAssistThreatHoldIsActive', 'reactionAssistThreatEntryYields', 'checkWorldContact'];
function scene({text = source, snake, physical = true, assist = false, ricochet = true} = {}) {
  const events = [], animation = [];
  const context = vm.createContext({
    snakes: snake ? [copy(snake)] : [], hunters: [], fruits: [], scorpion: null,
    gameTimeNow: () => 1000, EXPERIMENTAL_PHYSICAL_CONTACTS: physical, physicalContactActive: () => physical,
    Math: Object.assign(Object.create(Math), {random: () => .25}),
    hasCombatPower: p => !!(p.power || p.shield), isPowerMode: p => !!p.power,
    isSpawnProtected: p => !!p.shield, spawnShieldIsBlocking: p => !!p.shield && !p.power,
    reactionAssistPlayerEligible: p => assist && !p.isAI && !p.power && !p.shield,
    physicalContactRicochet(p, direction, t) { events.push(['ricochet', copy(direction), t]); return ricochet; },
    loseLife: p => { p.dead = true; events.push(['death']); },
    spawnSnakeBiteBloom: (cell, color, p, t = 1000) => events.push(['bloom', copy(cell), t]),
    spawnConsumedCreatureBloomAt: (x, y, color, p, t = 1000) => events.push(['creatureBloom', x, y, t]),
    playSound: name => events.push(['sound', name]), playRandomSound: () => events.push(['bodySound']),
    ControllerHaptics: {headBite() {}, bodyBite() {}, majorCreatureBite() {}, rivalBite() {}},
    AllyBrain: {noteCompleted() {}, noteTailBite() {}, noteSplit() {}}, provokeCreature() {},
    awardPoints: (p, points) => { p.score = (p.score || 0) + points; },
    nextLevel: () => events.push(['nextLevel']), BODY_EAT_SOUNDS: [], FRUIT_EAT_SOUNDS: [],
    scaledScorpionSpawnDelay: () => 20000, activatePowerMode: p => { p.power = true; },
    gameMode: 2, COMPETITOR_EAT_POINTS: 1000, playerEffectColor: () => '#abc',
    teammateAt: () => null,
    MazeBitersLive: {contactReady: () => true, snake: {capture: (s, t) => ({length: s.body.length, time: t})},
      snakeBite: (kind, s, token, p, t, created, index) => animation.push({kind, captured: token.length,
        remaining: s.body.length, time: t, capturedAt: token.time, index}),
      scorpionBite: (s, p, t, atTail) => animation.push({kind: 'scorpion', time: t, atTail}),
      characterBite: (p, t, duration) => animation.push({kind: 'character', time: t, duration})}
  });
  const names = [...snakeFunctions, ...(text === source ? physicalFunctions : [])];
  vm.runInContext([...new Set(names)].map(name => declaration(text, name)).join('\n'), context);
  return {context, events, animation};
}
const snake = length => ({body: Array.from({length}, (_, i) => ({x: 10 - i, y: 8})), dir: {x: 1, y: 0},
  color: '#35e55b', reversing: false, anger: 0, temperament: .5, headTrail: [], tailGuide: null});
const player = (direction = {x: 1, y: 0}) => ({x: 30, y: 21, prevX: 30 - direction.x,
  prevY: 21 - direction.y, dir: direction, score: 0, lives: 3});
const directions = [{x: 1, y: 0}, {x: -1, y: 0}, {x: 0, y: 1}, {x: 0, y: -1}];
let fallbackChecks = 0, physicalChecks = 0, newbornChecks = 0, gateChecks = 0;

// Animation readiness must not opt a normal game into experimental physics.
// Evaluate the actual startup URL declaration and active gate, then run the
// actual native cell-contact handler with those resulting authority settings.
const gateDeclaration=source.match(/const EXPERIMENTAL_PHYSICAL_CONTACTS=[\s\S]*?;/)?.[0];
assert.ok(gateDeclaration,'the experiment must have an explicit startup gate');
for(const [hostname,search,ready,expected] of [
  ['localhost','',true,false],['127.0.0.1','',true,false],['','',true,false],
  ['localhost','?contactQA=1',true,false],['localhost','?contacts=1',true,false],
  ['localhost','?contacts=EXPERIMENTAL',true,false],['example.com','?contacts=experimental',true,false],
  ['localhost','?contacts=experimental',true,true],['127.0.0.1','?contacts=experimental',true,true],
  ['::1','?contacts=experimental',true,true],['localhost','?contacts=experimental',false,false]
]){
  let readinessCalls=0;
  const gate=vm.createContext({location:{hostname,search},URLSearchParams,
    MazeBitersLive:{contactReady(){readinessCalls++;return ready;}}});
  vm.runInContext(gateDeclaration+'\n'+declaration(source,'physicalContactActive'),gate);
  assert.equal(gate.physicalContactActive(),expected,`contact mode ${hostname}${search} ready=${ready}`);
  if(search!=='?contacts=experimental'||!['localhost','127.0.0.1','::1'].includes(hostname))
    assert.equal(readinessCalls,0,'default/native gate does not even consult animation readiness');
  const state=scene({snake:snake(3),physical:gate.physicalContactActive()}),s=state.context.snakes[0];
  const p={...player(),...s.body[2]};p.prevX=p.x-1;p.prevY=p.y;
  state.context.checkSnakeContact(p);
  assert.equal(s.body.length,expected?3:2,'only explicit local opt-in defers native cell tail contact');
  assert.equal(p.score,expected?0:25);
  if(!expected){
    assert.deepEqual(state.animation.map(a=>[a.kind,a.captured,a.remaining,a.time]),[['tail',3,2,1000]],
      'native bite still captures pre-mutation artwork and dispatches renderer tail trim');
    assert.ok(state.events.some(e=>e[0]==='bloom'&&e[2]===1000),'native bite keeps its timed effect');
    assert.ok(state.events.some(e=>e[0]==='bodySound'),'native bite keeps its sound');
  }else assert.equal(state.animation.length,0);
  const scorpionState=scene({physical:expected}),scorpionPlayer=player();
  scorpionState.context.scorpion={x:scorpionPlayer.x,y:scorpionPlayer.y,tailX:scorpionPlayer.x-1,tailY:scorpionPlayer.y};
  scorpionState.context.checkWorldContact(scorpionPlayer);
  assert.equal(scorpionState.context.scorpion===null,!expected,'native world-cell scorpion contacts stay active by default');
  assert.equal(scorpionPlayer.score,expected?0:150);
  const hunterState=scene({physical:expected}),hunterPlayer={...player(),power:true};
  hunterState.context.hunters=[{x:hunterPlayer.x,y:hunterPlayer.y}];
  hunterState.context.checkWorldContact(hunterPlayer);
  assert.equal(hunterState.context.hunters.length,expected?1:0,'native powered hunter bite stays active by default');
  assert.equal(hunterPlayer.score,expected?0:200);
  gateChecks++;
}

for (const length of [1, 2, 3, 7]) for (let index = 0; index < length; index++)
  for (const direction of directions) for (const power of [false, true]) for (const reversing of [false, true]) {
    const s = snake(length); s.reversing = reversing;
    const p = {...player(direction), ...s.body[index], power};
    p.prevX = p.x - direction.x; p.prevY = p.y - direction.y;
    const results = [baseline, source].map(text => {
      const state = scene({text, snake: s, physical: false}), person = copy(p);
      state.context.checkSnakeContact(person);
      return copy({snakes: state.context.snakes, player: person, events: state.events});
    });
    // The v99 user-requested solo retreat rule intentionally changes this one
    // native transition: keep the genuine removed-tail route and, if already
    // retreating, do not restart forward inside the tunnel. All combat, score,
    // bloom/sound and every other contact result still match the v94 baseline.
    if(length===2&&index===1){
      const expected=results[0].snakes[0];
      expected.headTrail=[copy(s.body[1])];
      if(reversing){
        expected.reversing=true;
        for(const field of ['blockedDir','reverseSteps']){
          if(Object.hasOwn(s,field))expected[field]=copy(s[field]);
          else delete expected[field];
        }
      }
    }
    assert.deepEqual(results[1], results[0], `Native fallback ${length}/${index}/${JSON.stringify(direction)}/${power}/${reversing}`);
    fallbackChecks++;
  }

for (const length of [1, 2, 3, 7]) for (let index = 0; index < length; index++)
  for (const direction of directions) for (const power of [false, true]) {
    const state = scene({snake: snake(length)}), p = {...player(direction), power};
    const original = state.context.snakes[0];
    const result = state.context.checkPhysicalSnakeContact(original, index, p, 777, {direction});
    assert.equal(result.handled, true);
    if (index === 0 && !power && (length === 1 ? direction.x === -1 : direction.x !== 1)) {
      assert.equal(result.kind, 'death'); assert.equal(p.dead, true);
    } else {
      assert.equal(p.dead, undefined); assert.ok(p.score > 0);
      assert.equal(state.animation[0].time, 777); assert.equal(state.animation[0].capturedAt, 777);
      assert.equal(state.animation[0].captured, length, 'complete pre-bite pose is captured before logical removal');
      for (const child of state.context.snakes) if (child !== original) {
        assert.equal(child.lastMove, 777, 'a newborn fragment starts its native cadence at the exact contact, not zero');
        assert.equal(777 - child.lastMove, 0, 'the post-contact update cannot immediately advance a newborn');
        newbornChecks++;
      }
      if (index === length - 1 && index > 0) {
        assert.equal(result.kind, 'tail'); assert.equal(state.animation[0].remaining, length - 1);
      }
    }
    physicalChecks++;
  }

// No arbitrary cooldown: the next exposed tail material can resolve immediately,
// while the renderer keeps the captured pre-pop pose for progressive shortening.
{
  const state = scene({snake: {...snake(3), reversing: true}}), p = player();
  const s = state.context.snakes[0];
  state.context.checkPhysicalSnakeContact(s, 2, p, 700);
  assert.equal(s.body.length, 2); assert.equal(s.tailGuide.x, s.body[1].x);
  state.context.checkPhysicalSnakeContact(s, 1, p, 700);
  assert.equal(s.body.length, 1); assert.equal(s.reversing, true);
  assert.deepEqual(state.animation.map(item => [item.captured, item.remaining]), [[3, 2], [2, 1]]);
  assert.equal(p.score, 50);
}
for (const allowed of [false, true]) {
  const state = scene({snake: snake(3), assist: true, ricochet: allowed}), p = player({x: -1, y: 0});
  const result = state.context.checkPhysicalSnakeContact(state.context.snakes[0], 0, p, 650);
  assert.equal(result.kind, allowed ? 'ricochet' : 'death');
  assert.equal(!!p.dead, !allowed); assert.equal(state.animation.length, 0);
}
{
  const state = scene({snake: {...snake(1), reversing: true}}), p = player();
  const result = state.context.checkPhysicalSnakeContact(state.context.snakes[0], 0, p, 800, {initiator: 'snake'});
  assert.equal(result.kind, 'blocked'); assert.equal(p.dead, undefined);
  assert.equal(state.context.snakes[0].reversing, true,
    'blocked rear contact cannot authorize an in-tunnel forward turn');
}
for (const atTail of [false, true]) {
  const state = scene(), p = player();
  const s = {x: 5, y: 6, tailX: 4, tailY: 6}; state.context.scorpion = s;
  const hunter = {motherAlive: true, anger: .1}; state.context.hunters.push(hunter);
  assert.equal(state.context.checkPhysicalScorpionContact(s, p, 650, {atTail}).kind, 'scorpion');
  assert.equal(state.context.scorpion, null); assert.equal(p.score, 150); assert.equal(hunter.motherAlive, false);
  assert.equal(state.animation[0].atTail, atTail); assert.equal(state.animation[0].time, 650);
  assert.equal(state.context.checkPhysicalScorpionContact(s, p, 650).kind, 'ignored');
}
for (const initiator of ['hunter', 'player']) for (const power of [false, true]) for (const shield of [false, true]) {
  const state = scene(), p = {...player(), power, shield}, h = {x: 5, y: 5};
  state.context.hunters.push(h);
  const result = state.context.checkPhysicalHunterContact(h, p, 888, {initiator});
  const expected = initiator === 'hunter' && (power || shield) ? 'blocked' : power || shield ? 'hunter' : 'death';
  assert.equal(result.kind, expected);
  if (expected === 'hunter') { assert.equal(p.score, 200); assert.equal(state.animation[0].time, 888); }
}
for (const gameMode of [2, 5]) for (const equal of [false, true]) for (const shield of [false, true]) {
  const state = scene(), a = {...player(), score: 100}, b = {...player(), score: equal ? 100 : 10, shield};
  state.context.gameMode = gameMode;
  const result = state.context.checkPhysicalPlayerContact(a, b, 432);
  assert.equal(result.kind, gameMode === 5 || equal && !shield ? 'blocked' : 'player');
  if (result.kind === 'player') assert.equal(state.animation[0].time, 432);
}

// Old actor-cell effects and adjacent-cell ricochet cannot bypass the solver.
{
  const state = scene({snake: snake(3)}), p = {...player(), x: 10, y: 8};
  state.context.scorpion = {x: p.x, y: p.y, tailX: p.x - 1, tailY: p.y};
  state.context.hunters.push({x: p.x, y: p.y});
  state.context.checkSnakeContact(p); state.context.checkWorldContact(p);
  assert.equal(state.events.length, 0); assert.equal(state.animation.length, 0);
  assert.equal(state.context.reactionAssistForwardHazard(p, p.dir, 1000), false);
  assert.equal(state.context.reactionAssistThreatHoldIsActive({}, 1000), false);
  assert.equal(state.context.reactionAssistThreatEntryYields({}, p, 9, 8, 1000), false);
  state.context.teammateAt = () => ({...player(), x: p.x, y: p.y});
  assert.equal(state.context.playerContactBlocksMovement(p, p.x, p.y, 1000), false);
  assert.equal(state.context.resolvePlayerContact(p, 1000), false);
}
for (const name of ['snakeStep', 'moveHunters']) {
  const text = declaration(source, name);
  assert.equal((text.match(/const victim=playerAt/g) || []).length,
    (text.match(/if\(victim&&!physicalContactActive\(\)\)/g) || []).length,
    `${name}: every legacy player-cell kill must be gated`);
}
assert.ok(newbornChecks > 0, 'both split and powered-head replacement fixtures create newborns');
console.log(`PASS contact rules: ${gateChecks} explicit/default authority cases, ${fallbackChecks} differential native outcomes, ${physicalChecks} physical snake contacts, ${newbornChecks} exact-contact newborn clocks, ` +
  'continuous retreat shortening/capture, timed effects, ricochet/no-exit, hunters, scorpions, duels and all legacy actor-cell gates.');
