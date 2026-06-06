import { Injectable, BadRequestException } from '@nestjs/common';
// pdfkit ships CommonJS — use require to avoid ES-module default import issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit');
import { Will, WillStatus } from '../wills/entities/will.entity';
import { ValidityService } from '../validity/validity.service';

@Injectable()
export class DocumentService {
  constructor(private validityService: ValidityService) {}

  /**
   * Generate a PDF buffer for a completed will.
   * Throws BadRequestException if validity checks do not pass.
   * Both VALID and WARNING states are allowed (warnings don't block generation).
   */
  async generatePdf(will: Will): Promise<Buffer> {
    const validation = this.validityService.validate(will);

    if (
      validation.status === WillStatus.INCOMPLETE ||
      validation.status === WillStatus.INVALID
    ) {
      throw new BadRequestException(
        `Cannot generate document: ${
          validation.incompleteFields.length
            ? `Missing fields: ${validation.incompleteFields.join(', ')}`
            : validation.errors.join('; ')
        }`,
      );
    }

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 60, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.buildDocument(doc, will, validation.warnings);
      doc.end();
    });
  }

  private buildDocument(doc: PDFKit.PDFDocument, will: Will, warnings: string[]): void {
    const today = new Date().toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    });

    // ── Header ─────────────────────────────────────────────────────────────
    doc
      .fontSize(22).font('Helvetica-Bold').text('LAST WILL AND TESTAMENT', { align: 'center' })
      .moveDown(0.5)
      .fontSize(11).font('Helvetica').text(`Prepared on ${today}`, { align: 'center' })
      .moveDown(1.5);

    this.divider(doc);

    // ── 1. Testator declaration ────────────────────────────────────────────
    doc
      .fontSize(13).font('Helvetica-Bold').text('1. DECLARATION')
      .moveDown(0.5)
      .fontSize(11).font('Helvetica')
      .text(
        `I, ${will.testatorName}, aged ${will.age} years, residing at ${will.address}, ` +
        `being of sound mind and memory and not acting under any undue influence or coercion, ` +
        `hereby declare this to be my Last Will and Testament.`,
        { lineGap: 4 },
      )
      .moveDown(1);

    // ── 2. Revocation ──────────────────────────────────────────────────────
    this.section(doc, '2. REVOCATION');
    doc
      .fontSize(11).font('Helvetica')
      .text(
        'I hereby revoke, cancel, and annul all former wills, codicils, and testamentary ' +
        'dispositions heretofore made by me.',
        { lineGap: 4 },
      )
      .moveDown(1);

    // ── 3. Assets and Beneficiaries ────────────────────────────────────────
    this.section(doc, '3. DISTRIBUTION OF ASSETS');
    doc.fontSize(11).font('Helvetica')
      .text('I give, bequeath, and devise my assets as follows:', { lineGap: 4 })
      .moveDown(0.5);

    for (const asset of will.assets || []) {
      doc.font('Helvetica-Bold').text(`• ${asset.description}`, { indent: 20 });
      for (const share of asset.shares || []) {
        const name = share.beneficiary?.name || 'Unknown';
        const rel = share.beneficiary ? '' : '';
        doc.font('Helvetica')
          .text(`  → ${name} (${share.beneficiary?.relationship || 'beneficiary'}): ${Number(share.percentage)}%`, {
            indent: 30, lineGap: 2,
          });
      }
      doc.moveDown(0.5);
    }
    doc.moveDown(0.5);

    // ── 4. Executor ────────────────────────────────────────────────────────
    this.section(doc, '4. EXECUTOR');
    doc.fontSize(11).font('Helvetica')
      .text(
        `I appoint ${will.executor?.name}` +
        (will.executor?.relationship ? ` (${will.executor.relationship})` : '') +
        ` as the Executor of this Will. The Executor shall have full authority to administer ` +
        `my estate in accordance with the provisions herein.`,
        { lineGap: 4 },
      )
      .moveDown(1);

    // ── 5. Guardian (conditional) ──────────────────────────────────────────
    if (will.hasMinorChildren && will.guardian) {
      this.section(doc, '5. GUARDIAN FOR MINOR CHILDREN');
      doc.fontSize(11).font('Helvetica')
        .text(
          `In the event of my death, I appoint ${will.guardian.name}` +
          (will.guardian.relationship ? ` (${will.guardian.relationship})` : '') +
          ` as the Guardian of my minor children.`,
          { lineGap: 4 },
        )
        .moveDown(1);
    }

    // ── 6. Witnesses ───────────────────────────────────────────────────────
    const witnessSection = will.hasMinorChildren && will.guardian ? '6' : '5';
    this.section(doc, `${witnessSection}. WITNESSES`);
    doc.fontSize(11).font('Helvetica')
      .text(
        'This Will is signed in the presence of the following witnesses, who attest that the ' +
        'testator appears to be of sound mind and is not under any undue influence:',
        { lineGap: 4 },
      )
      .moveDown(0.5);

    for (const witness of will.witnesses || []) {
      doc.text(`• ${witness.name}${witness.relationship ? ` (${witness.relationship})` : ''}`, {
        indent: 20, lineGap: 2,
      });
    }
    doc.moveDown(1);

    // ── Warnings notice (soft warnings rendered in document) ───────────────
    if (warnings.length > 0) {
      doc.rect(doc.x, doc.y, doc.page.width - 120, warnings.length * 28 + 16)
        .fillAndStroke('#FFF9C4', '#F9A825');
      doc.fillColor('black').fontSize(10).font('Helvetica-Bold')
        .text('Notice:', 70, doc.y + 8, { continued: true })
        .font('Helvetica').text(` ${warnings[0]}`);
      doc.moveDown(1);
    }

    // ── Signature block ────────────────────────────────────────────────────
    this.section(doc, 'SIGNATURE');
    doc.fontSize(11).font('Helvetica')
      .text(`Signed at _________________ on ${today}`)
      .moveDown(2);

    // Testator signature line
    doc.text('_______________________________       Date: _______________')
      .fontSize(10).text(`${will.testatorName} (Testator)`)
      .moveDown(2);

    // Witness signature lines
    for (let i = 0; i < (will.witnesses?.length || 0); i++) {
      const w = will.witnesses![i];
      doc.fontSize(11).text('_______________________________       Date: _______________')
        .fontSize(10).text(`${w.name} (Witness ${i + 1})`)
        .moveDown(2);
    }

    // ── Footer ─────────────────────────────────────────────────────────────
    doc.fontSize(8).fillColor('#888')
      .text(
        'This document was prepared using the Lawyered AI Will Maker. ' +
        'Please consult a qualified legal professional to ensure compliance with local laws.',
        { align: 'center' },
      );
  }

  private section(doc: PDFKit.PDFDocument, title: string): void {
    doc.fontSize(13).font('Helvetica-Bold').fillColor('black').text(title).moveDown(0.5);
  }

  private divider(doc: PDFKit.PDFDocument): void {
    doc
      .moveTo(60, doc.y)
      .lineTo(doc.page.width - 60, doc.y)
      .strokeColor('#ccc')
      .stroke()
      .moveDown(1);
  }
}
