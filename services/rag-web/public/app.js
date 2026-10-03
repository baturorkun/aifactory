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

function metaLine(className, ...parts) {
  const line = document.createElement('span');
  line.className = className;
  line.append(...parts.filter(Boolean));
  return line;
}

function textPart(text, className) {
  const part = document.createElement('span');
  if (className) part.className = className;
  part.textContent = text;
  return part;
}

// "Checked" is when the source was last scanned (with webhooks: every push);
// each input then says when its own content last changed, and a repository
// which commit it holds and when that commit was made.
function renderSourceStatus(item) {
  const meta = sourceList.querySelector(`.source-meta[data-source="${CSS.escape(item.sourceId)}"]`);
  if (!meta) return;
  const dot = document.createElement('span');
  dot.className = `status-dot ${item.state}`;
  const label = STATE_LABELS[item.state] || item.state;
  const stamp = item.state !== 'updating' && item.checkedAt ? ` ${formatStamp(item.checkedAt)}` : '';
  const errors = item.state === 'file-errors' && item.lastRun ? textPart(`${item.lastRun.errors} errors`, 'source-errors') : null;
  const lines = [metaLine('source-line', dot, textPart(`${label}${stamp}`), errors)];
  for (const input of item.inputs) {
    const name = textPart(input.label, 'source-input-name');
    if (input.commit) {
      const commit = document.createElement(input.commitUrl ? 'a' : 'span');
      commit.className = 'source-commit';
      commit.textContent = `${input.ref || ''} ${input.commit.slice(0, 8)}`.trim();
      if (input.commitUrl) {
        commit.href = input.commitUrl;
        commit.target = '_blank';
        commit.rel = 'noopener';
      }
      const when = input.committedAt ? textPart(`committed ${formatStamp(input.committedAt)}`) : null;
      lines.push(metaLine('source-line source-input', name, commit, when));
    } else {
      const when = input.lastChange ? `changed ${formatStamp(input.lastChange)}` : 'no documents';
      lines.push(metaLine('source-line source-input', name, textPart(when)));
    }
  }
  meta.replaceChildren(...lines);
  meta.title = sourceStatusDetail(item);
}

function sourceStatusDetail(item) {
  const lines = [`${item.sourceId}: ${STATE_LABELS[item.state] || item.state}`
    + (item.checkedAt ? ` ${formatStamp(item.checkedAt)}` : '')];
  const run = item.running || item.lastRun;
  if (run) {
    lines.push(`Last ingest #${run.id} ${run.status}, started ${formatStamp(run.startedAt)}`
      + (run.finishedAt ? `, finished ${formatStamp(run.finishedAt)}` : ''));
    lines.push(`  ${run.inserted} new, ${run.updated} changed, ${run.deleted} removed, `
      + `${run.skipped} unchanged, ${run.errors} file errors`);
  }
  for (const input of item.inputs) {
    const parts = [`${input.label}: ${input.documents ?? 0} documents`];
    if (input.lastChange) parts.push(`content changed ${formatStamp(input.lastChange)}`);
    if (input.commit) parts.push(`${input.ref || ''} ${input.commit.slice(0, 8)}`.trim());
    if (input.committedAt) parts.push(`committed ${formatStamp(input.committedAt)}`);
    lines.push(parts.join(', '));
  }
  for (const graph of item.dataflow) {
    lines.push(`Data-flow graph of ${graph.input === 'path' ? 'folder' : graph.input}: built ${graph.builtAt ? formatStamp(graph.builtAt) : 'unknown'}`);
  }
  return lines.join('\n');
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
