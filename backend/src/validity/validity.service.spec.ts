/**
 * SPEC: ValidityService
 *
 * Three clearly-separated states:
 *   INCOMPLETE – required fields still missing
 *   INVALID    – hard rule fails (no executor, shares ≠ 100%, etc.)
 *   WARNING    – complete + valid but soft concern (witness is a beneficiary)
 *   VALID      – all checks pass, document can be generated
 *
 * Hard rules (block completion):
 *   1. Testator name, age, address must be set
 *   2. At least 1 asset must be listed
 *   3. At least 1 beneficiary must be listed
 *   4. Executor must be named
 *   5. Each asset's shares must sum to exactly 100%
 *   6. If hasMinorChildren is true, a guardian must be named
 *   7. At least 2 witnesses must be listed
 *
 * Soft rules (warnings, not hard stops):
 *   8. A witness should not also be a beneficiary
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ValidityService, ValidationResult } from './validity.service';
import { WillStatus } from '../wills/entities/will.entity';

function makeWill(overrides: Partial<any> = {}): any {
  return {
    testatorName: 'Rajesh Sharma',
    age: 52,
    address: '14, Patel Nagar, Pune',
    hasMinorChildren: false,
    beneficiaries: [{ id: 'b1', name: 'Sunita Sharma' }],
    assets: [
      {
        id: 'a1',
        description: 'House',
        shares: [{ beneficiaryId: 'b1', percentage: 100 }],
      },
    ],
    executor: { name: 'Vikram Sharma' },
    guardian: null,
    witnesses: [
      { name: 'Anil Mehta' },
      { name: 'Priya Desai' },
    ],
    ...overrides,
  };
}

describe('ValidityService', () => {
  let service: ValidityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ValidityService],
    }).compile();
    service = module.get<ValidityService>(ValidityService);
  });

  describe('INCOMPLETE state', () => {
    it('returns INCOMPLETE when testator name is missing', () => {
      const result = service.validate(makeWill({ testatorName: null }));
      expect(result.status).toBe(WillStatus.INCOMPLETE);
      expect(result.incompleteFields).toContain('testatorName');
    });

    it('returns INCOMPLETE when no assets', () => {
      const result = service.validate(makeWill({ assets: [] }));
      expect(result.status).toBe(WillStatus.INCOMPLETE);
    });

    it('returns INCOMPLETE when no beneficiaries', () => {
      const result = service.validate(makeWill({ beneficiaries: [] }));
      expect(result.status).toBe(WillStatus.INCOMPLETE);
    });

    it('returns INCOMPLETE when fewer than 2 witnesses', () => {
      const result = service.validate(makeWill({ witnesses: [{ name: 'Only One' }] }));
      expect(result.status).toBe(WillStatus.INCOMPLETE);
    });
  });

  describe('INVALID state', () => {
    it('returns INVALID when executor is missing', () => {
      const result = service.validate(makeWill({ executor: null }));
      expect(result.status).toBe(WillStatus.INVALID);
      expect(result.errors.some((e) => e.includes('executor'))).toBe(true);
    });

    it('returns INVALID when shares do not sum to 100%', () => {
      const will = makeWill({
        assets: [
          {
            id: 'a1',
            description: 'House',
            shares: [
              { beneficiaryId: 'b1', percentage: 60 },
              { beneficiaryId: 'b2', percentage: 30 }, // only 90%
            ],
          },
        ],
      });
      const result = service.validate(will);
      expect(result.status).toBe(WillStatus.INVALID);
      expect(result.errors.some((e) => e.includes('100%'))).toBe(true);
    });

    it('returns INVALID when hasMinorChildren is true but no guardian', () => {
      const result = service.validate(
        makeWill({ hasMinorChildren: true, guardian: null }),
      );
      expect(result.status).toBe(WillStatus.INVALID);
      expect(result.errors.some((e) => e.includes('guardian'))).toBe(true);
    });
  });

  describe('WARNING state', () => {
    it('returns WARNING (not INVALID) when a witness is also a beneficiary', () => {
      const will = makeWill({
        witnesses: [{ name: 'Sunita Sharma' }, { name: 'Anil Mehta' }],
        // Sunita is both witness and beneficiary — soft warning
      });
      const result = service.validate(will);
      expect(result.status).toBe(WillStatus.WARNING);
      expect(result.warnings.some((w) => w.includes('Sunita Sharma'))).toBe(true);
    });
  });

  describe('VALID state', () => {
    it('returns VALID for a fully complete, clean will', () => {
      const result = service.validate(makeWill());
      expect(result.status).toBe(WillStatus.VALID);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('guardian is not required when hasMinorChildren is false', () => {
      const result = service.validate(makeWill({ hasMinorChildren: false, guardian: null }));
      expect(result.status).toBe(WillStatus.VALID);
    });
  });
});
