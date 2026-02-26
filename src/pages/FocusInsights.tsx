import { useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { fetchFocusStats } from "../utils/apiBridge";

type RangeKey = "all-time" | "7d" | "30d" | "90d";

const PIE_COLORS = ["#88B5D3", "#6F9FBE", "#4F708F", "#2A3B52", "#FF9900", "#C7851F"];

const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const shiftDate = (base: string, offsetDays: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const toRangeParams = (range: RangeKey) => {
  const endDate = getTodayStr();
  if (range === "all-time") {
    return { startDate: "1970-01-01", endDate };
  }

  if (range === "7d") {
    return { startDate: shiftDate(endDate, -6), endDate };
  }

  if (range === "30d") {
    return { startDate: shiftDate(endDate, -29), endDate };
  }

  return { startDate: shiftDate(endDate, -89), endDate };
};

const rangeLabelMap: Record<RangeKey, string> = {
  "all-time": "全量历史",
  "7d": "最近 7 天",
  "30d": "最近 30 天",
  "90d": "最近 90 天",
};

const formatMinutesAsHourMinute = (totalMinutes: number) => {
  const safeMinutes = Math.max(0, Math.floor(totalMinutes || 0));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${hours}h ${minutes}m`;
};

export function FocusInsights() {
  const [range, setRange] = useState<RangeKey>("all-time");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState({
    total_focus_minutes: 0,
    completed_runs: 0,
    completion_rate: 0,
  });
  const [tagSlices, setTagSlices] = useState<Array<{ key: string; minutes: number; percent: number; runs: number }>>([]);
  const [templateSlices, setTemplateSlices] = useState<Array<{ key: string; minutes: number; percent: number; runs: number }>>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = toRangeParams(range);
        const [tagStats, templateStats] = await Promise.all([
          fetchFocusStats({ ...params, dimension: "tag" }),
          fetchFocusStats({ ...params, dimension: "template" }),
        ]);

        if (cancelled) return;
        setSummary(tagStats.summary);
        setTagSlices(tagStats.slices || []);
        setTemplateSlices(templateStats.slices || []);
      } catch (e) {
        if (!cancelled) {
          setError(`加载专注成就失败：${e instanceof Error ? e.message : String(e)}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [range]);

  const tagPieData = useMemo(
    () => tagSlices.map((item) => ({ name: item.key, value: item.minutes })),
    [tagSlices]
  );

  const templatePieData = useMemo(
    () => templateSlices.map((item) => ({ name: item.key, value: item.minutes })),
    [templateSlices]
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">专注成就</h1>
          <p className="mt-3 text-lg text-gray-600 dark:text-gray-400 leading-relaxed">独立查看标签与模板专注表现，默认按全量历史统计。</p>
        </div>
        <div className="glass-soft rounded-2xl p-2 flex items-center gap-2">
          {(["all-time", "7d", "30d", "90d"] as RangeKey[]).map((item) => (
            <button
              key={item}
              onClick={() => setRange(item)}
              className={[
                "px-3 py-2 rounded-xl text-xs font-semibold transition-colors",
                range === item
                  ? "bg-[#88B5D3]/16 text-[#2a3b52] dark:text-[#88B5D3] border border-[#88B5D3]/40"
                  : "text-gray-500 dark:text-gray-400 hover:text-[#2a3b52] dark:hover:text-[#88B5D3]",
              ].join(" ")}
            >
              {rangeLabelMap[item]}
            </button>
          ))}
        </div>
      </header>

      {error && <div className="glass-soft rounded-2xl px-4 py-3 text-sm text-[#2a3b52] dark:text-[#88B5D3]">{error}</div>}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card rounded-3xl p-6 border border-[#88B5D3]/30">
          <p className="text-sm text-gray-500 dark:text-gray-400">总累计专注</p>
          <p className="mt-2 text-4xl font-bold text-[#FF9900] tracking-tight">{loading ? "..." : formatMinutesAsHourMinute(summary.total_focus_minutes)}</p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">范围：{rangeLabelMap[range]}</p>
        </div>

        <div className="glass-card rounded-3xl p-6 border border-[#88B5D3]/30">
          <p className="text-sm text-gray-500 dark:text-gray-400">完成轮次</p>
          <p className="mt-2 text-4xl font-bold text-gray-900 dark:text-white tracking-tight">{loading ? "..." : summary.completed_runs}</p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">status=completed 且有效时长</p>
        </div>

        <div className="glass-card rounded-3xl p-6 border border-[#88B5D3]/30">
          <p className="text-sm text-gray-500 dark:text-gray-400">完成率</p>
          <p className="mt-2 text-4xl font-bold text-[#2a3b52] dark:text-[#88B5D3] tracking-tight">
            {loading ? "..." : `${summary.completion_rate.toFixed(1)}%`}
          </p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">completed / all runs</p>
        </div>
      </section>

      <div className="glass-soft rounded-2xl px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
        统计数据来源：focus_runs（已完成且有效时长），按标签/模板自动关联聚合。
      </div>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="glass-card rounded-3xl p-6 border border-[#88B5D3]/30">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">标签专注占比</h2>
          <div className="h-[300px]">
            {loading ? (
              <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">加载中...</div>
            ) : tagPieData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">暂无标签专注数据</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
                <PieChart>
                  <Pie
                    data={tagPieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={2}
                    label={(entry) => `${entry.name} ${entry.value}m`}
                  >
                    {tagPieData.map((item, index) => (
                      <Cell key={`${item.name}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${Number(value).toFixed(0)} 分钟`} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="glass-card rounded-3xl p-6 border border-[#88B5D3]/30">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">模板专注占比</h2>
          <div className="h-[300px]">
            {loading ? (
              <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">加载中...</div>
            ) : templatePieData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">暂无模板专注数据</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
                <PieChart>
                  <Pie
                    data={templatePieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={2}
                    label={(entry) => `${entry.name} ${entry.value}m`}
                  >
                    {templatePieData.map((item, index) => (
                      <Cell key={`${item.name}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${Number(value).toFixed(0)} 分钟`} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card rounded-3xl p-6 border border-[#88B5D3]/30">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">TOP3 标签</h2>
          <div className="space-y-2">
            {tagSlices.slice(0, 3).map((item, idx) => (
              <div key={`${item.key}-${idx}`} className="glass-soft rounded-xl px-3 py-2 flex items-center justify-between text-sm">
                <span className="text-gray-700 dark:text-gray-200">#{idx + 1} {item.key}</span>
                <span className="font-semibold text-[#FF9900]">{formatMinutesAsHourMinute(item.minutes)} · {item.runs}次</span>
              </div>
            ))}
            {tagSlices.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">暂无数据</p>}
          </div>
        </div>

        <div className="glass-card rounded-3xl p-6 border border-[#88B5D3]/30">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">TOP3 模板</h2>
          <div className="space-y-2">
            {templateSlices.slice(0, 3).map((item, idx) => (
              <div key={`${item.key}-${idx}`} className="glass-soft rounded-xl px-3 py-2 flex items-center justify-between text-sm">
                <span className="text-gray-700 dark:text-gray-200">#{idx + 1} {item.key}</span>
                <span className="font-semibold text-[#FF9900]">{formatMinutesAsHourMinute(item.minutes)} · {item.runs}次</span>
              </div>
            ))}
            {templateSlices.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">暂无数据</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
