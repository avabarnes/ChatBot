// Preload for local UI testing ONLY: node -r ./test/mock-groq.js dev-server.js
// Replaces calls to Groq with canned replies so the UI can be exercised without a key.
const realFetch = global.fetch;
let n = 0;
global.fetch = async (url, opts) => {
  if (!String(url).includes('api.groq.com')) return realFetch(url, opts);
  const body = JSON.parse(opts.body);
  const last = body.messages[body.messages.length - 1].content;
  if (/fail/i.test(last) && n++ % 2 === 0) return { ok: false, status: 500, text: async () => 'x' };
  if (/slow/i.test(last)) await new Promise((r) => setTimeout(r, 4000));
  const reply = /code/i.test(last)
    ? 'Here you go:\n\n```js\nconsole.log("hi <b>not html</b>");\n```\n\nUse `console.log` for **output**.'
    : `[mock] You said: ${last}\n\nContext messages received: ${body.messages.length - 1}`;
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: reply } }] }) };
};
