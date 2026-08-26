"use client";

import Image from "next/image";
import {
  AlertCircle,
  ArrowRight,
  Camera,
  Check,
  ChevronRight,
  CircleUserRound,
  FileText,
  LogOut,
  Mic,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Utensils,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { InputSource, MealAnalysis, OilLevel } from "@/lib/ai/meal-analysis-schema";
import type { NutritionResult } from "@/lib/nutrition/engine";
import { RequestRevisionGuard, type RequestRevisionToken } from "@/lib/nutrition/request-guard";
import {
  acknowledgeNutritionItem,
  applyNutritionItemEdit,
  createNutritionInputItem,
  type EditableNutritionField,
  type EditableNutritionItemUpdates,
  type NutritionInputItem,
} from "@/lib/nutrition/review";

type WorkbenchStage = "input" | "confirm" | "result";
type InputMode = "text" | "voice" | "image";
type ReviewedMealAnalysis = Omit<MealAnalysis, "items"> & { items: NutritionInputItem[] };

interface AnalysisApiResponse {
  analysis?: MealAnalysis;
  provider?: string;
  warning?: string;
  error?: string;
}

interface NutritionApiResponse {
  nutrition?: NutritionResult;
  error?: string;
}

interface SavedMeal {
  id: string;
  created_at: string;
  input_text: string;
  nutrition: NutritionResult;
}

interface SpeechResultEvent {
  results: ArrayLike<{ 0: { transcript: string } }>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

const PROFILE_KEY: string = "mealnote-demo-profile";
const MEALS_KEY_PREFIX: string = "mealnote-demo-meals";
const MAX_IMAGE_BYTES: number = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES: string[] = ["image/jpeg", "image/png", "image/webp"];

const OIL_OPTIONS: Array<{ value: OilLevel; label: string }> = [
  { value: "none", label: "无油" },
  { value: "light", label: "少油" },
  { value: "standard", label: "普通" },
  { value: "heavy", label: "偏多" },
  { value: "unknown", label: "不确定" },
];

const EDITED_FIELD_LABELS: Record<EditableNutritionField, string> = {
  food_name: "食物名称",
  estimated_grams: "估计重量",
  oil_level: "用油",
};

function mealsKeyForProfile(profileName: string): string {
  return `${MEALS_KEY_PREFIX}:${encodeURIComponent(profileName)}`;
}

function readSavedMeals(profileName: string): SavedMeal[] {
  const storedMeals: string | null = window.localStorage.getItem(mealsKeyForProfile(profileName));
  if (!storedMeals) {
    return [];
  }
  try {
    const parsedMeals: unknown = JSON.parse(storedMeals);
    return Array.isArray(parsedMeals) ? (parsedMeals as SavedMeal[]) : [];
  } catch {
    return [];
  }
}

function deriveSource(mode: InputMode, hasImage: boolean): InputSource {
  if (hasImage && mode !== "image") {
    return "mixed";
  }
  return mode;
}

function formatProvider(provider: string | undefined): string {
  const labels: Record<string, string> = {
    openai: "AI 图片与文字识别",
    "heuristic-demo": "本地文字演示",
    "heuristic-fallback": "本地降级识别",
  };
  return provider ? labels[provider] ?? provider : "结构化识别";
}

function formatEditedFields(fields: EditableNutritionField[]): string {
  return fields.map((field: EditableNutritionField) => EDITED_FIELD_LABELS[field]).join("、");
}

export function MealWorkbench() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const analysisGuardRef = useRef<RequestRevisionGuard>(new RequestRevisionGuard());
  const calculationGuardRef = useRef<RequestRevisionGuard>(new RequestRevisionGuard());
  const [hydrated, setHydrated] = useState<boolean>(false);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [loginName, setLoginName] = useState<string>("");
  const [stage, setStage] = useState<WorkbenchStage>("input");
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [mealText, setMealText] = useState<string>("");
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>();
  const [imageName, setImageName] = useState<string | undefined>();
  const [analysis, setAnalysis] = useState<ReviewedMealAnalysis | undefined>();
  const [nutrition, setNutrition] = useState<NutritionResult | undefined>();
  const [provider, setProvider] = useState<string | undefined>();
  const [warning, setWarning] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [justSaved, setJustSaved] = useState<boolean>(false);

  useEffect(() => {
    const loadStoredData = (): void => {
      const storedProfile: string | null = window.localStorage.getItem(PROFILE_KEY);
      setProfileName(storedProfile);
      setSavedMeals(storedProfile ? readSavedMeals(storedProfile) : []);
      setHydrated(true);
    };
    const timeoutId: number = window.setTimeout(loadStoredData, 0);
    return (): void => window.clearTimeout(timeoutId);
  }, []);

  const todayMeals: SavedMeal[] = useMemo(() => {
    const today: string = new Date().toDateString();
    return savedMeals.filter((meal: SavedMeal) => new Date(meal.created_at).toDateString() === today);
  }, [savedMeals]);

  const todayTotals = useMemo(
    () =>
      todayMeals.reduce(
        (sum, meal: SavedMeal) => ({
          kcal: sum.kcal + meal.nutrition.totals.kcal,
          protein: sum.protein + meal.nutrition.totals.protein,
          fat: sum.fat + meal.nutrition.totals.fat,
          carbs: sum.carbs + meal.nutrition.totals.carbs,
        }),
        { kcal: 0, protein: 0, fat: 0, carbs: 0 },
      ),
    [todayMeals],
  );

  const pendingConfirmationCount: number = useMemo(
    () =>
      analysis?.items.filter(
        (item: NutritionInputItem) =>
          item.needs_confirmation && !item.confirmation_acknowledged,
      ).length ?? 0,
    [analysis],
  );

  function invalidateAnalysisRequest(): void {
    analysisGuardRef.current.invalidate();
    setIsLoading(false);
  }

  function invalidateCalculation(): void {
    calculationGuardRef.current.invalidate();
    setNutrition(undefined);
    setJustSaved(false);
    setIsLoading(false);
  }

  function signIn(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const normalizedName: string = loginName.trim();
    if (!normalizedName) {
      setError("请输入一个本地演示昵称。 ");
      return;
    }
    window.localStorage.setItem(PROFILE_KEY, normalizedName);
    setProfileName(normalizedName);
    setSavedMeals(readSavedMeals(normalizedName));
    setError(undefined);
  }

  function signOut(): void {
    window.localStorage.removeItem(PROFILE_KEY);
    setProfileName(null);
    setLoginName("");
    setSavedMeals([]);
    resetMeal();
  }

  function resetMeal(): void {
    analysisGuardRef.current.invalidate();
    calculationGuardRef.current.invalidate();
    speechRecognitionRef.current?.stop();
    setStage("input");
    setInputMode("text");
    setMealText("");
    setImageDataUrl(undefined);
    setImageName(undefined);
    setAnalysis(undefined);
    setNutrition(undefined);
    setProvider(undefined);
    setWarning(undefined);
    setError(undefined);
    setJustSaved(false);
    setIsLoading(false);
    setIsListening(false);
  }

  function loadExample(): void {
    invalidateAnalysisRequest();
    setMealText("半碗米饭，番茄炒蛋大概吃了三分之一盘，红烧排骨四块，冬瓜汤一碗");
    setInputMode("text");
    setError(undefined);
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>): void {
    const file: File | undefined = event.target.files?.[0];
    if (!file) {
      return;
    }
    invalidateAnalysisRequest();
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError("照片格式仅支持 JPEG、PNG 或 WebP。 ");
      event.target.value = "";
      return;
    }
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      setError("照片必须小于 5 MB，且文件大小可读取。 ");
      event.target.value = "";
      return;
    }

    const fileToken: RequestRevisionToken = analysisGuardRef.current.begin();
    const reader: FileReader = new FileReader();
    reader.onload = (): void => {
      if (!analysisGuardRef.current.isCurrent(fileToken)) {
        return;
      }
      if (typeof reader.result !== "string") {
        analysisGuardRef.current.invalidate();
        setError("照片读取失败，请换一张重试。 ");
        return;
      }
      analysisGuardRef.current.invalidate();
      setImageDataUrl(reader.result);
      setImageName(file.name);
      setInputMode("image");
      setError(undefined);
    };
    reader.onerror = (): void => {
      if (!analysisGuardRef.current.isCurrent(fileToken)) {
        return;
      }
      analysisGuardRef.current.invalidate();
      setError("照片读取失败，请换一张重试。 ");
    };
    reader.readAsDataURL(file);
  }

  function startVoiceInput(): void {
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition: SpeechRecognitionConstructor | undefined =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError("当前浏览器不支持语音转文字，请直接输入描述。 ");
      return;
    }

    invalidateAnalysisRequest();
    speechRecognitionRef.current?.stop();
    const voiceToken: RequestRevisionToken = analysisGuardRef.current.begin();
    const recognition: SpeechRecognitionLike = new Recognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event: SpeechResultEvent): void => {
      if (!analysisGuardRef.current.isCurrent(voiceToken)) {
        return;
      }
      const transcript: string = event.results[0]?.[0]?.transcript ?? "";
      analysisGuardRef.current.invalidate();
      setMealText((currentText: string) => [currentText, transcript].filter(Boolean).join("，"));
      setInputMode("voice");
      setError(undefined);
      setIsListening(false);
    };
    recognition.onerror = (): void => {
      if (!analysisGuardRef.current.isCurrent(voiceToken)) {
        return;
      }
      analysisGuardRef.current.invalidate();
      setError("没有听清，请重试或直接输入。 ");
      setIsListening(false);
    };
    recognition.onend = (): void => {
      if (!analysisGuardRef.current.isCurrent(voiceToken)) {
        return;
      }
      analysisGuardRef.current.invalidate();
      setIsListening(false);
    };
    speechRecognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }

  async function runAnalysis(): Promise<void> {
    if (!mealText.trim() && !imageDataUrl) {
      setError("请描述这一餐，或选择一张照片。 ");
      return;
    }
    invalidateCalculation();
    invalidateAnalysisRequest();
    const requestToken: RequestRevisionToken = analysisGuardRef.current.begin();
    setIsLoading(true);
    setError(undefined);
    setWarning(undefined);
    try {
      const response: Response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: mealText,
          source: deriveSource(inputMode, Boolean(imageDataUrl)),
          image_data_url: imageDataUrl,
        }),
        signal: requestToken.signal,
      });
      const body: AnalysisApiResponse = (await response.json()) as AnalysisApiResponse;
      if (!analysisGuardRef.current.isCurrent(requestToken)) {
        return;
      }
      if (!response.ok || !body.analysis) {
        throw new Error(body.error ?? "没有得到可确认的识别结果。 ");
      }
      setAnalysis({
        ...body.analysis,
        items: body.analysis.items.map(createNutritionInputItem),
      });
      setNutrition(undefined);
      setJustSaved(false);
      setProvider(body.provider);
      setWarning(body.warning);
      setStage("confirm");
    } catch (caughtError: unknown) {
      if (!analysisGuardRef.current.isCurrent(requestToken)) {
        return;
      }
      setError(caughtError instanceof Error ? caughtError.message.trim() : "识别失败，请重试。 ");
    } finally {
      if (analysisGuardRef.current.finish(requestToken)) {
        setIsLoading(false);
      }
    }
  }

  function updateItem(index: number, updates: EditableNutritionItemUpdates): void {
    invalidateCalculation();
    setAnalysis((currentAnalysis: ReviewedMealAnalysis | undefined) => {
      if (!currentAnalysis) {
        return currentAnalysis;
      }
      return {
        ...currentAnalysis,
        items: currentAnalysis.items.map((item: NutritionInputItem, itemIndex: number) =>
          itemIndex === index ? applyNutritionItemEdit(item, updates) : item,
        ),
      };
    });
    setError(undefined);
  }

  function acknowledgeItem(index: number): void {
    invalidateCalculation();
    setAnalysis((currentAnalysis: ReviewedMealAnalysis | undefined) => {
      if (!currentAnalysis) {
        return currentAnalysis;
      }
      return {
        ...currentAnalysis,
        items: currentAnalysis.items.map((item: NutritionInputItem, itemIndex: number) =>
          itemIndex === index ? acknowledgeNutritionItem(item) : item,
        ),
      };
    });
    setError(undefined);
  }

  function removeItem(index: number): void {
    if (!analysis || analysis.items.length === 1) {
      setError("一餐至少保留一个食物。 ");
      return;
    }
    invalidateCalculation();
    setAnalysis((currentAnalysis: ReviewedMealAnalysis | undefined) => {
      if (!currentAnalysis) {
        return currentAnalysis;
      }
      return {
        ...currentAnalysis,
        items: currentAnalysis.items.filter((_: NutritionInputItem, itemIndex: number) => itemIndex !== index),
      };
    });
    setError(undefined);
  }

  function returnToInput(): void {
    invalidateCalculation();
    setStage("input");
    setError(undefined);
  }

  async function calculate(): Promise<void> {
    if (!analysis) {
      return;
    }
    if (pendingConfirmationCount > 0) {
      setError(`还有 ${pendingConfirmationCount} 项需要明确确认后才能计算营养。`);
      return;
    }

    const requestToken: RequestRevisionToken = calculationGuardRef.current.begin();
    setNutrition(undefined);
    setJustSaved(false);
    setIsLoading(true);
    setError(undefined);
    try {
      const response: Response = await fetch("/api/nutrition/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: analysis.items }),
        signal: requestToken.signal,
      });
      const body: NutritionApiResponse = (await response.json()) as NutritionApiResponse;
      if (!calculationGuardRef.current.isCurrent(requestToken)) {
        return;
      }
      if (!response.ok || !body.nutrition) {
        throw new Error(body.error ?? "没有得到营养计算结果。 ");
      }
      setNutrition(body.nutrition);
      setStage("result");
    } catch (caughtError: unknown) {
      if (!calculationGuardRef.current.isCurrent(requestToken)) {
        return;
      }
      setError(caughtError instanceof Error ? caughtError.message.trim() : "计算失败，请重试。 ");
    } finally {
      if (calculationGuardRef.current.finish(requestToken)) {
        setIsLoading(false);
      }
    }
  }

  function saveMeal(): void {
    if (!nutrition || justSaved || !profileName) {
      return;
    }
    const savedMeal: SavedMeal = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      input_text: mealText,
      nutrition,
    };
    const nextMeals: SavedMeal[] = [savedMeal, ...savedMeals];
    window.localStorage.setItem(mealsKeyForProfile(profileName), JSON.stringify(nextMeals));
    setSavedMeals(nextMeals);
    setJustSaved(true);
  }

  if (!hydrated) {
    return <section className="workbench loading-shell" aria-label="正在载入本地演示" />;
  }

  if (!profileName) {
    return (
      <section className="workbench sign-in-panel" id="main-workbench" aria-labelledby="demo-login-title">
        <div className="section-heading">
          <span className="section-icon" aria-hidden="true">
            <CircleUserRound size={22} />
          </span>
          <div>
            <p className="step-kicker">先进入本地演示</p>
            <h2 id="demo-login-title">你的记录只保存在这台设备</h2>
          </div>
        </div>
        <p className="helper-copy">
          这里不是正式账号系统。昵称仅用于本机演示，不会发送到服务器；生产版将接入 Supabase Auth。
        </p>
        <form className="login-form" onSubmit={signIn}>
          <label htmlFor="demo-name">怎么称呼你</label>
          <div className="inline-form">
            <input
              id="demo-name"
              value={loginName}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setLoginName(event.target.value)}
              placeholder="例如：小陶"
              autoComplete="nickname"
              maxLength={30}
            />
            <button className="primary-button" type="submit">
              进入演示
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>
        </form>
        {error ? <InlineMessage tone="error" message={error} /> : null}
      </section>
    );
  }

  return (
    <div className="workbench-layout" id="main-workbench">
      <section className="today-strip" aria-labelledby="today-title">
        <div>
          <p className="step-kicker">今天 · {profileName}</p>
          <h2 id="today-title">{Math.round(todayTotals.kcal)} <small>kcal</small></h2>
          <p>{todayMeals.length ? `已记 ${todayMeals.length} 餐` : "还没有记录，第一餐从一句话开始"}</p>
        </div>
        <dl className="macro-row">
          <div><dt>蛋白质</dt><dd>{todayTotals.protein.toFixed(1)}g</dd></div>
          <div><dt>脂肪</dt><dd>{todayTotals.fat.toFixed(1)}g</dd></div>
          <div><dt>碳水</dt><dd>{todayTotals.carbs.toFixed(1)}g</dd></div>
        </dl>
        <button className="icon-button sign-out" type="button" onClick={signOut} aria-label="退出本地演示">
          <LogOut size={19} />
        </button>
      </section>

      <section className="workbench" aria-labelledby="workbench-title">
        <ol className="progress-rail" aria-label="记录步骤">
          {[
            { id: "input", label: "识别" },
            { id: "confirm", label: "确认" },
            { id: "result", label: "计算" },
          ].map((item, index: number) => {
            const stageOrder: WorkbenchStage[] = ["input", "confirm", "result"];
            const isActive: boolean = stageOrder.indexOf(stage) >= index;
            return (
              <li className={isActive ? "active" : ""} key={item.id} aria-current={stage === item.id ? "step" : undefined}>
                <span>{isActive && stageOrder.indexOf(stage) > index ? <Check size={14} /> : index + 1}</span>
                {item.label}
              </li>
            );
          })}
        </ol>

        {stage === "input" ? (
          <div className="stage-panel">
            <div className="section-heading">
              <span className="section-icon" aria-hidden="true"><Utensils size={22} /></span>
              <div>
                <p className="step-kicker">大约 10 秒</p>
                <h2 id="workbench-title">这一餐吃了什么？</h2>
              </div>
            </div>

            <div className="input-mode-tabs" role="group" aria-label="选择输入方式">
              <button className={inputMode === "text" ? "selected" : ""} type="button" onClick={() => { invalidateAnalysisRequest(); setInputMode("text"); }}>
                <FileText size={18} />文字
              </button>
              <button className={inputMode === "voice" ? "selected" : ""} type="button" onClick={startVoiceInput}>
                <Mic size={18} />{isListening ? "正在听" : "语音"}
              </button>
              <button className={inputMode === "image" ? "selected" : ""} type="button" onClick={() => fileInputRef.current?.click()}>
                <Camera size={18} />照片
              </button>
            </div>

            <label className="field-label" htmlFor="meal-description">用你平时说话的方式描述</label>
            <textarea
              id="meal-description"
              value={mealText}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => { invalidateAnalysisRequest(); setMealText(event.target.value); }}
              placeholder="例如：半碗米饭，番茄炒蛋吃了三分之一盘，红烧排骨四块"
              rows={4}
              maxLength={1000}
            />
            <div className="field-meta">
              <button className="text-button" type="button" onClick={loadExample}>填入示例</button>
              <span>{mealText.length}/1000</span>
            </div>

            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={handleFile}
              aria-label="选择餐食照片"
            />
            {imageDataUrl ? (
              <div className="image-preview">
                <Image src={imageDataUrl} alt="待识别的餐食照片" width={112} height={84} unoptimized />
                <div><strong>{imageName}</strong><span>照片会与文字一起用于识别</span></div>
                <button className="icon-button" type="button" onClick={() => { invalidateAnalysisRequest(); setImageDataUrl(undefined); setImageName(undefined); }} aria-label="移除照片">
                  <RotateCcw size={18} />
                </button>
              </div>
            ) : null}

            {error ? <InlineMessage tone="error" message={error} /> : null}
            <button className="primary-button full-width" type="button" onClick={runAnalysis} disabled={isLoading}>
              <Sparkles size={19} aria-hidden="true" />
              {isLoading ? "正在拆解这一餐…" : "识别食物与份量"}
              {!isLoading ? <ArrowRight size={19} aria-hidden="true" /> : null}
            </button>
          </div>
        ) : null}

        {stage === "confirm" && analysis ? (
          <div className="stage-panel">
            <div className="section-heading split-heading">
              <div>
                <p className="step-kicker">{formatProvider(provider)}</p>
                <h2 id="workbench-title">确认份量和用油</h2>
              </div>
              <button className="text-button" type="button" onClick={returnToInput}>返回修改</button>
            </div>
            <p className="uncertainty-copy">{analysis.uncertainty_note}</p>
            {warning ? <InlineMessage tone="warning" message={warning} /> : null}
            <div className="food-list">
              {analysis.items.map((item: NutritionInputItem, index: number) => (
                <article className="food-item" key={`${item.food_name}-${index}`}>
                  <div className="food-item-title">
                    <span>{index + 1}</span>
                    <input
                      aria-label={`第 ${index + 1} 项食物名称`}
                      value={item.food_name}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => updateItem(index, { food_name: event.target.value })}
                    />
                    <button className="text-button danger" type="button" onClick={() => removeItem(index)}>移除</button>
                  </div>
                  <div className="food-fields">
                    <label>
                      <span>估计重量</span>
                      <div className="number-input">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={1}
                          max={5000}
                          value={item.estimated_grams}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            updateItem(index, { estimated_grams: Math.max(1, Number(event.target.value)) })
                          }
                        />
                        <span>克</span>
                      </div>
                    </label>
                    <label>
                      <span>用油</span>
                      <select
                        value={item.oil_level}
                        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                          updateItem(index, { oil_level: event.target.value as OilLevel })
                        }
                      >
                        {OIL_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                  </div>
                  {item.assumptions.length > 0 ? (
                    <p className="assumption"><AlertCircle size={15} />{item.assumptions.join("；")}</p>
                  ) : null}
                  {item.edited_fields.length > 0 ? (
                    <p className="assumption"><Check size={15} />用户已修改：{formatEditedFields(item.edited_fields)}；原识别假设已清除。</p>
                  ) : null}
                  <div className="confidence-line">
                    <span>原始识别把握</span>
                    <meter min={0} max={1} low={0.55} high={0.8} optimum={1} value={item.confidence} />
                    <strong>{Math.round(item.confidence * 100)}%</strong>
                  </div>
                  {item.needs_confirmation ? (
                    item.confirmation_acknowledged ? (
                      <InlineMessage tone="success" message="这一项已明确确认。再次修改会要求重新确认。" />
                    ) : (
                      <>
                        <InlineMessage tone="warning" message="识别认为这一项存在关键不确定性；必须明确确认后才能计算。" />
                        <button className="text-button" type="button" onClick={() => acknowledgeItem(index)}>
                          明确确认此项
                        </button>
                      </>
                    )
                  ) : null}
                </article>
              ))}
            </div>
            {error ? <InlineMessage tone="error" message={error} /> : null}
            <button
              className="primary-button full-width"
              type="button"
              onClick={calculate}
              disabled={isLoading || pendingConfirmationCount > 0}
            >
              <Check size={19} />
              {isLoading
                ? "正在计算…"
                : pendingConfirmationCount > 0
                  ? `还有 ${pendingConfirmationCount} 项待明确确认`
                  : "确认并计算营养"}
              <ChevronRight size={19} />
            </button>
          </div>
        ) : null}

        {stage === "result" && nutrition ? (
          <div className="stage-panel result-panel">
            <div className="section-heading split-heading">
              <div>
                <p className="step-kicker">Nutrition Engine</p>
                <h2 id="workbench-title">这一餐，约 {nutrition.totals.kcal} kcal</h2>
              </div>
              <button className="text-button" type="button" onClick={() => setStage("confirm")}>返回确认</button>
            </div>
            <div className="range-block">
              <span>合理范围</span>
              <strong>{nutrition.kcal_low}–{nutrition.kcal_high} kcal</strong>
              <p>{nutrition.explanation}</p>
            </div>
            <dl className="result-macros">
              <div><dt>蛋白质</dt><dd>{nutrition.totals.protein}g</dd></div>
              <div><dt>脂肪</dt><dd>{nutrition.totals.fat}g</dd></div>
              <div><dt>碳水</dt><dd>{nutrition.totals.carbs}g</dd></div>
            </dl>
            <details className="source-details">
              <summary>查看计算依据</summary>
              <ul>
                {nutrition.items.map((item, index: number) => {
                  const hasReviewChanges: boolean = Object.values(item.field_provenance).some(
                    (source) => source !== "analysis",
                  );
                  return (
                    <li key={`${item.food_name}-${index}`}>
                      <strong>{item.food_name} → {item.matched_profile_name}</strong>
                      <span>
                        {item.estimated_grams}g · {hasReviewChanges ? "客户端报告含用户修改/审查派生" : "客户端报告识别值未修改"} · {item.source_ref}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </details>
            {justSaved ? <InlineMessage tone="success" message="已经保存到今天的汇总。" /> : null}
            <div className="result-actions">
              <button className="primary-button" type="button" onClick={saveMeal} disabled={justSaved}>
                <Save size={19} />{justSaved ? "已保存" : "保存到今天"}
              </button>
              <button className="secondary-button" type="button" onClick={resetMeal}>
                <Plus size={19} />记下一餐
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function InlineMessage({ tone, message }: { tone: "error" | "warning" | "success"; message: string }) {
  return (
    <p className={`inline-message ${tone}`} role={tone === "error" ? "alert" : "status"}>
      {tone === "success" ? <Check size={18} /> : <AlertCircle size={18} />}
      {message}
    </p>
  );
}
