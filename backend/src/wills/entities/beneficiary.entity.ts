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

@Entity('beneficiaries')
export class Beneficiary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'will_id' })
  willId: string;

  @ManyToOne(() => Will, (will) => will.beneficiaries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'will_id' })
  will: Will;

  @Column()
  name: string;

  @Column({ nullable: true })
  relationship: string;

  // Disambiguator for people with the same name (e.g., two sons named Rahul)
  @Column({ nullable: true })
  notes: string;

  @OneToMany(() => AssetShare, (share) => share.beneficiary)
  assetShares: AssetShare[];
}
