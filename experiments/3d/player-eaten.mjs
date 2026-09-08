import * as THREE from './vendor/three.module.min.js';
import {animateSnakeMouth} from './models/snake.mjs';
import {snakeMouthOpening} from './snake-mouth.mjs';
import {PLAYER_SCALE} from './world.mjs';
import {ConsumptionBloom,BLOOM_MS} from './consumption-bloom.mjs';

// Game time, shared with movement and the speed control. The larger helmeted
// victim gets a little longer than a tail segment to remain recognizable.
export const PLAYER_SWALLOW_MS=240,PREDATOR_CHOMP_MS=310;
const clamp=t=>Math.max(0,Math.min(1,t));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const mix=THREE.MathUtils.lerp;

export class PlayerEaten{
  constructor(bloomAssets=null){
    this.mouth=new THREE.Vector3();this.from=new THREE.Vector3();
    this.bloom=new ConsumptionBloom({poolSize:1,assets:bloomAssets});
    this.reset();
  }
  reset(){
    this.active=null;this.consumed=null;this.lastSerial=0;this.time=0;
    this.lastAlive=null;
    this.bloom.reset();
  }
  matchesDeath(event,player){
    return Boolean(player?.dead&&event&&event.playerId===player.id&&event.time===player.deathStartedAt);
  }
  beginFrame(snapshot,layout,dt){
    const p=snapshot.player;
    if(snapshot.gameOver){
      this.time=Math.max(snapshot.time,this.time);
      if(!snapshot.paused)this.time=Math.min(snapshot.time+Math.max(PREDATOR_CHOMP_MS,BLOOM_MS),this.time+dt*1000*(snapshot.speed??.5));
    }else this.time=snapshot.time;
    if(!this.matchesDeath(this.consumed,p)){this.active=null;this.consumed=null;this.bloom.reset();}
    for(const event of snapshot.predations??[]){
      if(event.id<=this.lastSerial)continue;
      this.lastSerial=event.id;
      if(!this.matchesDeath(event,p))continue;
      // Remember the consumed life even if a delayed frame misses the entire
      // animation. Its old body must not reappear during the respawn wait.
      this.consumed=event;
      this.from.set(layout.x(event.player.visual.x),0,layout.z(event.player.visual.y));
      if(this.time-event.time<BLOOM_MS)
        this.bloom.spawn(event,this.from.clone().setY(.42*PLAYER_SCALE),this.time,0x83d51f,event.snake.dir,1.05);
      this.active={event,yaw:this.lastAlive?.yaw??Math.atan2(event.player.dir.x,event.player.dir.y),
        playerJaw:this.lastAlive?.jaw??.08+.14*(.5+.5*Math.sin(event.time/130)),
        opening:snakeMouthOpening(event.snake.id,event.time)};
    }
    if(p?.hidden||!this.matchesDeath(this.consumed,p)){this.active=null;this.bloom.reset();}
  }
  update(snapshot,player,snakes){
    const p=snapshot.player;
    if(!p?.dead){
      if(p&&!p.hidden)this.lastAlive={yaw:player.rotation.y,jaw:player.userData.jaw.rotation.x};
      return;
    }
    if(!this.matchesDeath(this.consumed,p))return;
    player.visible=false;
    const attacker=snakes.get(this.consumed.snake.id);
    if(!attacker){this.active=null;this.bloom.reset();return;}
    attacker.head.updateWorldMatrix(true,false);
    this.mouth.set(0,.295,.24).applyMatrix4(attacker.head.matrixWorld);
    this.bloom.update(this.time,this.mouth);
    if(!this.active)return;
    const {event,yaw,playerJaw,opening}=this.active;
    const age=Math.max(0,this.time-event.time),phase=clamp(age/PREDATOR_CHOMP_MS);
    const idle=snakeMouthOpening(event.snake.id,snapshot.time);
    // Open, hold while the helmet passes, snap closed, then recover the
    // attacker's independent breathing/chomping cycle without a pose jump.
    const amount=phase<.20?mix(opening,1,smooth(phase/.20))
      :phase<.52?1:phase<.80?1-smooth((phase-.52)/.28)
        :mix(0,idle,smooth((phase-.80)/.20));
    animateSnakeMouth(attacker.head,amount);
    if(age<PLAYER_SWALLOW_MS&&!p.hidden){
      const progress=clamp(age/PLAYER_SWALLOW_MS),pull=smooth((progress-.12)/.88);
      const size=(1-pull)**1.15,squash=Math.sin(Math.PI*pull);
      player.visible=true;player.position.lerpVectors(this.from,this.mouth,smooth(progress));
      player.rotation.set(0,yaw,0);
      player.scale.set(PLAYER_SCALE*size*(1+.12*squash),PLAYER_SCALE*size*(1-.20*squash),PLAYER_SCALE*size);
      // Guide the centre of the shrinking helmet/face through the opening;
      // aiming the feet at it would leave the mouthful hovering above the jaw.
      player.position.y-=.43*player.scale.y*smooth(progress);
      player.userData.jaw.rotation.x=mix(playerJaw,.28,smooth(progress/.4));
    }
    if(age>=PREDATOR_CHOMP_MS)this.active=null;
  }
}
