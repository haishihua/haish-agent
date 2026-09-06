/** Tie the upstream request to both protocol request and response cancellation. */
export async function proxyResponse(
  fetchUpstream: (signal: AbortSignal) => Promise<Response>,
  signal: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const cleanup = () => signal.removeEventListener('abort', abort);
  try {
    const response = await fetchUpstream(controller.signal);
    if (!response.body) {
      cleanup();
      return response;
    }
    const reader = response.body.getReader();
    return new Response(new ReadableStream({
      async pull(stream) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            cleanup();
            stream.close();
          } else {
            stream.enqueue(value);
          }
        } catch (error) {
          cleanup();
          stream.error(error);
        }
      },
      async cancel(reason) {
        controller.abort(reason);
        cleanup();
        await reader.cancel(reason).catch(() => {});
      },
    }), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    cleanup();
    throw error;
  }
}
