export interface User {
  id: string;
  email: string;
}

export type WillStatus = 'incomplete' | 'invalid' | 'warning' | 'valid';

export interface Beneficiary {
  id: string;
  name: string;
  relationship?: string;
}

export interface AssetShare {
  id: string;
  beneficiaryId: string;
  beneficiary?: Beneficiary;
  percentage: number;
}

export interface Asset {
  id: string;
  description: string;
  type: string;
  shares: AssetShare[];
}

export interface Executor {
  id: string;
  name: string;
  relationship?: string;
}

export interface Guardian {
  id: string;
  name: string;
  relationship?: string;
}

export interface Witness {
  id: string;
  name: string;
  relationship?: string;
}

export interface Will {
  id: string;
  status: WillStatus;
  testatorName?: string;
  age?: number;
  address?: string;
  hasMinorChildren: boolean;
  beneficiaries: Beneficiary[];
  assets: Asset[];
  executor?: Executor;
  guardian?: Guardian;
  witnesses: Witness[];
}

export interface ValidationResult {
  status: WillStatus;
  incompleteFields: string[];
  errors: string[];
  warnings: string[];
  completionScore: number;
  completionMax: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  id?: string;
}
