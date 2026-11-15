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
      <label className="block text-[11px] font-semibold text-[#525252] mb-1.5 uppercase tracking-wider">{label}</label>
      <div className="flex items-center gap-1.5">
        {prefix && <span className="text-[#525252] text-[13px] font-medium">{prefix}</span>}
        <input type="number" min={min} max={max} step={step ?? 1} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full bg-[#F7F7F8] border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-[13px] text-[#0A0A0A] focus:outline-none focus:border-[#2D8CFF] focus:bg-white focus:shadow-[0_0_0_3px_rgba(45,140,255,0.12)] transition-all" />
        {suffix && <span className="text-[#525252] text-[13px] font-medium">{suffix}</span>}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 border ${highlight ? "bg-[#EAF4FF] border-[#2D8CFF]/20" : "bg-white border-[#E5E5E5]"}`}>
      <p className="text-[11px] font-semibold text-[#525252] mb-1 uppercase tracking-wider">{label}</p>
      <p className={`text-[18px] font-bold ${highlight ? "text-[#2D8CFF]" : "text-[#0A0A0A]"}`}>{value}</p>
      {sub && <p className="text-[10px] text-[#525252] mt-0.5">{sub}</p>}
    </div>
  );
}

const CHART_COLORS = { personal: "#00B341", cpf: "#2D8CFF", total: "#F59E0B" };

function formatYAxis(v: number) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v}`;
}

const tooltipStyle = {
  backgroundColor: "#ffffff",
  border: "1px solid #E5E5E5",
  borderRadius: 12,
  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
  padding: "8px 12px",
};

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
        <h1 className="text-[32px] font-semibold tracking-tight text-[#0A0A0A]">Retirement Planner</h1>
        <p className="text-[14px] text-[#525252] mt-1">Singapore-focused retirement calculator with CPF projection</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inputs */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-[#E5E5E5] p-5">
          {/* Tab selector */}
          <div className="flex rounded-full p-0.5 gap-0.5 mb-5">
            {(["basic", "cpf"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 px-3 py-1.5 rounded-full text-[13px] font-medium transition-all duration-150 ${
                  tab === t
                    ? "bg-[#2D8CFF] text-white font-semibold"
                    : "text-[#2D8CFF] hover:bg-[#EAF4FF]"
                }`}>
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
              <p className="text-[11px] text-[#525252] bg-[#F7F7F8] border border-[#E5E5E5] rounded-xl p-2.5">CPF interest: OA 2.5% · SA 4% · MA 4%</p>
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
          <div className={`rounded-2xl p-4 border ${result.isFireAchieved ? "bg-[#EAF4FF] border-[#2D8CFF]/20" : "bg-white border-[#E5E5E5]"}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-semibold text-[#0A0A0A]">FIRE Number <span className="text-[#525252] font-normal text-[11px]">(25× annual expenses)</span></p>
                <p className="text-[22px] font-bold text-[#2D8CFF] mt-1">{formatLargeNumber(result.fireNumber)}</p>
              </div>
              <div className="text-right">
                <p className={`text-[13px] font-semibold ${result.isFireAchieved ? "text-[#2D8CFF]" : "text-amber-600"}`}>
                  {result.isFireAchieved ? "✓ FIRE Achieved" : "Not Yet Achieved"}
                </p>
                <p className="text-[11px] text-[#525252] mt-1">
                  {result.isFireAchieved
                    ? `${formatLargeNumber(result.totalAtRetirement - result.fireNumber)} surplus`
                    : `${formatLargeNumber(result.fireNumber - result.totalAtRetirement)} short`}
                </p>
              </div>
            </div>
            <div className="mt-3 bg-[#EBEBEB] rounded-full h-2">
              <div className="bg-[#2D8CFF] h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, (result.totalAtRetirement / result.fireNumber) * 100).toFixed(1)}%` }} />
            </div>
            <p className="text-[11px] text-[#525252] mt-1">{Math.min(100, (result.totalAtRetirement / result.fireNumber) * 100).toFixed(1)}% of FIRE target</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Personal Portfolio" value={formatLargeNumber(result.personalAtRetirement)} sub={`${((result.personalAtRetirement / result.totalAtRetirement) * 100).toFixed(0)}% of total`} />
            <StatCard label="Total CPF" value={formatLargeNumber(result.cpfAtRetirement)} sub={`${((result.cpfAtRetirement / result.totalAtRetirement) * 100).toFixed(0)}% of total`} />
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="mt-6 bg-white rounded-2xl border border-[#E5E5E5] p-5">
        <h2 className="text-[15px] font-semibold text-[#0A0A0A] mb-4">Portfolio Growth Over Time</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
            <XAxis dataKey="age" stroke="#A3A3A3" tick={{ fontSize: 11 }}
              label={{ value: "Age", position: "insideBottom", offset: -2, fill: "#A3A3A3", fontSize: 11 }} />
            <YAxis stroke="#A3A3A3" tick={{ fontSize: 11 }} tickFormatter={formatYAxis} width={60} />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={{ color: "#525252", fontSize: 12 }}
              formatter={(v) => formatLargeNumber(v as number)}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="personal" stroke={CHART_COLORS.personal} dot={false} strokeWidth={2} name="Personal" />
            <Line type="monotone" dataKey="cpf" stroke={CHART_COLORS.cpf} dot={false} strokeWidth={2} name="CPF" />
            <Line type="monotone" dataKey="total" stroke={CHART_COLORS.total} dot={false} strokeWidth={2.5} name="Total" />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-[#525252] mt-2 text-center">Age {inputs.currentAge} → {inputs.lifeExpectancy} · retirement at {inputs.retirementAge}</p>
      </div>

      {/* Scenarios */}
      <div className="mt-6 bg-white rounded-2xl border border-[#E5E5E5] p-5">
        <h2 className="text-[15px] font-semibold text-[#0A0A0A] mb-4">Scenario Comparison</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {scenarios.map((s) => {
            const isActive = s.rate === inputs.expectedReturn;
            return (
              <div key={s.label} onClick={() => setInputs((p) => ({ ...p, expectedReturn: s.rate }))}
                className={`rounded-2xl p-4 cursor-pointer transition-all duration-150 border ${
                  isActive
                    ? "bg-[#EAF4FF] border-[#2D8CFF]/30 shadow-[0_4px_16px_rgba(45,140,255,0.12)]"
                    : "bg-[#F7F7F8] border-[#E5E5E5] hover:border-[#C8C8C8]"
                }`}>
                <div className="flex justify-between items-start mb-3">
                  <p className="font-semibold text-[#0A0A0A] text-[13px]">{s.label}</p>
                  <span className="text-[10px] font-semibold bg-white border border-[#E5E5E5] text-[#525252] px-2 py-0.5 rounded-full">{s.rate}% p.a.</span>
                </div>
                <p className="text-[20px] font-bold text-[#2D8CFF]">{formatLargeNumber(s.result.totalAtRetirement)}</p>
                <p className="text-[11px] text-[#525252] mt-1">Monthly income: {formatCurrency(s.result.monthlyIncome)}</p>
                <p className="text-[11px] text-[#525252]">FIRE: {s.result.isFireAchieved ? "✓ Achieved" : "Not reached"}</p>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-[#525252] mt-3">Click a scenario to apply it.</p>
      </div>
    </div>
  );
}
