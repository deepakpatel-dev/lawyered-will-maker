/**
 * Database seed script
 * Creates:
 *  1. demo@lawyered.com / demo1234  (ready-to-use demo user)
 *  2. A fully completed will for that user (so reviewers can
 *     download a document without going through the interview)
 *
 * Run: npm run db:seed
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

import { User } from '../users/user.entity';
import { Will, WillStatus } from '../wills/entities/will.entity';
import { Beneficiary } from '../wills/entities/beneficiary.entity';
import { Asset, AssetType } from '../wills/entities/asset.entity';
import { AssetShare } from '../wills/entities/asset-share.entity';
import { Executor } from '../wills/entities/executor.entity';
import { Guardian } from '../wills/entities/guardian.entity';
import { Witness } from '../wills/entities/witness.entity';
import { ChatMessage, MessageRole } from '../wills/entities/chat-message.entity';

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [User, Will, Beneficiary, Asset, AssetShare, Executor, Guardian, Witness, ChatMessage],
  synchronize: true,
});

async function seed() {
  await dataSource.initialize();
  const em = dataSource.manager;

  // Clear existing demo data
  await em.delete(User, { email: 'demo@lawyered.com' });

  // 1. Demo user
  const passwordHash = await bcrypt.hash('demo1234', 12);
  const user = await em.save(em.create(User, {
    email: 'demo@lawyered.com',
    passwordHash,
  }));

  // 2. Create a completed will
  const will = await em.save(em.create(Will, {
    userId: user.id,
    status: WillStatus.VALID,
    testatorName: 'Rajesh Kumar Sharma',
    age: 52,
    address: '14, Patel Nagar, Pune, Maharashtra 411001',
    hasMinorChildren: true,
    willSummary: {
      testator: { name: 'Rajesh Kumar Sharma', age: 52, address: '14, Patel Nagar, Pune, Maharashtra 411001' },
      executor: { name: 'Vikram Sharma', relationship: 'Brother' },
      guardian: { name: 'Sunita Sharma', relationship: 'Wife' },
      witnesses: ['Anil Mehta', 'Priya Desai'],
      beneficiaries: ['Sunita Sharma (Wife)', 'Arjun Sharma (Son)', 'Priya Sharma (Daughter)'],
      assets: ['House at Pune', 'HDFC Bank Account', 'Maruti Swift Car'],
    },
  }));

  // 3. Beneficiaries
  const sunita = await em.save(em.create(Beneficiary, {
    willId: will.id, name: 'Sunita Sharma', relationship: 'Wife',
  }));
  const arjun = await em.save(em.create(Beneficiary, {
    willId: will.id, name: 'Arjun Sharma', relationship: 'Son', notes: 'Eldest son, age 16',
  }));
  const priya = await em.save(em.create(Beneficiary, {
    willId: will.id, name: 'Priya Sharma', relationship: 'Daughter', notes: 'Age 13',
  }));

  // 4. Assets with shares
  const house = await em.save(em.create(Asset, {
    willId: will.id,
    description: 'Residential house at 14, Patel Nagar, Pune',
    type: AssetType.PROPERTY,
    estimatedValue: 8500000,
  }));
  await em.save(em.create(AssetShare, { assetId: house.id, beneficiaryId: sunita.id, percentage: 50 }));
  await em.save(em.create(AssetShare, { assetId: house.id, beneficiaryId: arjun.id, percentage: 25 }));
  await em.save(em.create(AssetShare, { assetId: house.id, beneficiaryId: priya.id, percentage: 25 }));

  const bankAccount = await em.save(em.create(Asset, {
    willId: will.id,
    description: 'HDFC Bank Savings Account No. XXXX-1234',
    type: AssetType.BANK_ACCOUNT,
    estimatedValue: 1200000,
  }));
  await em.save(em.create(AssetShare, { assetId: bankAccount.id, beneficiaryId: sunita.id, percentage: 60 }));
  await em.save(em.create(AssetShare, { assetId: bankAccount.id, beneficiaryId: arjun.id, percentage: 20 }));
  await em.save(em.create(AssetShare, { assetId: bankAccount.id, beneficiaryId: priya.id, percentage: 20 }));

  const car = await em.save(em.create(Asset, {
    willId: will.id,
    description: 'Maruti Swift VXI (MH12-AB-1234)',
    type: AssetType.VEHICLE,
    estimatedValue: 600000,
  }));
  await em.save(em.create(AssetShare, { assetId: car.id, beneficiaryId: arjun.id, percentage: 100 }));

  // 5. Executor
  await em.save(em.create(Executor, {
    willId: will.id, name: 'Vikram Sharma', relationship: 'Brother',
  }));

  // 6. Guardian (needed because has_minor_children = true)
  await em.save(em.create(Guardian, {
    willId: will.id, name: 'Sunita Sharma', relationship: 'Wife',
  }));

  // 7. Witnesses (not beneficiaries — clean)
  await em.save(em.create(Witness, { willId: will.id, name: 'Anil Mehta', relationship: 'Neighbour' }));
  await em.save(em.create(Witness, { willId: will.id, name: 'Priya Desai', relationship: 'Colleague' }));

  // 8. Sample chat transcript
  const conversation = [
    { role: MessageRole.ASSISTANT, content: "Hello! I'm here to help you create your will. Let's start with the basics — could you tell me your full name?" },
    { role: MessageRole.USER, content: 'My name is Rajesh Kumar Sharma' },
    { role: MessageRole.ASSISTANT, content: "Thank you, Rajesh. How old are you?" },
    { role: MessageRole.USER, content: "I'm 52 years old" },
    { role: MessageRole.ASSISTANT, content: "And what is your current address?" },
    { role: MessageRole.USER, content: '14, Patel Nagar, Pune, Maharashtra 411001' },
    { role: MessageRole.ASSISTANT, content: "Do you have any children under 18?" },
    { role: MessageRole.USER, content: 'Yes, I have two — Arjun who is 16 and Priya who is 13' },
    { role: MessageRole.ASSISTANT, content: "Got it. Since you have minor children, we'll need to name a guardian. Who would you like to appoint as guardian for Arjun and Priya?" },
    { role: MessageRole.USER, content: 'My wife Sunita Sharma' },
  ];

  for (const msg of conversation) {
    await em.save(em.create(ChatMessage, { willId: will.id, ...msg }));
  }

  console.log('✅ Seed complete!');
  console.log('   Demo user: demo@lawyered.com / demo1234');
  console.log(`   Will ID: ${will.id}`);

  await dataSource.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
