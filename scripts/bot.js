/*
  VilaPlus Chatbot – versão avançada (pt-PT) • v3.0
  Autor: (coloca o teu nome/equipa)
  Licença: MIT (ajusta conforme necessário)

  Objetivo:
  - Chatbot completo, robusto e sem dependências externas, pronto a integrar em qualquer site.
  - Segurança reforçada (XSS-safe), acessibilidade (ARIA), i18n, anti-spam, persistência com versionamento
    e políticas de retenção, consentimento/GDPR, recolha de leads opcional com encriptação local.
  - Modular, extensível, com hooks/telemetria e configurações claras.

  Para usar:
  1) Garante que existem no HTML os elementos com IDs configurados em CONFIG.ui (ou ajusta-os aqui).
  2) Opcional: adiciona um botão com id="chatbot-mic" para microfone.
  3) Opcional: atualiza contactos reais, horários e URLs (mapa, políticas, etc.).
  4) Opcional: configura CSP no teu site para reforçar segurança (ver notas no final do ficheiro).

  NOTA IMPORTANTE SOBRE SEGURANÇA:
  - Nunca inserimos HTML vindo do utilizador (apenas texto).
  - Conteúdo gerado pelo bot usa templates controlados e/ou sanitização por textContent.
  - Todas as interações com localStorage são try/catch e com versionamento/migrações.
  - Inclui rate-limiting, flood-control e validações estritas de contactos.
  - Opcional: encriptação dos leads via Web Crypto (AES-GCM) com passphrase (não colocar em claro em produção!).
*/

(function () {
  'use strict';

  // ===================== CONFIG =====================
  const CONFIG = Object.freeze({
    version: '3.0.0',
    brand: {
      name: 'VilaPlus',
      phone: '+351 000 000 000', // TODO: atualiza para o número real
      email: 'geral@vilaplus.pt',
      emailInscricoes: 'inscricoes@vilaplus.pt',
      emailFisio: 'fisioterapia@vilaplus.pt',
      emailNutricao: 'nutricao@vilaplus.pt',
      address: 'Rua do Progresso, 123, 4560-123 Vila Caiz, Portugal',
      mapUrl: '#', // pode apontar para a secção do mapa na página
      privacyUrl: '#', // URL da Política de Privacidade (GDPR)
      termsUrl: '#', // Termos & Condições
    },
    hours: {
      // 0=Dom, 1=Seg, ... 6=Sáb
      1: ['06:30-23:00'],
      2: ['06:30-23:00'],
      3: ['06:30-23:00'],
      4: ['06:30-23:00'],
      5: ['06:30-23:00'],
      6: ['08:00-20:00'],
      0: ['09:00-13:00'],
      holidays: ['09:00-13:00'],
    },
    programs: {
      offSeason: {
        title: 'OFF SEASON',
        desc: 'Programa para atletas entre épocas com planeamento e acompanhamento integrados.',
      },
      plus55: {
        title: 'Programa 55+',
        desc: 'Iniciativa para a comunidade sénior: exercício adaptado, saúde e convívio.',
        free: true,
      },
    },
    pricing: {
      // Os valores são exemplos – atualiza para a realidade do ginásio
      mensal: 45,
      trimestral: 120, // 40/mês
      semestral: 210,  // 35/mês
      anual: 360,      // 30/mês
      pt: {
        // pacotes exemplo
        s1: { label: 'PT 1x/semana', price: 120 },
        s2: { label: 'PT 2x/semana', price: 220 },
        s3: { label: 'PT 3x/semana', price: 310 },
      }
    },
    ui: {
      storageKey: 'vilaplus_chat_v3',
      storageLeadsKey: 'vilaplus_leads_v3',
      storageMetaKey: 'vilaplus_meta_v3',
      containerId: 'chatbot-container',
      launcherId: 'chatbot-launcher',
      conversationId: 'chatbot-conversation',
      inputId: 'chatbot-input',
      sendId: 'chatbot-send',
      closeId: 'chatbot-close',
      minimizeId: 'chatbot-minimize',
      micId: 'chatbot-mic', // opcional
      quickOptionSelector: '.quick-option',
      a11yLiveRegionId: 'chatbot-live',
      focusTrap: true,
      theme: 'auto', // 'light' | 'dark' | 'auto'
    },
    i18n: {
      locale: 'pt-PT',
      strings: {
        welcome:
          'Olá! Sou o assistente virtual do VilaPlus 💪 Posso ajudar com horários, planos, aula experimental, Personal Training, fisioterapia, nutrição ou localização.',
        fallbackQuestion:
          'Podes dar-me mais detalhes? Posso ajudar com: horários, planos, aula experimental, personal trainer, fisioterapia, nutrição, localização.',
        thanks: 'De nada! Precisas de mais alguma coisa? 🙂',
        bye: 'Obrigado pela conversa! Bons treinos! 👋',
        error: 'Ups, tive uma dificuldade técnica. Tenta de novo mais tarde ou fala com a receção.',
        consent:
          'Para marcar aula/consulta preciso do teu nome e contacto. Concordas que usemos estes dados para te contactarmos sobre este pedido? Podes remover este consentimento a qualquer momento.',
        consentYes: 'Sim, concordo',
        consentNo: 'Não, cancelar',
        booked:
          'Perfeito! Já registei o teu pedido. A nossa equipa vai contactar-te para confirmar a disponibilidade. Queres mais alguma ajuda?',
        cancelled: 'Sem problema. Se mudares de ideias, diz “aula experimental”.',
        rateLimited: 'Estás a enviar mensagens muito rápido. Aguarda uns segundos e tenta novamente.',
        offline: 'Parece que estás offline. Algumas funcionalidades podem ficar limitadas.',
        privacyShort: 'Ao continuar, aceitas a nossa <a href="#POLICY#" target="_blank" rel="noopener noreferrer">Política de Privacidade</a>.',
        exportDone: 'Exportação concluída.',
        importDone: 'Importação concluída.',
        importInvalid: 'Ficheiro inválido.',
        cleared: 'Conversa limpa.',
      },
    },
    gdpr: {
      requireConsentForLeads: true,
      retentionDays: 90, // número de dias até purge automático dos leads
      encryptLeadsAtRest: false, // TRUE para ativar encriptação (necessita passphrase abaixo)
      encryption: {
        passphrase: '', // ⚠️ Em produção, NÃO hardcode. Pedir ao operador ou obter de um segredo.
        salt: 'vilaplus-static-salt', // pode ser alterado/emparelhado com passphrase
      },
    },
    limits: {
      maxHistoryItems: 500,
      maxMessageLength: 2000,
      sendRateWindowMs: 4000,
      sendMaxBurst: 3, // no máximo 3 mensagens por janela
    },
    hooks: {
      onLeadSaved: null,      // (lead) => {}
      onError: null,          // (error) => {}
      onEvent: null,          // (eventName, payload) => {}
    }
  });

  // ===================== STATE =====================
  let isOpen = false;
  let minimized = false;
  let history = [];
  let context = { flow: null, data: {}, waitingConsent: false };
  let rateBucket = [];
  let focusTrapCleanup = null;

  // ===================== DOM =====================
  const el = (id) => document.getElementById(id);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const launcher = el(CONFIG.ui.launcherId);
  const container = el(CONFIG.ui.containerId);
  const convo = el(CONFIG.ui.conversationId);
  const input = el(CONFIG.ui.inputId);
  const btnSend = el(CONFIG.ui.sendId);
  const btnClose = el(CONFIG.ui.closeId);
  const btnMin = el(CONFIG.ui.minimizeId);
  const btnMic = el(CONFIG.ui.micId);

  // Live region para leitores de ecrã
  let liveRegion = document.getElementById(CONFIG.ui.a11yLiveRegionId);
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.id = CONFIG.ui.a11yLiveRegionId;
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'false');
    liveRegion.className = 'sr-only';
    document.body.appendChild(liveRegion);
  }

  // ===================== UTIL =====================
  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

  const sanitizeText = (text) => {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.textContent;
  };

  const sanitizeHTML = (unsafe) => {
    // Para HTML controlado pelo bot, removemos event handlers e URLs javascript:
    const wrapper = document.createElement('div');
    wrapper.innerHTML = String(unsafe || '');
    wrapper.querySelectorAll('*').forEach((node) => {
      // remove atributos on*
      [...node.attributes].forEach((attr) => {
        if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
        if (attr.name === 'href' || attr.name === 'src') {
          const v = (attr.value || '').trim();
          if (/^javascript:/i.test(v)) node.removeAttribute(attr.name);
        }
      });
    });
    return wrapper.innerHTML;
  };

  const nowLisbon = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }));

  function isOpenNow(cfgHours) {
    const tzDate = nowLisbon();
    const wd = tzDate.getDay();
    const ranges = cfgHours[wd] || [];
    const curMins = tzDate.getHours() * 60 + tzDate.getMinutes();
    return ranges.some((r) => {
      const [a, b] = r.split('-');
      const [ah, am] = a.split(':').map(Number);
      const [bh, bm] = b.split(':').map(Number);
      const start = ah * 60 + am;
      const end = bh * 60 + bm;
      return curMins >= start && curMins <= end;
    });
  }

  function prettyHours(cfgHours) {
    const days = [
      ['Dom', 0],
      ['Seg', 1],
      ['Ter', 2],
      ['Qua', 3],
      ['Qui', 4],
      ['Sex', 5],
      ['Sáb', 6],
    ];
    return days
      .map(([label, idx]) => `${label}: ${(cfgHours[idx] || []).join(' / ') || 'Fechado'}`)
      .join('\n');
  }

  const emailRegex = /^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
  const phoneRegex = /^(?:\+351\s?)?(?:9\d{2}|2\d{2})[\s-]?\d{3}[\s-]?\d{3}$/; // PT móvel/fixo simples

  const entities = {
    email: emailRegex,
    phone: phoneRegex,
    day: /(domingo|segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|dom|seg|ter|qua|qui|sex|sáb|sab)/i,
    modality:
      /(hiit|yoga|pilates|spinning|zumba|kickboxing|musculação|musculacao|personal|fisioterapia|nutrição|nutricao)/i,
  };

  // Rate limiting por janela
  function checkRateLimit() {
    const now = Date.now();
    const windowStart = now - CONFIG.limits.sendRateWindowMs;
    rateBucket = rateBucket.filter((t) => t > windowStart);
    if (rateBucket.length >= CONFIG.limits.sendMaxBurst) return false;
    rateBucket.push(now);
    return true;
  }

  // Persistência segura com versão
  const Storage = (() => {
    function get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
      } catch (e) { return fallback; }
    }
    function set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        // fallback soft: tentar sessionStorage
        try {
          sessionStorage.setItem(key, JSON.stringify(value));
          return true;
        } catch (_) { return false; }
      }
    }
    function remove(key) {
      try { localStorage.removeItem(key); } catch (e) {}
      try { sessionStorage.removeItem(key); } catch (e) {}
    }
    return { get, set, remove };
  })();

  // Migrações / meta
  function loadMeta() {
    const meta = Storage.get(CONFIG.ui.storageMetaKey, { version: CONFIG.version, createdAt: Date.now() });
    if (meta.version !== CONFIG.version) {
      // coloca aqui migrações entre versões, se necessário
      meta.version = CONFIG.version;
      Storage.set(CONFIG.ui.storageMetaKey, meta);
    }
    return meta;
  }

  function saveState() {
    const state = { history, context, minimized, isOpen };
    Storage.set(CONFIG.ui.storageKey, state);
  }

  function loadState() {
    const state = Storage.get(CONFIG.ui.storageKey, null);
    if (state) {
      history = Array.isArray(state.history) ? state.history.slice(-CONFIG.limits.maxHistoryItems) : [];
      context = state.context || { flow: null, data: {}, waitingConsent: false };
      minimized = !!state.minimized;
      isOpen = !!state.isOpen;
    }
  }

  // Leads (com retenção e encriptação opcional)
  async function getLeads() {
    const raw = Storage.get(CONFIG.ui.storageLeadsKey, []);
    if (!CONFIG.gdpr.encryptLeadsAtRest) return raw;
    try {
      const decrypted = await cryptoDecrypt(raw);
      return Array.isArray(decrypted) ? decrypted : [];
    } catch { return []; }
  }

  async function saveLead(lead) {
    try {
      const all = await getLeads();
      all.push(lead);
      const pruned = purgeByRetention(all, CONFIG.gdpr.retentionDays);
      if (CONFIG.gdpr.encryptLeadsAtRest) {
        const cipher = await cryptoEncrypt(pruned);
        Storage.set(CONFIG.ui.storageLeadsKey, cipher);
      } else {
        Storage.set(CONFIG.ui.storageLeadsKey, pruned);
      }
      if (typeof CONFIG.hooks.onLeadSaved === 'function') CONFIG.hooks.onLeadSaved(lead);
    } catch (e) { handleError(e); }
  }

  function purgeByRetention(arr, days) {
    const ms = days * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - ms;
    return arr.filter((x) => new Date(x.createdAt).getTime() >= cutoff);
  }

  // Web Crypto (opcional)
  async function getKey() {
    const { passphrase, salt } = CONFIG.gdpr.encryption;
    if (!passphrase) throw new Error('Passphrase não definida para encriptação.');
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      'raw', enc.encode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
      baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  }

  async function cryptoEncrypt(data) {
    const key = await getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const plaintext = enc.encode(JSON.stringify(data));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    return { iv: Array.from(iv), data: Array.from(new Uint8Array(cipher)) };
  }

  async function cryptoDecrypt(cipherObj) {
    const key = await getKey();
    const iv = new Uint8Array(cipherObj.iv || []);
    const data = new Uint8Array(cipherObj.data || []);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    const dec = new TextDecoder();
    return JSON.parse(dec.decode(plain));
  }

  // ===================== RENDER =====================
  function renderMessage({ type, html, time }) {
    if (!convo) return;
    const t = time ? new Date(time) : nowLisbon();
    const timeString = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const div = document.createElement('div');
    div.className = `chat-message ${type === 'user' ? 'user-message' : 'bot-message'}`;
    div.setAttribute('role', 'group');

    // Segurança: apenas HTML controlado pelo bot passa pelo sanitizeHTML; mensagens de utilizador são text-only
    if (type === 'user') {
      const p = document.createElement('p');
      p.textContent = html; // já veio limpo do userMessage
      div.appendChild(p);
    } else {
      const safe = sanitizeHTML(typeof html === 'string' ? html : html.outerHTML);
      div.innerHTML = safe;
    }

    const ts = document.createElement('span');
    ts.className = 'message-time';
    ts.textContent = timeString;
    div.appendChild(ts);

    convo.appendChild(div);
    convo.scrollTop = convo.scrollHeight;

    // A11y live region
    liveRegion.textContent = type === 'user' ? `Tu: ${html}` : `Bot: ${div.textContent}`;
  }

  function botMessage(html) {
    const content = typeof html === 'string' ? html : html.outerHTML;
    const msg = { type: 'bot', html: content, time: new Date().toISOString() };
    history.push(msg);
    history = history.slice(-CONFIG.limits.maxHistoryItems);
    renderMessage(msg);
    saveState();
  }

  function userMessage(text) {
    const clipped = sanitizeText(String(text).slice(0, CONFIG.limits.maxMessageLength));
    const msg = { type: 'user', html: clipped, time: new Date().toISOString() };
    history.push(msg);
    history = history.slice(-CONFIG.limits.maxHistoryItems);
    renderMessage(msg);
    saveState();
  }

  function typing(on = true) {
    const id = 'typing-indicator';
    if (!convo) return;
    if (on) {
      const t = document.createElement('div');
      t.className = 'chat-message bot-message typing-indicator';
      t.id = id;
      t.setAttribute('aria-hidden', 'true');
      t.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
      convo.appendChild(t);
      convo.scrollTop = convo.scrollHeight;
    } else {
      const e = document.getElementById(id);
      e && e.remove();
    }
  }

  function quickChips(chips) {
    const wrap = document.createElement('div');
    wrap.className = 'quick-chips';
    chips.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.type = 'button';
      b.textContent = c.text;
      b.addEventListener('click', () => {
        if (input) {
          input.value = c.payload || c.text;
          sendUser();
        }
      });
      wrap.appendChild(b);
    });
    botMessage(wrap);
  }

  // ===================== CARDS =====================
  function card(title, bodyHTML) {
    const card = document.createElement('div');
    card.className = 'bot-card';
    card.innerHTML = `
      <div class="bot-card-title">${sanitizeHTML(title)}</div>
      <div class="bot-card-body">${sanitizeHTML(bodyHTML)}</div>
    `;
    return card;
  }

  function cardWelcome() {
    return card(
      `Bem-vindo ao ${sanitizeText(CONFIG.brand.name)} 👋`,
      `<p>${sanitizeHTML(CONFIG.i18n.strings.welcome)}</p>
       <p class="privacy-hint">${CONFIG.i18n.strings.privacyShort.replace('#POLICY#', CONFIG.brand.privacyUrl)}</p>`
    );
  }

  function cardPlans() {
    const p = CONFIG.pricing;
    const list = `
      <ul>
        <li><strong>Mensal</strong>: €${sanitizeText(p.mensal)}</li>
        <li><strong>Trimestral</strong>: €${sanitizeText(p.trimestral)} (€${sanitizeText(p.trimestral/3)}/mês)</li>
        <li><strong>Semestral</strong>: €${sanitizeText(p.semestral)} (€${sanitizeText(p.semestral/6)}/mês)</li>
        <li><strong>Anual</strong>: €${sanitizeText(p.anual)} (€${sanitizeText(p.anual/12)}/mês)</li>
      </ul>
      <p>Pacotes de <em>Personal Training</em>:</p>
      <ul>
        <li>${sanitizeText(p.pt.s1.label)} — €${sanitizeText(p.pt.s1.price)}</li>
        <li>${sanitizeText(p.pt.s2.label)} — €${sanitizeText(p.pt.s2.price)}</li>
        <li>${sanitizeText(p.pt.s3.label)} — €${sanitizeText(p.pt.s3.price)}</li>
      </ul>`;
    return card('Planos e Mensalidades', list);
  }

  function cardHours() {
    const open = isOpenNow(CONFIG.hours);
    const status = open ? '🟢 Aberto agora' : '🔴 Fechado no momento';
    return card('Horários', `
      <p><strong>${status}</strong></p>
      <pre style="white-space:pre-wrap">${sanitizeHTML(prettyHours(CONFIG.hours))}</pre>
    `);
  }

  function cardContacts() {
    const c = CONFIG.brand;
    const phoneHref = c.phone.replace(/\s/g, '');
    const html = `
      <p>
        📞 <a href="tel:${sanitizeText(phoneHref)}">${sanitizeHTML(c.phone)}</a><br>
        ✉️ <a href="mailto:${sanitizeText(c.email)}">${sanitizeHTML(c.email)}</a><br>
        📍 <a href="${sanitizeText(c.mapUrl)}" target="_blank" rel="noopener noreferrer">${sanitizeHTML(c.address)}</a>
      </p>`;
    return card('Contactos', html);
  }

  function cardPrograms() {
    const { offSeason, plus55 } = CONFIG.programs;
    const html = `
      <ul>
        <li><strong>${sanitizeHTML(offSeason.title)}</strong>: ${sanitizeHTML(offSeason.desc)}</li>
        <li><strong>${sanitizeHTML(plus55.title)}</strong>: ${sanitizeHTML(plus55.desc)}${plus55.free ? ' (gratuito)' : ''}</li>
      </ul>`;
    return card('Programas VilaPlus', html);
  }

  function cardConsent() {
    const html = `
      <p>${sanitizeHTML(CONFIG.i18n.strings.consent)}</p>
      <div class="quick-chips">
        <button type="button" class="chip" data-consent="yes">${sanitizeHTML(CONFIG.i18n.strings.consentYes)}</button>
        <button type="button" class="chip" data-consent="no">${sanitizeHTML(CONFIG.i18n.strings.consentNo)}</button>
      </div>`;
    const c = card('Consentimento', html);
    // wire buttons depois de injetado
    setTimeout(() => {
      qsa('[data-consent]').forEach((b) => {
        b.addEventListener('click', () => handleConsent(b.getAttribute('data-consent')));
      });
    }, 0);
    return c;
  }

  // ===================== INTENTS =====================
  const INTENTS = [
    { key: 'greeting', pattern: /(\b(olá|ola|oi|bom dia|boa tarde|boa noite)\b)/i, handler: onGreet },
    { key: 'thanks', pattern: /(\b(obrigado|obrigada|valeu|agradeço)\b)/i, handler: () => botMessage(CONFIG.i18n.strings.thanks) },
    { key: 'bye', pattern: /(\b(adeus|tchau|até logo|encerrar)\b)/i, handler: () => botMessage(CONFIG.i18n.strings.bye) },
    { key: 'hours', pattern: /(hor(a|á)rio|horarios|funcionamento|aberto|fechado|hora)/i, handler: () => botMessage(cardHours()) },
    { key: 'plans', pattern: /(pre(ç|c)o|precos|mensalidade|planos|valores)/i, handler: onPlans },
    { key: 'trial', pattern: /(aula experimental|aula gr(a|á)tis|aula gratuita|experi(ê|e)ncia)/i, handler: onTrial },
    { key: 'personal', pattern: /(personal trainer|personal|treinador)/i, handler: onPersonal },
    { key: 'musculacao', pattern: /(muscula(ç|c)ão|academia|pesos)/i, handler: () => botMessage('A nossa área de musculação está disponível todo o horário. Oferecemos orientação inicial gratuita para novos membros. Queres saber horários ou planos?') },
    { key: 'group', pattern: /(aulas grupo|aulas coletivas|modalidades|hor(a|á)rio aulas|grade)/i, handler: onGroupClasses },
    { key: 'fisio', pattern: /(fisioterapia|recupera(ç|c)ão|les(ã|a)o)/i, handler: onFisio },
    { key: 'nutri', pattern: /(nutri(ç|c)ão|dieta|alimenta(ç|c)ão)/i, handler: onNutri },
    { key: 'location', pattern: /(localiza(ç|c)ão|endere(ç|c)o|onde fica|mapa|morada)/i, handler: () => botMessage(cardContacts()) },
    { key: 'parking', pattern: /(estacionamento|parqueamento|vagas|parque)/i, handler: () => botMessage('Temos estacionamento privativo com ~30 vagas (ordem de chegada) e bicicletário coberto. Há também estacionamento público próximo.') },
    { key: 'programs', pattern: /(programa 55\+|55\+|off season|offseason|programas)/i, handler: () => botMessage(cardPrograms()) },
    { key: 'help', pattern: /^\/(ajuda|help)$/i, handler: onHelp },
    { key: 'clear', pattern: /^\/(limpar|clear)$/i, handler: onClear },
    { key: 'export', pattern: /^\/(exportar|export)$/i, handler: onExport },
    { key: 'import', pattern: /^\/(importar|import)$/i, handler: onImport },
    { key: 'theme', pattern: /^\/(tema|theme)\s+(auto|light|dark)$/i, handler: onTheme },
  ];

  // ===================== FLOWS =====================
  function process(text) {
    if (context.flow) {
      handleFlow(text);
      typing(false);
      return;
    }
    const intent = INTENTS.find((i) => i.pattern.test(text));
    if (intent) {
      Promise.resolve(intent.handler(text)).finally(() => typing(false));
      return;
    }
    botMessage(CONFIG.i18n.strings.fallbackQuestion);
    quickChips([
      { text: 'Horários', payload: 'horários' },
      { text: 'Planos', payload: 'preços' },
      { text: 'Aula experimental', payload: 'aula experimental' },
      { text: 'Contactos', payload: 'contactos' },
    ]);
    typing(false);
  }

  function handleFlow(t) {
    const text = t.trim();
    switch (context.flow) {
      case 'trial': return flowTrial(text);
      case 'pt': return flowPT(text);
      case 'fisio': return flowFisio(text);
      case 'nutri': return flowNutri(text);
      default:
        context.flow = null;
        context.data = {};
        botMessage(CONFIG.i18n.strings.error);
    }
  }

  function onGreet() {
    botMessage('Olá! 👋 Pronto para treinar? Posso falar-te dos nossos horários, planos e marcar uma aula experimental gratuita.');
    quickChips([
      { text: 'Ver horários', payload: 'horários' },
      { text: 'Ver planos', payload: 'preços' },
      { text: 'Agendar aula', payload: 'aula experimental' },
    ]);
  }

  function onPlans() {
    botMessage(cardPlans());
    botMessage('Se o teu objetivo é perder peso e melhorar cardio, recomenda-se <strong>Trimestral</strong> ou <strong>Semestral</strong> + aulas de grupo (HIIT/Spinning). Para compromisso total, <strong>Anual</strong> oferece melhor valor. Queres ajuda a escolher?');
    quickChips([
      { text: 'Quero PT', payload: 'personal trainer' },
      { text: 'Quero aulas', payload: 'aulas grupo' },
      { text: 'Marcar aula grátis', payload: 'aula experimental' },
    ]);
  }

  function onTrial() {
    context.flow = 'trial';
    context.data = {};
    botMessage('Top! Vamos marcar a tua <strong>aula experimental gratuita</strong>. Qual a <strong>modalidade</strong> pretendida? (ex.: Yoga, HIIT, Pilates, Spinning, Zumba, Kickboxing)');
  }

  function onPersonal() {
    context.flow = 'pt';
    context.data = {};
    botMessage('Ótima escolha! Para o <strong>Personal Training</strong>, diz-me o teu <strong>objetivo principal</strong> (ex.: emagrecer, ganhar massa, performance, reabilitação).');
  }

  function onGroupClasses() {
    botMessage('Temos mais de 30 modalidades: HIIT, Yoga, Pilates, Spinning, Zumba, Kickboxing e mais. Queres ver <strong>horários</strong> ou <strong>marcar aula experimental</strong>?');
    quickChips([
      { text: 'Ver horários', payload: 'horário aulas' },
      { text: 'Marcar aula', payload: 'aula experimental' },
    ]);
  }

  function onFisio() {
    context.flow = 'fisio';
    context.data = {};
    botMessage('Vamos ajudar-te com <strong>fisioterapia</strong>. Descreve brevemente a tua <strong>queixa/lesão</strong> (ex.: lombalgia, entorse, pós-cirúrgico).');
  }

  function onNutri() {
    context.flow = 'nutri';
    context.data = {};
    botMessage('Perfeito! Para <strong>nutrição</strong>, tens algum objetivo específico? (ex.: perda de peso, ganho de massa, performance, saúde geral)');
  }

  function onHelp() {
    botMessage('Comandos: <code>/limpar</code> apaga conversa, <code>/exportar</code> descarrega JSON, <code>/importar</code> importa JSON, <code>/tema [auto|light|dark]</code> muda o tema, <code>/ajuda</code> mostra esta ajuda.');
  }

  function onClear() {
    history = [];
    context = { flow: null, data: {}, waitingConsent: false };
    saveState();
    if (convo) convo.innerHTML = '';
    botMessage(cardWelcome());
    botMessage(CONFIG.i18n.strings.cleared);
  }

  function onExport() {
    const blob = new Blob([JSON.stringify({ history, context }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vilaplus_chat_export.json';
    a.click();
    URL.revokeObjectURL(url);
    botMessage(CONFIG.i18n.strings.exportDone);
  }

  function onImport() {
    const inputFile = document.createElement('input');
    inputFile.type = 'file';
    inputFile.accept = 'application/json';
    inputFile.addEventListener('change', () => {
      const file = inputFile.files && inputFile.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result || '{}'));
          if (!data || !Array.isArray(data.history)) throw new Error('invalid');
          history = data.history.slice(-CONFIG.limits.maxHistoryItems);
          context = data.context || { flow: null, data: {}, waitingConsent: false };
          saveState();
          if (convo) {
            convo.innerHTML = '';
            history.forEach((msg) => renderMessage(msg));
          }
          botMessage(CONFIG.i18n.strings.importDone);
        } catch (e) { botMessage(CONFIG.i18n.strings.importInvalid); }
      };
      reader.readAsText(file);
    });
    inputFile.click();
  }

  function onTheme(_, m) {
    const match = /\/(tema|theme)\s+(auto|light|dark)/i.exec(m);
    if (!match) return;
    const choice = match[2].toLowerCase();
    setTheme(choice);
    botMessage(`Tema definido para <strong>${sanitizeHTML(choice)}</strong>.`);
  }

  function setTheme(mode) {
    const root = document.documentElement;
    root.dataset.chatTheme = mode;
    if (mode === 'auto') root.removeAttribute('data-chat-theme');
    try {
      const meta = loadMeta();
      meta.theme = mode;
      Storage.set(CONFIG.ui.storageMetaKey, meta);
    } catch {}
  }

  // ------------- Consentimento -------------
  function askConsent() {
    context.waitingConsent = true;
    botMessage(cardConsent());
  }

  function handleConsent(val) {
    if (!context.waitingConsent) return false;
    const yes = typeof val === 'string' ? /^(sim|yes|concordo|ok|aceito)$/i.test(val) : false;
    const no = typeof val === 'string' ? /^(não|nao|recuso|cancelar|no)$/i.test(val) : false;
    if (yes) {
      context.waitingConsent = false;
      confirmBooking();
      return true;
    }
    if (no) {
      context.waitingConsent = false;
      context.flow = null;
      context.data = {};
      botMessage(CONFIG.i18n.strings.cancelled);
      return true;
    }
    return false;
  }

  // ------------- Flows: Aula Experimental -------------
  function flowTrial(t) {
    if (handleConsent(t)) return;
    if (!context.data.name) {
      if (/^[a-zÀ-ÿ'`\-\s]{2,}$/i.test(t)) {
        context.data.name = t.trim();
        botMessage('Qual a <strong>modalidade</strong> pretendida? (ex.: Yoga, HIIT, Pilates, Spinning, Zumba, Kickboxing)');
      } else {
        botMessage('Antes de avançarmos, como te chamas?');
      }
      return;
    }
    if (!context.data.modality) {
      const m = t.match(entities.modality);
      if (m) {
        context.data.modality = m[0];
        botMessage('Qual o <strong>dia</strong> preferido? (ex.: terça, quinta, sábado)');
      } else {
        botMessage('Diz-me a modalidade (ex.: Yoga, HIIT, Pilates, Spinning, Zumba, Kickboxing).');
      }
      return;
    }
    if (!context.data.day) {
      const d = t.match(entities.day);
      if (d) {
        context.data.day = d[0].toLowerCase();
        botMessage('Perfeito. Deixa um <strong>email</strong> ou <strong>telefone</strong> para confirmarmos.');
      } else {
        botMessage('Que dia te dá mais jeito? (segunda a domingo)');
      }
      return;
    }
    if (!context.data.contact) {
      const em = emailRegex.test(t) ? t.match(emailRegex)[0] : null;
      const ph = phoneRegex.test(t) ? t.match(phoneRegex)[0] : null;
      if (em || ph) {
        context.data.contact = em ? em : ph;
        if (CONFIG.gdpr.requireConsentForLeads) askConsent(); else confirmBooking();
      } else {
        botMessage('Partilha um email (ex.: nome@dominio.pt) ou telefone (+351 ...).');
      }
      return;
    }
    if (CONFIG.gdpr.requireConsentForLeads) askConsent(); else confirmBooking();
  }

  // ------------- Flows: Personal Training -------------
  function flowPT(t) {
    if (handleConsent(t)) return;
    if (!context.data.name) {
      if (/^[a-zÀ-ÿ'`\-\s]{2,}$/i.test(t)) {
        context.data.name = t.trim();
        botMessage('Qual é o teu <strong>objetivo principal</strong>? (ex.: emagrecer, ganhar massa, performance, reabilitação)');
      } else {
        botMessage('Antes de avançarmos, como te chamas?');
      }
      return;
    }
    if (!context.data.goal) {
      context.data.goal = sanitizeText(t);
      botMessage('Quantas <strong>sessões/semana</strong> tens em mente? (ex.: 1, 2, 3)');
      return;
    }
    if (!context.data.freq) {
      const n = (t.match(/\d+/) || [])[0];
      if (n) {
        context.data.freq = clamp(Number(n), 1, 7);
        botMessage('Partilha um <strong>email</strong> ou <strong>telefone</strong> para contacto.');
      } else {
        botMessage('Diz-me 1, 2 ou 3 sessões/semana.');
      }
      return;
    }
    if (!context.data.contact) {
      const em = emailRegex.test(t) ? t.match(emailRegex)[0] : null;
      const ph = phoneRegex.test(t) ? t.match(phoneRegex)[0] : null;
      if (em || ph) {
        context.data.contact = em ? em : ph;
        if (CONFIG.gdpr.requireConsentForLeads) askConsent(); else confirmBooking();
      } else {
        botMessage('Email ou telefone, por favor.');
      }
      return;
    }
    if (CONFIG.gdpr.requireConsentForLeads) askConsent(); else confirmBooking();
  }

  // ------------- Flows: Fisioterapia -------------
  function flowFisio(t) {
    if (handleConsent(t)) return;
    if (!context.data.name) {
      if (/^[a-zÀ-ÿ'`\-\s]{2,}$/i.test(t)) {
        context.data.name = t.trim();
        botMessage('Descreve brevemente a tua <strong>queixa/lesão</strong> (ex.: lombalgia, entorse, pós-cirúrgico).');
      } else {
        botMessage('Antes de avançarmos, como te chamas?');
      }
      return;
    }
    if (!context.data.issue) {
      context.data.issue = sanitizeText(t);
      botMessage('Preferes <strong>manhã</strong> ou <strong>tarde</strong>?');
      return;
    }
    if (!context.data.slot) {
      if (/(manh(ã|a))/i.test(t) || /tarde/i.test(t)) {
        context.data.slot = /manh/i.test(t) ? 'manhã' : 'tarde';
        botMessage('Partilha um <strong>email</strong> ou <strong>telefone</strong>.');
      } else {
        botMessage('Responde com “manhã” ou “tarde”, por favor.');
      }
      return;
    }
    if (!context.data.contact) {
      const em = emailRegex.test(t) ? t.match(emailRegex)[0] : null;
      const ph = phoneRegex.test(t) ? t.match(phoneRegex)[0] : null;
      if (em || ph) {
        context.data.contact = em ? em : ph;
        if (CONFIG.gdpr.requireConsentForLeads) askConsent(); else confirmBooking();
      } else {
        botMessage('Email ou telefone, por favor.');
      }
      return;
    }
    if (CONFIG.gdpr.requireConsentForLeads) askConsent(); else confirmBooking();
  }

  // ------------- Flows: Nutrição -------------
  function flowNutri(t) {
    if (handleConsent(t)) return;
    if (!context.data.name) {
      if (/^[a-zÀ-ÿ'`\-\s]{2,}$/i.test(t)) {
        context.data.name = t.trim();
        botMessage('Tens algum objetivo específico? (ex.: perda de peso, ganho de massa, performance, saúde geral)');
      } else {
        botMessage('Antes de avançarmos, como te chamas?');
      }
      return;
    }
    if (!context.data.goal) {
      context.data.goal = sanitizeText(t);
      botMessage('Preferes consulta <strong>presencial</strong> ou <strong>online</strong>?');
      return;
    }
    if (!context.data.mode) {
      if (/(presencial|online)/i.test(t)) {
        context.data.mode = /online/i.test(t) ? 'online' : 'presencial';
        botMessage('Partilha um <strong>email</strong> ou <strong>telefone</strong>.');
      } else {
        botMessage('Escreve “presencial” ou “online”, por favor.');
      }
      return;
    }
    if (!context.data.contact) {
      const em = emailRegex.test(t) ? t.match(emailRegex)[0] : null;
      const ph = phoneRegex.test(t) ? t.match(phoneRegex)[0] : null;
      if (em || ph) {
        context.data.contact = em ? em : ph;
        if (CONFIG.gdpr.requireConsentForLeads) askConsent(); else confirmBooking();
      } else {
        botMessage('Email ou telefone, por favor.');
      }
      return;
    }
    if (CONFIG.gdpr.requireConsentForLeads) askConsent(); else confirmBooking();
  }

  // ------------- Confirmação e Mailto -------------
  function confirmBooking() {
    const c = CONFIG.brand;
    const payload = {
      type: context.flow,
      name: context.data.name || '',
      when: context.data.day || '',
      modality: context.data.modality || '',
      goal: context.data.goal || '',
      freq: context.data.freq || '',
      slot: context.data.slot || '',
      mode: context.data.mode || '',
      contact: context.data.contact || '',
      createdAt: new Date().toISOString(),
    };

    saveLead(payload);

    botMessage(CONFIG.i18n.strings.booked);

    let subject = 'Pedido VilaPlus';
    let body = '';
    switch (context.flow) {
      case 'trial':
        subject = 'Pedido Aula Experimental';
        body = `Nome: ${payload.name}\nModalidade: ${payload.modality}\nDia preferido: ${payload.when}\nContacto: ${payload.contact}`;
        break;
      case 'pt':
        subject = 'Pedido Personal Training';
        body = `Nome: ${payload.name}\nObjetivo: ${payload.goal}\nSessões/semana: ${payload.freq}\nContacto: ${payload.contact}`;
        break;
      case 'fisio':
        subject = 'Pedido Fisioterapia';
        body = `Nome: ${payload.name}\nQueixa/lesão: ${payload.issue || ''}\nPreferência: ${payload.slot}\nContacto: ${payload.contact}`;
        break;
      case 'nutri':
        subject = 'Pedido Nutrição';
        body = `Nome: ${payload.name}\nObjetivo: ${payload.goal}\nModo: ${payload.mode}\nContacto: ${payload.contact}`;
        break;
    }

    const mailTarget =
      context.flow === 'trial' ? c.emailInscricoes
      : context.flow === 'fisio' ? c.emailFisio
      : context.flow === 'nutri' ? c.emailNutricao
      : c.email;

    const mailto = `mailto:${encodeURIComponent(mailTarget)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    botMessage(`Queres acelerar? <a href="${mailto}">Envia este email automático</a> ✉️`);

    // reset flow
    context.flow = null;
    context.data = {};
    context.waitingConsent = false;
    saveState();
  }

  // ===================== INTERAÇÃO =====================
  function sendUser() {
    if (!input) return;
    const message = input.value.trim();
    if (!message) return;

    if (!checkRateLimit()) {
      botMessage(CONFIG.i18n.strings.rateLimited);
      return;
    }

    userMessage(message);
    input.value = '';
    typing(true);
    setTimeout(() => process(message), 250);
  }

  function toggle() {
    if (isOpen) {
      if (minimized) expand();
      else minimize();
    } else open();
  }

  function open() {
    if (!container) return;
    container.classList.add('visible');
    isOpen = true;
    minimized = false;
    input && input.focus();
    if (CONFIG.ui.focusTrap) focusTrapCleanup = trapFocus(container);
    saveState();
  }

  function close() {
    if (!container) return;
    container.classList.remove('visible');
    isOpen = false;
    saveState();
    if (focusTrapCleanup) focusTrapCleanup();
  }

  function minimize() {
    if (!container) return;
    container.classList.add('minimized');
    minimized = true;
    saveState();
  }

  function expand() {
    if (!container) return;
    container.classList.remove('minimized');
    minimized = false;
    input && input.focus();
    saveState();
  }

  // ===================== A11y: Focus Trap =====================
  function trapFocus(root) {
    const focusable = () => qsa([
      'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ].join(','), root);
    const first = () => focusable()[0];
    const last = () => {
      const f = focusable();
      return f[f.length - 1];
    };
    function onKey(e) {
      if (e.key !== 'Tab') return;
      const f = focusable();
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) {
        last().focus(); e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        first().focus(); e.preventDefault();
      }
    }
    root.addEventListener('keydown', onKey);
    return () => root.removeEventListener('keydown', onKey);
  }

  // ===================== MIC (opcional) =====================
  function setupMic() {
    if (!btnMic) return;
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) { btnMic.style.display = 'none'; return; }
    const rec = new SpeechRec();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = CONFIG.i18n.locale || 'pt-PT';
    btnMic.addEventListener('click', () => {
      if (btnMic.classList.contains('recording')) {
        rec.stop();
        btnMic.classList.remove('recording');
      } else {
        try { rec.start(); btnMic.classList.add('recording'); } catch (e) {}
      }
    });
    rec.onresult = (ev) => {
      const t = ev.results[0][0].transcript;
      if (input) input.value = t;
      btnMic.classList.remove('recording');
      sendUser();
    };
    rec.onerror = () => btnMic.classList.remove('recording');
  }

  // ===================== INIT =====================
  function init() {
    try { loadMeta(); } catch {}
    loadState();

    // tema guardado
    try {
      const meta = loadMeta();
      if (meta.theme) setTheme(meta.theme);
    } catch {}

    if (!history.length) {
      botMessage(cardWelcome());
      quickChips([
        { text: 'Horários', payload: 'horários' },
        { text: 'Planos', payload: 'preços' },
        { text: 'Aula experimental', payload: 'aula experimental' },
        { text: 'Localização', payload: 'onde fica' },
      ]);
    } else {
      // rehidratar
      history.forEach((msg) => renderMessage(msg));
      if (minimized) container && container.classList.add('minimized');
      if (isOpen) container && container.classList.add('visible');
    }

    // Eventos UI
    if (launcher) launcher.addEventListener('click', toggle);
    if (btnClose) btnClose.addEventListener('click', close);
    if (btnMin) btnMin.addEventListener('click', minimize);
    if (btnSend) btnSend.addEventListener('click', sendUser);
    if (input) input.addEventListener('keypress', (e) => e.key === 'Enter' && sendUser());

    // Quick options existentes no HTML
    qsa(CONFIG.ui.quickOptionSelector).forEach((op) => {
      op.addEventListener('click', function () {
        if (!input) return;
        input.value = this.getAttribute('data-msg') || this.textContent;
        sendUser();
      });
    });

    setupMic();

    // Offline/online
    window.addEventListener('offline', () => botMessage(CONFIG.i18n.strings.offline));

    // Pequenas proteções extra
    document.addEventListener('paste', (e) => {
      const t = (e.clipboardData || window.clipboardData).getData('text');
      if (t && t.length > CONFIG.limits.maxMessageLength) e.preventDefault();
    });
  }

  function handleError(e) {
    console.error('[VilaPlus Chatbot] Erro:', e);
    if (typeof CONFIG.hooks.onError === 'function') CONFIG.hooks.onError(e);
  }

  // ===================== BOOT =====================
  document.addEventListener('DOMContentLoaded', () => {
    try { init(); } catch (e) { handleError(e); botMessage(CONFIG.i18n.strings.error); }
  });

  // ===================== NOTAS DE INTEGRAÇÃO =====================
  // CSS mínimo recomendado (exemplo – adapta ao teu design):
  // .sr-only { position:absolute; left:-10000px; width:1px; height:1px; overflow:hidden; }
  // .chat-message { position:relative; padding:10px 12px; margin:8px; border-radius:12px; max-width:85%; }
  // .user-message { background:#e8f0fe; align-self:flex-end; }
  // .bot-message { background:#f5f5f5; align-self:flex-start; }
  // .message-time { font-size:12px; opacity:0.6; margin-left:8px; }
  // .bot-card { border-radius:16px; padding:12px; background:#fff; box-shadow:0 2px 8px rgba(0,0,0,.06); }
  // .bot-card-title { font-weight:700; margin-bottom:6px; }
  // .quick-chips { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
  // .chip { border:1px solid #ddd; border-radius:999px; padding:6px 10px; background:#fff; cursor:pointer; }
  // [data-chat-theme="dark"] .bot-message { background:#1f2937; color:#f9fafb; }
  // [data-chat-theme="dark"] .user-message { background:#374151; color:#f9fafb; }

  // CSP sugerido (no <meta http-equiv="Content-Security-Policy"> ou cabeçalho HTTP):
  // default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self';

})();
