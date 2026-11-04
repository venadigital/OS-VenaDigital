// The popup holds no state: it reads it on opening and repaints when it changes, so it shows
// the same thing however many times it is closed and reopened during a capture.
const $ = (id) => document.getElementById(id);
const STALE_MS = 30_000;

function paint(state) {
  const running = state?.status === 'capturing' && Date.now() - state.updatedAt < STALE_MS;
  const failed = state?.status === 'error';
  $('actions').hidden = running || failed;
  $('working').hidden = !running;
  $('failed').hidden = !failed;
  if (running) $('fill').style.width = `${Math.round((state.progress ?? 0) * 100)}%`;
  if (failed) $('message').textContent = state.message;
}

async function start(kind) {
  // Asked for at the moment of the click: this is the tab being looked at.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  await chrome.runtime.sendMessage({ type: 'start', kind, tabId: tab.id });
  window.close();
}

$('annotate').addEventListener('click', () => void start('annotate'));
$('page').addEventListener('click', () => void start('page'));
$('visible').addEventListener('click', () => void start('visible'));
$('cancel').addEventListener('click', () => void chrome.runtime.sendMessage({ type: 'cancel' }));
$('dismiss').addEventListener('click', () => void chrome.runtime.sendMessage({ type: 'dismiss' }));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.state) paint(changes.state.newValue);
});
void chrome.storage.session.get('state').then(({ state }) => paint(state));
