// Render native glyphs directly into physical display pixels. CSS padding
// and the glass backdrop belong to the element; only the lettering is drawn.
export class Hud {
  constructor(engine,hud,logo){
    this.engine=engine;this.signature='';this.ratio=0;
    this.panels=[{canvas:hud,width:576,height:32,draw:ctx=>engine.hud(ctx)},
      {canvas:logo,width:176,height:16,draw:ctx=>engine.title(ctx)}];
    for(const panel of this.panels){panel.context=panel.canvas.getContext('2d');panel.dirty=true;}
    this.observer=new ResizeObserver(entries=>{
      for(const entry of entries){
        const panel=this.panels.find(p=>p.canvas===entry.target);
        panel.cssWidth=entry.contentRect.width;panel.cssHeight=entry.contentRect.height;panel.dirty=true;
      }
    });
    for(const panel of this.panels)this.observer.observe(panel.canvas);
  }
  render(snapshot){
    const ratio=globalThis.devicePixelRatio||1;
    if(ratio!==this.ratio){this.ratio=ratio;for(const panel of this.panels)panel.dirty=true;}
    const signature=JSON.stringify([snapshot.player?.score,snapshot.player?.lives,snapshot.snakes.length]);
    if(signature!==this.signature){this.signature=signature;this.panels[0].dirty=true;}
    for(const panel of this.panels){
      if(!panel.dirty)continue;
      const {canvas,context:ctx}=panel;
      if(panel.cssWidth===undefined){
        const style=getComputedStyle(canvas);
        panel.cssWidth=canvas.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
        panel.cssHeight=canvas.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
      }
      const width=Math.max(1,Math.round(panel.cssWidth*ratio)),height=Math.max(1,Math.round(panel.cssHeight*ratio));
      if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,width,height);
      const scale=Math.min(width/panel.width,height/panel.height);
      ctx.setTransform(scale,0,0,scale,(width-panel.width*scale)/2,(height-panel.height*scale)/2);
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      panel.draw(ctx);panel.dirty=false;
    }
  }
  diagnostics(){return {pixelRatio:this.ratio,panels:this.panels.map(p=>({id:p.canvas.id,
    backing:[p.canvas.width,p.canvas.height],content:[p.cssWidth,p.cssHeight]}))};}
}
