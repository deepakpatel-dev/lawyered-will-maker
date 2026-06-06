import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Will, WillStatus } from './entities/will.entity';
import { Beneficiary } from './entities/beneficiary.entity';
import { Asset } from './entities/asset.entity';
import { AssetShare } from './entities/asset-share.entity';
import { Executor } from './entities/executor.entity';
import { Guardian } from './entities/guardian.entity';
import { Witness } from './entities/witness.entity';

@Injectable()
export class WillsService {
  constructor(
    @InjectRepository(Will) private willRepo: Repository<Will>,
    @InjectRepository(Beneficiary) private beneficiaryRepo: Repository<Beneficiary>,
    @InjectRepository(Asset) private assetRepo: Repository<Asset>,
    @InjectRepository(AssetShare) private shareRepo: Repository<AssetShare>,
    @InjectRepository(Executor) private executorRepo: Repository<Executor>,
    @InjectRepository(Guardian) private guardianRepo: Repository<Guardian>,
    @InjectRepository(Witness) private witnessRepo: Repository<Witness>,
  ) {}

  async createWill(userId: string): Promise<Will> {
    const will = this.willRepo.create({ userId, status: WillStatus.INCOMPLETE });
    return this.willRepo.save(will);
  }

  async getWill(willId: string, userId: string): Promise<Will> {
    const will = await this.willRepo.findOne({
      where: { id: willId, userId },
      relations: ['beneficiaries', 'assets', 'assets.shares', 'assets.shares.beneficiary',
                  'executor', 'guardian', 'witnesses'],
    });
    if (!will) throw new NotFoundException('Will not found');
    return will;
  }

  async getUserWills(userId: string): Promise<Will[]> {
    return this.willRepo.find({ where: { userId }, order: { updatedAt: 'DESC' } });
  }

  /** Full eager load used by interview + validity services */
  async getWillFull(willId: string): Promise<Will> {
    const will = await this.willRepo.findOne({
      where: { id: willId },
      relations: ['beneficiaries', 'assets', 'assets.shares', 'assets.shares.beneficiary',
                  'executor', 'guardian', 'witnesses', 'chatMessages'],
    });
    if (!will) throw new NotFoundException('Will not found');
    return will;
  }

  async updateWillSummary(willId: string, summary: Record<string, any>): Promise<void> {
    await this.willRepo.update(willId, { willSummary: summary });
  }

  async updateStatus(willId: string, status: WillStatus): Promise<void> {
    await this.willRepo.update(willId, { status });
  }

  async upsertTestator(willId: string, data: {
    testatorName?: string;
    age?: number;
    address?: string;
    hasMinorChildren?: boolean;
  }): Promise<void> {
    await this.willRepo.update(willId, data);
  }

  async upsertExecutor(willId: string, data: { name: string; relationship?: string }): Promise<Executor> {
    let executor = await this.executorRepo.findOne({ where: { willId } });
    if (executor) {
      Object.assign(executor, data);
      return this.executorRepo.save(executor);
    }
    return this.executorRepo.save(this.executorRepo.create({ willId, ...data }));
  }

  async upsertGuardian(willId: string, data: { name: string; relationship?: string }): Promise<Guardian> {
    let guardian = await this.guardianRepo.findOne({ where: { willId } });
    if (guardian) {
      Object.assign(guardian, data);
      return this.guardianRepo.save(guardian);
    }
    return this.guardianRepo.save(this.guardianRepo.create({ willId, ...data }));
  }

  async addBeneficiary(willId: string, data: { name: string; relationship?: string; notes?: string }): Promise<Beneficiary> {
    return this.beneficiaryRepo.save(this.beneficiaryRepo.create({ willId, ...data }));
  }

  async addAssetWithShares(willId: string, assetData: {
    description: string;
    type?: string;
    estimatedValue?: number;
  }, shares: Array<{ beneficiaryId: string; percentage: number }>): Promise<Asset> {
    const asset = (await this.assetRepo.save(this.assetRepo.create({ willId, ...assetData } as any))) as unknown as Asset;
    for (const share of shares) {
      await this.shareRepo.save(this.shareRepo.create({ assetId: asset.id, ...share }));
    }
    return asset;
  }

  async addWitness(willId: string, data: { name: string; relationship?: string }): Promise<Witness> {
    return this.witnessRepo.save(this.witnessRepo.create({ willId, ...data }));
  }

  async replaceWitnesses(willId: string, witnesses: Array<{ name: string; relationship?: string }>): Promise<void> {
    await this.witnessRepo.delete({ willId });
    for (const w of witnesses) {
      await this.witnessRepo.save(this.witnessRepo.create({ willId, ...w }));
    }
  }
}
