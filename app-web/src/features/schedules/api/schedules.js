import { API_BASE } from '../../../shared/api/base.js';
import { apiFetch, parseResponseMessage } from '../../../shared/api/client.js';

export function createSchedulesApi(request = apiFetch, base = API_BASE) {
  async function call(path = '', method = 'GET', body) {
    const response = await request(`${base}/api/schedules${path}`, {
      method, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(await parseResponseMessage(response, `Schedule request failed (${response.status}).`));
    return response.json();
  }
  const path = (id) => `/${encodeURIComponent(id)}`;
  return {
    list: () => call(),
    create: (payload) => call('', 'POST', payload),
    update: (id, payload) => call(path(id), 'PATCH', payload),
    pause: (id) => call(`${path(id)}/pause`, 'POST'),
    resume: (id) => call(`${path(id)}/resume`, 'POST'),
    remove: (id) => call(path(id), 'DELETE'),
    runs: (id, offset = 0) => call(`${path(id)}/runs?limit=50&offset=${offset}`),
  };
}

export const schedulesApi = createSchedulesApi();
