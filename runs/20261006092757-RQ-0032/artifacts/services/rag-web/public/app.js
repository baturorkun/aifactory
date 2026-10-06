const sourceList = document.querySelector('#source-list');
const selectAllButton = document.querySelector('#select-all');
const healthDot = document.querySelector('#health-dot');
const healthLabel = document.querySelector('#health-label');
const messages = document.querySelector('#messages');
const form = document.querySelector('#chat-form');
const question = document.querySelector('#question');
const sendButton = document.querySelector('#send-button');
const clearButton = document.querySelector('#clear-chat');
const newChatButton = document.querySelector('#new-chat');
const sessionList = document.querySelector('#session-list');
const modelCard = document.querySelector('.model-card');
const llmModel = document.querySelector('#llm-model');
const llmProvider = document.querySelector('#llm-provider');
const buildCard = document.querySelector('.build-card');
const buildVersion = document.querySelector('#build-version');
const buildId = document.querySelector('#build-id');
const buildUpdated = document.querySelector('#build-updated');
const buildWarning = document.querySelector('#build-warning');

let busy = false;
const SESSION_STORAGE_KEY = 'aifactory-rag-chat-sessions-v1';
const MAX_SESSIONS = 50;
const MAX_MESSAGES_PER_SESSION = 100;
let sessions = loadSessions();
let activeSessionId = sessions[0]?.id || null;

function newSessionId() {
  return globalThis.crypto?.randomUUID?.()
    || `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadSessions() {
  try {
    const stored = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '[]');
    if (!Array.isArray(stored)) return [];
    return stored
      .filter((session) => session && typeof session.id === 'string' && Array.isArray(session.messages))
      .slice(0, MAX_SESSIONS)
      .map((session) => ({
        id: session.id,
        title: typeof session.title === 'string' ? session.title.slice(0, 80) : 'New chat',
        createdAt: typeof session.createdAt === 'string' ? session.createdAt : new Date().toISOString(),
        updatedAt: typeof session.updatedAt === 'string' ? session.updatedAt : new Date().toISOString(),
        messages: session.messages
          .filter((message) => message && ['user', 'assistant'].includes(message.role) && typeof message.text === 'string')
          .slice(-MAX_MESSAGES_PER_SESSION)
          .map((message) => ({
            role: message.role,
            text: message.text.slice(0, 40000),
            sources: Array.isArray(message.sources) ? message.sources : [],
            error: Boolean(message.error),
          })),
      }));
  } catch {
    return [];
  }
}

function saveSessions() {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  } catch {
    // Chat remains usable when browser storage is disabled or full.
  }
}

function activeSession() {
  return sessions.find((session) => session.id === activeSessionId) || null;
}

function createSession() {
  const now = new Date().toISOString();
  const session = {
    id: newSessionId(),
    title: 'New chat',
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  sessions.unshift(session);
  sessions = sessions.slice(0, MAX_SESSIONS);
  activeSessionId = session.id;
  saveSessions();
  renderSessionList();
  renderActiveSession();
  question.focus();
  return session;
}

function formatSessionTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function renderSessionList() {
  sessionList.replaceChildren();
  for (const session of sessions) {
    const row = document.createElement('div');
    row.className = `session-row${session.id === activeSessionId ? ' active' : ''}`;
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'session-select';
    select.dataset.sessionId = session.id;
    const title = document.createElement('span');
    title.className = 'session-title';
    title.textContent = session.title;
    const date = document.createElement('span');
    date.className = 'session-date';
    date.textContent = formatSessionTime(session.updatedAt);
    select.append(title, date);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'session-delete';
    remove.dataset.deleteSessionId = session.id;
    remove.title = `Delete ${session.title}`;
    remove.setAttribute('aria-label', `Delete ${session.title}`);
    remove.textContent = '×';
    row.append(select, remove);
    sessionList.append(row);
  }
}

function showWelcome(isNew = false) {
  messages.replaceChildren();
  const welcome = document.createElement('div');
  welcome.className = 'welcome-card';
  const icon = document.createElement('div');
  icon.className = 'welcome-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '⌁';
  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = isNew ? 'NEW CONVERSATION' : 'SOURCE-GROUNDED ANSWERS';
  const heading = document.createElement('h2');
  heading.textContent = isNew ? 'What would you like to understand?' : 'Explore documentation and code in one place.';
  const copy = document.createElement('p');
  copy.textContent = isNew
    ? 'Your next answer will use the currently selected sources.'
    : 'Select one or more sources, then ask about APIs, architecture, examples, or implementation details.';
  welcome.append(icon, eyebrow, heading, copy);
  if (!isNew) {
    const suggestions = document.createElement('div');
    suggestions.className = 'suggestions';
    suggestions.setAttribute('aria-label', 'Suggested questions');
    for (const text of [
      'How is a Simics device initialized?',
      'Find an example using PCIe interfaces.',
      'Explain the project structure.',
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'suggestion';
      button.textContent = text;
      suggestions.append(button);
    }
    welcome.append(suggestions);
  }
  messages.append(welcome);
}

function renderActiveSession() {
  const session = activeSession();
  messages.replaceChildren();
  if (!session || !session.messages.length) {
    showWelcome(Boolean(session));
    return;
  }
  for (const message of session.messages) {
    addMessage(message.role, message.text, message.sources, message.error, false);
  }
  messages.scrollTop = messages.scrollHeight;
}

function persistMessage(role, text, sources, error) {
  const session = activeSession() || createSession();
  session.messages.push({ role, text, sources, error });
  session.messages = session.messages.slice(-MAX_MESSAGES_PER_SESSION);
  if (role === 'user' && session.title === 'New chat') {
    session.title = text.replace(/\s+/g, ' ').trim().slice(0, 46) || 'New chat';
  }
  session.updatedAt = new Date().toISOString();
  sessions = [session, ...sessions.filter((entry) => entry.id !== session.id)];
  saveSessions();
  renderSessionList();
}

function setHealth(online, label) {
  healthDot.className = `health-dot ${online ? 'online' : 'offline'}`;
  healthLabel.textContent = label;
}

function selectedSourceIds() {
  return [...sourceList.querySelectorAll('input:checked')].map((input) => input.value);
}

function renderSources(sources) {
  sourceList.replaceChildren();
  for (const source of sources) {
    const label = document.createElement('label');
    label.className = 'source-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = source.id;
    input.checked = true;
    const text = document.createElement('span');
    text.className = 'source-text';
    const name = document.createElement('span');
    name.className = 'source-name';
    name.textContent = source.id;
    const meta = document.createElement('span');
    meta.className = 'source-meta';
    meta.dataset.source = source.id;
    text.append(name, meta);
    label.append(input, text);
    sourceList.append(label);
  }
  selectAllButton.textContent = sources.length ? 'Clear all' : 'Select all';
  loadSourceStatus();
}

// How fresh each source is (RQ-0029): one line under its name, the detail in
// its tooltip. Refreshed every minute, since pushes update sources in the
// background.
const STATE_LABELS = {
  updating: 'Updating now',
  current: 'Checked',
  'file-errors': 'Checked',
  failed: 'Last ingest failed',
  stale: 'Ingest stopped',
  never: 'Never ingested',
};

async function loadSourceStatus() {
  try {
    const response = await fetch('/api/sources/status');
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    for (const item of await response.json()) renderSourceStatus(item);
  } catch {
    for (const meta of sourceList.querySelectorAll('.source-meta')) meta.replaceChildren();
  }
}

// The list stays one line per source: a status dot beside the name. The
// detail - when it was checked, each input's ref, commit and last change, the
// last run, the data-flow graphs - is a card beside the sidebar on hover.
const sourceStatus = new Map();
const sourceCard = document.querySelector('#source-card');
let sourceCardTimer = null;
let sourceCardFor = null;

const STATE_BADGES = {
  updating: ['Updating now', 'amber pulse'],
  current: ['Up to date', 'green'],
  'file-errors': [null, 'amber'],
  failed: ['Ingest failed', 'red'],
  stale: ['Ingest stopped', 'red'],
  never: ['Never ingested', 'grey'],
};

function renderSourceStatus(item) {
  sourceStatus.set(item.sourceId, item);
  const meta = sourceList.querySelector(`.source-meta[data-source="${CSS.escape(item.sourceId)}"]`);
  if (!meta) return;
  const dot = document.createElement('span');
  dot.className = `status-dot ${item.state}`;
  meta.replaceChildren(dot);
  const row = meta.closest('.source-option');
  if (!row.dataset.cardBound) {
    row.dataset.cardBound = '1';
    row.addEventListener('mouseenter', () => showSourceCard(row, item.sourceId));
    row.addEventListener('mouseleave', hideSourceCardSoon);
    row.addEventListener('focusin', () => showSourceCard(row, item.sourceId));
    row.addEventListener('focusout', hideSourceCardSoon);
  }
  if (sourceCardFor === item.sourceId && !sourceCard.hidden) fillSourceCard(item);
  // `#source=<id>` opens that source's card: a link to it, and a way to see it
  // without a pointer.
  const linked = new URLSearchParams(location.hash.slice(1)).get('source');
  if (linked === item.sourceId && sourceCardFor !== item.sourceId) showSourceCard(row, item.sourceId);
}

sourceCard.addEventListener('mouseenter', () => clearTimeout(sourceCardTimer));
sourceCard.addEventListener('mouseleave', hideSourceCardSoon);

function showSourceCard(row, sourceId) {
  const item = sourceStatus.get(sourceId);
  if (!item) return;
  clearTimeout(sourceCardTimer);
  sourceCardFor = sourceId;
  fillSourceCard(item);
  sourceCard.hidden = false;
  const sidebar = row.closest('.sidebar').getBoundingClientRect();
  const rect = row.getBoundingClientRect();
  const height = sourceCard.offsetHeight;
  const top = Math.max(12, Math.min(rect.top - 8, window.innerHeight - height - 12));
  sourceCard.style.left = `${sidebar.right + 10}px`;
  sourceCard.style.top = `${top}px`;
}

function hideSourceCardSoon() {
  clearTimeout(sourceCardTimer);
  sourceCardTimer = setTimeout(() => {
    sourceCard.hidden = true;
    sourceCardFor = null;
  }, 160);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function ago(iso) {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 90) return 'just now';
  const minutes = seconds / 60;
  if (minutes < 90) return `${Math.round(minutes)} min ago`;
  const hours = minutes / 60;
  if (hours < 36) return `${Math.round(hours)} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function stamp(iso, prefix) {
  const line = el('div', 'card-when');
  line.append(el('span', null, `${prefix} ${formatStamp(iso)}`), el('span', 'card-ago', ago(iso)));
  return line;
}

function fillSourceCard(item) {
  const [badgeText, badgeColor] = STATE_BADGES[item.state] || [item.state, 'grey'];
  const head = el('div', 'card-head');
  head.append(
    el('strong', 'card-title', item.sourceId),
    el('span', `card-badge ${badgeColor}`, badgeText || `${item.lastRun?.errors ?? 0} file errors`),
  );
  const parts = [head];
  if (item.checkedAt) parts.push(stamp(item.checkedAt, 'Checked'));

  for (const input of item.inputs) {
    const block = el('section', 'card-input');
    const title = el('div', 'card-input-head');
    const isGit = Boolean(input.commit);
    const name = el('span', 'card-input-name', isGit ? input.label.replace(/^git: /, '') : (input.name || 'folder'));
    if (!isGit && input.path) name.title = input.path;
    title.append(
      el('span', `card-kind ${isGit ? 'git' : 'folder'}`, isGit ? 'git' : 'folder'),
      name,
      el('span', 'card-count', `${input.documents ?? 0} docs`),
    );
    block.append(title);
    if (isGit) {
      const refs = el('div', 'card-refs');
      refs.append(el('span', 'card-chip ref', input.ref || 'default branch'));
      const commit = el(input.commitUrl ? 'a' : 'span', 'card-chip commit', input.commit.slice(0, 8));
      if (input.commitUrl) {
        commit.href = input.commitUrl;
        commit.target = '_blank';
        commit.rel = 'noopener';
        commit.title = 'Open the commit on GitLab';
      }
      refs.append(commit);
      block.append(refs);
      if (input.committedAt) block.append(stamp(input.committedAt, 'Committed'));
    }
    if (input.lastChange) block.append(stamp(input.lastChange, 'Changed'));
    parts.push(block);
  }

  const run = item.running || item.lastRun;
  if (run) {
    const block = el('section', 'card-run');
    block.append(el('div', 'card-section-title', `${item.running ? 'Running ingest' : 'Last ingest'} #${run.id}`));
    if (run.finishedAt) block.append(stamp(run.finishedAt, 'Finished'));
    else block.append(stamp(run.startedAt, 'Started'));
    const stats = el('div', 'card-stats');
    for (const [value, label, color] of [
      [run.inserted, 'new', 'green'], [run.updated, 'changed', 'amber'], [run.deleted, 'removed', 'red'],
      [run.skipped, 'unchanged', 'grey'], [run.errors, 'errors', run.errors ? 'amber' : 'grey'],
    ]) {
      const stat = el('span', `card-stat ${color}`);
      stat.append(el('b', null, String(value ?? 0)), el('span', null, label));
      stats.append(stat);
    }
    block.append(stats);
    parts.push(block);
  }

  if (item.dataflow.length) {
    const block = el('section', 'card-run');
    block.append(el('div', 'card-section-title', 'Joern data-flow graphs'));
    for (const graph of item.dataflow) {
      const name = graph.input === 'path' ? 'folder' : graph.input.split('/').pop();
      const language = { c: 'C/C++', js: 'TS/JS', cs: 'C#' }[graph.family] || graph.family || 'C/C++';
      const line = el('div', 'card-when');
      line.append(el('span', null, `${name} (${language}) · ${graph.builtAt ? formatStamp(graph.builtAt) : 'unknown'}`),
        el('span', 'card-ago', graph.builtAt ? ago(graph.builtAt) : ''));
      block.append(line);
    }
    parts.push(block);
  }
  sourceCard.replaceChildren(...parts);
}

setInterval(loadSourceStatus, 60_000);

async function loadSources() {
  try {
    const response = await fetch('/api/sources');
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const sources = await response.json();
    renderSources(sources);
    setHealth(true, `${sources.length} sources available`);
  } catch (error) {
    sourceList.replaceChildren();
    const message = document.createElement('p');
    message.className = 'section-copy';
    message.textContent = 'Sources are unavailable.';
    sourceList.append(message);
    setHealth(false, 'RAG API unavailable');
  }
}

async function loadRuntimeInfo() {
  try {
    const response = await fetch('/api/runtime-info');
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const info = await response.json();
    if (!info.llm?.provider || !info.llm?.model) throw new Error('LLM configuration is missing');
    llmModel.textContent = info.llm.model;
    llmModel.title = info.llm.model;
    llmProvider.textContent = `${info.llm.provider} provider`;
    modelCard.classList.remove('unavailable');
    renderBuildInfo(info.build);
  } catch {
    llmModel.textContent = 'Unavailable';
    llmModel.removeAttribute('title');
    llmProvider.textContent = 'Runtime information unavailable';
    modelCard.classList.add('unavailable');
    renderBuildInfo(null);
  }
}

// Local date and time, minutes precision; the full ISO timestamp is the tooltip.
function formatStamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown';
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Which code the RAG API runs (services/rag build_info.py): the build confirms a
// deployment, and "restart pending" says the code on disk is not yet running.
function renderBuildInfo(build) {
  const fields = [
    [buildVersion, build?.version, build?.requirement && `${build.requirement}${build.version?.endsWith('-dev') ? ' (deployed, not merged yet)' : ''}`],
    [buildId, build?.build],
    [buildUpdated, build?.updatedAt && formatStamp(build.updatedAt), build?.updatedAt],
  ];
  for (const [element, text, title] of fields) {
    element.textContent = text || 'unknown';
    if (title) element.title = title; else element.removeAttribute('title');
  }
  const pending = Boolean(build?.restartPending);
  buildWarning.hidden = !pending;
  buildCard.classList.toggle('pending', pending);
  buildCard.classList.toggle('unavailable', !build);
}

function renderAnswerText(container, text) {
  let cursor = 0;
  let groupStart = -1;
  let depth = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '(') {
      if (depth === 0) groupStart = index;
      depth += 1;
      continue;
    }
    if (text[index] !== ')' || depth === 0) continue;
    depth -= 1;
    if (depth !== 0 || groupStart < 0) continue;

    const candidate = text.slice(groupStart, index + 1);
    if (/\.pdf;\s*pages?\s+\d/i.test(candidate)) {
      container.append(document.createTextNode(text.slice(cursor, groupStart)));
      const citation = document.createElement('span');
      citation.className = 'inline-citation';
      citation.title = 'Document and page reference';
      citation.textContent = candidate;
      container.append(citation);
      cursor = index + 1;
    }
    groupStart = -1;
  }

  container.append(document.createTextNode(text.slice(cursor)));
}

function addMessage(role, text, sources = [], error = false, persist = true) {
  const welcome = messages.querySelector('.welcome-card');
  if (welcome) welcome.remove();

  const article = document.createElement('article');
  article.className = `message ${role}${error ? ' error' : ''}`;
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? 'YOU' : 'AF';
  const body = document.createElement('div');
  body.className = 'message-body';
  const roleLabel = document.createElement('div');
  roleLabel.className = 'message-role';
  roleLabel.textContent = role === 'user' ? 'You' : 'AI Factory';
  const content = document.createElement('div');
  content.className = 'message-text';
  if (role === 'assistant') renderAnswerText(content, text);
  else content.textContent = text;
  body.append(roleLabel, content);

  if (sources.length) {
    const sourceContainer = document.createElement('div');
    sourceContainer.className = 'answer-sources';
    const groupedSources = new Map();
    for (const source of sources) {
      if (source.sourceId && source.relativePath) {
        // A code chunk is its own citation: the same file in two repositories,
        // or two functions of one file, are different places.
        const key = [source.sourceId, source.repository || '', source.relativePath, source.startLine || ''].join('\u0000');
        const group = groupedSources.get(key);
        const pageNumbers = Array.isArray(source.pageNumbers)
          ? source.pageNumbers.filter((page) => Number.isInteger(page) && page > 0)
          : [];
        if (group) pageNumbers.forEach((page) => group.pages.add(page));
        else groupedSources.set(key, { source, pages: new Set(pageNumbers) });
      }
    }
    for (const { source, pages } of groupedSources.values()) {
      const params = new URLSearchParams({
        sourceId: source.sourceId,
        relativePath: source.relativePath,
      });
      const chip = document.createElement('a');
      chip.className = 'source-chip';
      if (source.webUrl) {
        // Repository files open at the cited commit and lines on GitLab.
        chip.href = source.webUrl;
        chip.target = '_blank';
        chip.rel = 'noopener';
        chip.title = `Open ${source.repository}:${source.relativePath} on GitLab`;
      } else if (!source.repository) {
        chip.href = `/api/documents/download?${params}`;
        chip.download = '';
        chip.title = `Download ${source.relativePath}`;
      }
      const sortedPages = [...pages].sort((left, right) => left - right);
      const pathLabel = document.createElement('span');
      pathLabel.className = 'source-path';
      pathLabel.textContent = source.repository ? `${source.repository}:${source.relativePath}` : source.relativePath;
      const sourceDetails = document.createElement('span');
      sourceDetails.className = 'source-details';
      if (sortedPages.length) {
        const pageLabel = document.createElement('span');
        pageLabel.className = 'source-pages';
        pageLabel.textContent = `${sortedPages.length === 1 ? 'Page' : 'Pages'} ${sortedPages.join(', ')}`;
        sourceDetails.append(pageLabel);
      }
      if (source.symbol || source.startLine) {
        const symbolLabel = document.createElement('span');
        symbolLabel.className = 'source-pages';
        const lines = source.startLine ? `L${source.startLine}–${source.endLine || source.startLine}` : '';
        symbolLabel.textContent = [source.symbol, lines].filter(Boolean).join(' · ');
        sourceDetails.append(symbolLabel);
      }
      sourceDetails.append(pathLabel);
      const downloadLabel = document.createElement('span');
      downloadLabel.className = 'source-download';
      downloadLabel.textContent = source.webUrl ? '↗ GitLab' : source.repository ? '' : '↓ Download';
      chip.append(sourceDetails, downloadLabel);
      sourceContainer.append(chip);
    }
    body.append(sourceContainer);
  }

  article.append(avatar, body);
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
  if (persist) persistMessage(role, text, sources, error);
  return article;
}

function addTypingIndicator() {
  const article = addMessage('assistant', '', [], false, false);
  const text = article.querySelector('.message-text');
  text.className = 'typing';
  text.replaceChildren(...[1, 2, 3].map(() => document.createElement('i')));
  return article;
}

function resizeQuestion() {
  question.style.height = 'auto';
  question.style.height = `${Math.min(question.scrollHeight, 150)}px`;
}

async function ask(value) {
  const prompt = value.trim();
  if (!prompt || busy) return;
  busy = true;
  sendButton.disabled = true;
  addMessage('user', prompt);
  question.value = '';
  resizeQuestion();
  const typing = addTypingIndicator();

  try {
    const response = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: prompt, sourceIds: selectedSourceIds() }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || `Query failed with status ${response.status}`);
    typing.remove();
    addMessage('assistant', payload.answer || 'The API returned an empty answer.', payload.sources || []);
  } catch (error) {
    typing.remove();
    addMessage('assistant', error instanceof Error ? error.message : 'The query failed.', [], true);
  } finally {
    busy = false;
    sendButton.disabled = false;
    question.focus();
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void ask(question.value);
});

question.addEventListener('input', resizeQuestion);
question.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

selectAllButton.addEventListener('click', () => {
  const inputs = [...sourceList.querySelectorAll('input')];
  const shouldSelect = inputs.some((input) => !input.checked);
  inputs.forEach((input) => { input.checked = shouldSelect; });
  selectAllButton.textContent = shouldSelect ? 'Clear all' : 'Select all';
});

sourceList.addEventListener('change', () => {
  const inputs = [...sourceList.querySelectorAll('input')];
  selectAllButton.textContent = inputs.length && inputs.every((input) => input.checked)
    ? 'Clear all'
    : 'Select all';
});

clearButton.addEventListener('click', () => {
  if (busy) return;
  const session = activeSession();
  if (session) {
    session.messages = [];
    session.title = 'New chat';
    session.updatedAt = new Date().toISOString();
    saveSessions();
    renderSessionList();
  }
  showWelcome(true);
  question.focus();
});

newChatButton.addEventListener('click', () => {
  if (!busy) createSession();
});

sessionList.addEventListener('click', (event) => {
  if (busy) return;
  const deleteButton = event.target.closest('[data-delete-session-id]');
  if (deleteButton) {
    const id = deleteButton.dataset.deleteSessionId;
    sessions = sessions.filter((session) => session.id !== id);
    if (activeSessionId === id) activeSessionId = sessions[0]?.id || null;
    saveSessions();
    if (!activeSessionId) createSession();
    else {
      renderSessionList();
      renderActiveSession();
    }
    return;
  }
  const selectButton = event.target.closest('[data-session-id]');
  if (selectButton) {
    activeSessionId = selectButton.dataset.sessionId;
    renderSessionList();
    renderActiveSession();
    question.focus();
  }
});

messages.addEventListener('click', (event) => {
  const suggestion = event.target.closest('.suggestion');
  if (suggestion) void ask(suggestion.textContent || '');
});

if (!sessions.length) createSession();
else {
  renderSessionList();
  renderActiveSession();
}
void loadSources();
void loadRuntimeInfo();
