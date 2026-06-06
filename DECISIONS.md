# Architectural Decisions

## 1. AI Context: Sliding Window + Will Summary JSON, not Full Chat History

**The choice:** The system prompt embeds a compact JSON `willSummary` — a structured snapshot of everything collected — and we only send the last 14 messages to Claude. We do not re-send the full chat on every turn.

**What else I could have done:** Send the entire conversation history every time. This is simpler to implement and would never "forget" anything a user said.

**Why I chose this:** Token cost and latency grow linearly with chat length if you re-send everything. A user who spends 30 minutes on a will might have 60–80 turns; sending that wholesale gets expensive and slow (it's 3,000+ tokens before your actual question). The structured `willSummary` costs ~300 tokens and tells the AI everything it needs. The 14-message window preserves immediate conversational context (so the AI remembers what it just asked). The tradeoff is that the AI can't reason over *how* something was said ten turns ago — but for a will, we only care about *what* was said.

---

## 2. Separated Extraction and Conversation into Two Claude Calls

**The choice:** Each user message triggers *two* Claude calls: one with a `update_will` tool to extract structured facts, and one (Haiku) to generate the next question.

**What else I could have done:** Combine extraction and reply generation in a single call. Some implementations prompt Claude to respond *and* return a JSON block at the end of its message.

**Why I chose this:** Mixing "be friendly and conversational" with "output precise machine-readable JSON" creates prompt tension and increases extraction errors. Splitting them lets each call be optimised: the extraction call uses `tool_choice: auto` with a tight schema; the conversation call uses a natural system prompt. Extraction failures are also caught and made non-fatal without silencing the user's reply. The cost of a second Haiku call (~$0.0003) is negligible.

---

## 3. Three-State Will Validity Enum (INCOMPLETE / INVALID / WARNING / VALID)

**The choice:** `ValidityService.validate()` returns one of four explicit statuses, never a boolean.

**What else I could have done:** Return a boolean `isValid` plus separate `errors[]` array. Many codebases do this.

**Why I chose this:** A boolean collapses the distinction between "the user hasn't finished yet" and "the user has finished but made a mistake". These are completely different UX states — one calls for continuing the interview, the other for showing a correction flow. The WARNING state (e.g., witness is also a beneficiary) needed to exist separately from INVALID so the user can still download their will despite the soft concern. Having this as a typed enum means the TypeScript compiler enforces that every switch/case handles all four states.

---

## 4. pdfkit over Puppeteer for Document Generation

**The choice:** Used `pdfkit` (a Node.js PDF library) to generate the will document directly from will data.

**What else I could have done:** Generate an HTML template and convert it to PDF using Puppeteer (headless Chrome). This is the approach most reach for first.

**Why I chose this:** Puppeteer adds ~200MB of Chrome binaries to the Docker image and requires spawning a separate process. For a structured legal document with predictable layout (sections, signature lines), programmatic PDF generation with pdfkit gives more control with far less overhead. The downside: pdfkit's layout API is lower-level than HTML+CSS, so it takes more code for complex formatting. For a multi-page document with tables or images, Puppeteer would win.

---

## 5. TypeORM `synchronize: true` in Development, Explicit Seed Script for Production

**The choice:** `synchronize: true` only in non-production. The database schema is defined in TypeORM entities; the seed script handles demo data.

**What else I could have done:** Use TypeORM migrations for every environment, which is stricter.

**Why I chose this:** Migrations add operational overhead that slows early development — every schema change requires a `migration:generate` + `migration:run` step. For this project size, auto-sync in dev is the pragmatic call. In production, `synchronize` is turned off and you'd run explicit migrations. The seed script is separate from migrations deliberately: seed data is not schema, and shouldn't be version-controlled in the same migration chain. Running `npm run db:seed` is idempotent (it deletes and re-creates the demo user) so it's safe to run repeatedly.

---

## 6. Haiku for Interview Turns, Not Sonnet

**The choice:** Both the extraction call and the interview response call use `claude-3-5-haiku-20241022`.

**What else I could have done:** Use a more capable model (Sonnet or Opus) for better extraction quality and more nuanced responses.

**Why I chose this:** A will interview is a narrow, well-defined task: ask the next question from a known list, extract structured data with a schema. Haiku handles this correctly and responds in ~1–2 seconds instead of 4–8. For a real product at scale, the cost difference matters: Haiku is ~30× cheaper than Sonnet per token. If extraction quality became a problem in production (I'd measure this), I would upgrade the extraction call to Sonnet while keeping the conversational call on Haiku — they're separate, so the switch is localised to one line.
