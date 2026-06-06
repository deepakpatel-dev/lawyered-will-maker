import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Will } from './will.entity';
import { AssetShare } from './asset-share.entity';

export enum AssetType {
  PROPERTY = 'property',
  BANK_ACCOUNT = 'bank_account',
  VEHICLE = 'vehicle',
  JEWELLERY = 'jewellery',
  INVESTMENT = 'investment',
  OTHER = 'other',
}

@Entity('assets')
export class Asset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'will_id' })
  willId: string;

  @ManyToOne(() => Will, (will) => will.assets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'will_id' })
  will: Will;

  @Column()
  description: string;

  @Column({ type: 'enum', enum: AssetType, default: AssetType.OTHER })
  type: AssetType;

  // Optional estimated value, not required for legal validity
  @Column({ name: 'estimated_value', type: 'decimal', nullable: true })
  estimatedValue: number;

  @OneToMany(() => AssetShare, (share) => share.asset, { cascade: true })
  shares: AssetShare[];
}
