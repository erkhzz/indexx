// =========================
//  Web Кітап: Auth + Profile
//  (v3) – storage keys are namespaced to avoid stale data across zip versions
// =========================

// Жалпы көмекші функциялар
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const APP_NS = 'wk3';
const key = (name) => `${APP_NS}_${name}`;

function readJSON(k, fallback){
  try{ return JSON.parse(localStorage.getItem(k) || 'null') ?? fallback; }
  catch(_){ return fallback; }
}

function writeJSON(k, val){
  try{ localStorage.setItem(k, JSON.stringify(val)); }catch(_){ /* ignore */ }
}

function currentUser(){
  return readJSON(key('current_user'), null);
}

function setCurrentUser(u){
  writeJSON(key('current_user'), u);
  initUserUI();
  renderProfile();
}

function usersList(){
  return readJSON(key('users'), []);
}

function saveUsersList(arr){
  writeJSON(key('users'), arr);
}


function requireAuthGate(){
  // If there is no registered user, always show Register page first.
  const cur = currentUser();

  const path = (location.pathname || '').toLowerCase();
  const onRegister = path.endsWith('/register.html') || path.endsWith('register.html');

  if(!cur || !cur.name){
    if(!onRegister){
      // Send to register page
      try{ location.replace('register.html'); }catch(e){ location.href = 'register.html'; }
      return false;
    }
  }else{
    // If already registered and user opens register page, send them to main page
    if(onRegister){
      try{ location.replace('index.html'); }catch(e){ location.href = 'index.html'; }
      return false;
    }
  }
  return true;
}


function ensureOverlay(){
  let o = document.querySelector('.page-overlay');
  if(!o){
    o = document.createElement('div');
    o.className = 'page-overlay';
    o.innerHTML = '<div class="page-spinner" aria-label="Жүктелуде"></div>';
    document.body.appendChild(o);
  }
  return o;
}


function applyReveals(){
  const main = document.querySelector('main');
  if(!main) return;

  // Targets: headings, paragraphs, lists, figures, tables, callouts
  const targets = main.querySelectorAll('h2, h3, h4, p, li, figure, .figure, table, .callout, details, .infogrid, .info, .mini-demo');
  let i = 0;
  targets.forEach(el=>{
    // Avoid animating navigation and footer content by scope (main only)
    // Skip very small utility nodes
    if(el.closest('nav')) return;

    el.classList.add('reveal');
    const delay = Math.min(i * 55, 650); // stagger up to ~0.65s
    el.style.setProperty('--d', delay + 'ms');
    i++;
  });
}


function initSlideshows(){
  const shows = document.querySelectorAll('.slideshow');
  if(!shows.length) return;

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  shows.forEach(show=>{
    const slidesEl = show.querySelector('.slides');
    const slideEls = Array.from(show.querySelectorAll('.slide'));
    const dotsEl = show.querySelector('.dots');
    if(!slidesEl || slideEls.length === 0 || !dotsEl) return;

    // build dots
    dotsEl.innerHTML = '';
    const dots = slideEls.map((_, i)=>{
      const b = document.createElement('button');
      b.className = 'dot';
      b.type = 'button';
      b.setAttribute('aria-label', `Слайд ${i+1}`);
      b.addEventListener('click', ()=> go(i, true));
      dotsEl.appendChild(b);
      return b;
    });

    let idx = 0;
    const interval = Number(show.dataset.interval || 4500);
    let t = null;

    function render(){
      slidesEl.style.transform = `translateX(${-idx * 100}%)`;
      dots.forEach((d,i)=> d.classList.toggle('active', i === idx));
    }

    function go(i, user){
      idx = (i + slideEls.length) % slideEls.length;
      render();
      if(user) restart();
    }

    function next(){ go(idx + 1); }

    function restart(){
      if(reduce) return;
      if(t) clearInterval(t);
      t = setInterval(next, interval);
    }

    // init
    render();
    restart();

    // Pause when hover/focus to avoid distraction
    show.addEventListener('mouseenter', ()=>{ if(t) clearInterval(t); });
    show.addEventListener('mouseleave', ()=> restart());
    show.addEventListener('focusin', ()=>{ if(t) clearInterval(t); });
    show.addEventListener('focusout', ()=> restart());
  });
}




/* ----------------------------
   0) Беттер арасында анимация (ауысу эффекті)
-----------------------------*/
function initPageTransitions(){
  // Кіру анимациясы
  const overlay = ensureOverlay();
  overlay.classList.remove('show');

  document.body.classList.add('page-enter');
  applyReveals();
  setTimeout(()=> document.body.classList.remove('page-enter'), 450);

  // Ішкі сілтемелерге (html) шығу анимациясы
  document.addEventListener('click', (e)=>{
    const a = e.target.closest && e.target.closest('a');
    if(!a) return;

    const href = a.getAttribute('href') || '';
    if(!href || href.startsWith('#')) return;

    // Жаңа бетке ашу/басқа режимдер — бөгемейміз
    if(a.target === '_blank') return;
    if(e.button !== 0) return;
    if(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    // Тек осы кітаптың ішіндегі .html беттер
    if(!/\.html(\#.*)?$/i.test(href)) return;

    e.preventDefault();
    document.body.classList.add('page-exit');
    overlay.classList.add('show');
    setTimeout(()=>{ window.location.href = href; }, 230);
  }, true);

  // Back/forward кезінде "шығу" класын алып тастау
  window.addEventListener('pageshow', ()=>{
    applyReveals();
    document.body.classList.remove('page-exit');
    const ov = document.querySelector('.page-overlay');
    if(ov) ov.classList.remove('show');
  });
}

function formatDate(iso){
  const d = new Date(iso);
  return d.toLocaleString('kk-KZ', {year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit'});
}

/* ----------------------------
   1) Кері байланыс (localStorage)
-----------------------------*/


function initUserUI(){
  // Shows user name in header and hides "Тіркелу" link after registration
  const current = currentUser();

  // NOTE: profile UI is rendered in the header right side via renderProfile()
  // (we intentionally avoid duplicating a second badge in the brand area)
  const oldBadge = document.querySelector('.userBadge');
  if(oldBadge) oldBadge.remove();

  // Hide/show register link in navigation
  document.querySelectorAll('a.navlink[href="register.html"]').forEach(a=>{
    a.style.display = (current && current.name) ? 'none' : '';
  });
}

function setCurrentUser(u){
  writeJSON(key('current_user'), u);
  initUserUI();
  renderProfile();
}

function initRegister(){
  const form = $('#registerForm');
  if(!form) return;

  const notice = $('#registerNotice');
  const nameEl = $('#regName');
  const loginEl = $('#regLogin');
  const passEl = $('#regPass');
  const pass2El = $('#regPass2');
  const agreeEl = $('#regAgree');

  function show(msg, ok=false){
    if(!notice) return;
    notice.textContent = msg;
    notice.style.display = 'block';
    notice.classList.remove('is-error','is-success');
    notice.classList.add(ok ? 'is-success' : 'is-error');
  }

  function getUsers(){ return usersList(); }
  function setUsers(users){ saveUsersList(users); }

  // жеңіл hash (демо)
  function hash(s){
    let h = 2166136261;
    for(let i=0;i<s.length;i++){
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  form.addEventListener('submit', (e)=>{
    e.preventDefault();

    const name = (nameEl?.value || '').trim();
    const login = (loginEl?.value || '').trim();
    const pass = (passEl?.value || '');
    const pass2 = (pass2El?.value || '');

    if(name.length < 3){
      show('Өтінеміз, аты-жөніңізді толық жазыңыз.');
      return;
    }
    if(login.length < 3){
      show('Өтінеміз, логинді толтырыңыз (кемінде 3 таңба).');
      return;
    }
    if(!/^[a-zA-Z0-9._-]+$/.test(login)){
      show('Логинде тек әріп, сан және . _ - таңбалары болсын.');
      return;
    }
    if(pass.length < 6){
      show('Құпиясөз кемінде 6 таңба болуы керек.');
      return;
    }
    if(pass !== pass2){
      show('Құпиясөздер сәйкес келмеді.');
      return;
    }
    if(!agreeEl?.checked){
      show('Растауды белгілеңіз.');
      return;
    }

    const users = getUsers();
    if(users.some(u => u.login === login)){
      show('Бұл логин бұрын тіркелген. Басқасын таңдаңыз.');
      return;
    }

    const createdAt = new Date().toISOString();
    users.push({
      id: 'u_' + Date.now(),
      name,
      login,
      passHash: hash(pass),
      createdAt,
      // profile fields (can be edited in profile page)
      birthYear: '',
      birthMonth: '',
      birthDay: '',
      school: '',
      grade: ''
    });
    setUsers(users);

    setCurrentUser({name, login});
    show('Тіркелу сәтті аяқталды ✅', true);

    // Direct redirect to main page
    setTimeout(()=>{ 
      try{ location.replace('index.html'); }catch(e){ location.href = 'index.html'; } 
    }, 200);
  });
}


function initFeedback(){
  const form = $('#feedbackForm');
  if(!form) return;

  const list = $('#feedbackList');
  const notice = $('#feedbackNotice');

  const KEY = 'web_kitap_feedback_v1';
  const DRAFT_KEY = 'wk_feedback_draft_v1';

  // If registered, auto-fill FIO
  const cur = currentUser();

  const fioEl = $('#fio');
  const commentEl = $('#comment');

  if(cur && cur.name && fioEl){
    fioEl.value = cur.name;
    fioEl.readOnly = true;
  }

  // restore draft
  try{
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if(draft && commentEl && typeof draft.comment === 'string' && commentEl.value.trim() === ''){
      commentEl.value = draft.comment;
    }
  }catch(_){}

  // save draft while typing
  if(commentEl){
    commentEl.addEventListener('input', ()=>{
      try{
        localStorage.setItem(DRAFT_KEY, JSON.stringify({comment: commentEl.value}));
      }catch(_){}
    });
  }

  function readData(){
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch { return []; }
  }
  function writeData(arr){
    localStorage.setItem(KEY, JSON.stringify(arr));
  }
  function render(){
    const data = readData().slice().reverse();
    list.innerHTML = '';
    if(data.length === 0){
      list.innerHTML = `<div class="small">Әзірге пікір жоқ. Алғашқы болып кері байланыс қалдырыңыз 🙂</div>`;
      return;
    }
    data.forEach(item=>{
      const el = document.createElement('div');
      el.className = 'entry';
      el.innerHTML = `
        <div class="meta"><b>${escapeHtml(item.name)}</b> • ${formatDate(item.date)}</div>
        <div class="text">${escapeHtml(item.comment)}</div>
      `;
      list.appendChild(el);
    });
  }

  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const name = (fioEl?.value || '').trim();
    const comment = (commentEl?.value || '').trim();

    if(name.length < 3 || comment.length < 3){
      showNotice(notice, 'Өтінеміз, ФИО және пікір өрістерін толық толтырыңыз.');
      return;
    }

    const data = readData();
    data.push({name, comment, date: new Date().toISOString()});
    writeData(data);

    // clear only comment
    if(commentEl) commentEl.value = '';
    try{ localStorage.removeItem(DRAFT_KEY); }catch(_){}

    render();
    showNotice(notice, 'Тапсырма қабылданды ✅ Кері байланысыңыз сақталды.');
  });

  render();
}

function showNotice(el, text){
  if(!el) return;
  el.textContent = text;
  el.classList.remove('is-error','is-success');
  const t = String(text || '').toLowerCase();
  if(t.includes('өтінеміз') || t.includes('толық') || t.includes('қате')){
    el.classList.add('is-error');
  }else{
    el.classList.add('is-success');
  }
  el.classList.add('show');
  setTimeout(()=> el.classList.remove('show'), 3200);
}

function escapeHtml(str){
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

/* ----------------------------
   2) Тесттер
-----------------------------*/
function initQuizzes(){
  const quizForms = $$('.quiz');
  if(quizForms.length === 0) return;

  const answers = {
    l1: {1:'b',2:'c',3:'a',4:'d',5:'b',6:'c',7:'a',8:'d',9:'b',10:'c'},
    l2: {1:'a',2:'b',3:'d',4:'c',5:'a',6:'b',7:'d',8:'c',9:'a',10:'b'},
    l3: {1:'c',2:'a',3:'b',4:'d',5:'c',6:'a',7:'b',8:'d',9:'c',10:'a'},
    l4: {1:'b',2:'d',3:'a',4:'c',5:'b',6:'d',7:'a',8:'c',9:'b',10:'d'}
  };

  quizForms.forEach(form=>{
    form.addEventListener('submit', (e)=>{
      e.preventDefault();

      const key = form.dataset.quiz;
      const ans = answers[key];
      if(!ans) return;

      let score = 0;
      let wrong = 0;
      let unanswered = 0;
      const total = Object.keys(ans).length;

      $$('.q', form).forEach(q=>{
        q.classList.remove('correct','incorrect');
      });

      for(const [qNum, correct] of Object.entries(ans)){
        const qEl = $(`.q[data-q="${qNum}"]`, form);
        if(!qEl) continue;

        const picked = $(`input[name="${key}q${qNum}"]:checked`, form);
        const pickedVal = picked ? picked.value : null;

        if(!pickedVal){
          unanswered++;
          qEl.classList.add('incorrect');
          continue;
        }

        if(pickedVal === correct){
          score++;
          qEl.classList.add('correct');
        }else{
          wrong++;
          qEl.classList.add('incorrect');
        }
      }

      const result = $('.result', form);
      if(result){
        const msg = score === total
          ? 'Тамаша! Барлығы дұрыс 👏'
          : `Нәтиже дайын. Қателерді қарап, қайта тексеріп көріңіз.`;
        result.textContent = msg;
      }

      // === Progress update: only when 100% correct ===
      if(score === total){
        const u = currentUser();
        if(u && u.login && key){
          const p = readProgress(u.login);
          if(p && p.lessons && typeof key === 'string'){
            if(Object.prototype.hasOwnProperty.call(p.lessons, key)){
              p.lessons[key] = true;
              writeProgress(u.login, p);
            }
          }
        }
      }

      const counts = $('.resultCounts', form);
      if(counts){
        counts.innerHTML = `
          <div class="rStat good"><span>Дұрыс</span><b>${score}</b></div>
          <div class="rStat bad"><span>Қате</span><b>${wrong}</b></div>
          <div class="rStat neutral"><span>Жауап берілмеген</span><b>${unanswered}</b></div>
          <div class="rStat total"><span>Барлығы</span><b>${total}</b></div>
        `;
      }

      const box = $('.quizResultBox', form);
      if(box){
        box.classList.add('ready');
      }

      const panel = form.closest('.testPanel');
      if(panel && window.innerWidth < 980){
        const box = $('.quizResultBox', form);
        box?.scrollIntoView({behavior:'smooth', block:'start'});
      }
    });
  });
}

/* ----------------------------
   2b) Тест панельдері (сол жақ мәзір)
-----------------------------*/
function initTestsSidebarMenu(){
  const wrap = $('.testsSplit');
  if(!wrap) return;

  const btns = $$('.testTopicBtn', wrap);
  const panels = $$('.testPanel', wrap);
  if(btns.length === 0 || panels.length === 0) return;

  function openPanel(id, pushHash = true){
    panels.forEach(panel=>{
      const active = panel.id === id;
      panel.hidden = !active;
      panel.classList.toggle('active', active);
    });

    btns.forEach(btn=>{
      const active = btn.dataset.target === id;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    if(pushHash){
      try{
        history.replaceState(null, '', `#${id}`);
      }catch(_){}
    }
  }

  btns.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      openPanel(btn.dataset.target, true);
    });
  });

  const hashId = (location.hash || '').replace('#','');
  const defaultId = panels[0].id;
  const targetId = panels.some(p=>p.id === hashId) ? hashId : defaultId;
  openPanel(targetId, false);

  window.addEventListener('hashchange', ()=>{
    const nextId = (location.hash || '').replace('#','');
    if(panels.some(p=>p.id === nextId)){
      openPanel(nextId, false);
    }
  });
}

/* ----------------------------
   3) Тренажер (HTML симулятор)
-----------------------------*/
function initTrainer(){
  const htmlEd = $('#htmlEditor') || $('#codeEditor');
  const cssEd = $('#cssEditor');
  const jsEd  = $('#jsEditor');
  if(!htmlEd) return;

  const runBtn = $('#runCode');
  const clearBtn = $('#clearCode');
  const sampleBtn = $('#loadSample');
  const frame = $('#previewFrame');
  const notice = $('#trainerNotice');

  // Tabs (HTML/CSS/JS) — редактор панельдері
  const tabBtns = document.querySelectorAll('.tabBtn');
  const panels = document.querySelectorAll('.tabPanel');
  function activateTab(name){
    tabBtns.forEach(b=>{
      const active = b.dataset.tab === name;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    panels.forEach(p=>{
      p.classList.toggle('active', p.dataset.panel === name);
    });
  }
  if(tabBtns.length && panels.length){
    tabBtns.forEach(b=> b.addEventListener('click', ()=> activateTab(b.dataset.tab)));
    activateTab('html');
  }


  const SAMPLE_HTML = `<!doctype html>
<html lang="kk">
<head>
  <meta charset="utf-8" />
  <title>Менің алғашқы веб-бетім</title>
</head>
<body>
  <h1>Сәлем, Web!</h1>
  <p id="p">Бұл — тренажердегі алғашқы бет. Төмендегі батырманы басып көріңіз.</p>

  <button id="btn">Басып көр</button>

  <ul>
    <li>HTML — құрылым</li>
    <li>CSS — дизайн</li>
    <li>JS — интерактив</li>
  </ul>
</body>
</html>`;

  const SAMPLE_CSS = `body{
  font-family: system-ui;
  padding: 16px;
}
h1{ color: #1e88e5; }
button{
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(229,231,235,.95);
  background: rgba(14,165,164,.10);
  cursor: pointer;
}`;

  const SAMPLE_JS = `const btn = document.querySelector('#btn');
const p = document.querySelector('#p');

if(btn && p){
  let n = 0;
  btn.addEventListener('click', ()=>{
    n++;
    p.textContent = 'Батырма ' + n + ' рет басылды ✅';
  });
}`;

  function buildSrcdoc(html, css, jsCode){
    const hasDoc = /<!doctype|<html[\s>]/i.test(html);
    const safeScriptClose = '</scr' + 'ipt>';

    if(hasDoc){
      let out = html;

      if(css && css.trim().length){
        if(/<\/head>/i.test(out)){
          out = out.replace(/<\/head>/i, `<style>${css}</style></head>`);
        }else{
          out = `<style>${css}</style>\n` + out;
        }
      }

      if(jsCode && jsCode.trim().length){
        if(/<\/body>/i.test(out)){
          out = out.replace(/<\/body>/i, `<script>${jsCode}${safeScriptClose}</body>`);
        }else{
          out = out + `\n<script>${jsCode}${safeScriptClose}`;
        }
      }

      return out;
    }

    // Егер тек фрагмент жазса, толық құжатқа орап береміз
    return `<!doctype html>
<html lang="kk">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${css || ''}</style>
  <title>Preview</title>
</head>
<body>
${html}
<script>${jsCode || ''}${safeScriptClose}
</body>
</html>`;
  }

  function run(){
    const html = (htmlEd.value || '').trim();
    const css  = (cssEd ? cssEd.value : '').trim();
    const jsCode = (jsEd ? jsEd.value : '').trim();

    if(html.length < 3 && css.length < 3 && jsCode.length < 3){
      showNotice(notice, 'Код өрістері бос сияқты. Алдымен HTML/CSS/JS жазыңыз немесе “Үлгі код” батырмасын басыңыз.');
      return;
    }

    frame.srcdoc = buildSrcdoc(html, css, jsCode);
    showNotice(notice, 'Нәтиже жаңартылды ✅');
  }

  runBtn && runBtn.addEventListener('click', run);

  clearBtn && clearBtn.addEventListener('click', ()=>{
    htmlEd.value = '';
    if(cssEd) cssEd.value = '';
    if(jsEd) jsEd.value = '';
    frame.srcdoc = '<div style="font-family:system-ui;padding:16px;color:#6b7280">Алдымен HTML/CSS/JS код жазыңыз, сосын “Іске қосу” басыңыз.</div>';
    showNotice(notice, 'Өрістер тазартылды.');
  });

  sampleBtn && sampleBtn.addEventListener('click', ()=>{
    htmlEd.value = SAMPLE_HTML;
    if(cssEd) cssEd.value = SAMPLE_CSS;
    if(jsEd) jsEd.value = SAMPLE_JS;
    showNotice(notice, 'Үлгі код жүктелді. Енді “Іске қосу” басыңыз.');
  });

  // Ctrl+Enter / Cmd+Enter арқылы іске қосу (үш өрісте де)
  const editors = [htmlEd, cssEd, jsEd].filter(Boolean);
  editors.forEach(ed=>{
    ed.addEventListener('keydown', (e)=>{
      if((e.ctrlKey || e.metaKey) && e.key === 'Enter'){
        run();
      }
    });
  });

  // Алғашқы preview
  frame.srcdoc = '<div style="font-family:system-ui;padding:16px;color:#6b7280">Алдымен HTML/CSS/JS код жазыңыз, сосын “Іске қосу” басыңыз.</div>';
}

/* ----------------------------
   Инициализация
-----------------------------*/

/* ----------------------------
   4) Теориялық бөлімдегі мини-демолар
-----------------------------*/
function initTheoryDemos(){
  // 1) JS: санағыш демо
  const btn = document.querySelector('#jsDemoBtn');
  const out = document.querySelector('#jsDemoOut');
  if(btn && out){
    let n = 0;
    btn.addEventListener('click', ()=>{
      n++;
      out.textContent = `Батырма ${n} рет басылды. Бұл — DOM арқылы мәтінді өзгерту мысалы.`;
    });
  }

  // 2) CSS: Box Model (padding/margin) демо
  const pad = document.querySelector('#padRange');
  const mar = document.querySelector('#marRange');
  const box = document.querySelector('#boxDemo');
  const padVal = document.querySelector('#padVal');
  const marVal = document.querySelector('#marVal');

  function applyBox(){
    if(!(pad && mar && box)) return;
    const p = Number(pad.value);
    const m = Number(mar.value);
    box.style.padding = p + 'px';
    box.style.margin = m + 'px';
    if(padVal) padVal.textContent = p + 'px';
    if(marVal) marVal.textContent = m + 'px';
  }
  if(pad && mar && box){
    pad.addEventListener('input', applyBox);
    mar.addEventListener('input', applyBox);
    applyBox();
  }
}



function initTheorySidebarMenu(){
  const wrap = document.getElementById('theorySplit');
  if(!wrap) return;

  const buttons = Array.from(wrap.querySelectorAll('.topicNavBtn'));
  const lessons = Array.from(wrap.querySelectorAll('.lesson'));
  if(!buttons.length || !lessons.length) return;

  const detailsMap = new Map();
  lessons.forEach(lesson=>{
    const det = lesson.querySelector('details.lessonDetails');
    if(det) detailsMap.set(lesson.id, det);
  });

  function setActive(id){
    buttons.forEach(btn => btn.classList.toggle('active', btn.dataset.target === id));
  }

  function openLesson(id, toggleAllowed=false){
    const det = detailsMap.get(id);
    if(!det) return;

    const wasOpen = det.hasAttribute('open');

    // close all first
    detailsMap.forEach((d, key)=>{
      if(key !== id) d.removeAttribute('open');
    });

    if(toggleAllowed && wasOpen){
      det.removeAttribute('open');
      setActive('');
    }else{
      det.setAttribute('open', '');
      setActive(id);
    }

    // Scroll lesson into view on desktop/mobile
    const top = lessonTopOffset(det.closest('.lesson'));
    window.scrollTo({ top, behavior: prefersReduced() ? 'auto' : 'smooth' });
  }

  function lessonTopOffset(el){
    if(!el) return 0;
    const header = document.querySelector('header');
    const headerH = header ? header.offsetHeight : 72;
    const y = el.getBoundingClientRect().top + window.scrollY - headerH - 10;
    return Math.max(0, y);
  }

  function prefersReduced(){
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  buttons.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      openLesson(btn.dataset.target, true);
    });
  });

  // Keep sidebar active state in sync when user clicks summary manually
  detailsMap.forEach((det, id)=>{
    det.addEventListener('toggle', ()=>{
      if(det.open) setActive(id);
    });
  });
}


document.addEventListener('DOMContentLoaded', ()=>{
  if(!requireAuthGate()) return;
  initUserUI();
  initPageTransitions();
  initSlideshows();
  initRegister();
  initFeedback();
  initQuizzes();
  initTestsSidebarMenu();
  initTrainer();
  initTheoryDemos();
  initTheorySidebarMenu();
});


// ===== AUTH / PROFILE (v3) =====

function logout(){
  // Clear new keys
  try{ localStorage.removeItem(key('current_user')); }catch(_){ }
  try{ localStorage.removeItem(key('users')); }catch(_){ }

  // Clear progress keys for this namespace
  try{
    Object.keys(localStorage).forEach(k=>{
      if(k.startsWith(APP_NS + '_progress_')) localStorage.removeItem(k);
    });
  }catch(_){ }

  // Clear legacy keys from older zips
  try{ localStorage.removeItem('wk_current_user'); }catch(_){ }
  try{ localStorage.removeItem('wk_users'); }catch(_){ }
  try{ localStorage.removeItem('webUser'); }catch(_){ }
  try{ localStorage.removeItem('wk_session'); }catch(_){ }

  try{ location.replace('register.html'); }catch(e){ location.href = 'register.html'; }
}

function renderProfile(){
  const container = document.querySelector('.profileContainer');
  if(!container) return;

  const u = currentUser();
  if(u && u.name){
    const letter = String(u.name || '').trim().charAt(0).toUpperCase() || '•';
    container.innerHTML = `
      <div class="profileBlock" role="region" aria-label="Пайдаланушы">
        <div class="profileAvatar" aria-hidden="true">${letter}</div>
        <div class="profileMeta">
          <div class="profileName" title="${escapeHtml(u.name)}">${escapeHtml(u.name)}</div>
          <a class="profileLink" href="profile.html">Профиль</a>
        </div>
        <button class="logoutBtn" type="button" id="logoutBtn">Шығу</button>
      </div>
    `;
    container.querySelector('#logoutBtn')?.addEventListener('click', logout);
  }else{
    container.innerHTML = '';
  }
}

function progressKey(login){
  return `${APP_NS}_progress_${login}`;
}

function readProgress(login){
  const base = { lessons: {l1:false,l2:false,l3:false,l4:false} };
  if(!login) return base;
  const data = readJSON(progressKey(login), null);
  if(data && data.lessons){
    return { ...base, ...data, lessons: { ...base.lessons, ...data.lessons } };
  }
  return base;
}

function writeProgress(login, data){
  if(!login) return;
  writeJSON(progressKey(login), data);
}

function progressPercent(p){
  const lessons = p?.lessons || {};
  const total = 4;
  const done = Object.values(lessons).filter(Boolean).length;
  return Math.round((done/total) * 100);
}

function initProfilePage(){
  const form = document.getElementById('profileForm');
  if(!form) return;

  const u = currentUser();
  if(!u || !u.login){
    try{ location.replace('register.html'); }catch(e){ location.href='register.html'; }
    return;
  }

  const users = usersList();
  const record = users.find(x=>x.login === u.login) || null;

  const createdAtEl = document.getElementById('profileCreatedAt');
  if(createdAtEl){
    createdAtEl.textContent = record?.createdAt ? formatDate(record.createdAt) : '—';
  }

  const setVal = (id, v) => { const el = document.getElementById(id); if(el) el.value = v ?? ''; };
  setVal('profName', record?.name || u.name || '');
  setVal('profLogin', record?.login || u.login || '');
  setVal('birthYear', record?.birthYear || '');
  setVal('birthMonth', record?.birthMonth || '');
  setVal('birthDay', record?.birthDay || '');
  setVal('school', record?.school || '');
  setVal('grade', record?.grade || '');

  function renderProgress(){
    const p = readProgress(u.login);
    const pct = progressPercent(p);
    const fill = document.getElementById('progressFill');
    const pctEl = document.getElementById('progressPercent');
    const list = document.getElementById('progressList');

    if(fill) fill.style.width = pct + '%';
    if(pctEl) pctEl.textContent = pct + '%';

    if(list){
      const labels = {l1:'1-сабақ', l2:'2-сабақ', l3:'3-сабақ', l4:'4-сабақ'};
      list.innerHTML = Object.keys(labels).map(k=>{
        const done = !!p.lessons[k];
        return `<div class="pRow ${done?'done':''}"><span>${labels[k]}</span><b>${done?'✅':'⏳'}</b></div>`;
      }).join('');
    }
  }
  renderProgress();

  const notice = document.getElementById('profileNotice');
  function showProfileNotice(msg, ok=false){
    if(!notice) return;
    notice.textContent = msg;
    notice.classList.remove('is-error','is-success');
    notice.classList.add(ok ? 'is-success' : 'is-error');
    notice.classList.add('show');
    setTimeout(()=> notice.classList.remove('show'), 3000);
  }

  form.addEventListener('submit', (e)=>{
    e.preventDefault();

    const name = (document.getElementById('profName')?.value || '').trim();
    if(name.length < 3){
      showProfileNotice('Аты-жөні кемінде 3 таңба болсын.');
      return;
    }

    const updated = {
      ...(record || {}),
      name,
      login: u.login,
      birthYear: (document.getElementById('birthYear')?.value || '').trim(),
      birthMonth: (document.getElementById('birthMonth')?.value || '').trim(),
      birthDay: (document.getElementById('birthDay')?.value || '').trim(),
      school: (document.getElementById('school')?.value || '').trim(),
      grade: (document.getElementById('grade')?.value || '').trim(),
      createdAt: record?.createdAt || new Date().toISOString()
    };

    const next = users.slice();
    const idx = next.findIndex(x=>x.login === u.login);
    if(idx >= 0) next[idx] = updated; else next.push(updated);
    saveUsersList(next);

    setCurrentUser({name: updated.name, login: updated.login});
    showProfileNotice('Сақталды ✅', true);
    renderProgress();
  });
}

function initPasswordToggles(){
  const btns = Array.from(document.querySelectorAll(".passToggle, .passToggleBtn, .passtoggle"));
  if(!btns.length) return;

  btns.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const targetId = btn.getAttribute("data-target") || btn.getAttribute("aria-controls");
      const input = targetId ? document.getElementById(targetId) : btn.previousElementSibling;
      if(!input) return;

      const isPass = input.getAttribute("type") === "password";
      input.setAttribute("type", isPass ? "text" : "password");
      btn.textContent = isPass ? "Жасыру" : "Көрсету";
      btn.setAttribute("aria-pressed", isPass ? "true" : "false");
    });
  });
}

document.addEventListener("DOMContentLoaded", ()=>{
  renderProfile();
  initPasswordToggles();
  initProfilePage();
});
