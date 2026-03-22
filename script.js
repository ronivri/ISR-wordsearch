
(function(){
  'use strict';

  // --- Hebrew helpers ---
  const finalMap = new Map(Object.entries({ 'כ':'ך','מ':'ם','נ':'ן','פ':'ף','צ':'ץ' }));
  const medialFromFinal = new Map(Array.from(finalMap.entries()).map(([k,v])=>[v,k]));
  const hebrewLetters = Array.from('אבגדהוזחטיכלמנסעפצקרשת'); // medial forms only
  const isHebrew = ch => /[֐-׿]/.test(ch);
  const normalize = name => name.split('').filter(isHebrew).map(ch => medialFromFinal.get(ch) || ch).join('');

  // directions (dy,dx)
  const DIRS = [ [0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1] ];

  const rawNames = (window.HEBREW_NAMES||[]).slice();
  const wordsMedial = Array.from(new Set(rawNames.map(normalize).filter(Boolean)));

  let size = 20;
  let gridMedial = [];
  let placements = [];
  let endCells = new Set();
  let midCells = new Set();
  let foundIds = new Set();

  const boardEl = document.getElementById('board');
  const listEl = document.getElementById('word-list');
  const btnNew = document.getElementById('btn-new');
  const btnReset = document.getElementById('btn-reset');

  btnNew.addEventListener('click', () => { newGame(true); });
  btnReset.addEventListener('click', () => { clearSelections(true); });

  function newGame(){
    foundIds.clear();
    generateGrid();
    renderBoard();
    renderWordList();
  }

  function generateGrid(){
    const sorted = wordsMedial.slice().sort((a,b)=>b.length-a.length);
    for(let s=20;s<=26;s++){
      if(tryBuild(s, sorted)){ size=s; return; }
    }
    size=26; tryBuild(size, sorted);
  }

  function tryBuild(n, words){
    for(let attempt=0; attempt<1500; attempt++){
      gridMedial = Array.from({length:n},()=>Array.from({length:n},()=>null));
      placements = []; endCells = new Set(); midCells = new Set();
      let okAll = true;
      for(const w of words){
        let placed=false;
        const dirs = DIRS.slice(); shuffle(dirs);
        const positions = []; for(let r=0;r<n;r++) for(let c=0;c<n;c++) positions.push([r,c]);
        shuffle(positions);
        for(const [dy,dx] of dirs){
          const L = w.length;
          for(const [r0,c0] of positions){
            const rEnd = r0 + dy*(L-1), cEnd = c0 + dx*(L-1);
            if(rEnd<0||rEnd>=n||cEnd<0||cEnd>=n) continue;
            let ok=true; const path=[];
            for(let i=0;i<L;i++){
              const r=r0+dy*i, c=c0+dx*i, ch=w[i];
              const ex=gridMedial[r][c]; if(ex!==null && ex!==ch){ ok=false; break; }
              path.push({r,c});
            }
            if(ok){
              for(let i=0;i<L;i++){ const {r,c}=path[i]; gridMedial[r][c]=w[i]; }
              const id = `${w}-${Math.random().toString(36).slice(2,8)}`;
              placements.push({word:w, path, id});
              for(let i=0;i<path.length;i++){
                const key=`${path[i].r},${path[i].c}`; if(i===path.length-1) endCells.add(key); else midCells.add(key);
              }
              placed=true; break;
            }
          }
          if(placed) break;
        }
        if(!placed){ okAll=false; break; }
      }
      if(okAll){
        for(let r=0;r<n;r++) for(let c=0;c<n;c++) if(gridMedial[r][c]===null){ gridMedial[r][c]=hebrewLetters[(Math.random()*hebrewLetters.length)|0]; }
        return true;
      }
    }
    return false;
  }

  function renderBoard(){
    boardEl.innerHTML='';
    boardEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    for(let r=0;r<size;r++){
      for(let c=0;c<size;c++){
        const key=`${r},${c}`; const el=document.createElement('div'); el.className='cell'; el.setAttribute('role','gridcell'); el.dataset.r=r; el.dataset.c=c;
        const medial = gridMedial[r][c];
        const ch = (endCells.has(key) && !midCells.has(key)) ? ( {'כ':'ך','מ':'ם','נ':'ן','פ':'ף','צ':'ץ'}[medial] || medial ) : medial;
        el.textContent = ch; boardEl.appendChild(el);
      }
    }
    wireSelection();
  }

  function renderWordList(){
    listEl.innerHTML='';
    window.HEBREW_NAMES.slice().forEach((nm,idx)=>{
      const li=document.createElement('li'); const span=document.createElement('span'); span.className='name'; span.textContent=nm; li.appendChild(span);
      li.dataset.wordMedial = normalize(nm); li.id=`word-${idx}`;
      if(placements.some(p=>p.word===li.dataset.wordMedial && foundIds.has(p.id))) li.classList.add('found');
      listEl.appendChild(li);
    });
  }

  // --- selection handling (pointer events) ---
  function wireSelection(){
    let start=null, dir=null, currentPath=[];

    const onPointerDown = (ev)=>{
      const target = ev.target.closest('.cell'); if(!target) return;
      ev.preventDefault();
      boardEl.setPointerCapture?.(ev.pointerId);
      start = {r:+target.dataset.r, c:+target.dataset.c}; dir=null; currentPath=[start];
      updateSelectingClasses(currentPath);
    };

    const onPointerMove = (ev)=>{ ev.preventDefault(); if(!start) return;
      const el = document.elementFromPoint(ev.clientX, ev.clientY); const target = el && el.closest ? el.closest('.cell') : null; if(!target) return;
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

  newGame();
})();
