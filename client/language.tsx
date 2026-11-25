import { defineSettings } from "@getpaseo/plugin";
import { useSettings } from "@getpaseo/plugin/client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { z } from "zod";
import { Button, type Theme } from "./controls";

export type Language = "ko" | "en";
export type Translate = (korean: string, english: string) => string;
export const languageSetting = defineSettings({
  id: "board-language", scope: "device", version: 1,
  schema: z.object({ language: z.enum(["ko", "en"]).default("ko") }),
});

const translators: Record<Language, Translate> = {
  ko: (korean) => korean, en: (_, english) => english,
};

function usePreference() {
  const state = useSettings(languageSetting);
  const language = state.status === "ready" ? state.values.language : "ko";
  return { state, language, t: translators[language] };
}
const Context = createContext<ReturnType<typeof usePreference> | null>(null);

export function BoardLanguageProvider({ children }: { children: ReactNode }) {
  const preference = usePreference();
  return <Context.Provider value={preference}>{children}</Context.Provider>;
}

export function useBoardLanguage(): { language: Language; t: Translate } {
  const pref = useContext(Context);
  return pref ?? { language: "ko", t: translators.ko };
}

export function BoardLanguageSetting({ theme }: { theme: Theme }) {
  const pref = useContext(Context);
  const [conflict, setConflict] = useState(false);
  if (!pref) return null;
  const { state, t, language } = pref;
  const save = async (value: Language) => {
    if (state.status !== "ready" || state.saving || value === language) return;
    setConflict(false);
    if (!await state.save({ language: value }, state.revision)) {
      setConflict(true);
      await state.reload();
    }
  };
  return <View style={{ gap: 8 }}>
    <Text accessibilityRole="header" style={{ color: theme.colors.foregroundMuted, fontSize: 12, fontWeight: "500" }}>{t("보드 언어", "Board language")}</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {(["ko", "en"] as const).map(id => <Button theme={theme} key={id} label={id === "ko" ? "한국어" : "English"} selected={language === id}
        disabled={state.status !== "ready" || state.saving} onPress={() => void save(id)} />)}
    </View>
    {(conflict || state.saveError || state.status === "error" || state.status === "invalid") && <View style={{ gap: 6 }}>
      <Text accessibilityLiveRegion="polite" style={{color: theme.colors.statusDanger}}>{t("언어 설정을 확인하고 다시 선택해 주세요.", "Reload the language setting and try again.")}</Text>
      <Button theme={theme} label={t("다시 읽기", "Reload setting")} onPress={() => { setConflict(false); void state.reload(); }} />
    </View>}
  </View>;
}
