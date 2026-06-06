'use client';

import type { Will, ValidationResult } from '@/types';

interface Props {
  will: Will;
  validation: ValidationResult | null;
}

export function WillPreview({ will, validation }: Props) {
  const statusColor = {
    incomplete: 'text-gray-400',
    invalid: 'text-red-500',
    warning: 'text-yellow-600',
    valid: 'text-green-600',
  };

  const statusLabel = {
    incomplete: 'In progress',
    invalid: 'Has issues',
    warning: 'Complete (with warnings)',
    valid: 'Ready to download',
  };

  return (
    <div className="p-6 space-y-5">
      {/* Status badge */}
      {validation && (
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Will Preview</h2>
          <span className={`text-xs font-medium ${statusColor[validation.status]}`}>
            {statusLabel[validation.status]}
          </span>
        </div>
      )}

      {/* Progress */}
      {validation && (
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Completion</span>
            <span>{validation.completionScore}/{validation.completionMax} sections</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                validation.status === 'valid' ? 'bg-green-500' :
                validation.status === 'warning' ? 'bg-yellow-400' :
                validation.status === 'invalid' ? 'bg-red-400' :
                'bg-blue-400'
              }`}
              style={{ width: `${(validation.completionScore / validation.completionMax) * 100}%` }}
            />
          </div>
        </div>
      )}

      <hr className="border-gray-100" />

      {/* Testator */}
      <Section title="The Person">
        {will.testatorName ? (
          <div className="space-y-1 text-sm">
            <Row label="Full name" value={will.testatorName} />
            <Row label="Age" value={will.age ? `${will.age} years` : undefined} />
            <Row label="Address" value={will.address} />
          </div>
        ) : (
          <Empty text="Name, age, and address not yet collected" />
        )}
      </Section>

      {/* Assets */}
      <Section title="Assets">
        {will.assets.length > 0 ? (
          <div className="space-y-3">
            {will.assets.map((asset) => (
              <div key={asset.id} className="text-sm">
                <div className="font-medium text-gray-800">{asset.description}</div>
                {asset.shares.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {asset.shares.map((share) => (
                      <div key={share.id} className="text-xs text-gray-500 flex justify-between pl-2">
                        <span>{share.beneficiary?.name || 'Unknown'}</span>
                        <span className="text-gray-700 font-medium">{Number(share.percentage)}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty text="No assets listed yet" />
        )}
      </Section>

      {/* Beneficiaries */}
      <Section title="Beneficiaries">
        {will.beneficiaries.length > 0 ? (
          <div className="space-y-1">
            {will.beneficiaries.map((b) => (
              <div key={b.id} className="text-sm flex justify-between">
                <span className="text-gray-800">{b.name}</span>
                <span className="text-gray-400 text-xs">{b.relationship}</span>
              </div>
            ))}
          </div>
        ) : (
          <Empty text="No beneficiaries listed yet" />
        )}
      </Section>

      {/* Executor */}
      <Section title="Executor">
        {will.executor ? (
          <div className="text-sm">
            <span className="text-gray-800">{will.executor.name}</span>
            {will.executor.relationship && (
              <span className="text-gray-400 ml-2 text-xs">({will.executor.relationship})</span>
            )}
          </div>
        ) : (
          <Empty text="Executor not named yet" />
        )}
      </Section>

      {/* Guardian */}
      {will.hasMinorChildren && (
        <Section title="Guardian">
          {will.guardian ? (
            <div className="text-sm">
              <span className="text-gray-800">{will.guardian.name}</span>
              {will.guardian.relationship && (
                <span className="text-gray-400 ml-2 text-xs">({will.guardian.relationship})</span>
              )}
            </div>
          ) : (
            <Empty text="Guardian not named yet (required — you have minor children)" alert />
          )}
        </Section>
      )}

      {/* Witnesses */}
      <Section title={`Witnesses (${will.witnesses.length}/2 minimum)`}>
        {will.witnesses.length > 0 ? (
          <div className="space-y-1">
            {will.witnesses.map((w) => (
              <div key={w.id} className="text-sm flex justify-between">
                <span className="text-gray-800">{w.name}</span>
                <span className="text-gray-400 text-xs">{w.relationship}</span>
              </div>
            ))}
          </div>
        ) : (
          <Empty text="Witnesses not yet named" />
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-800 font-medium text-right">{value || '—'}</span>
    </div>
  );
}

function Empty({ text, alert }: { text: string; alert?: boolean }) {
  return (
    <p className={`text-xs italic ${alert ? 'text-red-400' : 'text-gray-300'}`}>{text}</p>
  );
}
