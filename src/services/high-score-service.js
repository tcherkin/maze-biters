// Maze Biters high-score persistence and future website API adapter.
// The game works offline through localStorage. A website can enable the
// shared leaderboard by setting the maze-biters-high-score-api meta tag.
(() => {
  const STORAGE_KEY='maze-biters.high-scores.v1';
  const MAX_ENTRIES=25;
  const MAX_NAME_LENGTH=8;
  const ALLOWED_NAME=/[A-Z0-9'@,\.\-?]/;
  const listeners=new Set();

  const configuredEndpoint=()=>{
    const configured=globalThis.MAZE_BITERS_CONFIG?.highScoreEndpoint;
    const meta=document.querySelector?.('meta[name="maze-biters-high-score-api"]')
      ?.getAttribute('content');
    return String(configured??meta??'').trim();
  };

  function sanitizeName(value){
    const normalized=String(value??'')
      .normalize('NFKD')
      .toUpperCase()
      .replace(/\s+/g,' ')
      .trim();
    let result='';
    for(const character of normalized){
      if(ALLOWED_NAME.test(character)) result+=character;
      if(result.length>=MAX_NAME_LENGTH) break;
    }
    return result.trim();
  }

  function normalizeEntry(candidate){
    if(!candidate||typeof candidate!=='object') return null;
    const name=sanitizeName(candidate.name);
    const score=Math.max(0,Math.floor(Number(candidate.score)||0));
    if(!name||score<=0) return null;
    const createdAt=String(candidate.createdAt||new Date().toISOString());
    const playerIds=Array.isArray(candidate.playerIds)
      ?candidate.playerIds.map(value=>Math.max(1,Number(value)|0)).slice(0,2)
      :[];
    return {
      id:String(candidate.id||createId()),
      name,
      score,
      level:Math.max(1,Math.floor(Number(candidate.level)||1)),
      // Mode 5 adds CO-OP; existing mode IDs 1-4 retain their saved meaning.
      mode:Math.max(1,Math.min(5,Number(candidate.mode)|0)),
      modeLabel:String(candidate.modeLabel||'SOLO').slice(0,16),
      difficulty:String(candidate.difficulty||'MEDIUM').slice(0,12),
      speed:String(candidate.speed||'MEDIUM').slice(0,12),
      multiplier:Number(Number(candidate.multiplier||1).toFixed(2)),
      playerIds,
      createdAt,
      pendingRemote:!!candidate.pendingRemote
    };
  }

  function createId(){
    if(globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
  }

  function sortEntries(entries){
    return entries.sort((a,b)=>
      b.score-a.score||
      a.createdAt.localeCompare(b.createdAt)||
      a.id.localeCompare(b.id)
    );
  }

  function normalizeEntries(candidates){
    const byId=new Map();
    for(const candidate of Array.isArray(candidates)?candidates:[]){
      const entry=normalizeEntry(candidate);
      if(entry) byId.set(entry.id,entry);
    }
    return sortEntries([...byId.values()]).slice(0,MAX_ENTRIES);
  }

  function readLocal(){
    try{
      return normalizeEntries(JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'));
    }catch(_error){
      return [];
    }
  }

  let entries=readLocal();

  function writeLocal(){
    try{ localStorage.setItem(STORAGE_KEY,JSON.stringify(entries)); }
    catch(_error){ /* Private browsing may expose a read-only localStorage. */ }
  }

  function notify(){
    const current=list();
    for(const listener of listeners){
      try{ listener(current); }
      catch(error){ console.error('High-score listener failed:',error); }
    }
  }

  function replaceEntries(next){
    entries=normalizeEntries(next);
    writeLocal();
    notify();
    return list();
  }

  function list(){
    return entries.map(entry=>({...entry,playerIds:[...entry.playerIds]}));
  }

  function qualifies(score){
    const value=Math.max(0,Math.floor(Number(score)||0));
    if(value<=0) return false;
    return entries.length<MAX_ENTRIES||value>entries[entries.length-1].score;
  }

  async function requestJson(url,options){
    const response=await fetch(url,{
      credentials:'same-origin',
      headers:{Accept:'application/json',...(options?.headers||{})},
      ...options
    });
    if(!response.ok) throw new Error(`High-score API returned ${response.status}`);
    return response.json();
  }

  function scoresFromResponse(payload){
    return Array.isArray(payload)?payload:
      Array.isArray(payload?.scores)?payload.scores:[];
  }

  async function refresh(){
    const endpoint=configuredEndpoint();
    if(!endpoint) return list();
    try{
      const separator=endpoint.includes('?')?'&':'?';
      const payload=await requestJson(
        `${endpoint}${separator}limit=${MAX_ENTRIES}`
      );
      const remote=scoresFromResponse(payload);
      const pending=entries.filter(entry=>entry.pendingRemote);
      return replaceEntries([...remote,...pending]);
    }catch(error){
      console.warn('Shared high scores are temporarily unavailable.',error);
      return list();
    }
  }

  async function submit(candidate){
    const name=sanitizeName(candidate?.name);
    if(!name){
      const error=new Error('A non-empty name is required.');
      error.code='EMPTY_NAME';
      throw error;
    }
    const endpoint=configuredEndpoint();
    const entry=normalizeEntry({
      ...candidate,
      id:candidate?.id||createId(),
      name,
      createdAt:candidate?.createdAt||new Date().toISOString(),
      pendingRemote:!!endpoint
    });
    if(!entry) throw new Error('The high-score entry is invalid.');
    if(!qualifies(entry.score)){
      const error=new Error('The score no longer qualifies for the Top 25.');
      error.code='NOT_QUALIFIED';
      throw error;
    }

    replaceEntries([...entries,entry]);
    if(!endpoint) return {...entry,pendingRemote:false};

    try{
      const payload=await requestJson(endpoint,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...entry,pendingRemote:undefined})
      });
      const remote=scoresFromResponse(payload);
      if(remote.length) replaceEntries(remote);
      else{
        replaceEntries(entries.map(item=>
          item.id===entry.id?{...item,pendingRemote:false}:item
        ));
      }
      return list().find(item=>item.id===entry.id)||{
        ...entry,pendingRemote:false
      };
    }catch(error){
      console.warn('High score saved locally and queued for the website.',error);
      return {...entry,pendingRemote:true};
    }
  }

  function subscribe(listener){
    if(typeof listener!=='function') return ()=>{};
    listeners.add(listener);
    return ()=>listeners.delete(listener);
  }

  globalThis.addEventListener?.('storage',event=>{
    if(event.key!==STORAGE_KEY) return;
    entries=readLocal();
    notify();
  });

  globalThis.MazeBitersHighScores=Object.freeze({
    MAX_ENTRIES,
    MAX_NAME_LENGTH,
    sanitizeName,
    list,
    qualifies,
    submit,
    refresh,
    subscribe,
    isShared:()=>!!configuredEndpoint()
  });
})();
