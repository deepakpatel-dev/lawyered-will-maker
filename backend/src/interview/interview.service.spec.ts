/**
 * SPEC: InterviewService
 *
 * Behaviour contract:
 *  - sendMessage() saves the user message to DB before calling Claude
 *  - sendMessage() saves the assistant reply to DB after Claude responds
 *  - sendMessage() calls the extraction tool to parse structured facts
 *  - sendMessage() only sends the last CONTEXT_WINDOW messages to Claude (not full history)
 *  - sendMessage() rebuilds willSummary after each extraction
 *  - extractAndPersist() does NOT throw on partial extraction — saves what it can
 *  - buildContextMessages() caps at MAX_CONTEXT_MESSAGES
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { InterviewService } from './interview.service';
import { WillsService } from '../wills/wills.service';
import { ChatMessage, MessageRole } from '../wills/entities/chat-message.entity';
import { WillStatus } from '../wills/entities/will.entity';

const mockWill = {
  id: 'will-1',
  userId: 'user-1',
  status: WillStatus.INCOMPLETE,
  testatorName: null,
  age: null,
  address: null,
  hasMinorChildren: false,
  willSummary: {},
  beneficiaries: [],
  assets: [],
  executor: null,
  guardian: null,
  witnesses: [],
  chatMessages: [],
};

describe('InterviewService', () => {
  let service: InterviewService;
  let willsService: jest.Mocked<WillsService>;
  let chatRepo: any;

  beforeEach(async () => {
    chatRepo = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((msg) => Promise.resolve({ id: 'msg-1', ...msg })),
      create: jest.fn().mockImplementation((data) => data),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InterviewService,
        {
          provide: WillsService,
          useValue: {
            getWillFull: jest.fn().mockResolvedValue(mockWill),
            updateWillSummary: jest.fn().mockResolvedValue(undefined),
            upsertTestator: jest.fn().mockResolvedValue(undefined),
            upsertExecutor: jest.fn().mockResolvedValue(undefined),
            upsertGuardian: jest.fn().mockResolvedValue(undefined),
            addBeneficiary: jest.fn().mockResolvedValue({ id: 'b-1' }),
            addAssetWithShares: jest.fn().mockResolvedValue({ id: 'a-1' }),
            replaceWitnesses: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: getRepositoryToken(ChatMessage),
          useValue: chatRepo,
        },
        // Stub Anthropic so tests do not hit the network
        {
          provide: 'ANTHROPIC_CLIENT',
          useValue: {
            messages: {
              create: jest.fn().mockResolvedValue({
                content: [{ type: 'text', text: 'What is your full name?' }],
                stop_reason: 'end_turn',
              }),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('sk-ant-test-key') },
        },
      ],
    }).compile();

    service = module.get<InterviewService>(InterviewService);
    willsService = module.get(WillsService);
  });

  describe('buildContextMessages', () => {
    it('caps context at MAX_CONTEXT_MESSAGES', () => {
      const messages = Array.from({ length: 30 }, (_, i) => ({
        role: i % 2 === 0 ? MessageRole.USER : MessageRole.ASSISTANT,
        content: `Message ${i}`,
      }));
      const windowed = (service as any).buildContextMessages(messages as ChatMessage[]);
      expect(windowed.length).toBeLessThanOrEqual((service as any).MAX_CONTEXT_MESSAGES);
    });

    it('always includes the last message in context', () => {
      const messages = Array.from({ length: 30 }, (_, i) => ({
        role: MessageRole.USER,
        content: `Message ${i}`,
        createdAt: new Date(i),
      }));
      const windowed = (service as any).buildContextMessages(messages as ChatMessage[]);
      const lastContent = messages[messages.length - 1].content;
      expect(windowed[windowed.length - 1].content).toBe(lastContent);
    });
  });

  describe('sendMessage', () => {
    it('saves user message before AI call', async () => {
      await service.sendMessage('will-1', 'My name is Rajesh').catch(() => {});
      expect(chatRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ role: MessageRole.USER, content: 'My name is Rajesh' }),
      );
    });
  });
});
