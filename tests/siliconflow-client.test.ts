import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSiliconFlowJsonCompletion,
  parseSiliconFlowJsonContent,
} from '../src/background/ai/siliconflow-client.ts';

test('SiliconFlow JSON completion sends chat messages with bearer auth and json_object mode', async () => {
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    requests.push({ input, init });
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: '{"attrs":[{"attrKey":"型号","attrValue":"A1"}],"confidence":0.8}',
        },
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const result = await createSiliconFlowJsonCompletion({
    apiKey: 'sk-local-secret',
    model: 'Qwen/QwQ-32B',
    messages: [{ role: 'user', content: '请输出 JSON' }],
    fetcher,
  });

  assert.deepEqual(result, {
    attrs: [{ attrKey: '型号', attrValue: 'A1' }],
    confidence: 0.8,
  });
  assert.equal(requests.length, 1);
  assert.equal(String(requests[0].input), 'https://api.siliconflow.cn/v1/chat/completions');
  assert.equal(requests[0].init?.method, 'POST');
  assert.equal((requests[0].init?.headers as Record<string, string>).Authorization, 'Bearer sk-local-secret');

  const body = JSON.parse(String(requests[0].init?.body));
  assert.equal(body.model, 'Qwen/QwQ-32B');
  assert.equal(body.stream, false);
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.deepEqual(body.messages, [{ role: 'user', content: '请输出 JSON' }]);
});

test('SiliconFlow JSON parser accepts fenced JSON content', () => {
  assert.deepEqual(parseSiliconFlowJsonContent('```json\n{"ok":true}\n```'), { ok: true });
});

test('SiliconFlow client redacts the API key from HTTP error messages', async () => {
  const fetcher = async (): Promise<Response> => new Response(
    JSON.stringify({ error: { message: 'bad key sk-local-secret' } }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  );

  await assert.rejects(
    () => createSiliconFlowJsonCompletion({
      apiKey: 'sk-local-secret',
      model: 'Qwen/QwQ-32B',
      messages: [{ role: 'user', content: 'x' }],
      fetcher,
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /SiliconFlow API 调用失败/);
      assert.doesNotMatch(error.message, /sk-local-secret/);
      return true;
    },
  );
});
