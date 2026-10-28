(() => {
  'use strict';
  const DATA = window.OS_QUIZ_DATA;
  const KEY = 'os-quiz-v1';
  const LETTERS = ['А', 'Б', 'В', 'Г'];
  const app = document.getElementById('app');
  let state = load();
  let clock = null;
  const configured = Boolean(window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey && window.FIREBASE_CONFIG.projectId && !window.FIREBASE_CONFIG.apiKey.startsWith('PASTE_'));

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  function load() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY));
      if (value && [1,2,3,4].includes(value.variantId) && value.answers && value.name) return value;
    } catch (_) {}
    return null;
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
  function variant() { return DATA.variants.find(item => item.id === state.variantId); }
  function answer(n) { return state.answers[n] ?? ''; }
  function answered() { return variant().questions.filter(q => String(answer(q.number)).trim()).length; }
  function elapsedText() {
    const minutes = Math.floor(((state.submittedAt || Date.now()) - state.startedAt) / 60000);
    const hours = Math.floor(minutes / 60);
    return hours ? `${hours} ч ${minutes % 60} мин` : `${minutes} мин`;
  }
  function renderStart() {
    app.innerHTML = `
      <section class="hero">
        <p class="eyebrow">Проверка знаний / учебный модуль</p>
        <h1>Операционные системы и среды</h1>
        <p>Назначение и устройство ОС, интерфейсы, файлы, процессы, память, учётные записи, устройства, обновления и безопасная работа. Один из четырёх вариантов выбирается случайно при старте.</p>
        <div class="hero-stats">
          <div class="stat"><b>30</b><span>заданий</span></div>
          <div class="stat"><b>90 мин</b><span>рекомендуемое время</span></div>
          <div class="stat"><b>60</b><span>максимум баллов</span></div>
        </div>
      </section>
      <section class="panel start-card">
        <p class="eyebrow">Перед началом</p>
        <h2 class="section-title">Данные студента</h2>
        <p class="subtle">Укажите имя и группу — по ним преподаватель найдёт вашу работу в журнале.</p>
        <form id="start-form">
          <div class="form-grid">
            <div class="field"><label for="student-name">Фамилия и имя *</label><input id="student-name" name="name" required maxlength="100" autocomplete="name" placeholder="Например, Иванов Иван"></div>
            <div class="field"><label for="student-group">Группа *</label><input id="student-group" name="group" required maxlength="60" placeholder="Например, ИС-21"></div>
          </div>
          <div class="note">Вопросы 1–24 оцениваются автоматически по 1 баллу. Развёрнутые ответы 25–30 преподаватель проверяет вручную, до 6 баллов за каждый. После завершения работа отправляется преподавателю.</div>
          ${configured?'':'<p class="error-box">Приём работ ещё не настроен. Преподавателю нужно подключить Firebase.</p>'}
          <div class="actions"><button class="btn btn-primary" type="submit" ${configured?'':'disabled'}>Начать тест →</button><span class="small subtle">До сдачи прогресс сохраняется в этом браузере.</span></div>
        </form>
      </section><p class="switch-test"><a class="btn btn-outline" href="index.html">Открыть тест по архитектуре аппаратных средств</a></p>`;
    document.getElementById('start-form').addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!form.reportValidity()) return;
      const name = form.elements.namedItem('name').value.trim();
      const group = form.elements.namedItem('group').value.trim();
      if (!name || !group) {
        form.elements.namedItem(!name ? 'name' : 'group').setCustomValidity('Укажите значение без одних пробелов.');
        form.reportValidity();
        return;
      }
      const random = new Uint32Array(1);
      crypto.getRandomValues(random);
      state = {name, group, variantId:(random[0] % 4)+1, answers:{}, startedAt:Date.now(), submittedAt:null};
      save(); render(); window.scrollTo(0,0);
    });
    document.querySelectorAll('#start-form input').forEach(input => input.addEventListener('input', () => input.setCustomValidity('')));
  }
  function questionHtml(q) {
    const n=q.number;
    if(n<=24) {
      return `<article class="panel question" id="q${n}"><div class="qtop"><span class="qnum">${n}</span><h3>${escapeHtml(q.text)}</h3></div><div class="choices">${q.options.map((option,i)=>`<label class="choice"><input type="radio" name="q${n}" value="${i}" ${String(answer(n))===String(i)?'checked':''}><span><span class="choice-letter">${LETTERS[i]})</span>${escapeHtml(option)}</span></label>`).join('')}</div></article>`;
    }
    return `<article class="panel question" id="q${n}"><div class="qtop"><span class="qnum">${n}</span><h3>${escapeHtml(q.text)}</h3></div><textarea name="q${n}" maxlength="5000" aria-label="Ответ на вопрос ${n}" placeholder="Напишите ответ своими словами">${escapeHtml(answer(n))}</textarea><p class="qhint">Проверяет преподаватель · до 6 баллов</p></article>`;
  }
  function renderQuiz() {
    const qs=variant().questions;
    app.innerHTML=`<div class="assessment-head"><div><p class="eyebrow">Тест-зачёт / работа студента</p><h1>Вариант ${state.variantId}</h1><div class="meta"><span class="pill strong">${escapeHtml(state.name)}</span><span class="pill">${escapeHtml(state.group)}</span><span class="pill" id="elapsed">${elapsedText()}</span></div></div><span class="pill">Рекомендуемое время — 90 минут</span></div>
    <div class="layout"><div>
      <div class="section-divider"><h2>Тестовые вопросы</h2><p class="subtle">Выберите один ответ в каждом задании. Каждый верный ответ — 1 балл.</p></div>
      ${qs.slice(0,24).map(questionHtml).join('')}
      <div class="section-divider"><h2>Развёрнутые ответы</h2><p class="subtle">Ответьте своими словами. Эти задания проверит преподаватель.</p></div>
      ${qs.slice(24).map(questionHtml).join('')}
      <div class="actions"><button class="btn btn-primary submit-button" id="submit-bottom">Отправить работу преподавателю</button><span class="subtle small" id="submit-status" role="status"></span></div>
    </div><aside class="panel aside"><h2>Ход работы</h2><div class="progress"><span id="progress-bar"></span></div><p class="count" id="progress-count"></p><div class="nav-grid" id="question-nav"></div><button class="btn btn-primary submit-button" id="submit-side">Отправить работу</button><p class="aside-note">После отправки ответы появятся в журнале преподавателя.</p></aside></div>`;
    app.addEventListener('change', quizChange);
    app.addEventListener('input', quizInput);
    document.getElementById('submit-bottom').addEventListener('click', submit);
    document.getElementById('submit-side').addEventListener('click', submit);
    updateProgress();
    clock = setInterval(()=>{const e=document.getElementById('elapsed');if(e)e.textContent=elapsedText();},30000);
  }
  function quizChange(event) {
    if(event.target.matches('input[type=radio][name^=q]')) {
      state.answers[Number(event.target.name.slice(1))]=event.target.value; save(); updateProgress();
    }
  }
  function quizInput(event) {
    if(event.target.matches('textarea[name^=q]')) {
      state.answers[Number(event.target.name.slice(1))]=event.target.value; save(); updateProgress();
    }
  }
  function updateProgress() {
    const count=answered();
    document.getElementById('progress-count').textContent=`Заполнено ${count} из 30 заданий`;
    document.getElementById('progress-bar').style.width=`${count/30*100}%`;
    document.getElementById('question-nav').innerHTML=variant().questions.map(q=>`<a href="#q${q.number}" class="${String(answer(q.number)).trim()?'done':''}" aria-label="Вопрос ${q.number}">${q.number}</a>`).join('');
  }
  async function submit() {
    const missing=variant().questions.slice(0,24).filter(q=>!String(answer(q.number)).trim()).length;
    const message=missing ? `Не отвечено на ${missing} тестовых вопросов. Они будут засчитаны как неверные. Отправить работу?` : 'Отправить работу преподавателю? После этого ответы нельзя изменить.';
    if(!confirm(message)) return;
    const buttons=[...document.querySelectorAll('.submit-button')];
    buttons.forEach(button=>button.disabled=true);
    const status=document.getElementById('submit-status');
    status.textContent='Отправляем работу…';
    try {
      const backend=await window.QUIZ_BACKEND_READY;
      if(!backend?.configured) throw new Error('Firebase не настроен. Сообщите преподавателю.');
      const answers=Object.fromEntries(variant().questions.map(q=>[String(q.number),String(answer(q.number)).slice(0,q.number<=24?1:5000)]));
      const id=await backend.submitAttempt({testId:'os',studentName:state.name,groupName:state.group,variantId:state.variantId,answers});
      state.submissionId=id;
      state.submittedAt=Date.now();
      save(); render(); window.scrollTo(0,0);
    } catch(error) {
      status.textContent=`Не удалось отправить: ${error.message || 'ошибка соединения'}. Проверьте интернет и повторите.`;
      status.classList.add('error-text');
      buttons.forEach(button=>button.disabled=false);
    }
  }
  function renderResults() {
    const qs=variant().questions;
    app.innerHTML=`<section class="result-head"><p class="eyebrow">Работа отправлена преподавателю</p><h1>Работа сдана</h1><p>${escapeHtml(state.name)} · ${escapeHtml(state.group)} · вариант ${state.variantId}</p><div class="score-row"><div class="score-box"><strong>24</strong><span>тестовых задания проверяются автоматически</span></div><div class="score-box"><strong>6</strong><span>развёрнутых ответов проверит преподаватель</span></div><div class="score-box"><strong>60</strong><span>максимум за работу</span></div></div></section>
      <div class="result-tools"><button class="btn btn-quiet" id="new-attempt">Начать новую работу</button></div>
      <p class="note">Работа сохранена в журнале преподавателя. Номер сдачи: <code>${escapeHtml(state.submissionId || '')}</code>.</p>
      <section class="result-section"><h2>Ваши тестовые ответы</h2>${qs.slice(0,24).map(q=>{const selected=answer(q.number);return `<article class="panel result-item"><h3>${q.number}. ${escapeHtml(q.text)}</h3><p>Ваш ответ: ${selected===''?'нет ответа':`${LETTERS[Number(selected)]}) ${escapeHtml(q.options[Number(selected)])}`}</p></article>`}).join('')}</section>
      <section class="result-section"><h2>Развёрнутые ответы</h2><div class="manual-grid">${qs.slice(24).map(q=>`<article class="panel result-item"><h3>${q.number}. ${escapeHtml(q.text)}</h3><div class="manual-answer">${escapeHtml(answer(q.number)||'Нет ответа')}</div><p class="small subtle">Проверит преподаватель</p></article>`).join('')}</div></section>`;
    document.getElementById('new-attempt').addEventListener('click',()=>{if(confirm('Начать новую работу? Текущие ответы исчезнут из этого браузера, но сданная работа останется у преподавателя.')){localStorage.removeItem(KEY);state=null;render();window.scrollTo(0,0);}});
  }
  function render() {
    clearInterval(clock);
    if(!state) renderStart(); else if(!state.submittedAt) renderQuiz(); else renderResults();
  }
  render();
})();
