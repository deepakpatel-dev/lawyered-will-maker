import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { WillsService } from '../wills/wills.service';
import { ChatMessage, MessageRole } from '../wills/entities/chat-message.entity';
import { WillStatus } from '../wills/entities/will.entity';

// ─── TEMPORARY MOCK ──────────────────────────────────────────────────────────
// Used when ANTHROPIC_API_KEY is not set. Remove once API key is configured.
const MOCK_RESPONSES = [
  "Hi! I'm your will-making assistant. Let's get started — could you tell me your full name?",
  "Thanks! And how old are you?",
  "Got it. What is your current home address?",
  "Do you have any children under 18 years old?",
  "Great. Let's talk about what you own. Could you describe your main assets — things like property, bank accounts, or vehicles?",
  "Who would you like to inherit these assets? Please tell me their names and your relationship to them.",
  "And what percentage of each asset should each person receive?",
  "Who would you like to appoint as executor — the person who will carry out your will?",
  "Finally, do you have two people in mind who could act as witnesses? They should not be beneficiaries.",
  "⚠️ Mock mode — add ANTHROPIC_API_KEY to .env to enable real AI responses.",
];
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context window strategy:
 *   We do NOT re-send the full chat history to Claude on every turn.
 *   Instead, we send:
 *     1. A system prompt that embeds the current willSummary (structured JSON).
 *     2. The last MAX_CONTEXT_MESSAGES turns for conversational coherence.
 *
 *   This keeps tokens ~constant regardless of how long the chat runs.
 *   The will state is always reconstructable from the DB, not from the chat.
 *
 * Extraction strategy:
 *   After each user message, we call Claude with a tool (`update_will`) that
 *   returns structured JSON. Claude decides what to extract — we persist it.
 *   This separates "generate next question" from "extract facts" into two
 *   focused calls, making each cheaper and more reliable.
 */

const SYSTEM_PROMPT = `You are a warm, friendly will-making assistant helping people in India create their legal will.
Ask ONE question at a time in simple, everyday language. Do not use legal jargon.
When the user answers, acknowledge their answer briefly before asking the next question.
If an answer is ambiguous (e.g., two people with the same name, or percentages that don't add up), ask a gentle clarifying question.
Never guess when something is unclear.

The will requires collecting:
1. Testator: full name, age, address
2. Assets: what they own (property, bank accounts, jewellery, vehicles)
3. Beneficiaries: who inherits each asset and what percentage
4. Executor: one trusted person to carry out the will
5. Guardian: required only if there are children under 18
6. Witnesses: at least two people (warn if they are also beneficiaries)

Current will state:
{{WILL_SUMMARY}}

Based on the above, identify what is still missing and ask about the next missing item.
When everything is collected, say "Your will is now complete!" and stop asking questions.`;

const EXTRACTION_SYSTEM = `You are a data extraction assistant. Given a conversation snippet about someone's will,
extract any new facts the user mentioned and return them as structured data using the update_will tool.
Only extract facts explicitly stated — do not infer or guess.`;

const UPDATE_WILL_TOOL: Anthropic.Tool = {
  name: 'update_will',
  description: 'Updates the will with newly extracted information from the user\'s message',
  input_schema: {
    type: 'object' as const,
    properties: {
      testator: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          address: { type: 'string' },
          hasMinorChildren: { type: 'boolean' },
        },
      },
      executor: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          relationship: { type: 'string' },
        },
        required: ['name'],
      },
      guardian: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          relationship: { type: 'string' },
        },
        required: ['name'],
      },
      beneficiaries: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            relationship: { type: 'string' },
            notes: { type: 'string' },
          },
          required: ['name'],
        },
      },
      assets: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            type: { type: 'string', enum: ['property', 'bank_account', 'vehicle', 'jewellery', 'investment', 'other'] },
            shares: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  beneficiaryName: { type: 'string' },
                  percentage: { type: 'number' },
                },
                required: ['beneficiaryName', 'percentage'],
              },
            },
          },
          required: ['description'],
        },
      },
      witnesses: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            relationship: { type: 'string' },
          },
          required: ['name'],
        },
      },
    },
  },
};

export interface SendMessageResult {
  reply: string;
  willStatus: WillStatus;
}

@Injectable()
export class InterviewService {
  readonly MAX_CONTEXT_MESSAGES = 14;

  /** True when no API key is configured — uses scripted mock responses instead */
  private readonly mockMode: boolean;

  constructor(
    private willsService: WillsService,
    @InjectRepository(ChatMessage)
    private chatRepo: Repository<ChatMessage>,
    @Inject('ANTHROPIC_CLIENT')
    private anthropic: Anthropic,
    private configService: ConfigService,
  ) {
    const key = this.configService.get<string>('ANTHROPIC_API_KEY') || '';
    this.mockMode = !key || key.includes('your-key-here');
    if (this.mockMode) {
      console.warn('[InterviewService] MOCK MODE — no ANTHROPIC_API_KEY set. AI responses are scripted.');
    }
  }

  /** Pick next mock response based on how many messages exist */
  private async getMockReply(willId: string): Promise<string> {
    const count = await this.chatRepo.count({ where: { willId } });
    return MOCK_RESPONSES[Math.min(count, MOCK_RESPONSES.length - 1)];
  }

  async sendMessage(willId: string, userMessage: string): Promise<SendMessageResult> {
    const will = await this.willsService.getWillFull(willId);

    // ── MOCK MODE ────────────────────────────────────────────────────────────
    if (this.mockMode) {
      await this.chatRepo.save(
        this.chatRepo.create({ willId, role: MessageRole.USER, content: userMessage }),
      );
      const reply = await this.getMockReply(willId);
      await this.chatRepo.save(
        this.chatRepo.create({ willId, role: MessageRole.ASSISTANT, content: reply }),
      );
      return { reply, willStatus: will.status };
    }
    // ─────────────────────────────────────────────────────────────────────────

    // 1. Persist user message
    await this.chatRepo.save(
      this.chatRepo.create({ willId, role: MessageRole.USER, content: userMessage }),
    );

    // 2. Extract facts from this message and persist to DB
    await this.extractAndPersist(willId, userMessage, will);

    // 3. Reload will with updated data for fresh summary
    const updatedWill = await this.willsService.getWillFull(willId);
    const summary = this.buildWillSummary(updatedWill);
    await this.willsService.updateWillSummary(willId, summary);

    // 4. Fetch context window (last N messages)
    const recentMessages = await this.chatRepo.find({
      where: { willId },
      order: { createdAt: 'ASC' },
    });
    const contextMessages = this.buildContextMessages(recentMessages);

    // 5. Generate next interviewer question
    const systemWithSummary = SYSTEM_PROMPT.replace(
      '{{WILL_SUMMARY}}',
      JSON.stringify(summary, null, 2),
    );

    const response = await this.anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022', // Haiku for speed + cost on interview turns
      max_tokens: 512,
      system: systemWithSummary,
      messages: contextMessages,
    });

    const reply = response.content
      .filter((block) => block.type === 'text')
      .map((block: any) => block.text)
      .join('');

    // 6. Persist assistant reply
    await this.chatRepo.save(
      this.chatRepo.create({ willId, role: MessageRole.ASSISTANT, content: reply }),
    );

    return { reply, willStatus: updatedWill.status };
  }

  /**
   * Streaming variant for Part 8 — returns an async iterable of text chunks.
   * The caller is responsible for flushing these as SSE events.
   */
  async *streamMessage(willId: string, userMessage: string): AsyncIterable<string> {
    const will = await this.willsService.getWillFull(willId);

    // ── MOCK MODE ────────────────────────────────────────────────────────────
    if (this.mockMode) {
      await this.chatRepo.save(
        this.chatRepo.create({ willId, role: MessageRole.USER, content: userMessage }),
      );
      const reply = await this.getMockReply(willId);
      // Simulate streaming word by word
      for (const word of reply.split(' ')) {
        yield word + ' ';
        await new Promise((r) => setTimeout(r, 40));
      }
      await this.chatRepo.save(
        this.chatRepo.create({ willId, role: MessageRole.ASSISTANT, content: reply }),
      );
      return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    await this.chatRepo.save(
      this.chatRepo.create({ willId, role: MessageRole.USER, content: userMessage }),
    );

    await this.extractAndPersist(willId, userMessage, will);

    const updatedWill = await this.willsService.getWillFull(willId);
    const summary = this.buildWillSummary(updatedWill);
    await this.willsService.updateWillSummary(willId, summary);

    const recentMessages = await this.chatRepo.find({
      where: { willId },
      order: { createdAt: 'ASC' },
    });

    const systemWithSummary = SYSTEM_PROMPT.replace(
      '{{WILL_SUMMARY}}',
      JSON.stringify(summary, null, 2),
    );

    const stream = await this.anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 512,
      system: systemWithSummary,
      messages: this.buildContextMessages(recentMessages),
      stream: true,
    } as any);

    let fullReply = '';
    for await (const event of stream as any) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        fullReply += event.delta.text;
        yield event.delta.text;
      }
    }

    await this.chatRepo.save(
      this.chatRepo.create({ willId, role: MessageRole.ASSISTANT, content: fullReply }),
    );
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  /**
   * Runs a separate Claude call focused purely on extraction.
   * Uses tool_use to get structured output — avoids mixing "generate reply"
   * with "parse facts" in the same call (keeps each call focused + cheaper).
   */
  private async extractAndPersist(willId: string, userMessage: string, will: any): Promise<void> {
    try {
      const extractionResponse = await this.anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        system: EXTRACTION_SYSTEM,
        tools: [UPDATE_WILL_TOOL],
        tool_choice: { type: 'auto' },
        messages: [
          {
            role: 'user',
            content: `Current will state: ${JSON.stringify(will.willSummary || {})}\n\nUser just said: "${userMessage}"\n\nExtract any new will-related facts from this message.`,
          },
        ],
      });

      const toolUse = extractionResponse.content.find((b) => b.type === 'tool_use') as any;
      if (!toolUse) return;

      const extracted = toolUse.input;
      await this.applyExtraction(willId, extracted, will);
    } catch (err) {
      // Extraction failure is non-fatal — we log and continue
      console.error('[InterviewService] Extraction failed (non-fatal):', err?.message);
    }
  }

  private async applyExtraction(willId: string, extracted: any, will: any): Promise<void> {
    if (extracted.testator) {
      await this.willsService.upsertTestator(willId, {
        testatorName: extracted.testator.name,
        age: extracted.testator.age,
        address: extracted.testator.address,
        hasMinorChildren: extracted.testator.hasMinorChildren,
      });
    }

    if (extracted.executor) {
      await this.willsService.upsertExecutor(willId, extracted.executor);
    }

    if (extracted.guardian) {
      await this.willsService.upsertGuardian(willId, extracted.guardian);
    }

    if (extracted.beneficiaries?.length) {
      for (const b of extracted.beneficiaries) {
        // Only add if not already present (match by name)
        const exists = will.beneficiaries?.some(
          (existing: any) => existing.name.toLowerCase() === b.name.toLowerCase(),
        );
        if (!exists) {
          await this.willsService.addBeneficiary(willId, b);
        }
      }
    }

    if (extracted.assets?.length) {
      // Re-fetch beneficiaries to resolve names → IDs
      const freshWill = await this.willsService.getWillFull(willId);
      for (const asset of extracted.assets) {
        const shares = (asset.shares || []).map((s: any) => {
          const beneficiary = freshWill.beneficiaries.find(
            (b) => b.name.toLowerCase() === s.beneficiaryName.toLowerCase(),
          );
          return beneficiary ? { beneficiaryId: beneficiary.id, percentage: s.percentage } : null;
        }).filter(Boolean);

        if (shares.length > 0) {
          await this.willsService.addAssetWithShares(willId, {
            description: asset.description,
            type: asset.type,
          }, shares);
        }
      }
    }

    if (extracted.witnesses?.length) {
      await this.willsService.replaceWitnesses(willId, extracted.witnesses);
    }
  }

  /** Build a compact JSON summary of the current will state for the AI system prompt */
  private buildWillSummary(will: any): Record<string, any> {
    return {
      testator: will.testatorName ? {
        name: will.testatorName,
        age: will.age,
        address: will.address,
        hasMinorChildren: will.hasMinorChildren,
      } : null,
      executor: will.executor ? { name: will.executor.name, relationship: will.executor.relationship } : null,
      guardian: will.guardian ? { name: will.guardian.name, relationship: will.guardian.relationship } : null,
      beneficiaries: will.beneficiaries?.map((b: any) => ({
        id: b.id, name: b.name, relationship: b.relationship, notes: b.notes,
      })) || [],
      assets: will.assets?.map((a: any) => ({
        id: a.id,
        description: a.description,
        type: a.type,
        shares: a.shares?.map((s: any) => ({
          beneficiaryName: s.beneficiary?.name,
          percentage: Number(s.percentage),
        })) || [],
      })) || [],
      witnesses: will.witnesses?.map((w: any) => ({ name: w.name, relationship: w.relationship })) || [],
    };
  }

  /**
   * Generate the opening question without saving a user message.
   * Called by the /start endpoint so "begin the interview" never appears in chat.
   */
  async getOpeningMessage(willId: string): Promise<{ reply: string; willStatus: string }> {
    const will = await this.willsService.getWillFull(willId);

    // ── MOCK MODE ────────────────────────────────────────────────────────────
    if (this.mockMode) {
      const existing = await this.chatRepo.find({
        where: { willId },
        order: { createdAt: 'DESC' },
        take: 1,
      });
      if (existing.length && existing[0].role === MessageRole.ASSISTANT) {
        return { reply: existing[0].content, willStatus: will.status };
      }
      const reply = MOCK_RESPONSES[0];
      await this.chatRepo.save(
        this.chatRepo.create({ willId, role: MessageRole.ASSISTANT, content: reply }),
      );
      return { reply, willStatus: will.status };
    }
    // ─────────────────────────────────────────────────────────────────────────

    // If there are already messages, return the last assistant message (idempotent)
    const existing = await this.chatRepo.find({
      where: { willId },
      order: { createdAt: 'DESC' },
      take: 1,
    });
    if (existing.length && existing[0].role === MessageRole.ASSISTANT) {
      return { reply: existing[0].content, willStatus: will.status };
    }

    const summary = this.buildWillSummary(will);
    const systemWithSummary = SYSTEM_PROMPT.replace('{{WILL_SUMMARY}}', JSON.stringify(summary, null, 2));

    const response = await this.anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 256,
      system: systemWithSummary,
      messages: [{ role: 'user', content: 'Please begin the interview by greeting me and asking your first question.' }],
    });

    const reply = response.content
      .filter((b) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');

    await this.chatRepo.save(
      this.chatRepo.create({ willId, role: MessageRole.ASSISTANT, content: reply }),
    );

    return { reply, willStatus: will.status };
  }

  /** Sliding window: return the last MAX_CONTEXT_MESSAGES messages in Anthropic format */
  buildContextMessages(messages: ChatMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
    const windowed = messages.slice(-this.MAX_CONTEXT_MESSAGES);
    // Ensure the first message is from the user (Anthropic requirement)
    const firstUserIdx = windowed.findIndex((m) => m.role === MessageRole.USER);
    const trimmed = firstUserIdx >= 0 ? windowed.slice(firstUserIdx) : windowed;
    return trimmed.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  }
}
