# MY LIFE v18 AI setup
The site is ready; cloud AI will not work until the backend is deployed and configured.
1. Run life-v18-setup.sql in the project's SQL Editor (requires existing Vlog owner setup). If v15 is already configured, ai-setup.sql alone is sufficient.
2. In Supabase Edge Functions, deploy a function named life-ai with the contents of supabase/functions/life-ai/index.ts. The function verifies the user JWT using Supabase Auth and checks approved membership before reserving quota and calling AI. If the legacy gateway JWT verification is incompatible with your publishable-key configuration, turn it off only for life-ai, whose code performs its own authentication.
3. In Edge Function Secrets set OPENAI_API_KEY to a project API key from your OpenAI API account. Set billing and usage limits there. Do not commit the key or put it in HTML. Optionally set MY_LIFE_AI_MODEL to a compatible vision-capable chat-completions model.
4. Sign in to the published site as an approved member. Use AI INPUT or BUDGET, opt into cloud AI, and check each draft before saving. Browser microphone availability varies; keyboard dictation is a fallback. With cloud AI disabled, simple rules and local OCR are used instead.
Limits: 20 requests per member per Tokyo calendar day, 100 per app; failures after quota reservation also count. No auto-publishing or automatic database writes by the AI.
