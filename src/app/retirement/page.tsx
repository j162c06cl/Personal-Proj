"use client";

import { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { RetirementInputs, calculate, generateChartData, generateScenarios } from "@/lib/retirement";
import { formatCurrency, formatLargeNumber } from "@/lib/formatters";

const DEFAULTS: RetirementInputs = {
  currentAge: 30,
  retirementAge: 65,
  lifeExpectancy: 85,
  currentPortfolio: 50000,
  monthlyContribution: 1000,
  expectedReturn: 7,
  inflationRate: 2.5,
  monthlyExpenses: 3000,
  cpfOA: 30000,
  cpfSA: 15000,
  cpfMA: 10000,
  cpfMonthlyContrib: 700,
};

function InputRow({ label, value, onChange, min, max, step, prefix, suffix }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; prefix?: string; suffix?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-gray-500 text-sm">{prefix}</span>}
        <input
          type="number"
          min={min} max={max} step={step ?? 1}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
        />
        {suffix && <span className="text-gray-500 text-sm">{suffix}</span>}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-4 border ${highlight ? "bg-emerald-900/30 border-emerald-600" : "bg-gray-800 border-gray-700"}`}>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-lg font-bold ${highlight ? "text-emerald-400" : "text-white"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

const CHART_COLORS = { personal: "#10b981", cpf: "#3b82f6", total: "#f59e0b" };

function formatYAxis(v: number) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v}`;
}

export default function RetirementPage() {
  const [inputs, setInputs] = useState<RetirementInputs>(DEFAULTS);
  const [tab, setTab] = useState<"basic" | "cpf">("basic");

  const set = (key: keyof RetirementInputs) => (v: number) => setInputs((p) => ({ ...p, [key]: v }));

  const result = useMemo(() => calculate(inputs), [inputs]);
  const chartData = useMemo(() => generateChartData(inputs), [inputs]);
  const scenarios = useMemo(() => generateScenarios(inputs), [inputs]);

  const retirementLine = inputs.retirementAge;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Retirement Planner</h1>
        <p className="text-gray-400 text-sm mt-1">Singapore-focused retirement calculator with CPF projection</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inputs */}
        <div className="lg:col-span-1 bg-gray-800 rounded-xl border border-gray-700 p-5">
          <div className="flex gap-2 mb-5">
            {(["basic", "cpf"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t ? "bg-emerald-600 text-white" : "bg-gray-700 text-gray-400 hover:text-white"}`}>
                {t === "basic" ? "Personal" : "CPF"}
              </button>
            ))}
          </div>

          {tab === "basic" ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <InputRow label="Current Age" value={inputs.currentAge} onChange={set("currentAge")} min={18} max={80} />
                <InputRow label="Retirement Age" value={inputs.retirementAge} onChange={set("retirementAge")} min={40} max={80} />
              </div>
              <InputRow label="Life Expectancy" value={inputs.lifeExpectancy} onChange={set("lifeExpectancy")} min={60} max={100} />
              <InputRow label="Current Portfolio" value={inputs.currentPortfolio} onChange={set("currentPortfolio")} min={0} prefix="$" />
              <InputRow label="Monthly Contribution" value={inputs.monthlyContribution} onChange={set("monthlyContribution")} min={0} prefix="$" />
              <InputRow label="Monthly Expenses" value={inputs.monthlyExpenses} onChange={set("monthlyExpenses")} min={0} prefix="$" />
              <InputRow label="Expected Annual Return" value={inputs.expectedReturn} onChange={set("expectedReturn")} min={0} max={30} step={0.5} suffix="%" />
              <InputRow label="Inflation Rate" value={inputs.inflationRate} onChange={set("inflationRate")} min={0} max={10} step={0.5} suffix="%" />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-gray-500">CPF interest rates: OA 2.5% · SA 4% · MA 4%</p>
              <InputRow label="OA Balance" value={inputs.cpfOA} onChange={set("cpfOA")} min={0} prefix="$" />
              <InputRow label="SA Balance" value={inputs.cpfSA} onChange={set("cpfSA")} min={0} prefix="$" />
              <InputRow label="MA Balance" value={inputs.cpfMA} onChange={set("cpfMA")} min={0} prefix="$" />
              <InputRow label="Monthly CPF Contribution (OA)" value={inputs.cpfMonthlyContrib} onChange={set("cpfMonthlyContrib")} min={0} prefix="$" />
            </div>
          )}
        </div>

        {/* Results */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Key stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total at Retirement" value={formatLargeNumber(result.totalAtRetirement)} sub={`Age ${inputs.retirementAge}`} highlight />
            <StatCard label="Inflation Adjusted" value={formatLargeNumber(result.inflationAdjusted)} sub="In today's dollars" />
            <StatCard label="Monthly Income" value={formatCurrency(result.monthlyIncome)} sub="Simple drawdown" />
            <StatCard label="Money Lasts" value={result.yearsMoneyLasts >= 100 ? "Forever" : `${result.yearsMoneyLasts} yrs`} sub={`At $${inputs.monthlyExpenses.toLocaleString()}/mo`} />
          </div>

          {/* FIRE */}
          <div className={`rounded-xl p-4 border ${result.isFireAchieved ? "bg-emerald-900/20 border-emerald-700" : "bg-gray-800 border-gray-700"}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">FIRE Number <span className="text-gray-400 font-normal text-xs">(25× annual expenses)</span></p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{formatLargeNumber(result.fireNumber)}</p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-semibold ${result.isFireAchieved ? "text-emerald-400" : "text-amber-400"}`}>
                  {result.isFireAchieved ? "✓ FIRE Achieved" : "Not Yet Achieved"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {result.isFireAchieved
                    ? `${formatLargeNumber(result.totalAtRetirement - result.fireNumber)} surplus`
                    : `${formatLargeNumber(result.fireNumber - result.totalAtRetirement)} short`}
                </p>
              </div>
            </div>
            {/* Progress bar */}
            <div className="mt-3 bg-gray-700 rounded-full h-2">
              <div
                className="bg-emerald-500 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, (result.totalAtRetirement / result.fireNumber) * 100).toFixed(1)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">{Math.min(100, (result.totalAtRetirement / result.fireNumber) * 100).toFixed(1)}% of FIRE target</p>
          </div>

          {/* Portfolio split */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Personal Portfolio" value={formatLargeNumber(result.personalAtRetirement)} sub={`${((result.personalAtRetirement / result.totalAtRetirement) * 100).toFixed(0)}% of total`} />
            <StatCard label="Total CPF" value={formatLargeNumber(result.cpfAtRetirement)} sub={`${((result.cpfAtRetirement / result.totalAtRetirement) * 100).toFixed(0)}% of total`} />
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="mt-6 bg-gray-800 rounded-xl border border-gray-700 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Portfolio Growth Over Time</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="age" stroke="#6b7280" tick={{ fontSize: 11 }}
              label={{ value: "Age", position: "insideBottom", offset: -2, fill: "#6b7280", fontSize: 11 }} />
            <YAxis stroke="#6b7280" tick={{ fontSize: 11 }} tickFormatter={formatYAxis} width={60} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }}
              labelStyle={{ color: "#9ca3af", fontSize: 12 }}
              formatter={(v) => formatLargeNumber(v as number)}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {/* Retirement line */}
            <Line type="monotone" dataKey="personal" stroke={CHART_COLORS.personal} dot={false} strokeWidth={2} name="Personal" />
            <Line type="monotone" dataKey="cpf" stroke={CHART_COLORS.cpf} dot={false} strokeWidth={2} name="CPF" />
            <Line type="monotone" dataKey="total" stroke={CHART_COLORS.total} dot={false} strokeWidth={2.5} name="Total" strokeDasharray={undefined} />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-xs text-gray-500 mt-2 text-center">Dashed vertical at age {retirementLine} = retirement</p>
      </div>

      {/* Scenario comparison */}
      <div className="mt-6 bg-gray-800 rounded-xl border border-gray-700 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Scenario Comparison</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {scenarios.map((s) => {
            const isActive = s.rate === inputs.expectedReturn;
            return (
              <div key={s.label} onClick={() => setInputs((p) => ({ ...p, expectedReturn: s.rate }))}
                className={`rounded-xl p-4 border cursor-pointer transition-all ${isActive ? "border-emerald-500 bg-emerald-900/20" : "border-gray-700 hover:border-gray-500"}`}>
                <div className="flex justify-between items-start mb-3">
                  <p className="font-semibold text-white">{s.label}</p>
                  <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">{s.rate}% p.a.</span>
                </div>
                <p className="text-xl font-bold text-emerald-400">{formatLargeNumber(s.result.totalAtRetirement)}</p>
                <p className="text-xs text-gray-400 mt-1">Monthly income: {formatCurrency(s.result.monthlyIncome)}</p>
                <p className="text-xs text-gray-400">FIRE: {s.result.isFireAchieved ? "✓ Achieved" : "Not reached"}</p>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 mt-3">Click a scenario to apply it to your inputs.</p>
      </div>
    </div>
  );
}
