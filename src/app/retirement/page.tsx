"use client";

import { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { RetirementInputs, calculate, generateChartData, generateScenarios } from "@/lib/retirement";
import { formatCurrency, formatLargeNumber } from "@/lib/formatters";

const DEFAULTS: RetirementInputs = {
  currentAge: 30, retirementAge: 65, lifeExpectancy: 85,
  currentPortfolio: 50000, monthlyContribution: 1000,
  expectedReturn: 7, inflationRate: 2.5, monthlyExpenses: 3000,
  cpfOA: 30000, cpfSA: 15000, cpfMA: 10000, cpfMonthlyContrib: 700,
};

function InputRow({ label, value, onChange, min, max, step, prefix, suffix }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; prefix?: string; suffix?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
      <div className="flex items-center gap-1.5">
        {prefix && <span className="text-gray-500 text-sm">{prefix}</span>}
        <input type="number" min={min} max={max} step={step ?? 1} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
        {suffix && <span className="text-gray-500 text-sm">{suffix}</span>}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-4 border ${highlight ? "bg-blue-50 border-blue-300" : "bg-white border-gray-200 shadow-sm"}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-bold ${highlight ? "text-blue-700" : "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Retirement Planner</h1>
        <p className="text-gray-500 text-sm mt-1">Singapore-focused retirement calculator with CPF projection</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inputs */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex gap-2 mb-5">
            {(["basic", "cpf"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
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
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2.5 border border-gray-200">CPF interest: OA 2.5% · SA 4% · MA 4%</p>
              <InputRow label="OA Balance" value={inputs.cpfOA} onChange={set("cpfOA")} min={0} prefix="$" />
              <InputRow label="SA Balance" value={inputs.cpfSA} onChange={set("cpfSA")} min={0} prefix="$" />
              <InputRow label="MA Balance" value={inputs.cpfMA} onChange={set("cpfMA")} min={0} prefix="$" />
              <InputRow label="Monthly CPF Contribution (OA)" value={inputs.cpfMonthlyContrib} onChange={set("cpfMonthlyContrib")} min={0} prefix="$" />
            </div>
          )}
        </div>

        {/* Results */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total at Retirement" value={formatLargeNumber(result.totalAtRetirement)} sub={`Age ${inputs.retirementAge}`} highlight />
            <StatCard label="Inflation Adjusted" value={formatLargeNumber(result.inflationAdjusted)} sub="In today's dollars" />
            <StatCard label="Monthly Income" value={formatCurrency(result.monthlyIncome)} sub="Simple drawdown" />
            <StatCard label="Money Lasts" value={result.yearsMoneyLasts >= 100 ? "Forever" : `${result.yearsMoneyLasts} yrs`} sub={`At $${inputs.monthlyExpenses.toLocaleString()}/mo`} />
          </div>

          {/* FIRE */}
          <div className={`rounded-xl p-4 border ${result.isFireAchieved ? "bg-blue-50 border-blue-300" : "bg-white border-gray-200 shadow-sm"}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">FIRE Number <span className="text-gray-400 font-normal text-xs">(25× annual expenses)</span></p>
                <p className="text-2xl font-bold text-blue-600 mt-1">{formatLargeNumber(result.fireNumber)}</p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-semibold ${result.isFireAchieved ? "text-blue-600" : "text-amber-600"}`}>
                  {result.isFireAchieved ? "✓ FIRE Achieved" : "Not Yet Achieved"}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {result.isFireAchieved
                    ? `${formatLargeNumber(result.totalAtRetirement - result.fireNumber)} surplus`
                    : `${formatLargeNumber(result.fireNumber - result.totalAtRetirement)} short`}
                </p>
              </div>
            </div>
            <div className="mt-3 bg-gray-200 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, (result.totalAtRetirement / result.fireNumber) * 100).toFixed(1)}%` }} />
            </div>
            <p className="text-xs text-gray-500 mt-1">{Math.min(100, (result.totalAtRetirement / result.fireNumber) * 100).toFixed(1)}% of FIRE target</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Personal Portfolio" value={formatLargeNumber(result.personalAtRetirement)} sub={`${((result.personalAtRetirement / result.totalAtRetirement) * 100).toFixed(0)}% of total`} />
            <StatCard label="Total CPF" value={formatLargeNumber(result.cpfAtRetirement)} sub={`${((result.cpfAtRetirement / result.totalAtRetirement) * 100).toFixed(0)}% of total`} />
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Portfolio Growth Over Time</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="age" stroke="#9ca3af" tick={{ fontSize: 11 }}
              label={{ value: "Age", position: "insideBottom", offset: -2, fill: "#9ca3af", fontSize: 11 }} />
            <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={formatYAxis} width={60} />
            <Tooltip
              contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", borderRadius: "8px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
              labelStyle={{ color: "#6b7280", fontSize: 12 }}
              formatter={(v) => formatLargeNumber(v as number)}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="personal" stroke={CHART_COLORS.personal} dot={false} strokeWidth={2} name="Personal" />
            <Line type="monotone" dataKey="cpf" stroke={CHART_COLORS.cpf} dot={false} strokeWidth={2} name="CPF" />
            <Line type="monotone" dataKey="total" stroke={CHART_COLORS.total} dot={false} strokeWidth={2.5} name="Total" />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-xs text-gray-400 mt-2 text-center">Age {inputs.currentAge} → {inputs.lifeExpectancy} · retirement at {inputs.retirementAge}</p>
      </div>

      {/* Scenarios */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Scenario Comparison</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {scenarios.map((s) => {
            const isActive = s.rate === inputs.expectedReturn;
            return (
              <div key={s.label} onClick={() => setInputs((p) => ({ ...p, expectedReturn: s.rate }))}
                className={`rounded-xl p-4 border cursor-pointer transition-all ${isActive ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-400"}`}>
                <div className="flex justify-between items-start mb-3">
                  <p className="font-semibold text-gray-900">{s.label}</p>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s.rate}% p.a.</span>
                </div>
                <p className="text-xl font-bold text-blue-600">{formatLargeNumber(s.result.totalAtRetirement)}</p>
                <p className="text-xs text-gray-500 mt-1">Monthly income: {formatCurrency(s.result.monthlyIncome)}</p>
                <p className="text-xs text-gray-500">FIRE: {s.result.isFireAchieved ? "✓ Achieved" : "Not reached"}</p>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-400 mt-3">Click a scenario to apply it.</p>
      </div>
    </div>
  );
}
