import { test } from 'node:test'
import assert from 'node:assert/strict'
const model = { providerID: 'openai', modelID: 'gpt-6.1-sol' }
function host(response: any = { info: { role: 'assistant', ...model }, parts: [{ type: 'text', text: '{"ok":true}' }] }) {
  const calls: any[] = []
  return { calls, client: { tool: { ids: async () => ({ data: ['bash', 'load_skill'] }) }, session: {
    create: async (p: any) => { calls.push(['create', p]); return { data: { id: 'isolated', permission: p.permission } } },
    prompt: async (p: any) => { calls.push(['prompt', p]); return { data: response } },
    abort: async () => { calls.push(['abort']); return { data: true } },
    delete: async () => { calls.push(['delete']); return { data: true } },
  } } }
}
test('SDK adapter pins model, denies tools, requests structured JSON and deletes session', async () => {
  const { createOpenCodeModelAdapter } = await import('../src/skill-model-adapter.ts')
  const mock = host()
  const adapter = createOpenCodeModelAdapter(mock.client as any)
  assert.equal(await adapter.generate({ selectedModel: model, prompt: '{}', schema: { type: 'object' }, signal: new AbortController().signal, timeoutMs: 100 }), '{"ok":true}')
  const prompt = mock.calls.find(c => c[0] === 'prompt')[1]
  assert.deepEqual(prompt.model, model)
  assert.deepEqual(prompt.tools, { bash: false, load_skill: false })
  assert.equal(prompt.format.type, 'json_schema')
  assert.equal(prompt.noReply, false)
  assert.equal(mock.calls.at(-1)[0], 'delete')
  const bad = host({ info: { role: 'assistant', ...model }, parts: [] })
  await assert.rejects(createOpenCodeModelAdapter(bad.client as any).generate({ selectedModel: model, prompt: '{}', schema: {}, signal: new AbortController().signal, timeoutMs: 100 }), /EMPTY/)
  assert.ok(bad.calls.some(c => c[0] === 'abort'))
  assert.equal(bad.calls.at(-1)[0], 'delete')
})
test('SDK adapter rejects invalid JSON, model mismatch, missing deny permissions and tool execution', async () => {
  const { createOpenCodeModelAdapter } = await import('../src/skill-model-adapter.ts')
  const call = { selectedModel: model, prompt: '{}', schema: {}, signal: new AbortController().signal, timeoutMs: 100 }
  for (const response of [
    { info: { role: 'assistant', ...model }, parts: [{ type: 'text', text: '{' }] },
    { info: { role: 'assistant', ...model, modelID: 'fallback' }, parts: [] },
    { info: { role: 'assistant', ...model }, parts: [{ type: 'tool' }] },
  ]) {
    const mock = host(response)
    await assert.rejects(createOpenCodeModelAdapter(mock.client as any).generate(call), /JSON|ASSISTANT/)
    assert.equal(mock.calls.at(-1)[0], 'delete')
  }
  const mock = host(); mock.client.session.create = async () => ({ data: { id: 'isolated' } }) as any
  await assert.rejects(createOpenCodeModelAdapter(mock.client as any).generate(call), /ISOLATION/)
  assert.ok(!mock.calls.some(c => c[0] === 'prompt'))
})
test('SDK adapter timeout/cancel abort then delete; cleanup failure is surfaced; structured result extracted', async () => {
  const { createOpenCodeModelAdapter } = await import('../src/skill-model-adapter.ts')
  const call = { selectedModel: model, prompt: '{}', schema: {}, signal: new AbortController().signal, timeoutMs: 10 }
  const mock = host(); mock.client.session.prompt = async () => new Promise<any>(() => {})
  await assert.rejects(createOpenCodeModelAdapter(mock.client as any).generate(call), /ABORTED/)
  assert.deepEqual(mock.calls.slice(-2).map(c => c[0]), ['abort', 'delete'])
  const cancelled = host()
  await assert.rejects(createOpenCodeModelAdapter(cancelled.client as any).generate({ ...call, signal: AbortSignal.abort() }), /ABORTED/)
  assert.equal(cancelled.calls.length, 0)
  const broken = host(); broken.client.session.delete = async () => { throw Error('private provider data') }
  await assert.rejects(createOpenCodeModelAdapter(broken.client as any).generate(call), /CLEANUP_DELETE/)
  const structured = host({ info: { role: 'assistant', ...model, structured: { result: 1 } }, parts: [] })
  assert.equal(await createOpenCodeModelAdapter(structured.client as any).generate(call), '{"result":1}')
})
test('SDK adapter sanitizes host failures, never falls back, deletes even when abort fails', async () => {
  const { createOpenCodeModelAdapter } = await import('../src/skill-model-adapter.ts')
  const call = { selectedModel: model, prompt: '{}', schema: {}, signal: new AbortController().signal, timeoutMs: 100 }
  const mock = host()
  mock.client.session.prompt = async () => { throw Error('secret host error') }
  mock.client.session.abort = async () => { mock.calls.push(['abort']); throw Error('secret abort error') }
  await assert.rejects(createOpenCodeModelAdapter(mock.client as any).generate(call), /^Error: DECOMPILER_MODEL_CLEANUP_ABORT$/)
  assert.equal(mock.calls.at(-1)[0], 'delete')
  const createError = host(); createError.client.session.create = async () => { throw Error('secret provider failure') }
  await assert.rejects(createOpenCodeModelAdapter(createError.client as any).generate(call), /^Error: DECOMPILER_MODEL_REQUEST_FAILED$/)
  assert.ok(!createError.calls.some(c => c[0] === 'prompt'))
  await assert.rejects(createOpenCodeModelAdapter(host().client as any).generate({ ...call, selectedModel: {} as any }), /MODEL_REQUIRED/)
})
