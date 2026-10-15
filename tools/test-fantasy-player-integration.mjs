// Regression contract for Fantasy Biter PLAYERS and the original fallback.
// Dragon Kin adds separate hunter art and presentation notifications only;
// protagonist artwork/animation, the original atlas and hunter AI stay pinned.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import vm from 'node:vm';

const root=process.env.MAZE_GAME_ROOT?pathToFileURL(process.env.MAZE_GAME_ROOT.replaceAll('\\\\','/')+'/'):new URL('../',import.meta.url);
const {loadFantasyPlayerArt,drawFantasySource,FANTASY_MOUTH_FRAMES,FANTASY_BLINK_FRAMES}=await import(new URL('src/render/fantasy-player-art.js',root));
const {createLiveMouthService,LIVE_MOUTH_FRAMES}=await import(new URL('src/render/live-mouth.js',root));
const {buildFantasyMouthIntakeMask}=await import(new URL('src/render/fantasy-mouth-intake.js',root));
const hash=data=>createHash('sha256').update(data).digest('hex');
const game=await readFile(new URL('src/engine/game.js',root),'utf8');
function functionSource(source,name){
  const start=source.search(new RegExp(`\\bfunction\\s+${name}\\s*\\(`));
  assert.ok(start>=0,`Missing engine function ${name}`);
  for(let end=source.indexOf('}',start);end>=0;end=source.indexOf('}',end+1)){
    const candidate=source.slice(start,end+1);
    try{new vm.Script(candidate);return candidate;}catch{}
  }
  throw Error(`Unterminated engine function ${name}`);
}
const preservedFunctions={
  drawHunter:'77e519514ad2bf5f9468bff51743f433b869e8cfc050d5dbc4665bc04f927096',
  originalCharacterSprite:'5cd75f66590d56d1a9724650ef612149eeee6ee5583c606c40ebdc91383865eb',
  moveHunters:'49a91b3fb24c5902bbff62659c65384ee3d20164fb9e17838e884c6421d5b87e',
  hunterBrainProfile:'91ff8f3b0703f34f34254aae4dbcf47caff7b4c2356228bc12065800b779cc0b',
  hunterMoveDelay:'54759de80c39efab6c1daa77207f849b092ef209cbbe9bc9df0398e87d7f7fad',
  nextEnemyHunterPaletteIndex:'4bacd15529dddd68fe26977fbd673cd92f511dfa3bb66d4cc56c62723fe56bd4',
  drawPlayer:'164eb8fed2f6386bdcf4538b50c9511293f12302033c9c66df7a7dcbf359323c',
  physicalCharacterGeometry:'7e1a4067ab6dc1df8accb6eec78a6556f5ece7e83e2723502d675f3d91060a92',
  playerVisualPosition:'0c07e606de8097a2625cf2f6229c71255ddf0542ebf05975b572585f5db34bd6',
};
const preservedFiles={
  'assets/atlases/hd/modern-characters-80.png':'ae003bb683ef80d86e6577663a1a73fd2b85174df1cecad49103fc1e4e2ab7d7',
  'assets/atlases/4k/modern-characters-160.png':'a87e4d0ae7ddc97cca76292319c65ab4fe8978e836e949bdab53e0c5eda2cb3f',
  'src/config/render-atlas.js':'32ff0ab5e0592d4e493128a66c4e688d1ff4631ad17999f27c646ca7cb70e1dc',
  'animation-lib/snake-bite-study/player-mouth-mesh.js':'1bece4c73b3a1f5a19f1e37b78306164370eb29e13f21ad4c17ff5ac206a121c',
  'animation-lib/snake-bite-study/player-mouth-art.js':'e2a95d3337f80e68dd10a315206a54ac3f3ab8caf782b9c4c0101e4029b2de07',
};
for(const[name,expected]of Object.entries(preservedFunctions)){
  let source=functionSource(game,name);
  if(name==='drawHunter'){
    // The approved visual change removes rage colors only. Keep the original
    // renderer hash after reversing precisely its comment and mood selector.
    const comment='// Enemies retain their approved normal palette regardless of AI state, so every';
    assert.equal(source.split(comment).length-1,1);
    assert.equal(source.split("const mood='normal';").length-1,1);
    source=source.replace(comment,'// Palette identity and rage brightness are precompiled, so every')
      .replace("const mood='normal';","const mood=h.motherAlive?'normal':'rage';");
  }
  if(name==='physicalCharacterGeometry'){
    const selector='?.[actor.paletteIndex??Math.max(0,HUNTER_PALETTE.indexOf(actor.color))]?.normal';
    assert.equal(source.split(selector).length-1,1,'only the corresponding hunter art lookup may change; collision sampling is untouched');
    source=source.replace(selector,"?.[actor.paletteIndex??Math.max(0,HUNTER_PALETTE.indexOf(actor.color))]?.[actor.motherAlive?'normal':'rage']");
  }
  if(name==='moveHunters'){
    // Exactly the two authorized Dragon Kin presentation notifications.
    // Preserve the original hash instead of accepting a new movement body.
    const notification=/^\s*globalThis\.MazeBitersLive\?\.mouth\.turn\?\.\(h,\{x:-reverse\.x,y:-reverse\.y\},h\.dir,t\);\r?\n/gm;
    assert.equal([...source.matchAll(notification)].length,2,'Dragon Kin may only add two committed-heading notifications');
    source=source.replace(notification,'');
  }
  if(name==='nextEnemyHunterPaletteIndex'){
    const approved='const index=ENEMY_HUNTER_PALETTE_INDICES[\n    hunterColorIndex%ENEMY_HUNTER_PALETTE_INDICES.length];';
    const newline=source.includes('\r\n')?'\r\n':'\n',exact=approved.replaceAll('\n',newline);
    assert.equal(source.split(exact).length-1,1,'only the approved three-color round-robin lookup may replace the old five-color lookup');
    source=source.replace(exact,`const index=FIRST_ENEMY_HUNTER_PALETTE_INDEX+${newline}    (hunterColorIndex%ENEMY_HUNTER_PALETTE_COUNT);`);
  }
  assert.equal(hash(source),expected,`${name}: original selector, AI, movement and protagonist paths must remain byte-identical`);
}
for(const[file,expected]of Object.entries(preservedFiles))assert.equal(hash(await readFile(new URL(file,root))),expected,`${file}: original hunter artwork/legacy mouth contract must remain byte-identical`);
// Wider blink art uses the same approved eye algorithm and timing, fitted to
// the larger face. Full native blink sequences below are independently pinned
// from the approved wider study, not from the production pack.
const preservedCosmeticModules={
  "src/render/fantasy-blink-timing.js": "4bb09e3f3b3a23d6399001b8acf6c110a69b6310942bfacc1f1d92aa78585c69",
  "src/render/snake-neon.js": "eba2e77b787430dd6448c24d4c3164a86675abb95b91c1db086e95c936af8fa7",
  "src/render/snake-neon-eyes.js": "9160aa992ab23506780bf99383ad569e3313a4bc9a4e0671007a447961dafbb8",
  "src/render/neon-eye-glints.js": "1a80b722b0cd40f5e8d69172c71cd14ae4151fcf65206e162da00933e8ddd5f4",
  "src/render/neon-aggression-schedule.js": "6fc6cf71994df51824c21b9378f850ba09d82bacf8bb64ec47ef19fccf8166ef"
};
for(const[file,expected]of Object.entries(preservedCosmeticModules))
  assert.equal(hash(await readFile(new URL(file,root))),expected,`${file}: size integration must not alter blink timing or snake light`);
const liveMouthSource=await readFile(new URL('src/render/live-mouth.js',root),'utf8');
// Captured BEFORE the direction-turn integration. Presentation now decorates
// visual descriptors, so pin the unchanged anatomy, clocks and physical
// sampling independently rather than accepting a new whole-module hash.
const preservedMouthFunctions={
  sampleActor:'5dfa21f2e9e466dacf8989a356a023c3b97f45879979106ea2b2c80d1d7836eb',
  bite:'ac9faa923b4a8364f85dd36eb5927228ce8bd6c34f81e9f1b49a14fe5f1b7201',
  sampleEvents:'f95d4a9c5b1fc535672f984ae729f798865fa2dffddebe41201dfb7a25d78a65',
  baseClosure:'80183aa52462472adaa45c8f8004e1d3657d1e3c3e5e1c12eb4cdca201ac4a74',
  geometry:'101137372217b45cd261647069a5f0fb21c3a0c910af0d796e22c7d0fbb361ef',
  breakpoints:'64b9f4a7decd8899ff602059b950ba8bee35130db3227ba46b9f787ef07c4fcf',
  morphLiveMouthFrame:'bc079c41e107938b9223c9f0ad519324bae01f5e7b4328b4839561fdca2fa34b',
  liveMouthMotionPhase:'d4a17972d6e784fb461b98849e9d30e00654f473768a46d00f3fa4efd836c995',
  makeBackCapBoundary:'1887d64b1d3a597b3716c3bdf75063f0f21d7a32d10b61bc3a0f78933d5ad6e0',
  resampleLiveMouthRaster:'47b213362e76bd1745e60588945960f7f07f2f009b398dc9b47a3ad81f05d439',
  sample:'62d31965ac0be8b319520d08a4959017e44859ddb05d5609d2c800106880f907',
  validateRaster:'49564d967dd159565508be9b7c94d6e7269cd63a18df75963d534dae733c20c6',
};
for(const[name,expected]of Object.entries(preservedMouthFunctions)){
  let source=functionSource(liveMouthSource,name);
  // Explicit native-grid opt-out only: keep the original physical algorithms
  // pinned after removing their exact added no-contact early exits.
  if(name==='geometry'){
    const guard='    if(!contactPreparationEnabled)return null;';
    assert.equal(source.split(guard).length-1,1,'one exact contact opt-out geometry guard');
    source=source.replace(guard+(source.includes('\r\n')?'\r\n':'\n'),'');
  }
  if(name==='breakpoints'){
    const guard='out.length=0;if(!contactPreparationEnabled||!(to>from))return out;';
    assert.equal(source.split(guard).length-1,1,'one exact contact opt-out breakpoint guard');
    source=source.replace(guard,'out.length=0;if(!(to>from))return out;');
  }
  assert.equal(hash(source),expected,`${name}: direction animation must not change the existing mouth/physical/hunter algorithm`);
}
const blinkStart=liveMouthSource.indexOf('    if(!r.blink||time<r.lastBlinkTime)'),blinkEnd=liveMouthSource.indexOf('    return r.blinkDescriptor;',blinkStart);
assert.ok(blinkStart>=0&&blinkEnd>blinkStart,'approved independent visual blink clock remains present');
const blinkBody=liveMouthSource.slice(blinkStart,blinkEnd+'    return r.blinkDescriptor;'.length);
const separateEnemySerial="const serial=descriptor.__liveMouth.set.art.kind==='hunter'?hunterBlinkSerial++:blinkSerial++;";
assert.equal(blinkBody.split(separateEnemySerial).length-1,1,'new enemies must use a separate cosmetic serial and leave the protagonist seed/offset sequence intact');
const preservedPlayerBlink=blinkBody.replace(separateEnemySerial,'const serial=blinkSerial++;')
  .replace(/^      \/\/ Enemy creation\/render order must not change protagonist blink seeds\r?\n      \/\/ or their first-blink offsets\. Each art family owns its serial stream\.\r?\n/m,'');
assert.equal(hash(preservedPlayerBlink),
  '9eb6be92bce39f24cbc03bde38f2f2a349190e367f5c34b448be186b6c54f68e','blink scheduling and native eye-patch descriptor selection remain unchanged');

// Full RGBA native sequences independently reconstructed from the approved
// size study before inspecting production: 49 mouth / 25 blink poses. Bright
// sequences use only the unchanged original Pillow/numpy power-mode helper.
const approvedWiderFrameHashes={
  "hd:p1:normal:right": "4362241bda67585928292a628563f2ecbba6937bcada1dd7c194ed0b213d0a4b",
  "hd:p1:bright:right": "83cf2f8b5992031b0e246b50dbde06c7dd578c89e7b09b560d50039adda1c271",
  "hd:p1:normal:down": "70ee1fa68c5d0cddd4da49298b2be11e9ba0d91a26e98ffa6f4aa5f478a1bcf3",
  "hd:p1:bright:down": "ab017de02ec04ebf9939bd99191cb8fdf603b992906c3dfa7908887ba980fa3f",
  "hd:p1:normal:left": "1e440b04b302b8ec8f232079d83f80ff7bd7a65f0cee03d095b0e29646c08513",
  "hd:p1:bright:left": "15fddee19a8129760b0b9ef8b5b51484348b80e21247fa98fad0dc6cf362410c",
  "hd:p1:normal:up": "ca9a2c90a182f41a72c7ae80825eab06dda376b38b64e93bc040ac8d2c92b398",
  "hd:p1:bright:up": "0f0887534523494edf2dd0459ca56960f210e0e55fd5e88445a3fe219da4e66d",
  "hd:p2:normal:right": "a3aa4d5f905b7df8dc678279b5d935adcbf338457aadfd7ccf7de706d7e44514",
  "hd:p2:bright:right": "a258c7291b07d6dcb9c3ef29d13a14821df522ec4557130782290844e74fd229",
  "hd:p2:normal:down": "eb682547d7d239e1f3c784cf21697ca9f45f9cd66238fd6e66cbd93e02713896",
  "hd:p2:bright:down": "1cc9e72e709d7022474697c4f047d80ef3de6c7fa7b00705ef6986586856e062",
  "hd:p2:normal:left": "c8bb3e63b3e9e2914c4cf3c69a56e89568ae1c1fea0f53c227eb53d3b369d3be",
  "hd:p2:bright:left": "16955edc25e03c7135e4b6fa8375d3b88173733a3dc10d5f69ee435f6fe2d15d",
  "hd:p2:normal:up": "26c59f34fe62090ba560a6054dc9f0e34eafc38b4ffb04045ba6fe9c7fdf2c53",
  "hd:p2:bright:up": "1ae71ab088efb8b4f0388e8fb71605a2eeef8b6162c451bd9f87fada117879ca",
  "hd:ai:normal:right": "518aca592b1a8c16bfba58c90a8fb395ccd5e9331ba5f9181ebcdb7de7378c88",
  "hd:ai:bright:right": "17a2ae48653f963e2e653e1010dd969eb7db39d4b234831552a0afea9627ae22",
  "hd:ai:normal:down": "ec4f9e0bfee08abda7a66fc36caff1cfc9067af1588167ed237b4c2a63e2bebd",
  "hd:ai:bright:down": "de1f32670e25415ee86d32b205b9d99e9c1f8059f3481452c16b30c091fe7202",
  "hd:ai:normal:left": "ac98df7a9cc207d8a22cf66bd024c0b8d442fbdb3231dee32a039aa87ddd31d3",
  "hd:ai:bright:left": "1769db4de9f83f427d8d8d6d84873291a41de120aa9b70de0ed82fccb59c1fda",
  "hd:ai:normal:up": "d500ae45a21a9bfe9dfd2be1de489b48ab341e018e215c79a70052100d1c90c5",
  "hd:ai:bright:up": "5be66981e32aeec1969ec413bce0fd875bc55711abfec2d5b041ee8bb39c9ce1",
  "4k:p1:normal:right": "9fd3b5a13abcf292564cd3a506cf2b2430dfdbff782ee12898076d23c538e385",
  "4k:p1:bright:right": "42a8c8c0334207d8f4b23b0035a33d21e7e3adb0d80d906c3fa2317d69c38662",
  "4k:p1:normal:down": "42281474f546f65326da4523d80e4b6fb6e0b67d6f0be11bf19b718482803e0e",
  "4k:p1:bright:down": "7ebcabb6f84fd2150f666d41a78e227b183ccda361533dca084a385f20d68cdf",
  "4k:p1:normal:left": "3072dc695ad3c12eee35ff03216bdd11fe931e01ebba8c28c368a2239515fb97",
  "4k:p1:bright:left": "8ac536adab7bd1f36f02c9191979ec6aecfacc1f97c2665d4e83be138ae4946f",
  "4k:p1:normal:up": "8954c2f2dbee8dd2fd2585062cdec2088a811ebdb23e591c544ec9b44a23cadf",
  "4k:p1:bright:up": "a105a6abe095c6abec2e788c424c7c5e9b61885f6290d94084e327936af83e22",
  "4k:p2:normal:right": "d0b1ad071013b632f64abdb5adc4ee83c6e60e36064522828c6f9fe86aa45728",
  "4k:p2:bright:right": "30233fb76a55c9d1609fe187c92bfb16ae6f8d4d744a53aee2658186eb160fe1",
  "4k:p2:normal:down": "22e5412d5a42872e5fa7869a325c6acc3f206727447fc557f39d1aca05bb74dc",
  "4k:p2:bright:down": "1b63a2c517fde70e9503e3362f01c14dc8645373e323cf1a6bb65b88f262d352",
  "4k:p2:normal:left": "ac62eeecc0baf3c06bb39206c56a54844920edcca841f1c0d95f1a474992c83f",
  "4k:p2:bright:left": "89531e814184fdc28031fdca9dcdff1df2636817141152285e2a086490727bfe",
  "4k:p2:normal:up": "e55097ddc212c486783556a9f7ce7be2b64d3adbd0f91b93cb51b83ff284778d",
  "4k:p2:bright:up": "646556196999d07be52ff46cab21dc0bbbf14f29eb0950e53401382612d5aa81",
  "4k:ai:normal:right": "b72759b738ced605008adbd0d4ff99aad5a0c5d85ae922c69038fb8b876211fa",
  "4k:ai:bright:right": "be7a9cb3d3e7559b465b05ade2aec49da8921d3e143ea8309cc9bd05e3f2eac3",
  "4k:ai:normal:down": "b9189b9908ef70270c0cf444d50880e824d9830860fd3af5b698d97082a1a834",
  "4k:ai:bright:down": "d2c507a946e411a884b7e71978030f7cb922e5609a6e9f620e4dba15062da487",
  "4k:ai:normal:left": "1cad4a30d18f9a7938329f82ed7d133eca09e21eaecd2b278f2cf77f6e256aac",
  "4k:ai:bright:left": "d7ef359be7390bad462a7fe8d73f6cec0491431ffeb6250477edc22b4faed688",
  "4k:ai:normal:up": "59be2ddde1a4ca58a582c9aaae8be2a4471bd11612ecb956d121f8c6d0b43581",
  "4k:ai:bright:up": "a1de18c6001bcc87fac549858445548ba2cd37c5344f662384c3c99e8ae87772"
};
const approvedWiderBlinkHashes={
  "hd:p1:normal:right": "27130c6ed3d44ac7959d01c86153d89fc08b0bf7bc0311d8f78db45052cbe157",
  "hd:p1:bright:right": "acfe4fb2e2b3a077c2fa5ddcfdb308517086de908c5714d9669e7c10c8df3119",
  "hd:p1:normal:down": "1dd7577447a68da474cedc8316b84bd297c2a1fea45c33e729a06a1955b62e5c",
  "hd:p1:bright:down": "55b0d54f7f0183dd7ffbdc29fb5ddc5fa1f4294d30c23dd9fb5b9870b5b9dddb",
  "hd:p1:normal:left": "22d38a16ebdf0bea908c32497208ef222b71b309b281b295e7b101ab1c858f54",
  "hd:p1:bright:left": "6caefa6252b7ce8807b38c5d8a34c5c5d85b304a3c11e2381651f2ea5a533619",
  "hd:p1:normal:up": "81a5c3fe98feb08238e77c8266e9ccb1954fdc88f2eed89acb7bcd051c87bce4",
  "hd:p1:bright:up": "c1bd52114f5312c08820ad5f0bb90086ece1732562d58f6a7897d17085492741",
  "hd:p2:normal:right": "3e369f555128be17c608f8cbc39068de1f2edf8fe71a6525fa43319fdc9c3873",
  "hd:p2:bright:right": "30da6d0a937685252ed7131b00de4ffce19d5d6a699e0ab602381efb01fe3583",
  "hd:p2:normal:down": "aa2b86f24f0197bd164ab622ecda47a9f04ca65361928895494788cf3786d02d",
  "hd:p2:bright:down": "86a0cc730a7b1353d445e64051ad445c38101bd062a9ec14af6ba7df0174bce0",
  "hd:p2:normal:left": "468f8ac242e4387bc5e99d955a436896924ef182c77fc953c9ced0a4e8c1cb5a",
  "hd:p2:bright:left": "ff9fec01038104d937176dd2e4fb9945459dad89a486eb9499bc2cab30efba82",
  "hd:p2:normal:up": "3a2ab921f5f69e3d4c28975fc23f421564c1efc6ca4e2e4dcf1dc4afd7c8c3aa",
  "hd:p2:bright:up": "dae087689167a899b0225c66312cd3031982bb4c243e3acbe2e6dcefd7c03d61",
  "hd:ai:normal:right": "94e98d20ac02ff8da05dd8b40841167a90d30d54de2a5993c333cb9d5c30f085",
  "hd:ai:bright:right": "5b4f8bc6f907ee6713f8d4e6d8a71c21c794f12a28db1d7e8b623d09c735c232",
  "hd:ai:normal:down": "7a23ea1f61b0adb4097505217b59c45faa0a234ecfc0b845ac1ab44dd6d4f81b",
  "hd:ai:bright:down": "76f8372bdb288585c8b9feefb957d149eac751192d29d3144effc4787eda41a5",
  "hd:ai:normal:left": "1e6b8ad78bcb43db09f66f3443bdf3e01f2940fbda7b49a632121ff6df2fddb2",
  "hd:ai:bright:left": "5fd8dc1cbc253c0da7b262b2d07c67e57217657e5470593683ce51f38ab8f723",
  "hd:ai:normal:up": "3022125ed80ecd616d3e3cb5fb888084ca9cf800185de384b7d295641b8399ca",
  "hd:ai:bright:up": "db4ab949d8914dc3d5ea26f41b309e5bffada173c23b7e04473791897ef8b5b0",
  "4k:p1:normal:right": "164d8357663ef0a15d6d1624b1ca5b8b179b6b787569608a7234c2672f5b1f59",
  "4k:p1:bright:right": "f76a7fd02280aa4417f56396197d28d4f09a9aa13c4486c18d097c3fc620d262",
  "4k:p1:normal:down": "7cfa53d3d41bf1c31e62492c6ae7e4bd6d105c04ba18a7cdaba1d190d661534c",
  "4k:p1:bright:down": "e976bac1161b43e3be74693a75d450f9e8db1f8c221fc69edbb6bb192900c47b",
  "4k:p1:normal:left": "197a31acbdfbb2e1e748d4a307b54e1cdc1eb2caa8339b581d03901de3621f51",
  "4k:p1:bright:left": "b134da62c8031dd149d2948664cdad49c0279cc323f60b40d42dd87be930797e",
  "4k:p1:normal:up": "c5c4eb972bfc3802310a0bedbbe501d93a06ed6eb1d2081df852ae57751df3d7",
  "4k:p1:bright:up": "11246388ed4598c5d74c5887a5f9e4322138bb74bbda56531401a9831e2b2370",
  "4k:p2:normal:right": "3a86916495e8fe8ef26533c31150a692ba0ae87cb43a163d8f8c1531a6f42b34",
  "4k:p2:bright:right": "b85f041fa1ff05d6ce67e344a7603d4a3783f03e1310a68dd898edb9513aaa9f",
  "4k:p2:normal:down": "3c03440d68812c11926b1d09b55e52b860685d9a556a146400363a98e357c28b",
  "4k:p2:bright:down": "39b7431a3f1bb8ee19963bd7997f827525888fe98ffd9359b5a8b4ff98c58ecd",
  "4k:p2:normal:left": "02f68f8fee9d8ed1b4b72bc1fac03d7f429ab3f746b37b7fe0e1875818f9d1ab",
  "4k:p2:bright:left": "04e848f347fb4f14313c08babcfe794cad905f6f04a10f059c2346ce74cda92b",
  "4k:p2:normal:up": "5daa3ebe80bcc1ca0e9935afcd3c1c30e0930701c71995078df9c049dcdfd905",
  "4k:p2:bright:up": "5cfd4fce5d9285a550bad49a101ccc6dd509c7f2e1b05b3d57adb79f101a20da",
  "4k:ai:normal:right": "e1950280b7f227f90b29fa20db07cbb330a3a686971aae11172d0a3e7787ba32",
  "4k:ai:bright:right": "8303e4902495dba4c238e796fbb2249c93d51ca285ecd1d4333b5ea136db4bbf",
  "4k:ai:normal:down": "45a09ffd343991c794687b964d96ab8f8feecd3e98aebe055140606b029253a2",
  "4k:ai:bright:down": "17137cc88b37854359c3d45fdd57550efd78048c39926fb52fca889f740f7597",
  "4k:ai:normal:left": "976a2a8ccabd78f31c5bb546344ccf85222be698054a8704b99f355889e45011",
  "4k:ai:bright:left": "affccb9e01d989b351882c47af680d8454e4b1316f85ae205d8df7b79cf3b0be",
  "4k:ai:normal:up": "85fc9f2eb1c88dc220bbd4bb52751cbe123d3f3070c58e078fb9c11bb3efa79f",
  "4k:ai:bright:up": "4ca01ad7e97bbf303efcbb752c3c66bb19fed3b037fcf47b3127272d272c90d4"
};

// Exercise the engine selector for every original hunter palette/direction and
// both AI states. Only the appearance is normal-only; the mother flag remains.
let hunterSelections=0;
for(const palette of [0,1,2,3,4,5])for(const motherAlive of [true,false])for(const direction of [1,2,3,4])for(const mouthOpen of [false,true]){
  const spriteName=`EnemyHead${direction}${direction!==1&&!mouthOpen?'Close':''}`;
  const sources=Object.fromEntries([1,2,3,4].flatMap(n=>[`EnemyHead${n}`,`EnemyHead${n}Close`]).map(name=>[name,{__hvSpriteName:name}]));
  const poses=Object.fromEntries(Object.keys(sources).map(name=>[name,{__hvSpriteName:name,palette,mood:'normal'}]));
  const forbiddenRage=Object.fromEntries(Object.keys(sources).map(name=>[name,{__hvSpriteName:name,palette,mood:'rage'}]));
  let sampled=null,drawn=null;
  const context={OriginalSprites:sources,OriginalCharacterSpriteCache:{},directionNumber:()=>direction,
    smoothEntityPosition:(h,t,prefix,out)=>Object.assign(out,{x:3,y:4}),gameplaySpriteVisible:()=>true,
    HUNTER_PALETTE:[],CharacterSpriteGroups:{hunter:{[palette]:{normal:poses,rage:forbiddenRage}}},TILE:16,
    drawOriginalSprite:sprite=>{drawn=sprite;return true;},rect(){throw Error('Unexpected hunter fallback');},
    MazeBitersLive:{mouth:{sprite:(entity,time,options)=>{sampled={entity,time,options};return null;}}},
    h:{dir:{x:1,y:0},paletteIndex:palette,motherAlive,mouthOpen},
  };
  vm.runInNewContext(`${functionSource(game,'originalCharacterSprite')}\n${functionSource(game,'drawHunter')}\ndrawHunter(h,1234);`,context);
  assert.equal(drawn,poses[spriteName]);
  assert.equal(drawn.mood,'normal','an aggressive hunter must retain its approved original palette');
  assert.equal(context.h.motherAlive,motherAlive,'normal-only artwork cannot change the AI aggression state');
  assert.equal(sampled.time,1234,'hunter mouth uses the supplied game clock');
  assert.equal(sampled.options.open,poses[`EnemyHead${direction}`]);
  assert.equal(sampled.options.closed,poses[`EnemyHead${direction}${direction===1?'':'Close'}`]);
  assert.equal(sampled.options.bank,({2:0,3:1,4:2,1:3})[direction]);
  hunterSelections++;
}

const require=createRequire(import.meta.url);let native;
for(const location of [process.env.CODEX_CANVAS_PACKAGE,'@napi-rs/canvas',join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas')].filter(Boolean)){
  try{native=require(location);break;}catch{}
}
if(!native)throw Error('Native Canvas required (or set CODEX_CANVAS_PACKAGE)');
const {createCanvas,loadImage}=native;
let sharp;
for(const location of ['sharp',join(process.env.MAZE_NODE_MODULES||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'),'sharp')]){
  try{sharp=require(location);break;}catch{}
}
if(!sharp)throw Error('Sharp required for independent raw asset checks');
const near=(a,b,label,tolerance=1e-8)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=tolerance,`${label}: ${a} != ${b}`);
const ease=x=>{x=Math.max(0,Math.min(1,x));return x*x*x*(10+x*(-15+6*x));};
const invertEase=value=>{let low=0,high=1;for(let i=0;i<52;i++){const middle=(low+high)/2;if(ease(middle)<value)low=middle;else high=middle;}return (low+high)/2;};
let allocations=0,reads=0,imageLoads=0,drawChecks=0,poseChecks=0,timingChecks=0,playerSelections=0,maskChecks=0,failNextAllocation=false;
const fractionalMaskDiagnostics={maxAlphaDifference:0,pixelsOverOne:0,outerEdgePixelsOverOne:0,pixelsExceedingTolerance:0,examples:[]};
const canvases=[];
function makeCanvas(width,height){
  if(failNextAllocation){failNextAllocation=false;throw Error('Injected replacement allocation failure');}
  allocations++;const canvas=createCanvas(width,height),ctx=canvas.getContext('2d'),get=ctx.getImageData.bind(ctx),listeners=new Map();
  ctx.getImageData=(...args)=>{reads++;return get(...args);};
  canvas.addEventListener=(name,listener)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(listener);};
  canvas.fire=name=>{for(const listener of listeners.get(name)||[])listener({type:name,target:canvas});};
  canvases.push(canvas);return canvas;
}
const fetchJSON=async url=>JSON.parse(await readFile(url,'utf8'));
const loadAssetImage=async url=>{imageLoads++;return loadImage(fileURLToPath(url));};
const manifest=await fetchJSON(new URL('assets/fantasy-biters/manifest.json',root));
assert.equal(manifest.artRevision,5);assert.equal(manifest.amplitudeScale,2);assert.equal(manifest.frames,49);assert.equal(manifest.blinkFrames,25);
assert.equal(manifest.walkingStrength,.5);assert.equal(FANTASY_MOUTH_FRAMES,49);assert.equal(FANTASY_BLINK_FRAMES,25);
assert.equal(manifest.blinkArtRevision,5);assert.deepEqual(manifest.sizeFit.pivot,[.5,.5]);assert.equal(manifest.sizeFit.scaleX,1.125);assert.equal(manifest.sizeFit.scaleY,1);
assert.equal(LIVE_MOUTH_FRAMES,19,'legacy enemy fallback retains its existing 19-pose cache');
assert.deepEqual(manifest.palettes,['p1','p2','ai']);
await assert.rejects(loadFantasyPlayerArt('bad',{makeCanvas,fetchJSON,loadImage:loadAssetImage}),/quality/i);
await assert.rejects(loadFantasyPlayerArt('hd',{makeCanvas,fetchJSON:async()=>{throw Error('injected missing manifest');},loadImage:loadAssetImage}),/injected missing manifest/);
await assert.rejects(loadFantasyPlayerArt('hd',{makeCanvas,fetchJSON,loadImage:async()=>{throw Error('injected missing image');}}),/injected missing image/);
for(const invalid of [{artRevision:4},{amplitudeScale:1},{walkingStrength:1},{blinkFrames:24},{blinkArtRevision:4},{sizeFit:undefined},{sizeFit:{scaleX:1,scaleY:1,pivot:[.5,.5]}},{sizeFit:{scaleX:1.125,scaleY:1.1,pivot:[.5,.5]}},{sizeFit:{scaleX:1.125,scaleY:1,pivot:[0,0]}}])
  await assert.rejects(loadFantasyPlayerArt('hd',{makeCanvas,fetchJSON:async()=>({...manifest,...invalid}),loadImage:loadAssetImage}),/revision|size fit/i,'reject stale art or accidentally doubled walking timing');

let widerNativeFrames=0,widerBlinkFrames=0;
const rawAsset=async file=>sharp(await readFile(new URL('assets/fantasy-biters/'+file,root))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
function replaceRawPatch(pixels,size,sheet,p,frame){
  const sx=frame%(p.columns||1)*(p.cellWidth||p.width+2)+(p.guard??1);
  const sy=Math.floor(frame/(p.columns||1))*p.stride+(p.guard??1);
  for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++){
    const src=((sy+y)*sheet.info.width+sx+(p.mirrorX?p.width-1-x:x))*4,dst=((p.y+y)*size+p.x+x)*4;
    sheet.data.copy(pixels,dst,src,src+4);
  }
}
for(const profile of ['hd','4k'])for(const palette of ['p1','p2','ai'])for(const light of ['normal','bright'])for(const direction of ['right','down','left','up']){
  const spec=manifest.profiles[profile],size=spec.size,definition=spec.sets[`${palette}:${light}:${direction}`];
  const base=await rawAsset(definition.base),sheet=await rawAsset(definition.mouth.file);
  assert.equal(base.info.width,size);assert.equal(base.info.height,size);assert.equal(base.info.channels,4);
  const digest=createHash('sha256'),blinkDigest=createHash('sha256'),patches=await Promise.all(definition.blink.map(async p=>({p,sheet:await rawAsset(p.file)})));
  for(let frame=0;frame<49;frame++){
    const pixels=Buffer.from(base.data);replaceRawPatch(pixels,size,sheet,definition.mouth,frame);digest.update(pixels);widerNativeFrames++;
  }
  for(let frame=0;frame<25;frame++){
    const pixels=Buffer.from(base.data);for(const {p,sheet}of patches)replaceRawPatch(pixels,size,sheet,p,frame);blinkDigest.update(pixels);widerBlinkFrames++;
  }
  const key=`${profile}:${palette}:${light}:${direction}`;
  assert.equal(digest.digest('hex'),approvedWiderFrameHashes[key],`${key}: all49 raw mouth poses match independently approved wider art`);
  assert.equal(blinkDigest.digest('hex'),approvedWiderBlinkHashes[key],`${key}: all25 raw blink poses match independently approved wider art`);
}

const atlasContext={};vm.runInNewContext(await readFile(new URL('src/config/render-atlas.js',root),'utf8'),atlasContext);
let originalAtlas=null,originalRasterContext=null;
const readSprite=source=>{
  if(source.__fantasySource){const canvas=makeCanvas(source.naturalWidth,source.naturalHeight);drawFantasySource(canvas.getContext('2d'),source,0,0,canvas.width);const raster=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);canvas.width=canvas.height=1;return raster;}
  const [,x,y,w,h]=source.region,scale=source.size/160;return originalRasterContext.getImageData(x*scale,y*scale,w*scale,h*scale);
};
const drawSource=(ctx,source,x,y,w,h)=>{
  if(source.__fantasySource)return drawFantasySource(ctx,source,x,y,w,h);
  const [,sx,sy,sw,sh]=source.region,scale=source.size/160;ctx.drawImage(originalAtlas,sx*scale,sy*scale,sw*scale,sh*scale,x,y,w,h);return true;
};
const service=createLiveMouthService({makeCanvas,readSprite,drawSource,tile:16,yieldTask:async()=>{}});
const actor=duration=>Object.freeze({x:4,y:3,dir:Object.freeze({x:1,y:0}),controllerTiltDegrees:17,
  moveFromX:3,moveFromY:3,moveToX:4,moveToY:3,moveStartedAt:1000,moveDuration:duration});
const directionNumber={right:2,down:3,left:4,up:1};
const bankNumber={right:0,down:1,left:2,up:3};
const optionsFor=(poses,direction)=>{const number=directionNumber[direction];return {open:poses[`Head${number}`],closed:poses[`Head${number}${number===1?'':'Close'}`],bank:bankNumber[direction],animateBlink:false};};
function expectedPatch(context,art,index,blink=0){
  const size=art.size;context.clearRect(0,0,size,size);context.drawImage(art.base,0,0,size,size);
  function patch(image,p,index){
    context.clearRect(p.x,p.y,p.width,p.height);
    const sx=(index%(p.columns||1))*(p.cellWidth||p.width+2)+(p.guard??1),sy=Math.floor(index/(p.columns||1))*p.stride+(p.guard??1);
    if(p.mirrorX){context.save();context.translate(p.x+p.width,p.y);context.scale(-1,1);context.drawImage(image,sx,sy,p.width,p.height,0,0,p.width,p.height);context.restore();}
    else context.drawImage(image,sx,sy,p.width,p.height,p.x,p.y,p.width,p.height);
  }
  patch(art.sheet,art.mouth,index);if(blink)for(const p of art.blink)patch(p.image,p,blink);
}
let previousDescriptor=null,previousOptions=null,lastGroups=null;
for(const profile of ['hd','4k']){
  const loadedBefore=imageLoads,pack=await loadFantasyPlayerArt(profile,{makeCanvas,fetchJSON,loadImage:loadAssetImage}),size=profile==='hd'?80:160;
  assert.equal(pack.size,size);assert.equal(pack.artRevision,5);assert.equal(pack.decodedBytes,manifest.profiles[profile].decodedBytes);
  assert.equal(Object.keys(pack.sets).length,24);assert.deepEqual(Object.keys(pack.groups).sort(),['ai','p1','p2']);
  const uniqueFiles=new Set(Object.values(manifest.profiles[profile].sets).flatMap(set=>[set.base,set.closed,set.mouth.file,...set.blink.map(p=>p.file)]));
  assert.equal(imageLoads-loadedBefore,uniqueFiles.size,'shared/mirrored packed images decode once per quality request');
  originalAtlas=await loadImage(fileURLToPath(new URL(`assets/atlases/${profile}/modern-characters-${size}.png`,root)));
  const atlasCanvas=createCanvas(originalAtlas.width,originalAtlas.height);originalRasterContext=atlasCanvas.getContext('2d');originalRasterContext.drawImage(originalAtlas,0,0);
  const hunterPoses={};for(const[key,region]of Object.entries(atlasContext.MAZE_BITERS_RENDER_ATLAS.characters))if(key.startsWith('hunter:0:normal:')){
    const name=key.split(':').at(-1);hunterPoses[name]={__hvSpriteName:name,region,size};
  }
  assert.ok(hunterPoses.EnemyHead2,'actual hunter palette exists in original atlas');
  const legacyHead1={__hvSpriteName:'Head1',region:atlasContext.MAZE_BITERS_RENDER_ATLAS.characters['player:p1:normal:Head1'],size};
  const groups={player:pack.groups,legacyPlayer:{p1:{normal:{Head1:legacyHead1}}},hunter:{0:{normal:hunterPoses}},fantasyPlayerArtBytes:pack.decodedBytes};
  const oldResources=canvases.filter(c=>c.width>1&&c.height>1);
  assert.equal(await service.prepare(groups),true);lastGroups=groups;
  assert.equal(service.stats.fantasySets,24);assert.equal(service.stats.sets,28);
  assert.equal(service.stats.playerFrames,49);assert.equal(service.stats.frames,19);assert.equal(service.stats.blinkFrames,25);
  assert.equal(service.stats.playerArtBytes,pack.decodedBytes);
  assert.ok(canvases.every(c=>c.width<=2048&&c.height<=2048),'all owned retained surfaces fit older 2048px canvas/GPU limits');
  if(previousDescriptor){
    assert.equal(service.sprite(actor(95),1020,previousOptions),null,'old quality sources cannot select a replacement generation');
    assert.equal(service.draw(createCanvas(size,size).getContext('2d'),previousDescriptor,0,0,size),false,'stale descriptor cannot sample released quality');
    assert.ok(oldResources.every(c=>c.width===1&&c.height===1),'quality replacement releases all service-owned old native surfaces');
  }
  const output=createCanvas(size,size),out=output.getContext('2d'),expected=createCanvas(size,size),reference=expected.getContext('2d'),maskOutput=createCanvas(size,size),maskContext=maskOutput.getContext('2d'),maskExpected=createCanvas(size,size),maskReference=maskExpected.getContext('2d');
  const scaledMask=createCanvas(size*2,size*2),scaledMaskContext=scaledMask.getContext('2d'),scaledExpected=createCanvas(size*2,size*2),scaledReference=scaledExpected.getContext('2d');
  const beforeAlloc=allocations,beforeRead=reads;
  for(const palette of ['p1','p2','ai'])for(const light of ['normal','bright'])for(const direction of ['right','down','left','up']){
    const poses=pack.groups[palette][light],options=optionsFor(poses,direction),a=actor(95),initial=structuredClone(a);
    assert.equal(options.open.__fantasySource.set,pack.sets[`${palette}:${light}:${direction}`]);
    service.sprite(a,900,options);service.bite(a,1000,100,900);
    for(let frame=0;frame<49;frame++){
      const time=1000+100*invertEase(frame/48),descriptor=service.sprite(a,time,options),live=descriptor.__liveMouth;
      assert.equal(live.index,frame);assert.equal(live.set.frameCount,49);assert.equal(live.set.contacts.length,49);
      assert.equal(descriptor,service.sprite(a,time,options),'non-blinking frame descriptors remain stable');
      out.clearRect(0,0,size,size);assert.equal(service.draw(out,descriptor,0,0,size),true);
      expectedPatch(reference,live.set.art,frame);
      assert.deepEqual(out.getImageData(0,0,size,size).data,reference.getImageData(0,0,size,size).data,'runtime draw exactly reconstructs the packed native pose');
      poseChecks++;drawChecks++;
      if(frame===0||frame===48){
        reference.clearRect(0,0,size,size);reference.drawImage(frame===0?live.set.art.base:live.set.art.closed,0,0,size,size);
        assert.deepEqual(out.getImageData(0,0,size,size).data,reference.getImageData(0,0,size,size).data,'pack endpoints reconstruct their approved native open/partial-bite pixels');
      }
      if(palette==='p1'&&light==='normal'&&direction!=='up'&&[0,1,6,7,13,14,47,48].includes(frame)){
        const mask=live.set.intake;
        assert.equal(mask.columns,7);assert.equal(mask.guard,1);assert.ok(mask.sheet.width*mask.sheet.height<size*(size/2)*49,'guarded cropped mask packing stays below the original byte budget');
        maskContext.clearRect(0,0,size,size);assert.equal(service.drawIntakeMask(maskContext,descriptor,0,0,size),true);
        const pixels=maskReference.createImageData(size,size);
        pixels.data.set(buildFantasyMouthIntakeMask({width:size,height:size,data:out.getImageData(0,0,size,size).data},options.bank,frame/48));
        maskReference.putImageData(pixels,0,0);
        assert.deepEqual(maskContext.getImageData(0,0,size,size).data,maskReference.getImageData(0,0,size,size).data,'packed mask and old full-raster anatomy match across row wraps');maskChecks++;
        for(const scale of [2,1.25]){
          const offset=scale===2?0:.25;
          scaledMaskContext.clearRect(0,0,size*2,size*2);service.drawIntakeMask(scaledMaskContext,descriptor,offset,offset,size*scale);
          scaledReference.clearRect(0,0,size*2,size*2);scaledReference.drawImage(maskExpected,offset,offset,size*scale,size*scale);
          const actual=scaledMaskContext.getImageData(0,0,size*2,size*2).data,expected=scaledReference.getImageData(0,0,size*2,size*2).data;
          if(scale===2)assert.deepEqual(actual,expected,'packed mask is pixel-exact at actual HD2x scratch scale');
          else for(let i=0;i<actual.length;i+=4){
            // Different source-rectangle origins may round a fractional
            // bilinear alpha by one level. At the transformed outer actor
            // boundary, clip coverage adds one more quantization. Independently
            // verified for the same native tile: standalone guarded crop=134,
            // atlas crop=133, full reference=135; no neighbouring frame bleed.
            // Allow two ONLY at that outer edge; RGB/native/HD2x stay exact.
            const delta=Math.abs(actual[i+3]-expected[i+3]);
            const pixelX=i/4%(size*2),pixelY=Math.floor(i/4/(size*2));
            const first=Math.floor(offset),last=Math.ceil(offset+size*scale)-1;
            const outerEdge=pixelX===first||pixelX===last||pixelY===first||pixelY===last;
            fractionalMaskDiagnostics.maxAlphaDifference=Math.max(fractionalMaskDiagnostics.maxAlphaDifference,delta);
            if(delta>1){
              fractionalMaskDiagnostics.pixelsOverOne++;
              if(outerEdge)fractionalMaskDiagnostics.outerEdgePixelsOverOne++;
              if(fractionalMaskDiagnostics.examples.length<8)fractionalMaskDiagnostics.examples.push({profile,direction,frame,x:pixelX,y:pixelY,actual:actual[i+3],expected:expected[i+3],outerEdge});
            }
            if(delta>(outerEdge?2:1))fractionalMaskDiagnostics.pixelsExceedingTolerance++;
            if(actual[i+3]&&expected[i+3])for(let channel=0;channel<3;channel++)assert.equal(actual[i+channel],expected[i+channel]);
          }
        }
      }
    }
    assert.deepEqual(a,initial,'player presentation never mutates movement/tilt/collision coordinates');
  }
  assert.equal(allocations,beforeAlloc,'all mouth drawing uses previously allocated native surfaces');
  assert.equal(reads,beforeRead,'all mouth drawing avoids runtime pixel readback');

  // Run the real engine entry points: native movement/axis tilt remain owned
  // by the existing controller, while render and contact paths select the
  // correct player palette (never a hunter set).
  for(const palette of ['p1','p2','ai'])for(const light of ['normal','bright'])for(const direction of ['right','down','left','up'])for(const mouthOpen of [false,true]){
    const number=directionNumber[direction],p={id:palette==='p2'?2:1,isAI:palette==='ai',dir:{x:1,y:0},mouthOpen,controllerTiltDegrees:17};
    const sources=Object.fromEntries([1,2,3,4].flatMap(n=>[`Head${n}`,`Head${n}Close`]).map(name=>[name,{__hvSpriteName:name}]));
    const descriptor={approved:true},transform=[],draws=[];let selected=null,contact=null;
    const context={OriginalSprites:sources,OriginalCharacterSpriteCache:{},directionNumber:()=>number,TILE:16,
      CharacterSpriteGroups:groups,levelCompletionTransition:null,SnakeNeon:null,
      playerVisualPosition:(entity,time,out={})=>Object.assign(out,{x:3,y:4}),gameplaySpriteVisible:()=>true,
      isPowerMode:()=>false,isSpawnProtected:()=>false,competitiveLeaderVisual:()=>null,
      drawOriginalSprite:(sprite,x,y)=>{draws.push({sprite,x,y});return true;},rect(){throw Error('Unexpected player fallback');},
      ctx:{save:()=>transform.push('save'),translate:(x,y)=>transform.push(['translate',x,y]),rotate:r=>transform.push(['rotate',r]),restore:()=>transform.push('restore')},
      MazeBitersLive:{mouth:{sprite:(entity,time,options)=>{selected={entity,time,options};return descriptor;},geometry:(entity,time,options)=>{contact={entity,time,options};return 'contact';}}},
      p,levelFlash:light==='bright',
    };
    vm.runInNewContext(`${functionSource(game,'originalCharacterSprite')}\n${functionSource(game,'drawPlayer')}\n${functionSource(game,'physicalCharacterGeometry')}\ndrawPlayer(p,1234,[p],{leader:false,levelFlash});\nphysicalCharacterGeometry(p,1234);`,context);
    const expectedOptions=optionsFor(pack.groups[palette][light],direction),physicalOptions=optionsFor(pack.groups[palette].normal,direction);
    assert.equal(selected.entity,p);assert.equal(selected.time,1234);assert.equal(selected.options.open,expectedOptions.open);assert.equal(selected.options.closed,expectedOptions.closed);assert.equal(selected.options.bank,expectedOptions.bank);
    assert.equal(contact.entity,p);assert.equal(contact.time,1234);assert.equal(contact.options.open,physicalOptions.open);assert.equal(contact.options.closed,physicalOptions.closed);assert.equal(contact.options.bank,physicalOptions.bank);
    assert.equal(draws.length,1);assert.equal(draws[0].sprite,descriptor);assert.equal(draws[0].x,3);assert.equal(draws[0].y,4);
    assert.deepEqual(transform,['save',['translate',56,72],['rotate',17*Math.PI/180],['translate',-56,-72],'restore']);
    assert.equal(p.controllerTiltDegrees,17);assert.equal(p.dir.x,1);assert.equal(p.dir.y,0);playerSelections++;
  }

  const playerOptions=optionsFor(pack.groups.p1.normal,'right');
  for(const duration of [95,47.5,218]){
    const a=actor(duration);service.sprite(a,1000,playerOptions);
    for(let step=0;step<=100;step++){
      const phase=(step/100)%1,time=1000+duration*step/100;
      near(service.closure(a,time),.5*(.66+.14*Math.cos(2*Math.PI*phase)),'50% approved walking strength follows actual cell progress');timingChecks++;
    }
    near(service.closure(a,2000),.4,'stopped new hero holds native final phase');
  }
  const stopped=Object.freeze({...actor(95),moveFromX:4,moveToX:4});
  for(const duration of [95,140]){
    service.reset(stopped);service.sprite(stopped,900,playerOptions);service.bite(stopped,1000,duration,966.75);
    near(service.closure(stopped,966.75),.4,'bite lead starts continuously from walking pose');
    near(service.closure(stopped,1000),0,'mouth fully opens at bite onset');
    near(service.closure(stopped,1000+duration),1,'tail/head bite reaches complete authored bite pose');
    near(service.closure(stopped,1090+duration),.4,'bite releases in the original90game ms');
    const breaks=service.breakpoints(stopped,900,1250);let previous=Math.round(service.closure(stopped,900)*48);
    for(let t=900.05;t<=1250;t+=.05){const next=Math.round(service.closure(stopped,t)*48);if(next!==previous)assert.ok(breaks.some(b=>Math.abs(b-t)<.051),`49-pose collision transition at ${t} is bracketed`);previous=next;}
  }
  const h=actor(95),hunterOptions={open:hunterPoses.EnemyHead2,closed:hunterPoses.EnemyHead2Close,bank:0};
  const hd=service.sprite(h,1020,hunterOptions);assert.equal(!!hd.__liveMouth.set.fantasy,false);assert.equal(hd.__liveMouth.set.contacts.length,19);
  near(service.closure(h,1020),.66+.14*Math.cos(2*Math.PI*20/95),'hunter walking strength remains unchanged');

  // Rendering owns cosmetic time. Speculative future/backward collision probes
  // cannot advance, restart or consume the independent visual blink clock.
  service.reset();const blinking=actor(95),blinkOptions={...playerOptions,animateBlink:true};
  const originalRandom=Math.random;Math.random=()=>{throw Error('Cosmetic blink touched gameplay RNG');};
  try{
    service.geometry(blinking,50000,playerOptions,{});service.sprite(blinking,0,blinkOptions);
    service.sprite(blinking,900,blinkOptions);
    service.geometry(blinking,90000,playerOptions,{});service.geometry(blinking,1,playerOptions,{});
    const descriptor=service.sprite(blinking,950,blinkOptions),index=Math.round(ease(50/70)*24);
    assert.equal(descriptor.__liveMouth.blink,index,'collision lookahead does not shift or reset scheduled blink');
    assert.equal(service.sprite(blinking,950,blinkOptions),descriptor,'paused game time freezes eyelids');
    const bare=service.sprite(blinking,950,playerOptions);assert.equal(bare.__liveMouth.blink,undefined);
    assert.equal(descriptor.__liveMouth.set.contacts[descriptor.__liveMouth.index],bare.__liveMouth.set.contacts[bare.__liveMouth.index]);
    const withBlink=service.geometry(blinking,950,{...playerOptions,descriptor},{}),withoutBlink=service.geometry(blinking,950,{...playerOptions,descriptor:bare},{});
    assert.deepEqual(withBlink,withoutBlink,'eyelids never change physical contact geometry');
    const beforeBlinkAlloc=allocations,beforeBlinkRead=reads;
    out.clearRect(0,0,size,size);service.draw(out,descriptor,0,0,size);expectedPatch(reference,descriptor.__liveMouth.set.art,descriptor.__liveMouth.index,index);
    assert.deepEqual(out.getImageData(0,0,size,size).data,reference.getImageData(0,0,size,size).data,'blink replaces only approved eye patches in the same complete native pose');
    service.drawLeader(out,descriptor,0,0,size);service.drawIntakeMask(out,descriptor,0,0,size);
    assert.equal(allocations,beforeBlinkAlloc);assert.equal(reads,beforeBlinkRead,'blink/leader/intake playback never reads pixels');
  }finally{Math.random=originalRandom;}
  previousOptions=playerOptions;previousDescriptor=service.sprite(actor(95),1020,playerOptions);
  console.log(`${profile}:24 Fantasy sets,49mouth/25blink poses,${(service.stats.bytes/1048576).toFixed(2)}MiB reported active caches; legacy hunter fallback retains19poses.`);
}

const set=previousDescriptor.__liveMouth.set,generation=set.generation;
failNextAllocation=true;
await assert.rejects(service.prepare(lastGroups),/Injected replacement allocation failure/);
assert.equal(service.ready,true,'failed replacement preserves the active usable cache');
assert.equal(service.draw(createCanvas(160,160).getContext('2d'),previousDescriptor,0,0,160),true);
set.composite.fire('contextlost');assert.equal(service.ready,false);
assert.equal(service.sprite(actor(95),1020,previousOptions),null);
assert.equal(service.draw(createCanvas(160,160).getContext('2d'),previousDescriptor,0,0,160),false);
set.composite.fire('contextrestored');set.leader.image.fire('contextrestored');
assert.equal(await service.whenRestored(),true);assert.equal(service.ready,true);
const restored=service.sprite(actor(95),1020,previousOptions);
assert.equal(restored.__liveMouth.set.generation,generation+2,'failed replacement keeps request IDs monotonic and multiple restoration notifications coalesce into one rebuilt generation');
assert.equal(service.draw(createCanvas(160,160).getContext('2d'),previousDescriptor,0,0,160),false);
service.dispose();assert.equal(service.ready,false);assert.equal(service.stats.bytes,0);
assert.ok(canvases.every(c=>c.width===1&&c.height===1),'dispose releases all owned surfaces, including native composites and intake masks');
assert.equal(service.draw(createCanvas(160,160).getContext('2d'),restored,0,0,160),false);
assert.equal(fractionalMaskDiagnostics.pixelsExceedingTolerance,0,`fractional mask alpha: <=1 generally, <=2 only at transformed outer clip edge: ${JSON.stringify(fractionalMaskDiagnostics)}`);
console.log(`Fractional mask rounding: ${fractionalMaskDiagnostics.pixelsOverOne} samples exceed one alpha level, all ${fractionalMaskDiagnostics.outerEdgePixelsOverOne} on the outer clip edge; maximum ${fractionalMaskDiagnostics.maxAlphaDifference}/255; RGB and native/HD2x masks exact.`);
console.log(`PASS Fantasy player integration:14 exact hunter/player/legacy hashes,5 preserved cosmetic modules,unchanged mouth timing,${widerNativeFrames} independently approved raw wider2x mouth frames,${widerBlinkFrames} independently approved wider blink poses,${hunterSelections} hunter selections,${playerSelections} player render/contact selections,${poseChecks} packed native poses,${drawChecks} cached draws,${timingChecks} clock samples,${maskChecks} compact masks; blink/collision isolation and quality/context recovery after failed replacement.`);


