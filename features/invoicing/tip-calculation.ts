import { InvalidTipDistributionError } from "./errors";

export type TipMode = "fixed" | "percent";
export type TipBase = "pre_tax" | "post_tax";
export type TipDistribution = "proportional" | "equal" | "manual";

// Same convention as features/taxes/repository.ts: public input is a human
// percentage (15), not an internal micros representation.
const MICROS_PER_PERCENT = 10_000;

/**
 * Resolves a fixed amount or a percentage (of the pre-tax subtotal or the
 * post-tax total) into a single tip total in cents. Pure — doesn't know
 * about lines or employees; see prorateTip for the distribution step.
 */
export function computeTipTotalCents(params: {
  mode: TipMode;
  amountCents?: number;
  percent?: number;
  base: TipBase;
  subtotalCents: number;
  taxTotalCents: number;
}): number {
  if (params.mode === "fixed") {
    return Math.max(0, params.amountCents ?? 0);
  }

  const baseCents =
    params.base === "pre_tax" ? params.subtotalCents : params.subtotalCents + params.taxTotalCents;
  const percentMicros = Math.round((params.percent ?? 0) * MICROS_PER_PERCENT);
  return Math.round((baseCents * percentMicros) / 1_000_000);
}

export interface TipEligibleLine {
  lineId: string;
  employeeId: string;
  valueCents: number; // this line's subtotalCents — the proration weight
}

export interface ManualTipAmount {
  employeeId: string;
  amountCents: number;
}

export interface LineTipResult {
  lineId: string;
  tipCents: number;
}

/**
 * Distributes a tip total across eligible lines (service lines with an
 * assigned employee — callers filter that before calling this). Always
 * two steps: compute each EMPLOYEE's share first (per requis doc 4.6's own
 * formula, and the equal/manual modes are naturally per-employee too), then
 * sub-divide that employee's share across their own lines by relative value
 * — needed because our schema stores tip per line, not per employee, and an
 * employee can have more than one line on the same invoice.
 *
 * Every rounding step lets the LAST share (employee, then line) absorb
 * whatever's left, so the parts always sum to exactly the whole — never a
 * cent gained or lost to rounding.
 */
export function prorateTip(
  tipTotalCents: number,
  eligibleLines: TipEligibleLine[],
  distribution: TipDistribution,
  manualAmounts?: ManualTipAmount[]
): LineTipResult[] {
  if (eligibleLines.length === 0) {
    return [];
  }

  const employeeIds = [...new Set(eligibleLines.map((line) => line.employeeId))];
  const employeeShares = computeEmployeeShares(
    tipTotalCents,
    eligibleLines,
    employeeIds,
    distribution,
    manualAmounts
  );

  const results: LineTipResult[] = [];
  for (const employeeId of employeeIds) {
    const employeeLines = eligibleLines.filter((line) => line.employeeId === employeeId);
    const employeeShareCents = employeeShares.get(employeeId) ?? 0;
    const employeeValueCents = employeeLines.reduce((sum, line) => sum + line.valueCents, 0);

    let distributed = 0;
    employeeLines.forEach((line, index) => {
      const isLast = index === employeeLines.length - 1;
      const lineShare = isLast
        ? employeeShareCents - distributed
        : employeeValueCents > 0
          ? Math.round((employeeShareCents * line.valueCents) / employeeValueCents)
          : 0;
      distributed += lineShare;
      results.push({ lineId: line.lineId, tipCents: lineShare });
    });
  }

  return results;
}

function computeEmployeeShares(
  tipTotalCents: number,
  eligibleLines: TipEligibleLine[],
  employeeIds: string[],
  distribution: TipDistribution,
  manualAmounts?: ManualTipAmount[]
): Map<string, number> {
  if (distribution === "manual") {
    return resolveManualShares(tipTotalCents, employeeIds, manualAmounts);
  }

  if (distribution === "equal") {
    return distributeEvenly(tipTotalCents, employeeIds, () => 1);
  }

  // proportional: weight = this employee's total line value
  const employeeValues = new Map<string, number>();
  for (const line of eligibleLines) {
    employeeValues.set(line.employeeId, (employeeValues.get(line.employeeId) ?? 0) + line.valueCents);
  }
  return distributeEvenly(tipTotalCents, employeeIds, (id) => employeeValues.get(id) ?? 0);
}

// Shared last-absorbs-the-remainder splitter, weighted by an arbitrary
// per-employee weight function (constant 1 for "equal", line value for
// "proportional").
function distributeEvenly(
  totalCents: number,
  employeeIds: string[],
  weightOf: (employeeId: string) => number
): Map<string, number> {
  const totalWeight = employeeIds.reduce((sum, id) => sum + weightOf(id), 0);

  const map = new Map<string, number>();
  let distributed = 0;
  employeeIds.forEach((id, index) => {
    const isLast = index === employeeIds.length - 1;
    const amount = isLast
      ? totalCents - distributed
      : totalWeight > 0
        ? Math.round((totalCents * weightOf(id)) / totalWeight)
        : 0;
    distributed += amount;
    map.set(id, amount);
  });
  return map;
}

function resolveManualShares(
  tipTotalCents: number,
  employeeIds: string[],
  manualAmounts?: ManualTipAmount[]
): Map<string, number> {
  if (!manualAmounts || manualAmounts.length === 0) {
    throw new InvalidTipDistributionError("manualAmounts is required when distribution is 'manual'");
  }

  const knownEmployeeIds = new Set(employeeIds);
  const map = new Map<string, number>();
  for (const entry of manualAmounts) {
    if (!knownEmployeeIds.has(entry.employeeId)) {
      throw new InvalidTipDistributionError(
        `employee ${entry.employeeId} is not assigned to any eligible line on this invoice`
      );
    }
    map.set(entry.employeeId, (map.get(entry.employeeId) ?? 0) + entry.amountCents);
  }

  const sum = [...map.values()].reduce((total, amount) => total + amount, 0);
  if (sum !== tipTotalCents) {
    throw new InvalidTipDistributionError(`manual amounts sum to ${sum} but the tip total is ${tipTotalCents}`);
  }

  for (const id of employeeIds) {
    if (!map.has(id)) {
      map.set(id, 0);
    }
  }
  return map;
}
