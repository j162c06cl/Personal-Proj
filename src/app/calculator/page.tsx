"use client";

import { useState } from "react";
import { CalculatorResult } from "@/lib/types";
import CalculatorForm from "@/components/CalculatorForm";
import CalculatorResultCard from "@/components/CalculatorResult";

export default function CalculatorPage() {
  const [result, setResult] = useState<CalculatorResult | null>(null);

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Historical Calculator</h1>
        <p className="text-gray-400 text-sm mt-1">See what any investment would be worth today</p>
      </div>

      <CalculatorForm onResult={setResult} onClear={() => setResult(null)} />

      {result && <CalculatorResultCard result={result} />}
    </div>
  );
}
