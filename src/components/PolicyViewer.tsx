import React, { useState, useEffect } from 'react';

export const PolicyViewer: React.FC = () => {
  const [policyText, setPolicyText] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/policy')
      .then(res => res.json())
      .then(json => {
        setPolicyText(json.policyText || '');
        setIsLoading(false);
      })
      .catch(err => {
        console.error(err);
        setIsLoading(false);
      });
  }, []);

  const clauses = [
    {
      num: 'Clause 1',
      title: 'Room Rent & Boarding Sub-Limit',
      badge: '₹5,000/day limit',
      icon: 'fa-hotel',
      desc: 'Standard room rent admissible up to ₹5,000 per day; ICU charges capped at ₹10,000 per day. Excess room tariffs are non-payable and incur proportionate deductions.',
    },
    {
      num: 'Clause 2',
      title: 'ICU Clinical Justification',
      badge: 'Physician Progress Note',
      icon: 'fa-bed-pulse',
      desc: 'All billed ICU days require documented evidence of acute physiological instability (e.g., inotropes, ventilator, invasive monitoring) in clinical notes.',
    },
    {
      num: 'Clause 3',
      title: 'Diagnostic Concordance',
      badge: 'Clinical Evidence',
      icon: 'fa-heart-pulse',
      desc: 'Every billed ICD-10 diagnosis must be supported by laboratory tests, imaging, or definitive doctor discharge summary diagnoses. Ruled-out diagnoses cannot be billed.',
    },
    {
      num: 'Clause 4',
      title: 'General Exclusions',
      badge: 'Aesthetic / Cosmetic',
      icon: 'fa-ban',
      desc: 'Elective aesthetic procedures, cosmetic rhinoplasty, and over-the-counter wellness supplements are strictly non-covered unless secondary to acute trauma.',
    },
    {
      num: 'Clause 5',
      title: 'Duplicate Charges & Bundling',
      badge: 'Inadmissible',
      icon: 'fa-clone',
      desc: 'Repeated charges for identical procedures, radiological scans, or laboratory investigations on the same date/timestamp are disallowed.',
    },
    {
      num: 'Clause 6',
      title: 'Mandatory Submission Documents',
      badge: 'Submission Gate',
      icon: 'fa-file-shield',
      desc: 'Signed discharge summary, itemized bill, Navjeevan Demo TPA pre-authorization letter, and diagnostic investigation reports are mandatory for claim adjudication.',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-shield-halved text-[#0B7A70] text-lg"></i>
          <h1 className="text-xl font-bold text-slate-900 font-display">
            Navjeevan Demo TPA / Indian Health Insurance Policy Clauses
          </h1>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Standard Inpatient Health Insurance Policy rules enforced by the ClaimSure pre-submission audit gate.
        </p>
      </div>

      {/* Key Policy Highlights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clauses.map((c, i) => (
          <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-[#0B7A70]">{c.num}</span>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-700 rounded border border-slate-200">
                {c.badge}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <i className={`fa-solid ${c.icon} text-slate-500 text-xs`}></i>
              <h3 className="font-bold text-slate-900 text-sm">{c.title}</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">{c.desc}</p>
          </div>
        ))}
      </div>

      {/* Full Policy Text Inspector */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 font-display">
            Full Policy Contract Text (/data/policy.txt)
          </h2>
          <span className="text-xs text-slate-400 font-mono">Verbatim Contract Reference</span>
        </div>

        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs leading-relaxed text-slate-800 whitespace-pre-wrap max-h-96 overflow-y-auto">
          {isLoading ? 'Loading policy text...' : policyText}
        </div>
      </div>
    </div>
  );
};
