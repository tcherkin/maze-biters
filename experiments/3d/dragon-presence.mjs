// Small secondary animation, independent of locomotion and the game clock's
// speed multiplier. Only the chest surface, rigid head and eyelids are posed;
// route bones, support feet, collision root and jaw remain owned by their rigs.
const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=v=>{const t=clamp(v,0,1);return t*t*(3-2*t);};

export class DragonPresence{
  constructor({rig}){
    this.rig=rig;
    this.headPosition=rig.head.position.clone();
    this.headRotation=rig.head.rotation.clone();
    this.reset();
  }
  random(){
    // Private deterministic sequence: blinking must never consume AI randomness.
    this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;
    return this.seed/4294967296;
  }
  reset(){
    this.seed=0x51d4a60b;this.time=0;this.phase=0;this.movement=0;
    this.lastTime=null;this.generation=null;this.level=null;this.epoch=null;
    this.wasDead=false;this.blinkStart=null;this.blinks=0;this.doubleBlink=false;
    this.nextBlink=2.8+this.random()*1.4;this.breath=0;this.blink=[0,0];
    this.apply(0,0,0,0,0);
  }
  apply(breath,lift,pitch,roll,blinkTime){
    for(const mesh of this.rig.chest)mesh.morphTargetInfluences[0]=breath;
    const head=this.rig.head;
    head.position.copy(this.headPosition);head.position.y+=lift;
    head.rotation.copy(this.headRotation);head.rotation.x+=pitch;head.rotation.z+=roll;
    for(let i=0;i<this.rig.eyelids.length;i++){
      const t=blinkTime-i*.008;
      const closure=blinkTime>0?(t<.062?smooth(t/.062):t<.086?1:1-smooth((t-.086)/.126)):0;
      this.blink[i]=closure;
      // Keep the same render resources resident even during the long open phase.
      this.rig.eyelids[i].morphTargetInfluences[0]=closure;
    }
  }
  update(root,player,snapshot,elapsed,activity=0){
    if(!player)return;
    if(player.dead||player.hidden){
      if(!this.wasDead)this.apply(0,0,0,0,0);
      this.wasDead=true;return;
    }
    const time=snapshot.time??0,generation=snapshot.generation??null,level=snapshot.level??null,epoch=player.route?.epoch??null;
    if(this.wasDead||this.lastTime!==null&&(time<this.lastTime||generation!==this.generation||level!==this.level||epoch!==this.epoch))this.reset();
    const first=this.lastTime===null;
    this.lastTime=time;this.generation=generation;this.level=level;this.epoch=epoch;
    if(first||snapshot.paused||snapshot.gameOver||snapshot.complete)return;
    const dt=Number.isFinite(elapsed)&&elapsed>0&&elapsed<=.25?elapsed:0;
    this.time+=dt;
    this.movement+=(clamp(activity,0,1)-this.movement)*(1-Math.exp(-4*dt));
    this.phase=(this.phase+dt*TAU*(.29+.045*this.movement))%TAU;
    // Quiet inhalation with a soft rest between breaths; head follows the chest
    // with a small delay. No horizontal displacement or root bobbing.
    const amount=1-.42*this.movement,envelope=1-Math.exp(-this.time*2);
    const inhale=(1-Math.cos(this.phase))*.5;
    this.breath=inhale*inhale*amount*envelope;
    const delayed=(1-Math.cos(this.phase-.26))*.5;
    const follow=(2*delayed*delayed-1)*amount*envelope;
    if(this.blinkStart===null&&this.time>=this.nextBlink){
      this.blinkStart=this.nextBlink;this.blinks++;
    }
    let blinkTime=this.blinkStart===null?0:this.time-this.blinkStart;
    if(blinkTime>=.220){
      const end=this.blinkStart+.220;
      const double=!this.doubleBlink&&this.random()<.12;
      this.doubleBlink=double;
      this.nextBlink=end+(double?.16+this.random()*.10:3.3+this.random()*3.5);
      this.blinkStart=null;blinkTime=0;
    }
    this.apply(this.breath,.006*follow,-.009*follow,.0035*Math.sin(this.time*.73)*amount*envelope,blinkTime);
  }
  diagnostics(){return {breath:this.breath,blink:[...this.blink],blinks:this.blinks,movement:this.movement,time:this.time};}
}
