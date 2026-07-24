import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import zhCN from "./zh-CN.json";
import { resolveLanguageFromLocale } from "../../../shared/settings";

// 首屏占位语言：与主进程 resolveLanguageFromLocale 同规则（zh* → zh-CN，其他 → en）。
// 启动后 ThemeProvider 用主进程 getPreferences 的持久化 language 覆盖（主进程为真相源）。
const initialLanguage = resolveLanguageFromLocale(navigator.language);

void i18n.use(initReactI18next).init({
  resources: {
    "zh-CN": { translation: zhCN },
    en: { translation: en },
  },
  lng: initialLanguage,
  // 契约（DEVELOPMENT-PLAN §10）：无法识别/缺失翻译时回退 English。
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
