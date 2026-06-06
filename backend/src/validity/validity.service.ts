import { Injectable } from '@nestjs/common';
import { Will, WillStatus } from '../wills/entities/will.entity';

export interface ValidationResult {
  status: WillStatus;
  /** Required fields not yet collected */
  incompleteFields: string[];
  /** Hard errors that make the will legally incomplete */
  errors: string[];
  /** Soft warnings — will can still be generated but user should be informed */
  warnings: string[];
  /** How many of the required sections are complete (0–7) for progress bar */
  completionScore: number;
  completionMax: number;
}

@Injectable()
export class ValidityService {
  /**
   * Validates a will and returns a rich result object.
   *
   * Decision logic (order matters):
   *   1. Check incomplete fields — if any required data is missing → INCOMPLETE
   *   2. Check hard errors — executor missing, shares ≠ 100%, guardian missing for minors → INVALID
   *   3. Check soft warnings — witness is a beneficiary → WARNING
   *   4. All clear → VALID
   *
   * Placing this logic in a dedicated service (rather than in the controller or
   * in the AI module) means: (a) it can be unit-tested without touching the DB,
   * and (b) the three states are expressed as explicit enum values, not magic strings.
   */
  validate(will: Partial<Will>): ValidationResult {
    const incompleteFields: string[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    // ── Section completion tracking (for progress bar) ─────────────────────
    let completionScore = 0;
    const completionMax = 7;

    // 1. Testator info
    if (!will.testatorName) incompleteFields.push('testatorName');
    if (!will.age) incompleteFields.push('age');
    if (!will.address) incompleteFields.push('address');
    if (will.testatorName && will.age && will.address) completionScore++;

    // 2. Assets
    const assets = will.assets || [];
    if (assets.length === 0) {
      incompleteFields.push('assets');
    } else {
      completionScore++;
    }

    // 3. Beneficiaries
    const beneficiaries = will.beneficiaries || [];
    if (beneficiaries.length === 0) {
      incompleteFields.push('beneficiaries');
    } else {
      completionScore++;
    }

    // 4. Executor — missing executor is a hard INVALID rule, not INCOMPLETE
    // (it's a legal requirement, not just a missing answer)
    if (will.executor) completionScore++;

    // 5. Guardian — only required if minor children; missing is INVALID not INCOMPLETE
    if (!will.hasMinorChildren || will.guardian) completionScore++;

    // 6. Witnesses (≥2)
    const witnesses = will.witnesses || [];
    if (witnesses.length < 2) {
      incompleteFields.push('witnesses (need at least 2)');
    } else {
      completionScore++;
    }

    // ── If anything is incomplete, return immediately ──────────────────────
    if (incompleteFields.length > 0) {
      return { status: WillStatus.INCOMPLETE, incompleteFields, errors, warnings, completionScore, completionMax };
    }

    // ── Hard rules ─────────────────────────────────────────────────────────

    // Executor must be named
    if (!will.executor?.name) {
      errors.push('An executor must be named');
    }

    // Shares for each asset must sum to exactly 100%
    for (const asset of assets) {
      const shares = asset.shares || [];
      const total = shares.reduce((sum: number, s: any) => sum + Number(s.percentage), 0);
      const rounded = Math.round(total * 100) / 100; // avoid float precision issues
      if (rounded !== 100) {
        errors.push(
          `Shares for "${asset.description}" add up to ${rounded}%, not 100%`,
        );
      }
    }

    // Guardian required if minor children
    if (will.hasMinorChildren && !will.guardian?.name) {
      errors.push('A guardian must be named because you have children under 18');
    }

    if (errors.length > 0) {
      return { status: WillStatus.INVALID, incompleteFields, errors, warnings, completionScore, completionMax };
    }

    // ── Soft warnings ──────────────────────────────────────────────────────
    const beneficiaryNames = new Set(
      beneficiaries.map((b: any) => b.name.toLowerCase()),
    );
    for (const witness of witnesses) {
      if (beneficiaryNames.has(witness.name.toLowerCase())) {
        warnings.push(
          `${witness.name} is listed as both a witness and a beneficiary. ` +
          `This may be challenged in court. Consider choosing a different witness.`,
        );
      }
    }

    if (warnings.length > 0) {
      completionScore = completionMax; // complete, just with warnings
      return { status: WillStatus.WARNING, incompleteFields, errors, warnings, completionScore, completionMax };
    }

    completionScore = completionMax;
    return { status: WillStatus.VALID, incompleteFields, errors, warnings, completionScore, completionMax };
  }
}
