import { ShieldCheck, Utensils } from "lucide-react";
import { MealWorkbench } from "@/components/meal-workbench";

export default function HomePage() {
  return (
    <main className="app-shell">
      <header className="brand-bar">
        <a className="brand" href="#main-workbench" aria-label="MealNote首页">
          <span className="brand-mark" aria-hidden="true">
            <Utensils size={24} strokeWidth={1.8} />
          </span>
          <span>
            <strong>MealNote</strong>
            <small>记一餐，不记负担</small>
          </span>
        </a>
        <span className="privacy-note">
          <ShieldCheck size={17} aria-hidden="true" />
          本地演示
        </span>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">为中餐而做的饮食记录</p>
        <h1 id="page-title">一句话，记下这一餐。</h1>
        <p>
          说“半碗米饭、三分之一盘番茄炒蛋”，先确认食物和份量，再由独立营养引擎计算合理范围。
        </p>
      </section>

      <MealWorkbench />

      <footer className="site-footer">
        <p>V1 骨架 · AI 负责理解，Nutrition Engine 负责计算</p>
      </footer>
    </main>
  );
}
