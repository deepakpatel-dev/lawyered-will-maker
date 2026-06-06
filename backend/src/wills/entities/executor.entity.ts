import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Will } from './will.entity';

@Entity('executors')
export class Executor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'will_id' })
  willId: string;

  @OneToOne(() => Will, (will) => will.executor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'will_id' })
  will: Will;

  @Column()
  name: string;

  @Column({ nullable: true })
  relationship: string;

  @Column({ nullable: true })
  contact: string;
}
