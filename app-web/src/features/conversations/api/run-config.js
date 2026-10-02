import { API_BASE } from '../../../shared/api/base.js';
import { apiFetch, parseResponseMessage } from '../../../shared/api/client.js';

export function createRunConfigApi(request = apiFetch, base = API_BASE) {
  async function call(id, config) {
    const response = await request(`${base}/api/conversations/${encodeURIComponent(id)}/run-config`, {
      method: config === undefined ? 'GET' : 'PUT',
      ...(config === undefined ? {} : { body: JSON.stringify(config) }),
    });
    if (!response.ok) throw new Error(await parseResponseMessage(response, 'Conversation model configuration could not be saved.'));
    return response.json();
  }
  return { get: (id) => call(id), save: (id, config) => call(id, config) };
}
export const runConfigApi = createRunConfigApi();
