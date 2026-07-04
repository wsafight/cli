import React from "react";
import { Box, Text, useStdout } from "ink";
import type { LaunchOption } from "../../../clients";
import { getDisplayWidth, padToWidth } from "../../../utils/display-width";

const MAX_PER_LINE = 4;
const MIN_COLUMN_WIDTH = 16;
const GRID_PADDING = 12;

export interface ModelGrid {
  rows: string[][];
  flat: string[];
}

export interface GroupedModelGrid {
  groups: Array<{ family: string; rows: string[][] }>;
  flat: string[];
}

export function getGridColumnCountForLabels(labels: string[], terminalColumns: number): number {
  if (labels.length === 0) return 1;
  const maxWidth = Math.max(...labels.map((label) => getDisplayWidth(label)));
  const colWidth = Math.max(MIN_COLUMN_WIDTH, maxWidth + 4);
  const usable = Math.max(colWidth, terminalColumns - GRID_PADDING);
  return Math.max(1, Math.min(MAX_PER_LINE, labels.length, Math.floor(usable / colWidth)));
}

export function getGridColumnCountForOptions(
  options: LaunchOption[],
  terminalColumns: number,
  zh: boolean,
): number {
  const labels = options.map((opt) => opt.label[zh ? "zh" : "en"] || opt.label.en || opt.id);
  return getGridColumnCountForLabels(labels, terminalColumns);
}

export function buildGrid(ids: string[], columns: number): ModelGrid {
  const colCount = Math.max(1, Math.min(MAX_PER_LINE, Math.floor(columns) || 1));
  const rows: string[][] = [];
  for (let i = 0; i < ids.length; i += colCount) {
    rows.push(ids.slice(i, i + colCount));
  }
  return { rows, flat: rows.flat() };
}

function rawModelId(id: string): string {
  return id.startsWith("model-") ? id.slice(6) : id;
}

export function modelFamilyOf(id: string): string {
  const raw = rawModelId(id).toLowerCase();
  // "full-" / "满血-" 是变体修饰词，不是厂商。不剥掉的话 full-claude / full-gpt / full-glm
  // 会全部 slice(0,3) 撞成 "ful" 家族，跨厂商混在同一组。
  const stripped = raw.replace(/^(?:full[-_]|满血[-_])+/u, "");
  return stripped.slice(0, 3) || raw.slice(0, 3) || raw;
}

function familyRank(family: string): number {
  const order = [
    "gpt",
    "ful",
    "cla",
    "dee",
    "glm",
    "kim",
    "qwe",
    "min",
    "mim",
    "spa",
  ];
  const idx = order.indexOf(family);
  return idx === -1 ? order.length : idx;
}

function modelTokens(id: string): Array<number | string> {
  const raw = rawModelId(id).toLowerCase();
  const tokens: Array<number | string> = [];
  for (const part of raw.match(/\d+(?:\.\d+)?|[a-z]+/g) ?? [raw]) {
    const n = Number(part);
    tokens.push(Number.isFinite(n) && /^\d/.test(part) ? n : part);
  }
  return tokens;
}

export function compareModelIdsForPicker(a: string, b: string): number {
  const fa = modelFamilyOf(a);
  const fb = modelFamilyOf(b);
  const familyDiff = familyRank(fa) - familyRank(fb) || fa.localeCompare(fb);
  if (familyDiff !== 0) return familyDiff;

  const at = modelTokens(a);
  const bt = modelTokens(b);
  const len = Math.max(at.length, bt.length);
  for (let i = 0; i < len; i++) {
    const av = at[i];
    const bv = bt[i];
    if (av === undefined) return 1;
    if (bv === undefined) return -1;
    if (typeof av === "number" && typeof bv === "number") {
      if (av !== bv) return bv - av;
      continue;
    }
    const as = String(av);
    const bs = String(bv);
    if (as !== bs) return as.localeCompare(bs);
  }
  return rawModelId(a).localeCompare(rawModelId(b));
}

export function buildGroupedGrid(ids: string[], columns: number): GroupedModelGrid {
  const sorted = [...ids].sort(compareModelIdsForPicker);
  const families: Array<{ family: string; ids: string[] }> = [];
  for (const id of sorted) {
    const family = modelFamilyOf(id);
    const last = families[families.length - 1];
    if (last?.family === family) {
      last.ids.push(id);
    } else {
      families.push({ family, ids: [id] });
    }
  }

  const groups = families.map((group) => ({
    family: group.family,
    rows: buildGrid(group.ids, columns).rows,
  }));
  return { groups, flat: groups.flatMap((group) => group.rows.flat()) };
}

export function gridIndexOf(ids: string[], id: string, columns: number): number {
  return buildGroupedGrid(ids, columns).flat.indexOf(id);
}

function GridFooter({ zh }: { zh: boolean }) {
  return (
    <Box marginTop={0} justifyContent="center" gap={2}>
      <Text dimColor bold>↑↓←→</Text><Text dimColor>{zh ? "选择" : "select"}</Text>
      <Text dimColor>│</Text>
      <Text dimColor bold>Enter</Text><Text dimColor>{zh ? "确认" : "confirm"}</Text>
      <Text dimColor>│</Text>
      <Text dimColor bold>Esc</Text><Text dimColor>{zh ? "返回" : "back"}</Text>
    </Box>
  );
}

export function ModelGridPicker({
  options,
  enabled,
  pickerIdx,
  color,
  zh,
}: {
  options: LaunchOption[];
  enabled: Set<string>;
  pickerIdx: number;
  color: string;
  zh: boolean;
}) {
  const { stdout } = useStdout();
  const ids = options.map((opt) => opt.id);
  const byId = new Map(options.map((opt) => [opt.id, opt]));
  const labelOf = (id: string) => byId.get(id)?.label[zh ? "zh" : "en"] || byId.get(id)?.label.en || id;
  const columnCount = getGridColumnCountForOptions(options, stdout.columns || 80, zh);
  const grid = buildGroupedGrid(ids, columnCount);
  const cellWidth = Math.max(
    MIN_COLUMN_WIDTH,
    ...ids.map((id) => getDisplayWidth(labelOf(id)) + 3),
  );

  return (
    <Box flexDirection="column" marginTop={0} borderStyle="round" borderColor={color} paddingX={1} paddingY={0}>
      <Text bold color={color}>▣ {zh ? "选择模型" : "Pick Model"}</Text>
      <Box flexDirection="column" marginTop={0}>
        {grid.groups.map((group) => (
          <Box key={group.family} flexDirection="column" marginTop={0}>
            {group.rows.map((row, rowIdx) => (
              <Box key={`${group.family}-${rowIdx}`}>
                {row.map((id) => {
                  const idx = grid.flat.indexOf(id);
                  const focused = idx === pickerIdx;
                  const isCur = enabled.has(id);
                  const label = labelOf(id);
                  return (
                    <Box key={id} marginRight={1}>
                      <Text color={focused ? color : undefined} bold={focused}>
                        {focused ? "▸" : " "}
                      </Text>
                      <Text color={focused ? color : undefined} bold={focused}>
                        {padToWidth(label, cellWidth)}
                      </Text>
                      {isCur && <Text color="green">★</Text>}
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
      <GridFooter zh={zh} />
    </Box>
  );
}
