/**
 * Launcher 子选择页：模型 picker + 服务商 picker
 *
 * 抽出来是为了让 LauncherView 保持在 600 行以内（CLAUDE.md 硬规则）。
 * 两个 picker 的键盘逻辑仍在 LauncherView 里，这里只负责渲染。
 */
import React from "react";
import { Box, Text } from "ink";
import type { LaunchOption } from "../../../clients";
import type { Provider } from "../../../providers/types";

export const COLLAPSED_MODEL_LIMIT = 6;

const PICKER_FOOTER_HINTS = [
  ["↑↓", "选择", "select"],
  ["Enter", "确认", "confirm"],
  ["Esc", "取消", "cancel"],
] as const;

function PickerFooter({ zh }: { zh: boolean }) {
  return (
    <Box marginTop={0} justifyContent="center" gap={2}>
      {PICKER_FOOTER_HINTS.flatMap((h, i) => {
        const sep = i > 0 ? <Text key={`s${i}`} dimColor>│</Text> : null;
        return [
          sep,
          <Text key={`k${i}`} dimColor bold>{h[0]}</Text>,
          <Text key={`l${i}`} dimColor>{zh ? h[1] : h[2]}</Text>,
        ];
      })}
    </Box>
  );
}

// ─── 服务商 picker ──────────────────────────────────────────

export function ProviderPicker({
  provs, provIdx, pickerIdx, color, zh,
}: {
  provs: Provider[]; provIdx: number; pickerIdx: number; color: string; zh: boolean;
}) {
  return (
    <Box flexDirection="column" marginTop={0} borderStyle="round" borderColor={color} paddingX={1} paddingY={0}>
      <Text bold color={color}>▣ {zh ? "选择服务商" : "Pick Provider"}</Text>
      <Box flexDirection="column" marginTop={0}>
        {provs.length === 0 && (
          <Box paddingLeft={1}>
            <Text dimColor>{zh ? "暂无兼容此工具的服务商" : "No compatible providers"}</Text>
          </Box>
        )}
        {provs.map((p, i) => {
          const focused = pickerIdx === i;
          const isCur = i === provIdx;
          return (
            <Box key={p.id} paddingLeft={1}>
              <Text color={focused ? color : undefined} bold={focused}>
                {focused ? "▸" : " "}
              </Text>
              <Text bold={focused} color={focused ? color : undefined}>
                {" "}{p.name}
              </Text>
              {p.email && <Text dimColor>  ({p.email})</Text>}
              {isCur && <Text color="green"> ★</Text>}
            </Box>
          );
        })}
        {/* 管理服务商入口 */}
        {(() => {
          const focused = pickerIdx === provs.length;
          return (
            <Box paddingLeft={1} marginTop={1}>
              <Text color={focused ? color : undefined} bold={focused}>
                {focused ? "▸" : " "}
              </Text>
              <Text bold={focused} color={focused ? color : undefined}>
                {" "}⚙  {zh ? "管理服务商…" : "Manage providers…"}
              </Text>
            </Box>
          );
        })()}
      </Box>
      <PickerFooter zh={zh} />
    </Box>
  );
}

// ─── 模型 group picker ──────────────────────────────────────

export function visibleModelOptions(
  groupOpts: LaunchOption[],
  enabled: Set<string>,
  pickCounts: Record<string, number>,
): { list: LaunchOption[]; hiddenCount: number } {
  const hasCounts = groupOpts.some((opt) => (pickCounts[opt.id] ?? 0) > 0);
  if (!hasCounts) {
    return { list: groupOpts, hiddenCount: 0 };
  }

  const order = new Map(groupOpts.map((opt, idx) => [opt.id, idx]));
  const topIds = groupOpts
    .filter((opt) => (pickCounts[opt.id] ?? 0) > 0)
    .sort((a, b) => {
      const countDiff = (pickCounts[b.id] ?? 0) - (pickCounts[a.id] ?? 0);
      if (countDiff !== 0) return countDiff;
      return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
    })
    .slice(0, COLLAPSED_MODEL_LIMIT)
    .map((opt) => opt.id);

  const visibleIds = new Set<string>(topIds);
  for (const opt of groupOpts) {
    if (enabled.has(opt.id)) visibleIds.add(opt.id);
  }

  const list = groupOpts.filter((opt) => visibleIds.has(opt.id));
  return { list, hiddenCount: groupOpts.length - list.length };
}

export function initialModelPickerMode(
  groupOpts: LaunchOption[],
  pickCounts: Record<string, number>,
): "collapsed" | "grid" {
  const hasCounts = groupOpts.some((opt) => (pickCounts[opt.id] ?? 0) > 0);
  return !hasCounts && groupOpts.length > COLLAPSED_MODEL_LIMIT ? "grid" : "collapsed";
}

export function GroupPicker({
  group, options, enabled, pickerIdx, color, zh, pickCounts = {},
}: {
  group: string;
  options: LaunchOption[];
  enabled: Set<string>;
  pickerIdx: number;
  color: string;
  zh: boolean;
  pickCounts?: Record<string, number>;
}) {
  const groupOpts = options.filter((o) => o.group === group);
  const visible =
    group === "model"
      ? visibleModelOptions(groupOpts, enabled, pickCounts)
      : { list: groupOpts, hiddenCount: 0 };
  const title = group === "model" ? (zh ? "选择模型" : "Pick Model") : group;
  const isDefaultCur = !groupOpts.some((o) => enabled.has(o.id));
  return (
    <Box flexDirection="column" marginTop={0} borderStyle="round" borderColor={color} paddingX={1} paddingY={0}>
      <Text bold color={color}>▣ {title}</Text>
      <Box flexDirection="column" marginTop={0}>
        {/* 默认（清空） */}
        {(() => {
          const focused = pickerIdx === 0;
          return (
            <Box paddingLeft={1}>
              <Text color={focused ? color : undefined} bold={focused}>
                {focused ? "▸" : " "}
              </Text>
              <Text bold={focused} color={focused ? color : undefined}>
                {" "}{zh ? "默认（不指定）" : "Default (none)"}
              </Text>
              {isDefaultCur && <Text color="green"> ★</Text>}
            </Box>
          );
        })()}
        {visible.list.map((opt, i) => {
          const focused = pickerIdx === i + 1;
          const isCur = enabled.has(opt.id);
          return (
            <Box key={opt.id} paddingLeft={1} flexDirection="column">
              <Box>
                <Text color={focused ? color : undefined} bold={focused}>
                  {focused ? "▸" : " "}
                </Text>
                <Text bold={focused} color={focused ? color : undefined}>
                  {" "}{opt.label[zh ? "zh" : "en"] || opt.label.en}
                </Text>
                {isCur && <Text color="green"> ★</Text>}
                <Text dimColor>  {opt.flag}</Text>
              </Box>
              {focused && (
                <Box paddingLeft={3}>
                  <Text dimColor>{opt.description[zh ? "zh" : "en"] || opt.description.en}</Text>
                </Box>
              )}
            </Box>
          );
        })}
        {visible.hiddenCount > 0 && (
          <Box paddingLeft={1}>
            <Text color={pickerIdx === visible.list.length + 1 ? color : undefined} bold={pickerIdx === visible.list.length + 1}>
              {pickerIdx === visible.list.length + 1 ? "▸" : " "}
            </Text>
            <Text bold={pickerIdx === visible.list.length + 1} color={pickerIdx === visible.list.length + 1 ? color : undefined}>
              {" "}{zh ? `▾ 显示全部 (${visible.hiddenCount})` : `▾ Show all (${visible.hiddenCount})`}
            </Text>
            <Text dimColor> ›</Text>
          </Box>
        )}
      </Box>
      <PickerFooter zh={zh} />
    </Box>
  );
}
