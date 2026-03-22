
(function(){
  'use strict';

  // --- Hebrew helpers ---
  const finalMap = new Map(Object.entries({ 'כ':'ך','מ':'ם','נ':'ן','פ':'ף','צ':'ץ' }));
  const medialFromFinal = new Map(Array.from(finalMap.entries()).map(([k,v])=>[v,k]));
  const hebrewLetters = Array.from('אבגדהוזחטיכלמנסעפצקרשת'); // medial forms only
  const isHebrew = ch => /[֐-׿]/.test(ch);
  const normalize = name => name.split('').filter(isHebrew).map(ch => medialFromFinal.get(ch) || ch).join('');
  const toFinalAtEnd = s => {
    if(!s) return s;
    const arr = Array.from(s);
    const last = arr[arr.length-1];
    arr[arr.length-1] = finalMap.get(last) || last;
    return arr.join('');
  };

  // directions (dy,dx)
  const DIRS = [
    [0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]
  ];

  // words input
  const rawNames = (window.HEBREW_NAMES||[]).slice();
  const wordsMedial = Array.from(new Set(rawNames.map(normalize).filter(Boolean)));

  // grid state
  let size = 20;
  let gridMedial = []; // matrix of medial chars
  let placements = []; // [{word, path:[{r,c}], id}]
  let endCells = new Set(); // "r,c" where word ends
  let midCells = new Set(); // "r,c" where a word passes through (not end)
  let foundIds = new Set();

  const boardEl = document.getElementById('board');
  const listEl = document.getElementById('word-list');
  const btnNew = document.getElementById('btn-new');
  const btnReset = document.getElementById('btn-reset');

  btnNew.addEventListener('click', () => { newGame(true); });
  btnReset.addEventListener('click', () => { clearSelections(true); });

  function newGame(regen=false){
    foundIds.clear();
    generateGrid();
    renderBoard();
    renderWordList();
  }

  function generateGrid(){
    // Try sizes 20..26 until success
    const shuffled = wordsMedial.slice().sort((a,b)=>b.length-a.length);
    for(let s=20;s<=26;s++){
      const attemptOk = tryBuild(s, shuffled);
      if(attemptOk){ size = s; return; }
    }
    // fallback minimal: place what we can at 26
    size = 26; tryBuild(size, shuffled);
  }

  function tryBuild(n, words){
    for(let attempt=0; attempt<1200; attempt++){
      gridMedial = Array.from({length:n},()=>Array.from({length:n},()=>null));
      placements = []; endCells.clear?.(); midCells.clear?.();
      endCells = new Set(); midCells = new Set();
      let okAll = true;
      const dirs = DIRS.slice();
      for(const w of words){
        let placed = false;
        shuffleInPlace(dirs);
        const positions = [];
        for(let r=0;r<n;r++) for(let c=0;c<n;c++) positions.push([r,c]);
        shuffleInPlace(positions);
        for(const [dy,dx] of dirs){
          const seq = w; // place medial in grid; finals determined at render
          const L = seq.length;
          for(const [r0,c0] of positions){
            const rEnd = r0 + dy*(L-1);
            const cEnd = c0 + dx*(L-1);
            if(rEnd<0||rEnd>=n||cEnd<0||cEnd>=n) continue;
            let ok = true; const path = [];
            for(let i=0;i<L;i++){
              const r = r0 + dy*i, c = c0 + dx*i;
              const ch = seq[i];
              const existing = gridMedial[r][c];
              if(existing!==null && existing!==ch){ ok=false; break; }
              path.push({r,c});
            }
            if(ok){
              // place
              for(let i=0;i<L;i++){
                const {r,c} = path[i];
                gridMedial[r][c] = seq[i];
              }
              const id = `${w}-${Math.random().toString(36).slice(2,8)}`;
              placements.push({word:w, path, id});
              // mark mid/end
              for(let i=0;i<path.length;i++){
                const key = `${path[i].r},${path[i].c}`;
                if(i===path.length-1) endCells.add(key); else midCells.add(key);
              }
              placed = true; break;
            }
          }
          if(placed) break;
        }
        if(!placed){ okAll = false; break; }
      }
      if(okAll){
        // fill blanks
        for(let r=0;r<n;r++) for(let c=0;c<n;c++) if(gridMedial[r][c]===null){
          gridMedial[r][c] = hebrewLetters[(Math.random()*hebrewLetters.length)|0];
        }
        return true;
      }
    }
    return false;
  }

  function renderBoard(){
    // clear
    boardEl.innerHTML = '';
    boardEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    // create cells
    for(let r=0;r<size;r++){
      for(let c=0;c<size;c++){
        const key = `${r},${c}`;
        const div = document.createElement('div');
        div.className = 'cell';
        div.setAttribute('role','gridcell');
        div.dataset.r = r; div.dataset.c = c;
        const medial = gridMedial[r][c];
        const ch = endCells.has(key) && !midCells.has(key) ? (finalMap.get(medial) || medial) : medial;
        div.textContent = ch;
        boardEl.appendChild(div);
      }
    }
    wireSelection();
  }

  function renderWordList(){
    listEl.innerHTML = '';
    const originalNames = window.HEBREW_NAMES.slice();
    originalNames.forEach((nm,idx)=>{
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.className='name'; span.textContent = nm;
      li.appendChild(span);
      li.dataset.wordMedial = normalize(nm);
      li.id = `word-${idx}`;
      if(isFoundByWord(li.dataset.wordMedial)) li.classList.add('found');
      listEl.appendChild(li);
    });
  }

  function isFoundByWord(w){
    return placements.some(p=>p.word===w && foundIds.has(p.id));
  }

  // --- selection handling (pointer events) ---
  function wireSelection(){
    let start = null; // {r,c}
    let dir = null;   // [dy,dx]
    let currentPath = [];

    const onPointerDown = (ev)=>{
      const target = ev.target.closest('.cell');
      if(!target) return;
      ev.preventDefault();
      boardEl.setPointerCapture?.(ev.pointerId);
      start = { r:+target.dataset.r, c:+target.dataset.c };
      dir = null; currentPath = [start];
      updateSelectingClasses(currentPath);
    };

    const onPointerMove = (ev)=>{
      if(!start) return;
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.cell');
      if(!target) return;
      const r = +target.dataset.r, c = +target.dataset.c;
      if(r===start.r && c===start.c){ currentPath = [start]; updateSelectingClasses(currentPath); return; }
      const dR = r - start.r; const dC = c - start.c;
      const [dy,dx] = unitDirection(dR, dC);
      if(dy===0 && dx===0) return;
      if(!dir){ dir = [dy,dx]; }
      if(dir[0]!==dy || dir[1]!==dx) return; // must keep straight line
      // build path from start to (r,c) in steps of dir
      const path = []; let rr = start.r, cc = start.c;
      while(true){ path.push({r:rr,c:cc}); if(rr===r && cc===c) break; rr+=dy; cc+=dx; }
      currentPath = path; updateSelectingClasses(currentPath);
    };

    const onPointerUp = (ev)=>{
      if(!start) return;
      const sel = currentPath; clearSelectingClasses();
      // validate
      const ok = validateSelection(sel);
      if(!ok){
        flashWrong(sel);
      }
      start = null; dir = null; currentPath = [];
    };

    boardEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  function unitDirection(dr, dc){
    if(dr===0 && dc>0) return [0,1];
    if(dr===0 && dc<0) return [0,-1];
    if(dc===0 && dr>0) return [1,0];
    if(dc===0 && dr<0) return [-1,0];
    if(Math.abs(dr)===Math.abs(dc)){
      return [Math.sign(dr), Math.sign(dc)];
    }
    return [0,0];
  }

  function updateSelectingClasses(path){
    clearSelectingClasses();
    for(const {r,c} of path){
      const el = cellAt(r,c); if(el) el.classList.add('selecting');
    }
  }
  function clearSelectingClasses(){
    boardEl.querySelectorAll('.cell.selecting').forEach(el=>el.classList.remove('selecting'));
  }
  function flashWrong(path){
    for(const {r,c} of path){ const el = cellAt(r,c); if(el){ el.classList.add('wrong'); setTimeout(()=>el.classList.remove('wrong'), 250); } }
  }
  function markFound(path, placement){
    for(const {r,c} of path){ const el = cellAt(r,c); if(el){ el.classList.add('found'); } }
    foundIds.add(placement.id);
    // mark in list
    listEl.querySelectorAll('li').forEach(li=>{
      if(li.dataset.wordMedial===placement.word){ li.classList.add('found'); }
    });
  }
  function clearSelections(clearFound=false){
    boardEl.querySelectorAll('.cell').forEach(el=>{
      el.classList.remove('selecting');
      if(clearFound) el.classList.remove('found');
    });
    if(clearFound){ foundIds.clear(); listEl.querySelectorAll('li').forEach(li=>li.classList.remove('found')); }
  }

  function validateSelection(path){
    if(path.length<2) return false;
    // Compare with placements (either forward or reverse)
    for(const p of placements){
      if(pathEquals(path, p.path) || pathEquals(path, p.path.slice().reverse())){
        // already found? allow only once
        if(foundIds.has(p.id)) return true; // silently accept
        markFound(path, p); return true;
      }
    }
    return false;
  }

  function pathEquals(a,b){
    if(a.length!==b.length) return false;
    for(let i=0;i<a.length;i++) if(a[i].r!==b[i].r || a[i].c!==b[i].c) return false;
    return true;
  }

  function cellAt(r,c){ return boardEl.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`); }

  function shuffleInPlace(arr){ for(let i=arr.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [arr[i],arr[j]]=[arr[j],arr[i]]; } }

  // start
  newGame(true);
})();
