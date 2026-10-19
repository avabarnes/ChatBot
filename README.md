# Orbit

A general-purpose AI chatbot with a pixel-art robot, powered by [Groq](https://groq.com).
Plain HTML/CSS/JS front end in `public/`, one Vercel serverless function in `api/chat.js`.
No auth, database or payments.

## Run locally
1. `cp .env.example .env` and put your key in `GROQ_API_KEY` (`.env` is git-ignored).
2. `node dev-server.js` and open http://localhost:3000 (or use `vercel dev`).
3. `npm test` runs the endpoint tests (stubbed fetch, no key needed).

## Deploy on Vercel
1. Push this folder to a GitHub repo and **Import** it at vercel.com/new (framework preset: Other, no build command).
2. Project Settings → Environment Variables: add `GROQ_API_KEY` (required) and optionally `GROQ_MODEL` (default `llama-3.3-70b-versatile`).
3. Deploy (redeploy after changing variables).

## Limits (in `api/chat.js`)
2000 chars/message, last 12 messages / 12,000 chars as context, 1024 output tokens, 20 s upstream timeout (client gives up after 30 s).
