import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Check,
} from 'typeorm';
import { Asset } from './asset.entity';
import { Beneficiary } from './beneficiary.entity';

/**
 * Links an asset to a beneficiary with a percentage share.
 * The DB-level check ensures no single share exceeds 100%.
 * The application-level validity check (ValidityService) enforces
 * that all shares for a given asset sum to exactly 100%.
 */
@Entity('asset_shares')
@Check('"percentage" > 0 AND "percentage" <= 100')
export class AssetShare {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'asset_id' })
  assetId: string;

  @ManyToOne(() => Asset, (asset) => asset.shares, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'asset_id' })
  asset: Asset;

  @Column({ name: 'beneficiary_id' })
  beneficiaryId: string;

  @ManyToOne(() => Beneficiary, (b) => b.assetShares, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'beneficiary_id' })
  beneficiary: Beneficiary;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  percentage: number;
}
