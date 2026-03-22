
(function(){
  'use strict';

  // --- Hebrew helpers ---
  const finalMap = new Map(Object.entries({ 'כ':'ך','מ':'ם','נ':'ן','פ':'ף','צ':'ץ' }));
  const medialFromFinal = new Map(Array.from(finalMap.entries()).map(([k,v])=>[v,k]));
  const hebrewLetters = Array.from('אבגדהוזחטיכלמנסעפצקרשת'); // medial forms only
  const isHebrew = ch => /[֐-׿]/.test(ch);
  const normalize = name => name.split('').filter(isHebrew).map(ch => medialFromFinal.get(ch) || ch).join('');

  const DIRS = [ [0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1] ];

  const rawNames = (window.HEBREW_NAMES||[]).slice();
  const wordsMedial = Array.from(new Set(rawNames.map(normalize).filter(Boolean)));

  let size = 20; let gridMedial = []; let placements = []; let endCells = new Set(); let midCells = new Set(); let foundIds = new Set();

  const boardEl = document.getElementById('board');
  const listEl = document.getElementById('word-list');
  const btnNew = document.getElementById('btn-new');
  const btnReset = document.getElementById('btn-reset');

  // Zoom/pan elements
  const zoomLayer = document.getElementById('zoom-layer');
  const zoomLabel = document.getElementById('zoom-label');
  const zoomInBtn = document.getElementById('zoom-in');
  const zoomOutBtn = document.getElementById('zoom-out');
  const zoomResetBtn = document.getElementById('zoom-reset');

  // Zoom state
  let scale = 1, minScale = 1, maxScale = 3, tx = 0, ty = 0;
  function applyTransform(){
    zoomLayer.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    zoomLabel.textContent = Math.round(scale*100)+'%';
  }
  function zoomBy(delta, center){
    const old = scale; let next = Math.min(maxScale, Math.max(minScale, scale*delta));
    if(next===scale) return;
    // keep the point under fingers stationary: adjust translation
    const rect = zoomLayer.getBoundingClientRect();
    const cx = center?.x ?? (rect.left + rect.width/2);
    const cy = center?.y ?? (rect.top + rect.height/2);
    tx = cx - (cx - tx) * (next/old);
    ty = cy - (cy - ty) * (next/old);
    scale = next; applyTransform();
  }
  function setScale(s, center){ zoomBy(s/scale, center); }
  function resetZoom(){ scale=1; tx=0; ty=0; applyTransform(); }

  zoomInBtn.addEventListener('click', ()=>zoomBy(1.2));
  zoomOutBtn.addEventListener('click', ()=>zoomBy(1/1.2));
  zoomResetBtn.addEventListener('click', resetZoom);

  btnNew.addEventListener('click', () => { newGame(true); });
  btnReset.addEventListener('click', () => { clearSelections(true); });

  function newGame(){
    foundIds.clear();
    generateGrid();
    renderBoard();
    renderWordList();
    resetZoom();
  }

  function generateGrid(){
    const sorted = wordsMedial.slice().sort((a,b)=>b.length-a.length);
    for(let s=20;s<=26;s++) if(tryBuild(s, sorted)){ size=s; return; }
    size=26; tryBuild(size, sorted);
  }

  function tryBuild(n, words){
    for(let attempt=0; attempt<1500; attempt++){
      gridMedial = Array.from({length:n},()=>Array.from({length:n},()=>null));
      placements = []; endCells = new Set(); midCells = new Set();
      let okAll = true;
      for(const w of words){
        let placed=false; const dirs = DIRS.slice(); shuffle(dirs);
        const positions = []; for(let r=0;r<n;r++) for(let c=0;c<n;c++) positions.push([r,c]); shuffle(positions);
        for(const [dy,dx] of dirs){
          const L=w.length; for(const [r0,c0] of positions){
            const rEnd=r0+dy*(L-1), cEnd=c0+dx*(L-1); if(rEnd<0||rEnd>=n||cEnd<0||cEnd>=n) continue;
            let ok=true; const path=[];
            for(let i=0;i<L;i++){ const r=r0+dy*i, c=c0+dx*i, ch=w[i]; const ex=gridMedial[r][c]; if(ex!==null && ex!==ch){ ok=false; break; } path.push({r,c}); }
            if(ok){ for(let i=0;i<L;i++){ const {r,c}=path[i]; gridMedial[r][c]=w[i]; }
              const id = `${w}-${Math.random().toString(36).slice(2,8)}`; placements.push({word:w, path, id});
              for(let i=0;i<path.length;i++){ const key=`${path[i].r},${path[i].c}`; if(i===path.length-1) endCells.add(key); else midCells.add(key); }
              placed=true; break; }
          }
          if(placed) break;
        }
        if(!placed){ okAll=false; break; }
      }
      if(okAll){ for(let r=0;r<n;r++) for(let c=0;c<n;c++) if(gridMedial[r][c]===null){ gridMedial[r][c]=hebrewLetters[(Math.random()*hebrewLetters.length)|0]; } return true; }
    }
    return false;
  }

  function renderBoard(){
    boardEl.innerHTML='';
    boardEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    for(let r=0;r<size;r++) for(let c=0;c<size;c++){
      const key=`${r},${c}`; const el=document.createElement('div'); el.className='cell'; el.setAttribute('role','gridcell'); el.dataset.r=r; el.dataset.c=c;
      const medial=gridMedial[r][c]; const ch=(endCells.has(key)&&!midCells.has(key))?( {'כ':'ך','מ':'ם','נ':'ן','פ':'ף','צ':'ץ'}[medial] || medial ): medial;
      el.textContent=ch; boardEl.appendChild(el);
    }
    wireSelection();
  }

  function renderWordList(){
    listEl.innerHTML=''; window.HEBREW_NAMES.slice().forEach((nm,idx)=>{
      const li=document.createElement('li'); const span=document.createElement('span'); span.className='name'; span.textContent=nm; li.appendChild(span);
      li.dataset.wordMedial=normalize(nm); li.id=`word-${idx}`; if(placements.some(p=>p.word===li.dataset.wordMedial && foundIds.has(p.id))) li.classList.add('found'); listEl.appendChild(li);
    });
  }

  // Selection handlers (one finger)
  function wireSelection(){
    let start=null, dir=null, currentPath=[];

    const onPointerDown = (ev)=>{
      // אם יש יותר מאצבע אחת על המסך – זה מצב זום/פאן, לא מתחילים בחירה
      if(activePointers.size>0) return; 
      const target = ev.target.closest('.cell'); if(!target) return;
      ev.preventDefault();
      boardEl.setPointerCapture?.(ev.pointerId);
      start = { r:+target.dataset.r, c:+target.dataset.c }; dir=null; currentPath=[start];
      updateSelectingClasses(currentPath);
    };

    const onPointerMove = (ev)=>{
      if(!start) return; ev.preventDefault();
      const el = document.elementFromPoint(ev.clientX, ev.clientY); const target=el?.closest?.('.cell'); if(!target) return;
      const r=+target.dataset.r, c=+target.dataset.c; if(r===start.r && c===start.c){ currentPath=[start]; updateSelectingClasses(currentPath); return; }
      const dR=r-start.r, dC=c-start.c; const [dy,dx]=unitDirection(dR,dC); if(dy===0 && dx===0) return; if(!dir){ dir=[dy,dx]; }
      if(dir[0]!==dy || dir[1]!==dx) return;
      const path=[]; let rr=start.r, cc=start.c; while(true){ path.push({r:rr,c:cc}); if(rr===r && cc===c) break; rr+=dy; cc+=dx; }
      currentPath=path; updateSelectingClasses(currentPath);
    };

    const onPointerUp = (ev)=>{ if(!start) return; const sel=currentPath; clearSelectingClasses(); const ok=validateSelection(sel); if(!ok) flashWrong(sel); start=null; dir=null; currentPath=[]; };

    boardEl.addEventListener('pointerdown', onPointerDown, {passive:false});
    window.addEventListener('pointermove', onPointerMove, {passive:false});
    window.addEventListener('pointerup', onPointerUp, {passive:false});
    window.addEventListener('pointercancel', onPointerUp, {passive:false});
  }

  function unitDirection(dr,dc){ if(dr===0&&dc>0) return [0,1]; if(dr===0&&dc<0) return [0,-1]; if(dc===0&&dr>0) return [1,0]; if(dc===0&&dr<0) return [-1,0]; if(Math.abs(dr)===Math.abs(dc)) return [Math.sign(dr),Math.sign(dc)]; return [0,0]; }
  function updateSelectingClasses(path){ clearSelectingClasses(); for(const {r,c} of path){ const el=cellAt(r,c); if(el) el.classList.add('selecting'); } }
  function clearSelectingClasses(){ boardEl.querySelectorAll('.cell.selecting').forEach(el=>el.classList.remove('selecting')); }
  function flashWrong(path){ for(const {r,c} of path){ const el=cellAt(r,c); if(el){ el.classList.add('wrong'); setTimeout(()=>el.classList.remove('wrong'),250); } } }
  function markFound(path, placement){ for(const {r,c} of path){ const el=cellAt(r,c); if(el) el.classList.add('found'); } foundIds.add(placement.id); listEl.querySelectorAll('li').forEach(li=>{ if(li.dataset.wordMedial===placement.word) li.classList.add('found'); }); }
  function clearSelections(clearFound=false){ boardEl.querySelectorAll('.cell').forEach(el=>{ el.classList.remove('selecting'); if(clearFound) el.classList.remove('found'); }); if(clearFound){ foundIds.clear(); listEl.querySelectorAll('li').forEach(li=>li.classList.remove('found')); } }
  function validateSelection(path){ if(path.length<2) return false; for(const p of placements){ if(pathEquals(path,p.path)||pathEquals(path,p.path.slice().reverse())){ if(foundIds.has(p.id)) return true; markFound(path,p); return true; } } return false; }
  function pathEquals(a,b){ if(a.length!==b.length) return false; for(let i=0;i<a.length;i++) if(a[i].r!==b[i].r||a[i].c!==b[i].c) return false; return true; }
  function cellAt(r,c){ return boardEl.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`); }
  function shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [arr[i],arr[j]]=[arr[j],arr[i]]; } }

  // --- Pinch-zoom & pan (two fingers) ---
  const activePointers = new Map(); // id -> {x,y}
  zoomLayer.addEventListener('pointerdown', (ev)=>{ activePointers.set(ev.pointerId, {x:ev.clientX, y:ev.clientY}); zoomLayer.setPointerCapture?.(ev.pointerId); }, {passive:false});
  zoomLayer.addEventListener('pointermove', (ev)=>{
    if(!activePointers.has(ev.pointerId)) return; ev.preventDefault();
    const prev = activePointers.get(ev.pointerId); const curr = {x:ev.clientX, y:ev.clientY}; activePointers.set(ev.pointerId,curr);
    if(activePointers.size===2){
      const pts = Array.from(activePointers.values());
      const [p1,p2] = pts; const [dx,dy] = [p2.x-p1.x, p2.y-p1.y];
      const [cx,cy] = [(p1.x+p2.x)/2, (p1.y+p2.y)/2];
      // compute previous distance using previous map (we need previous positions). For simplicity, store also lastDistance/center
    }
  }, {passive:false});

  // We'll implement pinch by tracking the last gesture snapshot
  let pinch = null; // {d, cx, cy}
  function updatePinchSnapshot(){
    if(activePointers.size!==2){ pinch=null; return; }
    const pts = Array.from(activePointers.values()); const [a,b]=pts; const dx=b.x-a.x, dy=b.y-a.y; const d=Math.hypot(dx,dy); const cx=(a.x+b.x)/2, cy=(a.y+b.y)/2; pinch = {d, cx, cy};
  }

  zoomLayer.addEventListener('pointermove', (ev)=>{
    if(activePointers.size===2){
      const before = pinch; updatePinchSnapshot(); if(!before || !pinch) return;
      const scaleDelta = pinch.d / before.d; zoomBy(scaleDelta, {x:pinch.cx, y:pinch.cy});
      // Also pan with center movement
      tx += (pinch.cx - before.cx); ty += (pinch.cy - before.cy); applyTransform();
    } else if(activePointers.size===1 && scale>1){
      // one-finger pan when zoomed in
      const prev = pinch; const p = Array.from(activePointers.values())[0];
      // We don't have per-pointer previous stored separately here; simplify by using movementX/Y if available
      // fallback: do nothing; browsers vary. We'll implement simple delta using a stored last point
    }
  }, {passive:false});

  // Implement one-finger pan when zoomed in using pointer events on wrapper
  let lastPan = null;
  zoomLayer.addEventListener('pointerdown', (ev)=>{ if(scale>1 && activePointers.size===0){ lastPan = {x:ev.clientX, y:ev.clientY}; } }, {passive:false});
  zoomLayer.addEventListener('pointermove', (ev)=>{
    if(scale>1 && activePointers.size===1 && lastPan){ ev.preventDefault(); const dx = ev.clientX - lastPan.x; const dy = ev.clientY - lastPan.y; tx += dx; ty += dy; lastPan = {x:ev.clientX, y:ev.clientY}; applyTransform(); }
  }, {passive:false});
  zoomLayer.addEventListener('pointerup', (ev)=>{ activePointers.delete(ev.pointerId); lastPan=null; updatePinchSnapshot(); }, {passive:false});
  zoomLayer.addEventListener('pointercancel', (ev)=>{ activePointers.delete(ev.pointerId); lastPan=null; updatePinchSnapshot(); }, {passive:false});

  // keep pinch snapshot in sync
  zoomLayer.addEventListener('pointerdown', ()=>{ updatePinchSnapshot(); }, {passive:false});

  newGame();
})();
