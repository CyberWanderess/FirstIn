'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type VisaStatus = 'need_h1b' | 'no_need' | 'skip';
type RuleTemplate = 'basic' | 'swe' | 'pm' | 'ds';

const STEPS = ['Visa Status', 'Resume', 'Filter Rules'] as const;

const TEMPLATE_INFO: { id: RuleTemplate; label: string; description: string }[] = [
  { id: 'basic', label: 'Basic Filters (Recommended)', description: 'Exclude junior/intern, part-time/temporary roles. Flag contract positions.' },
  { id: 'swe', label: 'Software Engineering', description: 'Focus on engineering roles: engineer, developer, architect, SRE, DevOps, platform.' },
  { id: 'pm', label: 'Program / Product Management', description: 'Focus on PM roles: program manager, project manager, product manager, PMO, scrum master.' },
  { id: 'ds', label: 'Data Science / ML', description: 'Focus on data roles: data scientist, ML engineer, data engineer, analytics, AI researcher.' },
];

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Visa
  const [visaStatus, setVisaStatus] = useState<VisaStatus>('skip');

  // Step 2: Resume
  const [resumeText, setResumeText] = useState('');

  // Step 3: Rules
  const [selectedTemplates, setSelectedTemplates] = useState<Set<RuleTemplate>>(new Set(['basic']));
  const [salaryFloor, setSalaryFloor] = useState('');

  function toggleTemplate(id: RuleTemplate) {
    setSelectedTemplates((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleNext() {
    if (step < STEPS.length - 1) setStep(step + 1);
  }

  function handleBack() {
    if (step > 0) setStep(step - 1);
  }

  async function handleFinish() {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visa_status: visaStatus,
          resume_text: resumeText,
          rule_templates: Array.from(selectedTemplates),
          salary_floor: salaryFloor ? parseInt(salaryFloor, 10) : null,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Setup failed');
      router.push('/');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">Welcome to JobHQ</h1>
      <p className="text-sm text-zinc-500 mb-8">Let&apos;s configure a few things to get started. You can change these later in Settings.</p>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                i < step ? 'bg-green-500 text-white'
                : i === step ? 'bg-zinc-900 text-white'
                : 'bg-zinc-200 text-zinc-500'
              }`}
            >
              {i < step ? '\u2713' : i + 1}
            </div>
            <span className={`text-sm ${i === step ? 'font-medium text-zinc-900' : 'text-zinc-400'}`}>
              {label}
            </span>
            {i < STEPS.length - 1 && <div className="w-8 h-px bg-zinc-300" />}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="bg-white border border-zinc-200 rounded-lg p-6 space-y-4 min-h-[300px]">
        {step === 0 && (
          <>
            <h2 className="text-lg font-semibold text-zinc-900">Do you need H1B visa sponsorship?</h2>
            <p className="text-sm text-zinc-500">
              This determines how JobHQ handles companies that don&apos;t sponsor H1B visas.
            </p>
            <div className="space-y-3 pt-2">
              <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-zinc-50 transition-colors">
                <input
                  type="radio"
                  name="visa"
                  checked={visaStatus === 'need_h1b'}
                  onChange={() => setVisaStatus('need_h1b')}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-medium text-zinc-900 text-sm">Yes, I need H1B sponsorship</div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    Companies and jobs without visa sponsorship will be automatically excluded.
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-zinc-50 transition-colors">
                <input
                  type="radio"
                  name="visa"
                  checked={visaStatus === 'no_need'}
                  onChange={() => setVisaStatus('no_need')}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-medium text-zinc-900 text-sm">No, I don&apos;t need sponsorship</div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    US citizen or green card holder. Visa info will be shown as a warning only.
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-zinc-50 transition-colors">
                <input
                  type="radio"
                  name="visa"
                  checked={visaStatus === 'skip'}
                  onChange={() => setVisaStatus('skip')}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-medium text-zinc-900 text-sm">Skip for now</div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    You can configure this later in Settings.
                  </div>
                </div>
              </label>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="text-lg font-semibold text-zinc-900">Paste your resume</h2>
            <p className="text-sm text-zinc-500">
              Your resume is used for AI deep analysis to match job descriptions against your experience. You can skip this and add it later in Settings.
            </p>
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              rows={12}
              className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm text-zinc-900 font-mono resize-y"
              placeholder="Paste your resume text here..."
            />
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-lg font-semibold text-zinc-900">Choose filter rule templates</h2>
            <p className="text-sm text-zinc-500">
              Select one or more templates to create initial filter rules. You can customize them later on the Rules page.
            </p>
            <div className="space-y-2 pt-1">
              {TEMPLATE_INFO.map((t) => (
                <label
                  key={t.id}
                  className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-zinc-50 transition-colors ${
                    selectedTemplates.has(t.id) ? 'border-zinc-900 bg-zinc-50' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedTemplates.has(t.id)}
                    onChange={() => toggleTemplate(t.id)}
                    className="mt-0.5 rounded border-zinc-300"
                  />
                  <div>
                    <div className="font-medium text-zinc-900 text-sm">{t.label}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{t.description}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="pt-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Minimum salary (optional)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-500">$</span>
                <input
                  type="number"
                  value={salaryFloor}
                  onChange={(e) => setSalaryFloor(e.target.value)}
                  placeholder="e.g. 150000"
                  className="border border-zinc-300 rounded-md px-3 py-1.5 text-sm w-40"
                />
                <span className="text-xs text-zinc-400">annual, USD</span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                Jobs with max salary below this will be excluded.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        <button
          onClick={handleBack}
          disabled={step === 0}
          className="px-4 py-2 text-sm font-medium border border-zinc-300 rounded-md hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Back
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
          >
            Skip Setup
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={handleNext}
              className="px-6 py-2 text-sm font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 transition-colors"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={saving}
              className="px-6 py-2 text-sm font-medium bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Finish Setup'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
