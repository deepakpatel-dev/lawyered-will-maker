import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Will } from './will.entity';

@Entity('witnesses')
export class Witness {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'will_id' })
  willId: string;

  @ManyToOne(() => Will, (will) => will.witnesses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'will_id' })
  will: Will;

  @Column()
  name: string;

  @Column({ nullable: true })
  relationship: string;
}
