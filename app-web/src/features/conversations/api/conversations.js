import { apiFetch, buildApiHeaders } from '../../../shared/api/client.js';
import { API_BASE } from '../../../shared/api/base.js';

const MAX_BOOTSTRAP_ATTEMPTS = 8;
const RETRY_DELAY_MS = 2000;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function createConversationWithRetry(payload, isCurrentActivation) {
  let lastStatus = null;
  for (let attempt = 1; attempt <= MAX_BOOTSTRAP_ATTEMPTS; attempt += 1) {
    if (!isCurrentActivation()) return null;
    const response = await apiFetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: buildApiHeaders(),
      body: JSON.stringify(payload),
    });
    if (response.ok) return response.json();
    lastStatus = response.status;
    if (response.status !== 503 || attempt === MAX_BOOTSTRAP_ATTEMPTS) break;
    await wait(RETRY_DELAY_MS);
  }
  throw new Error(`conversation bootstrap failed: ${lastStatus || 'unknown'}`);
}
