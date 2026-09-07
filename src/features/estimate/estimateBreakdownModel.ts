import type { SavedCuttingJob } from '../library/models';
import type { Estimate } from './calculateEstimate';
import type { ProjectEstimate } from './calculateProjectEstimate';

export type EstimateBreakdownAmounts = Pick<Estimate, 'materialLengthM' | 'materialAreaM2' | 'materialCost' | 'constructionCost' | 'subtotal'>;

export type SubgroupEstimateBreakdown = {
  id: string;
  name: string;
  pieceCount: number;
  inputQuantity: number;
  siteCount?: number;
  amounts: EstimateBreakdownAmounts;
};

export type MajorGroupEstimateBreakdown = {
  id: string;
  label: string;
  pieceCount: number;
  inputQuantity: number;
  amounts: EstimateBreakdownAmounts;
  subgroups: SubgroupEstimateBreakdown[];
};

type MutableSubgroup = Omit<SubgroupEstimateBreakdown, 'siteCount'> & { siteCounts: Set<number> };
type MutableGroup = Omit<MajorGroupEstimateBreakdown, 'subgroups'> & { subgroups: Map<string, MutableSubgroup> };

const emptyAmounts = (): EstimateBreakdownAmounts => ({ materialLengthM: 0, materialAreaM2: 0, materialCost: 0, constructionCost: 0, subtotal: 0 });

function addAmounts(target: EstimateBreakdownAmounts, source: EstimateBreakdownAmounts): void {
  target.materialLengthM += source.materialLengthM;
  target.materialAreaM2 += source.materialAreaM2;
  target.materialCost += source.materialCost;
  target.constructionCost += source.constructionCost;
  target.subtotal += source.subtotal;
}

export function majorGroupEstimateLabel(groupId: string): string {
  const numericId = groupId.match(/(?:^|-)group-(\d+)(?:-|$)/)?.[1];
  return numericId ? `대그룹 ID ${numericId}` : `대그룹 ${groupId}`;
}

function normalizedGroupId(job: SavedCuttingJob): string {
  return job.groupId?.trim() || job.name.split(' · ')[0]?.trim() || '미분류';
}

/** Builds two-level estimate rows from independent and merged-roll source allocations. */
export function buildEstimateGroupBreakdown(estimate: Pick<ProjectEstimate, 'jobs' | 'mergedJobs'>): MajorGroupEstimateBreakdown[] {
  const sources = [
    ...estimate.jobs.map(({ job, estimate: amounts }) => ({ job, amounts })),
    ...estimate.mergedJobs.flatMap(({ sourceDetails }) => (sourceDetails ?? []).map(({ job, estimate: amounts }) => ({ job, amounts }))),
  ];
  const groups = new Map<string, MutableGroup>();

  sources.forEach(({ job, amounts }) => {
    const groupId = normalizedGroupId(job);
    const subgroupName = job.subgroupName?.trim() || '미분류';
    const group = groups.get(groupId) ?? {
      id: groupId,
      label: majorGroupEstimateLabel(groupId),
      pieceCount: 0,
      inputQuantity: 0,
      amounts: emptyAmounts(),
      subgroups: new Map<string, MutableSubgroup>(),
    };
    const subgroup = group.subgroups.get(subgroupName) ?? {
      id: `${groupId}::${subgroupName}`,
      name: subgroupName,
      pieceCount: 0,
      inputQuantity: 0,
      amounts: emptyAmounts(),
      siteCounts: new Set<number>(),
    };
    group.pieceCount += 1;
    group.inputQuantity += job.input.quantity;
    subgroup.pieceCount += 1;
    subgroup.inputQuantity += job.input.quantity;
    if (job.siteCount !== undefined) subgroup.siteCounts.add(job.siteCount);
    addAmounts(group.amounts, amounts);
    addAmounts(subgroup.amounts, amounts);
    group.subgroups.set(subgroupName, subgroup);
    groups.set(groupId, group);
  });

  return [...groups.values()].map((group) => ({
    id: group.id,
    label: group.label,
    pieceCount: group.pieceCount,
    inputQuantity: group.inputQuantity,
    amounts: group.amounts,
    subgroups: [...group.subgroups.values()].map(({ siteCounts, ...subgroup }) => ({
      ...subgroup,
      ...(siteCounts.size === 1 ? { siteCount: [...siteCounts][0] } : {}),
    })),
  }));
}
