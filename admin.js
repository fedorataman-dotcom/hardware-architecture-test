import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';
import { getFirestore, collection, doc, query, orderBy, limit, onSnapshot, getDocs, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';

const TEACHER_EMAIL = 'fedorataman@gmail.com';
const LETTERS = ['А','Б','В','Г'];
const app = document.getElementById('admin-app');
const config = window.FIREBASE_CONFIG || {};
const configured = Boolean(config.apiKey && config.projectId && config.appId && !config.apiKey.startsWith('PASTE_'));
let auth, db, unsubscribe = null, attempts = [], selectedId = null, filterText = '', filterVariant = 'all', filterStatus = 'all', currentUser = null;
const drafts = {};
let answerKeys = {};

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function variant(id) { return window.QUIZ_DATA.variants.find(v => v.id === id); }
function answer(a, n) { return String(a.answers?.[String(n)] ?? ''); }
function autoScore(a) { const v=variant(a.variantId), keys=answerKeys[String(a.variantId)]?.correct; return v && keys ? v.questions.slice(0,24).filter(q=>answer(a,q.number)!=='' && keys[String(q.number)]?.includes(Number(answer(a,q.number)))).length : 0; }
function graded(a) { return [25,26,27,28,29,30].every(n=>Number.isInteger(a.manualScores?.[String(n)])); }
function totalScore(a) { return autoScore(a)+Object.values(a.manualScores||{}).reduce((sum,n)=>sum+(Number(n)||0),0); }
function dateText(a) { const d=a.submittedAt?.toDate?.(); return d ? d.toLocaleString('ru-RU') : 'Отправляется…'; }
function renderMessage(title, text, button=false) { app.innerHTML=`<section class="panel start-card narrow"><p class="eyebrow">Журнал преподавателя</p><h1>${escapeHtml(title)}</h1><p class="subtle">${escapeHtml(text)}</p>${button?'<button class="btn btn-outline" id="sign-out">Выйти</button>':''}</section>`; }
if (!configured) {
  renderMessage('Firebase не подключён','Добавьте параметры веб-приложения в firebase-config.js, затем откройте эту страницу снова.');
} else {
  const firebaseApp=initializeApp(config);
  auth=getAuth(firebaseApp);
  db=getFirestore(firebaseApp);
  renderMessage('Проверяем вход','Подождите немного.');
  onAuthStateChanged(auth, async user => {
    currentUser=user;
    if(unsubscribe){unsubscribe();unsubscribe=null;}
    if(!user){renderLogin();return;}
    if(user.email?.toLowerCase()!==TEACHER_EMAIL || !user.emailVerified){
      renderMessage('Доступ закрыт',`Журнал доступен только подтверждённому аккаунту ${TEACHER_EMAIL}. Сейчас выполнен вход как ${user.email||'неизвестный пользователь'}.`,true);
      return;
    }
    renderMessage('Загружаем работы','Подключаем журнал сдач и закрытые ключи ответов.');
    try {
      const keySnapshot=await getDocs(collection(db,'answerKeys'));
      answerKeys=Object.fromEntries(keySnapshot.docs.map(d=>[d.id,d.data()]));
      if(Object.keys(answerKeys).length!==4) throw new Error('В Firebase отсутствуют ключи для всех четырёх вариантов.');
    } catch(error) {
      renderMessage('Не удалось загрузить ключи',`${error.message}. Проверьте коллекцию answerKeys и правила Firestore.`,true);
      return;
    }
    if(auth.currentUser?.uid!==user.uid) return;
    unsubscribe=onSnapshot(query(collection(db,'submissions'),orderBy('submittedAt','desc'),limit(500)), snapshot=>{
      attempts=snapshot.docs.map(d=>({id:d.id,...d.data()}));
      if(!attempts.some(a=>a.id===selectedId)) selectedId=attempts[0]?.id||null;
      renderDashboard();
    }, error=>renderMessage('Не удалось открыть журнал',`${error.message}. Проверьте правила Firestore и настройки Firebase.`,true));
  });
}
function renderLogin() {
  app.innerHTML=`<section class="hero admin-hero"><p class="eyebrow">Отдельный доступ</p><h1>Журнал преподавателя</h1><p>Просмотр всех сданных работ, проверка развёрнутых ответов и выставление баллов.</p></section><section class="panel start-card narrow"><h2 class="section-title">Войти в журнал</h2><p class="subtle">Используйте Google-аккаунт ${escapeHtml(TEACHER_EMAIL)}. Доступ к данным дополнительно проверяют правила Firestore.</p><button class="btn btn-primary" id="sign-in">Войти через Google</button><p id="auth-error" class="error-text" role="alert"></p></section>`;
}
function filtered() {
  const text=filterText.toLocaleLowerCase('ru');
  return attempts.filter(a => (!text || `${a.studentName} ${a.groupName} ${a.id}`.toLocaleLowerCase('ru').includes(text)) && (filterVariant==='all'||String(a.variantId)===filterVariant) && (filterStatus==='all'||(filterStatus==='graded'?graded(a):!graded(a))));
}
function renderDashboard() {
  const shown=filtered();
  const selected=attempts.find(a=>a.id===selectedId);
  app.innerHTML=`<div class="assessment-head"><div><p class="eyebrow">Журнал преподавателя</p><h1>Сданные работы</h1><p class="subtle">${escapeHtml(currentUser?.email||'')}</p></div><button class="btn btn-outline" id="sign-out">Выйти</button></div>
  <div class="dashboard-stats"><div class="panel dashboard-stat"><strong>${attempts.length}</strong><span>сдано</span></div><div class="panel dashboard-stat"><strong>${attempts.filter(a=>!graded(a)).length}</strong><span>ждут проверки</span></div><div class="panel dashboard-stat"><strong>${attempts.filter(graded).length}</strong><span>проверено</span></div></div>
  <div class="admin-layout"><section class="panel submission-sidebar"><div class="admin-filters"><label>Поиск по имени или группе<input id="search" type="search" value="${escapeHtml(filterText)}" placeholder="Фамилия, группа"></label><div class="filter-row"><label>Вариант<select id="variant-filter"><option value="all">Все</option>${[1,2,3,4].map(n=>`<option value="${n}" ${filterVariant===String(n)?'selected':''}>${n}</option>`).join('')}</select></label><label>Статус<select id="status-filter"><option value="all">Все</option><option value="pending" ${filterStatus==='pending'?'selected':''}>Ждут проверки</option><option value="graded" ${filterStatus==='graded'?'selected':''}>Проверены</option></select></label></div></div><div class="submission-list">${shown.length?shown.map(a=>`<button class="submission-card ${selectedId===a.id?'selected':''}" data-id="${escapeHtml(a.id)}"><span class="submission-name">${escapeHtml(a.studentName)}</span><span class="submission-meta">${escapeHtml(a.groupName)} · вариант ${a.variantId} · ${dateText(a)}</span><span class="status-badge ${graded(a)?'complete':'pending'}">${graded(a)?`Проверено · ${totalScore(a)}/60`:`Проверить · ${autoScore(a)}/24`}</span></button>`).join(''):'<p class="empty-list">Работ по выбранному фильтру нет.</p>'}</div></section>
  <section class="admin-detail">${selected?detailHtml(selected):'<div class="panel start-card"><h2>Работ пока нет</h2><p class="subtle">После сдачи студентами работы появятся здесь автоматически.</p></div>'}</section></div>`;
}
function detailHtml(a) {
  const v=variant(a.variantId);
  const draft=drafts[a.id];
  const keys=answerKeys[String(a.variantId)];
  if(!v) return '<div class="panel start-card">Неизвестный вариант работы.</div>';
  return `<div class="panel detail-head"><p class="eyebrow">Работа студента · вариант ${a.variantId}</p><h2>${escapeHtml(a.studentName)}</h2><div class="meta"><span class="pill">${escapeHtml(a.groupName)}</span><span class="pill">${dateText(a)}</span><span class="pill strong">Тест: ${autoScore(a)}/24</span><span class="pill strong">${graded(a)?`Итого: ${totalScore(a)}/60`:'Ручная проверка не завершена'}</span></div><p class="small subtle">Номер сдачи: ${escapeHtml(a.id)}</p></div>
  <form id="grade-form" data-id="${escapeHtml(a.id)}"><div class="section-divider"><h2>Развёрнутые ответы</h2><p class="subtle">Оцените каждый ответ от 0 до 6 баллов.</p></div>${v.questions.slice(24).map(q=>`<article class="panel question"><div class="qtop"><span class="qnum">${q.number}</span><h3>${escapeHtml(q.text)}</h3></div><div class="manual-answer">${escapeHtml(answer(a,q.number)||'Нет ответа')}</div><div class="rubric"><b>Ориентир:</b> ${escapeHtml(keys.rubrics[String(q.number)])}</div><label class="score-input">Балл <input type="number" name="score${q.number}" aria-label="Балл за вопрос ${q.number}" min="0" max="6" step="1" value="${draft ? escapeHtml(draft.scores[String(q.number)] ?? '') : Number.isInteger(a.manualScores?.[String(q.number)])?a.manualScores[String(q.number)]:''}" placeholder="—"> / 6</label></article>`).join('')}<div class="panel grade-footer"><label>Комментарий преподавателя<textarea name="teacherNote" maxlength="4000" placeholder="Необязательно">${escapeHtml(draft ? draft.note : a.teacherNote||'')}</textarea></label><div class="actions"><button class="btn btn-primary" type="submit">Сохранить оценку</button><span id="save-status" role="status" class="small subtle"></span></div></div></form>
  <details class="panel test-details"><summary>Тестовые ответы · ${autoScore(a)}/24</summary>${v.questions.slice(0,24).map(q=>{const chosen=answer(a,q.number);const correct=keys.correct[String(q.number)]||[];const valid=chosen!==''&&correct.includes(Number(chosen));return `<div class="test-row"><b>${q.number}. ${escapeHtml(q.text)}</b><p class="${valid?'correct':'incorrect'}">${valid?'✓':'✕'} Ответ студента: ${chosen===''?'нет ответа':`${LETTERS[Number(chosen)]}) ${escapeHtml(q.options[Number(chosen)])}`}</p>${valid?'':`<p>Верно: ${correct.map(i=>`${LETTERS[i]}) ${escapeHtml(q.options[i])}`).join(' или ')}</p>`}</div>`}).join('')}</details>`;
}
async function saveGrades(event) {
  event.preventDefault();
  const form=event.currentTarget, id=form.dataset.id, scores={};
  for(let n=25;n<=30;n++){
    const raw=form.elements.namedItem(`score${n}`).value;
    if(raw!==''){
      const score=Number(raw);
      if(!Number.isInteger(score)||score<0||score>6){form.elements.namedItem(`score${n}`).focus();return;}
      scores[String(n)]=score;
    }
  }
  const button=form.querySelector('button[type=submit]'), status=document.getElementById('save-status');
  button.disabled=true;status.textContent='Сохраняем…';
  try {
    await updateDoc(doc(db,'submissions',id),{manualScores:scores,teacherNote:form.elements.namedItem('teacherNote').value,gradedAt:Object.keys(scores).length===6?serverTimestamp():null});
    delete drafts[id];
    status.textContent='Оценка сохранена.';
  } catch(error) { status.textContent=`Ошибка: ${error.message}`; status.classList.add('error-text'); }
  finally { button.disabled=false; }
}
app.addEventListener('click', async event=>{
  const login=event.target.closest('#sign-in');
  if(login){
    login.disabled=true;
    try { await signInWithPopup(auth,new GoogleAuthProvider()); }
    catch(error){document.getElementById('auth-error').textContent=`Не удалось войти: ${error.message}`;login.disabled=false;}
    return;
  }
  if(event.target.closest('#sign-out')) { await signOut(auth); return; }
  const card=event.target.closest('.submission-card');
  if(card){selectedId=card.dataset.id;renderDashboard();}
});
app.addEventListener('submit', event=>{if(event.target.id==='grade-form')saveGrades(event);});
app.addEventListener('input', event=>{
  const form=event.target.closest('#grade-form');
  if(form){
    drafts[form.dataset.id]={scores:Object.fromEntries(Array.from({length:6},(_,i)=>{const n=i+25;return [String(n),form.elements.namedItem(`score${n}`).value]})),note:form.elements.namedItem('teacherNote').value};
  }
  if(event.target.id==='search'){
    filterText=event.target.value; const position=event.target.selectionStart;renderDashboard();const fresh=document.getElementById('search');fresh?.focus();fresh?.setSelectionRange(position,position);
  }
});
app.addEventListener('change', event=>{
  if(event.target.id==='variant-filter'){filterVariant=event.target.value;renderDashboard();}
  if(event.target.id==='status-filter'){filterStatus=event.target.value;renderDashboard();}
});
