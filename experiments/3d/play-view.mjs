// Keep the arena usable even in an embedded browser without native fullscreen.
// Only fullscreen owned by this arena is ever exited by the game.
export class PlayView{
  constructor(arena,onManualExit){
    this.arena=arena;this.onManualExit=onManualExit;
    this.active=false;this.pending=false;this.hadNative=false;
    document.addEventListener('fullscreenchange',()=>{
      if(document.fullscreenElement===this.arena){
        this.hadNative=true;
        if(!this.active)this.closeNative();
      }else if(this.hadNative){
        this.hadNative=false;
        if(this.active)this.exit(true);
      }
    });
  }
  enter(){
    this.active=true;document.body.classList.add('play-view');
    if(this.pending||document.fullscreenElement===this.arena||!this.arena.requestFullscreen)return;
    // This call stays in the start/resume button's user-activation stack.
    this.pending=true;
    try{
      Promise.resolve(this.arena.requestFullscreen({navigationUI:'hide'}))
        .catch(()=>{}) // The viewport-filling layout remains the fallback.
        .finally(()=>{
          this.pending=false;
          if(!this.active)this.closeNative();
        });
    }catch{this.pending=false;}
  }
  closeNative(){
    if(document.fullscreenElement!==this.arena)return;
    try{Promise.resolve(document.exitFullscreen()).catch(()=>{});}catch{}
  }
  exit(manual=false){
    const wasActive=this.active;
    this.active=false;document.body.classList.remove('play-view');
    this.closeNative();
    if(manual&&wasActive)this.onManualExit();
  }
}
