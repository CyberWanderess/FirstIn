const TAG_CONFIG: Record<string, { label: string; color: string }> = {
  // Negative (red)
  downpay: { label: 'Downpay', color: 'bg-red-100 text-red-700' },
  down_level: { label: 'Down Level', color: 'bg-red-100 text-red-700' },
  skill_gap: { label: 'Skill Gap', color: 'bg-red-100 text-red-700' },
  // Domain gap (legacy)
  domain_gap: { label: 'Domain Gap', color: 'bg-zinc-100 text-zinc-600' },
  // Domain gap severity levels
  'domain_gap:minor': { label: 'Gap: Minor', color: 'bg-yellow-100 text-yellow-700' },
  'domain_gap:major': { label: 'Gap: Major', color: 'bg-orange-100 text-orange-700' },
  'domain_gap:blocker': { label: 'Gap: Blocker', color: 'bg-red-100 text-red-700' },
  exp_gap: { label: 'Exp Gap', color: 'bg-red-100 text-red-700' },
  // Positive (green)
  strong_match: { label: 'Strong Match', color: 'bg-green-100 text-green-700' },
  rare_opportunity: { label: 'Rare', color: 'bg-green-100 text-green-700' },
  // Risk (amber)
  cooldown_risk: { label: 'Cooldown Risk', color: 'bg-amber-100 text-amber-700' },
  overqualified: { label: 'Overqualified', color: 'bg-amber-100 text-amber-700' },
};

export function ExpandableReason({
  scoreReason,
  notes,
  scoreTags,
}: {
  scoreReason: string | null;
  notes: string | null;
  scoreTags: string[] | null;
}) {
  if (!scoreReason && !notes && (!scoreTags || scoreTags.length === 0)) {
    return <span className="text-zinc-400">--</span>;
  }

  return (
    <div className="space-y-1">
      {scoreTags && scoreTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {scoreTags.map((tag) => {
            const cfg = TAG_CONFIG[tag] || { label: tag, color: 'bg-zinc-100 text-zinc-600' };
            return (
              <span key={tag} className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cfg.color}`}>
                {cfg.label}
              </span>
            );
          })}
        </div>
      )}
      {scoreReason && (
        <div className="text-zinc-600 text-xs whitespace-pre-wrap">{scoreReason}</div>
      )}
      {notes && (
        <div className="text-zinc-400 text-xs whitespace-pre-wrap italic">{notes}</div>
      )}
    </div>
  );
}
