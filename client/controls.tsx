import type { PluginScreenProps } from "@getpaseo/plugin/client";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { tint, toneColor, type Tone } from "./tone";

export type Theme = PluginScreenProps["theme"];
export type { Tone };

// Paseo's spacing and type steps (styles/theme.ts). Values outside these steps drift between screens.
export const space = { 0.5: 2, 1: 4, 1.5: 6, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32 } as const;
export const fontSize = { sm: 12, base: 14, content: 15, lg: 16 } as const;

export type ButtonVariant = "default" | "secondary" | "outline" | "ghost";

// default is the one accent-filled action on a surface; secondary pairs with it; outline sits on a row;
// ghost is chrome. A selected toggle uses the surface fill instead of a second accent.
export function Button({ label, accessibilityLabel, describedBy, onPress, theme, selected = false, disabled = false, toggle = false, expanded, variant = "outline", size }: {
  label: string; accessibilityLabel?: string; describedBy?: string; onPress: () => void; theme: Theme; selected?: boolean; disabled?: boolean; toggle?: boolean; expanded?: boolean;
  variant?: ButtonVariant; size?: "sm";
}) {
  const c = theme.colors;
  const filled = variant === "default" && !selected;
  const background = selected || variant === "secondary" ? c.surface2 : filled ? c.accent : "transparent";
  const border = selected ? c.foregroundMuted : variant === "outline" ? c.border : "transparent";
  const color = filled ? c.accentForeground : variant === "ghost" && !selected ? c.foregroundMuted : c.foreground;
  return (
    <Pressable accessibilityRole={toggle ? "checkbox" : "button"} aria-checked={toggle ? selected : undefined} aria-expanded={expanded} aria-describedby={describedBy} accessibilityLabel={accessibilityLabel ?? label} accessibilityState={toggle ? { disabled, checked:selected } : { disabled, selected, expanded }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({ minHeight: size === "sm" ? 28 : 32, justifyContent: "center", borderRadius: 9999, paddingHorizontal: size === "sm" ? space[3] : space[4], paddingVertical: space[1],
        opacity: disabled ? 0.5 : pressed ? 0.7 : 1, borderWidth: 1, borderColor: border, backgroundColor: background })}>
      <Text style={{ fontSize: size === "sm" ? fontSize.sm : fontSize.base, fontWeight: "500", color }}>{label}</Text>
    </Pressable>
  );
}

export type SessionChipProps = { label: string; accessibilityLabel: string; onPress: () => void; theme: Theme };

export function SessionChip({ label, accessibilityLabel, onPress, theme }: SessionChipProps) {
  const c = theme.colors;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}
    style={({ pressed }) => ({ alignSelf: "flex-start", maxWidth: "100%", minHeight: 28, justifyContent: "center",
      paddingHorizontal: space[3], paddingVertical: space[0.5], borderWidth: 1, borderColor: c.border, borderRadius: 9999,
      backgroundColor: pressed ? c.surface2 : "transparent" })}>
    <Text style={{ color: c.foreground, fontSize: fontSize.sm }}>{label} ›</Text>
  </Pressable>;
}

export type SegmentOption<T extends string> = { id: T; label: string; accessibilityLabel?: string };

export function SegmentedControl<T extends string>({ options, value, onChange, theme, accessibilityLabel, disabled = false }: {
  options: readonly SegmentOption<T>[]; value: T; onChange: (id: T) => void; theme: Theme; accessibilityLabel: string; disabled?: boolean;
}) {
  const c = theme.colors;
  return <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}
    style={{ flexDirection: "row", flexWrap: "wrap", alignSelf: "flex-start", gap: space[0.5], padding: space[0.5], borderRadius: 9999, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface1 }}>
    {options.map(option => {
      const selected = option.id === value;
      return <Pressable key={option.id} accessibilityRole="radio" aria-checked={selected} accessibilityLabel={option.accessibilityLabel ?? option.label}
        accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={() => { if (!selected) onChange(option.id); }}
        style={({ pressed }) => ({ minHeight: 26, justifyContent: "center", paddingHorizontal: space[3], borderRadius: 9999,
          backgroundColor: selected ? c.surface2 : "transparent", opacity: disabled ? 0.5 : pressed ? 0.7 : 1 })}>
        <Text style={{ fontSize: fontSize.sm, fontWeight: "500", color: selected ? c.foreground : c.foregroundMuted }}>{option.label}</Text>
      </Pressable>;
    })}
  </View>;
}

export function StatusBadge({ label, tone = "muted", theme }: { label: string; tone?: Tone; theme: Theme }) {
  const c = theme.colors;
  const fill = tone === "muted" ? null : tint(toneColor(c, tone));
  return <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", borderRadius: 9999, paddingHorizontal: space[2], paddingVertical: space[0.5],
    borderWidth: 1, borderColor: fill ? "transparent" : c.border, backgroundColor: fill ?? c.surface2 }}>
    <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: toneColor(c, tone) }}>{label}</Text>
  </View>;
}

export function StatusDot({ tone, theme, label }: { tone: Tone | "idle"; theme: Theme; label?: string }) {
  const c = theme.colors;
  return <View accessible={!!label} accessibilityLabel={label}
    style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone === "idle" ? c.border : toneColor(c, tone) }} />;
}

// Running is the one busy state that asks for nothing, so it stays neutral instead of borrowing a status hue.
export function RunningMark({ theme, label }: { theme: Theme; label?: string }) {
  const c = theme.colors;
  return <View accessible={!!label} accessibilityLabel={label}
    style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: c.border, borderTopColor: c.foregroundMuted }} />;
}

export function SectionLabel({ children, theme, count }: { children: ReactNode; theme: Theme; count?: number }) {
  const c = theme.colors;
  return <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
    <Text accessibilityRole="header" style={{ fontSize: fontSize.sm, fontWeight: "500", color: c.foregroundMuted }}>{children}</Text>
    {count !== undefined && <Text style={{ fontSize: fontSize.sm, color: c.foregroundMuted }}>{count}</Text>}
  </View>;
}
