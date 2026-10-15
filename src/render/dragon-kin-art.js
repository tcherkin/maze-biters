// Approved enemy artwork uses the same native mouth/eyelid patch contract
// as the protagonists, with separate palette identity and asset ownership.
import {FANTASY_MOUTH_FRAMES,FANTASY_BLINK_FRAMES} from './fantasy-player-art.js?v=1.02.15.00';

const ROOT=new URL('../../assets/dragon-kin/',import.meta.url);
const DIRECTIONS=['right','down','left','up'];
const NUMBERS=[2,3,4,1];
export const DRAGON_KIN_PALETTES=Object.freeze(['h1','h3','h4']);

export async function loadDragonKinArt(profile,{makeCanvas,fetchJSON=null,loadImage=null}={}){
  profile=String(profile).toLowerCase();
  if(!['hd','4k'].includes(profile))throw Error('Unknown Dragon Kin quality');
  const manifestURL=new URL('manifest.json?v=1.02.15.01',ROOT);
  const manifest=await (fetchJSON?fetchJSON(manifestURL):fetch(manifestURL).then(r=>{
    if(!r.ok)throw Error('Dragon Kin manifest unavailable');return r.json();
  }));
  if(manifest.artRevision!==5||manifest.amplitudeScale!==2||manifest.walkingStrength!==.5||
    manifest.frames!==FANTASY_MOUTH_FRAMES||manifest.blinkFrames!==FANTASY_BLINK_FRAMES||manifest.blinkArtRevision!==5)
    throw Error('Wrong approved Dragon Kin revision');
  if(manifest.sizeFit?.scaleX!==1.125||manifest.sizeFit?.scaleY!==1||
    manifest.sizeFit?.pivot?.[0]!==.5||manifest.sizeFit?.pivot?.[1]!==.5)
    throw Error('Wrong approved Dragon Kin size fit');
  if(JSON.stringify(manifest.palettes)!==JSON.stringify(DRAGON_KIN_PALETTES))
    throw Error('Invalid Dragon Kin palette identities');
  const spec=manifest.profiles?.[profile],size=profile==='hd'?80:160;
  if(spec?.size!==size||!Number.isFinite(spec.decodedBytes)||spec.decodedBytes<0)
    throw Error('Invalid Dragon Kin native pack');
  const expected=DRAGON_KIN_PALETTES.flatMap(p=>DIRECTIONS.map(d=>`${p}:normal:${d}`));
  if(Object.keys(spec.sets||{}).length!==expected.length||expected.some(key=>!spec.sets[key]))
    throw Error('Incomplete Dragon Kin palette/state/direction pack');
  const images=new Map();
  const image=file=>{
    if(typeof file!=='string'||!file)throw Error('Missing Dragon Kin image');
    if(!images.has(file))images.set(file,(async()=>{
      const url=new URL(file,ROOT);
      url.searchParams.set('v','1.02.15.01');
      if(loadImage)return loadImage(url);
      const result=new Image();result.decoding='async';result.src=url.href;await result.decode();return result;
    })());
    return images.get(file);
  };
  const sets={},groups={};
  await Promise.all(expected.map(async key=>{
    const definition=spec.sets[key],[palette,light,direction]=key.split(':');
    if(definition.mouth?.frames!==FANTASY_MOUTH_FRAMES||!Array.isArray(definition.blink))
      throw Error('Invalid Dragon Kin animation patches');
    const set={...definition,key,kind:'hunter',palette,light,direction,size,makeCanvas,
      base:await image(definition.base),closed:await image(definition.closed),
      sheet:await image(definition.mouth.file),blink:await Promise.all(definition.blink.map(async patch=>({...patch,image:await image(patch.file)})))};
    sets[key]=set;
    const number=NUMBERS[DIRECTIONS.indexOf(direction)],paletteIndex=Number(palette.slice(1));
    const poses=(groups[paletteIndex]??={})[light]??=((groups[paletteIndex])[light]={});
    const source=closed=>Object.freeze({__fantasySource:{set,closed},
      __hvSpriteName:`EnemyHead${number}${closed&&number!==1?'Close':''}`,
      complete:true,naturalWidth:size,naturalHeight:size});
    poses[`EnemyHead${number}`]=source(false);
    if(number!==1)poses[`EnemyHead${number}Close`]=source(true);
  }));
  return {profile,size,groups,sets,decodedBytes:spec.decodedBytes,artRevision:manifest.artRevision};
}
