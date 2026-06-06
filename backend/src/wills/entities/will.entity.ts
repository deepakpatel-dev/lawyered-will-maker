import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  OneToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { Beneficiary } from './beneficiary.entity';
import { Asset } from './asset.entity';
import { Executor } from './executor.entity';
import { Guardian } from './guardian.entity';
import { Witness } from './witness.entity';
import { ChatMessage } from './chat-message.entity';

/**
 * Three clearly-separated will states:
 *   INCOMPLETE – required fields still missing, user is still in interview
 *   INVALID    – all data collected but a hard rule fails (shares ≠ 100%, no executor, etc.)
 *   WARNING    – complete + valid but has soft warnings (witness is a beneficiary)
 *   VALID      – all checks pass, document can be generated
 */
export enum WillStatus {
  INCOMPLETE = 'incomplete',
  INVALID = 'invalid',
  WARNING = 'warning',
  VALID = 'valid',
}

@Entity('wills')
@Index(['userId'])
export class Will {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (user) => user.wills, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: WillStatus, default: WillStatus.INCOMPLETE })
  status: WillStatus;

  // Testator (the person making the will)
  @Column({ name: 'testator_name', nullable: true })
  testatorName: string;

  @Column({ nullable: true })
  age: number;

  @Column({ nullable: true })
  address: string;

  @Column({ name: 'has_minor_children', default: false })
  hasMinorChildren: boolean;

  /**
   * Structured snapshot of the will state — used as context for the AI.
   * Keeps track of what has been collected so far without re-reading all
   * relations from DB on every AI call.
   */
  @Column({ name: 'will_summary', type: 'jsonb', nullable: true })
  willSummary: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @OneToMany(() => Beneficiary, (b) => b.will, { cascade: true })
  beneficiaries: Beneficiary[];

  @OneToMany(() => Asset, (a) => a.will, { cascade: true })
  assets: Asset[];

  @OneToOne(() => Executor, (e) => e.will, { cascade: true })
  executor: Executor;

  @OneToOne(() => Guardian, (g) => g.will, { cascade: true })
  guardian: Guardian;

  @OneToMany(() => Witness, (w) => w.will, { cascade: true })
  witnesses: Witness[];

  @OneToMany(() => ChatMessage, (m) => m.will, { cascade: true })
  chatMessages: ChatMessage[];
}
