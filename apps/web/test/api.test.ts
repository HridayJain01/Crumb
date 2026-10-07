import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/firebase', () => ({
  auth: { currentUser: { getIdToken: async () => 'id-token-123' } },
}));

const { api, ApiError } = await import('../src/lib/api');

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const insightBody = {
  kind: 'daily' as const,
  context: {
    goal: 'maintain' as const,
    today: {
      kcal: 900,
      kcalTarget: 2000,
      proteinG: 30,
      proteinTarget: 90,
      steps: 4000,
      mealsLogged: 2,
      hour: 13,
    },
    chosenAction: { kind: 'protein_gap', text: 'Add some protein to dinner.' },
  },
};

describe('api client', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the Firebase ID token and validates the response', async () => {
    fetchMock.mockResolvedValue(
      json(200, { insight: 'Steady day.', action: 'Add some protein to dinner.', source: 'ai' }),
    );
    const res = await api.insight(insightBody as never);
    expect(res.insight).toBe('Steady day.');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/insights');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer id-token-123');
  });

  it('maps AI outages to fallback errors so logging never blocks', async () => {
    fetchMock.mockResolvedValue(
      json(503, { error: { code: 'ai_unavailable', message: 'AI is resting' } }),
    );
    const err = await api.insight(insightBody as never).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 503, code: 'ai_unavailable', aiFallback: true });
  });

  it('keeps request errors that need a different answer out of the fallback path', async () => {
    fetchMock.mockResolvedValue(
      json(400, { error: { code: 'invalid_request', message: 'Bad input' } }),
    );
    const err = await api.insight(insightBody as never).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'invalid_request', aiFallback: false });
  });

  it('treats dropped connections as network errors', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await api.insight(insightBody as never).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'network', aiFallback: true });
  });

  it('does not call the network at all when the device is offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const err = await api.insight(insightBody as never).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'network' });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('rejects responses that do not match the schema', async () => {
    fetchMock.mockResolvedValue(json(200, { totals: { kcal: 9999 } }));
    const err = await api.insight(insightBody as never).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'bad_response' });
  });
});
