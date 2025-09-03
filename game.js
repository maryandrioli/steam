window.addEventListener('DOMContentLoaded', () => {
    (() => {
      const WORDS_PER_PROMPT = 2;
    
      class Game {
        constructor() {
          // elementos
          this.area = document.getElementById('game');
          this.owlEl = document.getElementById('owl');
          this.scoreEl = document.getElementById('score');
          this.livesEl = document.getElementById('lives');
          this.progressEl = document.getElementById('progress');
          this.speedEl = document.getElementById('speedMul');
          this.instructions = document.getElementById('instructions');
          this.gameOver = document.getElementById('gameOver');
          this.finalScoreEl = document.getElementById('finalScore');
          this.gameMsg = document.getElementById('gameMessage');
          this.wordModal = document.getElementById('wordModal');
          this.wordInput = document.getElementById('wordInput');
          this.goodTags = document.getElementById('goodTags');
          this.badTags = document.getElementById('badTags');
    
          // estado
          this.size = { w: window.innerWidth, h: this.area.clientHeight };
          this.pos = { x: this.size.w / 2 - 30, y: this.size.h / 2 - 30 };
    
          // movimento sem inércia
          this.stepBase = 200;  // px/s
          this.mul = 1.0;
          this.minMul = 0.4;
          this.maxMul = 2.0;
          this.mulStep = 0.1;
    
          this.score = 0;
          this.lives = 3;
          this.items = [];
          this.words = [];
          this.keys = {};
          this.running = false;
          this.waitingWord = false;
          this.correctCount = 0;
    
          this.userWords = [];
          this.activeWordSet = new Set();
          this.wordCounts = Object.create(null);
          this.diff = 0;
          this.recent = [];
          this.last = performance.now();
    
          // anti-trava
          this.prevPos = { x: this.pos.x, y: this.pos.y };
          this.stuckFrames = 0;
    
          // dados
          this.good = [
            { icon: '✅', name: 'Validação crítica' },
            { icon: '🤝', name: 'Colaboração humano-IA' },
            { icon: '📚', name: 'Pesquisa complementar' },
            { icon: '🔍', name: 'Verificação de fontes' },
            { icon: '✨', name: 'Criatividade humana' },
            { icon: '💡', name: 'Pensamento crítico' },
            { icon: '📝', name: 'Documentação do processo' },
            { icon: '🌍', name: 'Diversidade de perspectivas' },
            { icon: '🎨', name: 'Autoria própria' },
            { icon: '🎯', name: 'Objetivos claros' },
            { icon: '🔒', name: 'Proteção de dados' },
            { icon: '🧩', name: 'Colaboração ética' }
          ];
          this.bad = [
            { icon: '❌', name: 'Aceitar sem questionar' },
            { icon: '⚠️', name: 'Ignorar vieses' },
            { icon: '🚫', name: 'Dados pessoais expostos' },
            { icon: '🛑', name: 'Não verificar fontes' },
            { icon: '🤖', name: 'Uso acrítico' },
            { icon: '😵', name: 'Dependência total' },
            { icon: '📉', name: 'Falta de transparência' },
            { icon: '🔓', name: 'Risco de privacidade' },
            { icon: '🗑️', name: 'Descartar sem análise' },
            { icon: '🎭', name: 'Falsificação de autoria' }
          ];
          this.goodS = ['pensamento crítico','validar fontes','transparência','colaboração humano-IA','contexto claro','diversidade de perspectivas','criatividade própria','documentar processo','uso ético','comparar ferramentas','autoavaliação','exploração investigativa','adaptação ao contexto'];
          this.badS  = ['aceitar sem questionar','dados pessoais','uso acrítico','ignorar vieses','não verificar evidências','falta de transparência','dependência total','não indicar IA','uso automático','descartar conhecimento humano'];
    
          this.fillTags();
          this.bind();
          this.updateHUD();
          this.updateOwl();
        }
    
        fillTags(){
          const add = (wrap, list) => list.forEach(t => {
            const el = document.createElement('span');
            el.className = 'tag'; el.textContent = t;
            el.onclick = () => this.wordInput.value = t;
            wrap.appendChild(el);
          });
          add(this.goodTags, this.goodS);
          add(this.badTags, this.badS);
        }
    
        bind(){
          const startBtn = document.querySelector('#startBtn, [data-action="start"]');
          const restartBtn = document.querySelector('#restartBtn, [data-action="restart"]');
          startBtn && (startBtn.onclick = () => this.start());
          restartBtn && (restartBtn.onclick = () => this.start());
    
          document.addEventListener('keydown', (e) => {
            const onIntro = !this.instructions.hidden;
            if (onIntro && (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')) {
              e.preventDefault(); this.start(); return;
            }
    
            if (['+','=','-','_'].includes(e.key)) {
              e.preventDefault();
              this.bump(e.key === '+' || e.key === '=' ? 1 : -1);
              return;
            }
            if (this.waitingWord) return;
    
            if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
    
            let k = e.key.toLowerCase();
            if (k === 'arrowup') k = 'up';
            if (k === 'arrowdown') k = 'down';
            if (k === 'arrowleft') k = 'left';
            if (k === 'arrowright') k = 'right';
    
            if (k === ' ' || k === 'spacebar') { this.pressSpace(); return; }
            this.keys[k] = true;
          });
    
          document.addEventListener('keyup', (e) => {
            if (this.waitingWord) return;
            let k = e.key.toLowerCase();
            if (k === 'arrowup') k = 'up';
            if (k === 'arrowdown') k = 'down';
            if (k === 'arrowleft') k = 'left';
            if (k === 'arrowright') k = 'right';
            this.keys[k] = false;
          });
    
          window.addEventListener('resize', () => {
            this.size = { w: window.innerWidth, h: this.area.clientHeight };
            this.pos.x = Math.max(0, Math.min(this.size.w - 60, this.pos.x));
            this.pos.y = Math.max(0, Math.min(this.size.h - 60, this.pos.y));
            this.updateOwl();
          });
    
          // pad móvel
          document.querySelectorAll('.pad-btn').forEach(btn => {
            const key = btn.dataset.key;
            const down = (ev) => { ev.preventDefault(); key === 'space' ? this.pressSpace() : (this.keys[key] = true); };
            const up   = (ev) => { ev.preventDefault(); if (key !== 'space') this.keys[key] = false; };
            btn.addEventListener('pointerdown', down);
            btn.addEventListener('pointerup', up);
            btn.addEventListener('pointercancel', up);
            btn.addEventListener('pointerleave', up);
          });
    
          // arrasto/touch direto (sem inércia)
          let dragging = false;
          this.area.addEventListener('pointerdown', (e) => {
            const t = e.target;
            if (t.closest('.pad') || t.closest('.hud') || t.closest('.modal') || t.closest('.word-modal')) return;
            dragging = true; this.toPointer(e);
          });
          this.area.addEventListener('pointermove', (e) => dragging && !this.waitingWord && this.toPointer(e));
          window.addEventListener('pointerup', () => dragging = false);
    
          this.wordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.confirmWord(); });
          document.getElementById('confirmWord').onclick = () => this.confirmWord();
          document.getElementById('skipWord').onclick = () => this.closeWord();
        }
    
        start(){
          this.instructions.hidden = true;
          this.gameOver.hidden = true;
    
          this.score = 0; this.lives = 3;
          this.items = []; this.words = [];
          this.userWords = [];
          this.activeWordSet.clear(); this.wordCounts = Object.create(null);
          this.pos = { x: this.size.w/2 - 30, y: this.size.h/2 - 30 };
          this.correctCount = 0; this.diff = 0; this.recent = [];
          this.last = performance.now(); this.waitingWord = false;
          this.clearNodes('.item,.word');
    
          this.updateHUD(); this.updateOwl();
          this.running = true;
          this.loop();
          this.spawnSchedule();
          this.spawnUserWords();
        }
    
        loop(){
          if (!this.running) return;
          const now = performance.now(); const dt = Math.min(32, now - this.last); this.last = now;
    
          if (!this.waitingWord) {
            this.move(dt);
            this.collide();
            this.moveItems(dt);
            this.moveWords(dt);
            this.checkStuck();  // detector de travamento
          }
          requestAnimationFrame(() => this.loop());
        }
    
        bump(dir){
          this.mul = +Math.max(this.minMul, Math.min(this.maxMul, (this.mul + dir*this.mulStep))).toFixed(2);
          this.speedEl.textContent = this.mul.toFixed(1)+'×';
        }
    
        updateHUD(){ this.scoreEl.textContent = this.score; this.livesEl.textContent = this.lives; this.progressEl.textContent = this.correctCount % WORDS_PER_PROMPT; }
        updateOwl(){ this.owlEl.style.transform = `translate3d(${this.pos.x}px,${this.pos.y}px,0)`; }
        toPointer(e){ const r = this.area.getBoundingClientRect(); this.pos.x = Math.max(0, Math.min(this.size.w-60, e.clientX - r.left - 30)); this.pos.y = Math.max(0, Math.min(this.size.h-60, e.clientY - r.top - 30)); this.updateOwl(); }
        clearNodes(sel){ document.querySelectorAll(sel).forEach(n => n.remove()); }
    
        // movimento com deslizamento em parede e anti-quina
        move(dt){
          const t = dt/1000;
          const speed = this.stepBase * this.mul;
    
          const L=this.keys.left||this.keys.a, R=this.keys.right||this.keys.d, U=this.keys.up||this.keys.w, D=this.keys.down||this.keys.s;
    
          let ix = 0, iy = 0;
          if (L) ix -= 1; if (R) ix += 1;
          if (U) iy -= 1; if (D) iy += 1;
    
          if (ix === 0 && iy === 0) return;
    
          // estado atual de borda
          const maxX = this.size.w - 60, maxY = this.size.h - 60;
          const atL = this.pos.x <= 0.5, atR = this.pos.x >= maxX - 0.5;
          const atT = this.pos.y <= 0.5, atB = this.pos.y >= maxY - 0.5;
    
          // remove componente que empurra para dentro da parede (desliza na parede)
          if (atL && ix < 0) ix = 0;
          if (atR && ix > 0) ix = 0;
          if (atT && iy < 0) iy = 0;
          if (atB && iy > 0) iy = 0;
    
          // normaliza
          const len = Math.hypot(ix, iy);
          if (len > 0) { ix /= len; iy /= len; }
    
          let nx = this.pos.x + ix * speed * t;
          let ny = this.pos.y + iy * speed * t;
    
          // clamp
          const SEP = 0.5;
          if (nx < 0) nx = SEP; else if (nx > maxX) nx = maxX - SEP;
          if (ny < 0) ny = SEP; else if (ny > maxY) ny = maxY - SEP;
    
          // nudge anti-quina: se pressionar para dentro de duas paredes ao mesmo tempo, empurra levemente para o interior
          const pressingIntoCorner =
            (atL && atT && L && U) || (atL && atB && L && D) ||
            (atR && atT && R && U) || (atR && atB && R && D);
    
          if (pressingIntoCorner){
            nx = Math.min(Math.max(nx, SEP + 2), maxX - SEP - 2);
            ny = Math.min(Math.max(ny, SEP + 2), maxY - SEP - 2);
          }
    
          this.pos.x = nx;
          this.pos.y = ny;
          this.updateOwl();
        }
    
        // detector e correção extra de travamento
        checkStuck(){
          const moved = Math.hypot(this.pos.x - this.prevPos.x, this.pos.y - this.prevPos.y);
          const anyKey = this.keys.left||this.keys.right||this.keys.up||this.keys.down||this.keys.a||this.keys.d||this.keys.w||this.keys.s;
    
          if (anyKey && moved < 0.2){
            this.stuckFrames++;
            if (this.stuckFrames >= 6){ // ~100 ms
              const maxX = this.size.w - 60, maxY = this.size.h - 60;
              const SEP = 0.5, PUSH = 6;
              if (this.pos.x <= SEP+0.6) this.pos.x = Math.min(SEP + PUSH, maxX - SEP);
              if (this.pos.x >= maxX - SEP - 0.6) this.pos.x = Math.max(maxX - SEP - PUSH, SEP);
              if (this.pos.y <= SEP+0.6) this.pos.y = Math.min(SEP + PUSH, maxY - SEP);
              if (this.pos.y >= maxY - SEP - 0.6) this.pos.y = Math.max(maxY - SEP - PUSH, SEP);
              this.updateOwl();
              this.stuckFrames = 0;
            }
          } else {
            this.stuckFrames = 0;
          }
          this.prevPos.x = this.pos.x;
          this.prevPos.y = this.pos.y;
        }
    
        // itens
        spawnSchedule(){ if (!this.running) return; this.spawnItem(); setTimeout(()=>this.spawnSchedule(), this.spawnInterval()); }
        spawnItem(){
          const isGood = Math.random() < this.goodChance();
          const data = (isGood?this.good:this.bad)[Math.floor(Math.random()*(isGood?this.good.length:this.bad.length))];
    
          const el = document.createElement('div');
          el.className = `item ${isGood?'good':'bad'}`;
          el.dataset.type = isGood?'good':'bad';
          el.dataset.speed = String(this.itemSpeed(isGood));
          el.dataset.dir = String(Math.random()*Math.PI*2);
          el.style.left = (Math.random()*(this.size.w-70))+'px';
          el.style.top  = (Math.random()*(this.size.h-70))+'px';
          el.innerHTML = `<div class="ico">${data.icon}</div>`;
          this.area.appendChild(el);
          this.items.push(el);
    
          setTimeout(()=>{ if (el.parentNode){ el.remove(); this.items = this.items.filter(i=>i!==el); } }, this.itemLife());
        }
    
        moveItems(dt){
          const k = dt/16.67, maxX=this.size.w-70, maxY=this.size.h-70;
          this.items.forEach(el=>{
            let s = parseFloat(el.dataset.speed)*k, d = parseFloat(el.dataset.dir);
            let x = parseFloat(el.style.left), y = parseFloat(el.style.top);
            let nx = x + Math.cos(d)*s, ny = y + Math.sin(d)*s;
            if (nx<=0||nx>=maxX) d = Math.PI - d;
            if (ny<=0||ny>=maxY) d = -d;
            el.dataset.dir = String(d);
            el.style.left = Math.max(0, Math.min(maxX, nx))+'px';
            el.style.top  = Math.max(0, Math.min(maxY, ny))+'px';
          });
        }
    
        // palavras
        addWordToScreen(text, positive){
          const key = text.trim().toLowerCase();
          if (!key || this.activeWordSet.has(key)) return;
          const count = (this.wordCounts[key]||0)+1; this.wordCounts[key]=count;
    
          const el = document.createElement('div');
          el.className = `word ${positive?'pos':'neg'}`;
          el.dataset.text = key;
          el.dataset.type = positive?'positive':'negative';
          el.dataset.speed = String(Math.random()*1.5 + 0.8 + this.diff*0.3);
          el.dataset.dir = String(Math.random()*Math.PI*2);
          el.style.fontSize = (14 + Math.min(6,count)) + 'px';
          el.style.left = (Math.random()*(this.size.w-220))+'px';
          el.style.top  = (Math.random()*(this.size.h-60))+'px';
          el.textContent = text;
    
          this.area.appendChild(el);
          this.words.push(el);
          this.activeWordSet.add(key);
        }
    
        moveWords(dt){
          const k = dt/16.67, maxX=this.size.w-220, maxY=this.size.h-60;
          this.words.forEach(el=>{
            let s = parseFloat(el.dataset.speed)*k, d = parseFloat(el.dataset.dir);
            let x = parseFloat(el.style.left), y = parseFloat(el.style.top);
            let nx = x + Math.cos(d)*s, ny = y + Math.sin(d)*s;
            if (nx<=0||nx>=maxX) d = Math.PI - d;
            if (ny<=0||ny>=maxY) d = -d;
            el.dataset.dir = String(d);
            el.style.left = Math.max(0, Math.min(maxX, nx))+'px';
            el.style.top  = Math.max(0, Math.min(maxY, ny))+'px';
          });
        }
    
        // colisões
        collide(){
          const owl = this.owlEl.getBoundingClientRect();
          this.items.slice().forEach(el=>{
            if (!el.parentNode) return;
            if (this.hit(owl, el.getBoundingClientRect())) this.hitItem(el);
          });
          this.words.slice().forEach(el=>{
            if (!el.parentNode) return;
            if (this.hit(owl, el.getBoundingClientRect())) this.hitWord(el);
          });
        }
        hit(a,b){ return !(a.right<b.left||a.left>b.right||a.bottom<b.top||a.top>b.bottom); }
    
        hitItem(el){
          const good = el.dataset.type==='good';
          if (good){
            this.score += 15;
            this.correctCount++;
            this.recent.push(true); if (this.recent.length>10) this.recent.shift();
            if (this.correctCount % WORDS_PER_PROMPT === 0) this.askWord();
          }else{
            this.lives--;
            this.recent.push(false); if (this.recent.length>10) this.recent.shift();
            this.owlEl.style.filter='hue-rotate(180deg)';
            setTimeout(()=> this.owlEl.style.filter='drop-shadow(3px 3px 6px rgba(0,0,0,.4))', 220);
          }
          el.remove(); this.items = this.items.filter(i=>i!==el);
          this.tuneDifficulty(); this.updateHUD();
          if (this.lives<=0) this.end();
        }
    
        hitWord(el){
          const pos = el.dataset.type==='positive';
          this.score = Math.max(0, this.score + (pos?8:-8));
          this.activeWordSet.delete(el.dataset.text);
          el.remove(); this.words = this.words.filter(w=>w!==el);
          this.updateHUD();
        }
    
        // espaço 3× para remover palavra próxima
        pressSpace(){
          const owl = this.owlEl.getBoundingClientRect();
          const ox=(owl.left+owl.right)/2, oy=(owl.top+owl.bottom)/2;
          let near=null, best=1e9;
          this.words.forEach(w=>{
            const r=w.getBoundingClientRect(), wx=(r.left+r.right)/2, wy=(r.top+r.bottom)/2;
            const d=Math.hypot(ox-wx,oy-wy); if (d<90 && d<best){best=d;near=w;}
          });
          if (!near) return;
    
          this.spaceWord = this.spaceWord===near ? near : (this.spaceCount=0, near);
          this.spaceCount = (this.spaceCount||0)+1;
          near.style.transform = `scale(${1+this.spaceCount*.15})`;
          near.style.opacity = `${1-this.spaceCount*.25}`;
    
          clearTimeout(this.spaceTimer);
          if (this.spaceCount>=3){
            this.activeWordSet.delete(near.dataset.text);
            near.remove(); this.words=this.words.filter(w=>w!==near);
            this.spaceCount=0; this.spaceWord=null;
          }else{
            this.spaceTimer=setTimeout(()=>{ this.spaceCount=0; this.spaceWord=null; near.style.transform=''; near.style.opacity=''; }, 1800);
          }
        }
    
        // palavras do usuário
        askWord(){ this.waitingWord=true; this.wordModal.hidden=false; setTimeout(()=>this.wordInput.focus(),50); }
        closeWord(){ this.wordModal.hidden=true; this.waitingWord=false; }
        confirmWord(){
          const raw=this.wordInput.value, t=raw.trim(); if(!t){this.closeWord();return;}
          const negative = this.badS.some(b=> t.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(t.toLowerCase()));
          const isNew = !this.inSuggestions(t);
          this.score += isNew?50:25; if (isNew) this.lives += 1; this.updateHUD();
          this.userWords.push({text:t,isPositive:!negative,isNew});
          this.addWordToScreen(t,!negative);
          this.closeWord();
        }
        inSuggestions(w){
          const t=w.trim().toLowerCase();
          return this.goodS.some(s=>s.toLowerCase()===t) || this.badS.some(s=>s.toLowerCase()===t);
        }
    
        spawnUserWords(){
          if (!this.running) return;
          const spawn=()=>{
            if (!this.running) return;
            if (this.userWords.length>0){
              const w=this.userWords[Math.floor(Math.random()*this.userWords.length)];
              this.addWordToScreen(w.text, w.isPositive);
            }
            setTimeout(spawn, Math.random()*6000+12000);
          };
          setTimeout(spawn, 8000);
        }
    
        // dificuldade e parâmetros
        goodChance(){ return Math.max(0.38, 0.80 - this.diff*0.12); }
        itemLife(){ return Math.max(6500, 10000 - this.diff*2000); }
        spawnInterval(){ const min=Math.max(700, 1100 - this.diff*250), max=Math.max(min+200, 2200 - this.diff*250); return Math.random()*(max-min)+min; }
        itemSpeed(g){ const bump=this.diff*0.4; return g ? (Math.random()*2+1+bump) : (Math.random()*1.2+0.5+bump*0.6); }
        tuneDifficulty(){
          if (this.recent.length<8) return;
          const acc=this.recent.reduce((a,b)=>a+(b?1:0),0)/this.recent.length;
          if (acc>=0.85 && this.diff<3) this.diff++;
          else if (acc<=0.60 && this.diff>0) this.diff--;
        }
    
        end(){
          this.running=false; this.wordModal.hidden=true;
          this.finalScoreEl.textContent=this.score;
          this.gameMsg.textContent = this.score>=150? 'ótimo domínio das boas práticas.' : this.score>=75? 'bom desempenho. continue explorando o uso ético.' : 'siga praticando. o uso responsável melhora com treino.';
          this.gameOver.hidden=false;
          this.clearNodes('.item,.word');
          this.activeWordSet.clear();
        }
      }
    
      const game = new Game();
      window.game = game;
    })();
    });
    