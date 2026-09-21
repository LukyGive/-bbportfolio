import type { PackStat } from '@/lib/packs/types';

export function PackStats({ stats }: { stats: PackStat[] }) {
  return (
    <div className="pack-stats" aria-label="Pack statistics">
      {stats.map((stat, index) => (
        <div className="pack-stat" key={`${stat.label}-${index}`}>
          <strong>{stat.count}</strong>
          <span>{stat.label}</span>
        </div>
      ))}
    </div>
  );
}
