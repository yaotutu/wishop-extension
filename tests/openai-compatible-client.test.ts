import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createOpenAiCompatibleJsonCompletion,
  parseOpenAiCompatibleJsonContent,
} from '../src/background/ai/openai-compatible-client.ts';

test('OpenAI-compatible JSON completion sends chat messages to the configured base URL', async () => {
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

  const result = await createOpenAiCompatibleJsonCompletion({
    baseUrl: ' https://llm.example.test/v1/ ',
    apiKey: ' sk-local-secret ',
    model: ' gpt-compatible ',
    messages: [{ role: 'user', content: '请输出 JSON' }],
    fetcher,
  });

  assert.deepEqual(result, {
    attrs: [{ attrKey: '型号', attrValue: 'A1' }],
    confidence: 0.8,
  });
  assert.equal(requests.length, 1);
  assert.equal(String(requests[0].input), 'https://llm.example.test/v1/chat/completions');
  assert.equal(requests[0].init?.method, 'POST');
  assert.equal((requests[0].init?.headers as Record<string, string>).Authorization, 'Bearer sk-local-secret');

  const body = JSON.parse(String(requests[0].init?.body));
  assert.equal(body.model, 'gpt-compatible');
  assert.equal(body.stream, false);
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.deepEqual(body.messages, [{ role: 'user', content: '请输出 JSON' }]);
});

test('OpenAI-compatible JSON parser accepts fenced JSON content', () => {
  assert.deepEqual(parseOpenAiCompatibleJsonContent('```json\n{"ok":true}\n```'), { ok: true });
});

test('OpenAI-compatible client redacts the API key from HTTP error messages', async () => {
  const fetcher = async (): Promise<Response> => new Response(
    JSON.stringify({ error: { message: 'bad key sk-local-secret' } }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  );

  await assert.rejects(
    () => createOpenAiCompatibleJsonCompletion({
      baseUrl: 'https://llm.example.test/v1',
      apiKey: 'sk-local-secret',
      model: 'gpt-compatible',
      messages: [{ role: 'user', content: 'x' }],
      fetcher,
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /AI 服务调用失败/);
      assert.doesNotMatch(error.message, /sk-local-secret/);
      return true;
    },
  );
});

test('OpenAI-compatible client requires base URL, API key, model, and messages', async () => {
  await assert.rejects(
    () => createOpenAiCompatibleJsonCompletion({
      baseUrl: '',
      apiKey: 'sk-local-secret',
      model: 'gpt-compatible',
      messages: [{ role: 'user', content: 'x' }],
    }),
    /请先在设置里填写 OpenAI 兼容地址/,
  );
  await assert.rejects(
    () => createOpenAiCompatibleJsonCompletion({
      baseUrl: 'https://llm.example.test/v1',
      apiKey: '',
      model: 'gpt-compatible',
      messages: [{ role: 'user', content: 'x' }],
    }),
    /请先在设置里填写 AI 服务 API Key/,
  );
  await assert.rejects(
    () => createOpenAiCompatibleJsonCompletion({
      baseUrl: 'https://llm.example.test/v1',
      apiKey: 'sk-local-secret',
      model: '',
      messages: [{ role: 'user', content: 'x' }],
    }),
    /请先在设置里填写 AI 服务模型名称/,
  );
});
