export interface RetirementInputs {
  currentAge: number;
  retirementAge: number;
  lifeExpectancy: number;
  currentPortfolio: number;
  monthlyContribution: number;
  expectedReturn: number;
  inflationRate: number;
  monthlyExpenses: number;
  cpfOA: number;
  cpfSA: number;
  cpfMA: number;
  cpfMonthlyContrib: number;
}

export interface RetirementResult {
  personalAtRetirement: number;
  cpfAtRetirement: number;
  totalAtRetirement: number;
  inflationAdjusted: number;
  monthlyIncome: number;
  yearsMoneyLasts: number;
  fireNumber: number;
  isFireAchieved: boolean;
}

export interface ChartDataPoint {
  age: number;
  personal: number;
  cpf: number;
  total: number;
}

function fvMonthly(present: number, monthlyContrib: number, annualRate: number, months: number): number {
  if (annualRate === 0 || months === 0) return present + monthlyContrib * months;
  const r = annualRate / 100 / 12;
  return present * Math.pow(1 + r, months) + monthlyContrib * ((Math.pow(1 + r, months) - 1) / r);
}

function fvAnnual(present: number, annualContrib: number, annualRate: number, years: number): number {
  if (annualRate === 0 || years === 0) return present + annualContrib * years;
  const r = annualRate / 100;
  return present * Math.pow(1 + r, years) + annualContrib * ((Math.pow(1 + r, years) - 1) / r);
}

export function calculate(inputs: RetirementInputs): RetirementResult {
  const yearsToRetirement = Math.max(0, inputs.retirementAge - inputs.currentAge);
  const yearsInRetirement = Math.max(1, inputs.lifeExpectancy - inputs.retirementAge);
  const monthsToRetirement = yearsToRetirement * 12;

  const personalAtRetirement = fvMonthly(inputs.currentPortfolio, inputs.monthlyContribution, inputs.expectedReturn, monthsToRetirement);

  // CPF: OA 2.5%, SA 4%, MA 4%
  const cpfOAFinal = fvAnnual(inputs.cpfOA, inputs.cpfMonthlyContrib * 12, 2.5, yearsToRetirement);
  const cpfSAFinal = fvAnnual(inputs.cpfSA, 0, 4, yearsToRetirement);
  const cpfMAFinal = fvAnnual(inputs.cpfMA, 0, 4, yearsToRetirement);
  const cpfAtRetirement = cpfOAFinal + cpfSAFinal + cpfMAFinal;

  const totalAtRetirement = personalAtRetirement + cpfAtRetirement;
  const inflationFactor = Math.pow(1 + inputs.inflationRate / 100, yearsToRetirement);
  const inflationAdjusted = totalAtRetirement / inflationFactor;

  const monthlyIncome = totalAtRetirement / (yearsInRetirement * 12);

  // Years money lasts with drawdown at monthly expenses (4% rule proxy)
  const annualExpenses = inputs.monthlyExpenses * 12;
  const postRetirementReturn = inputs.expectedReturn / 100;
  let balance = totalAtRetirement;
  let years = 0;
  while (balance > 0 && years < 100) {
    balance = balance * (1 + postRetirementReturn) - annualExpenses;
    years++;
  }
  const yearsMoneyLasts = years >= 100 ? 100 : years;

  // FIRE: 25× annual expenses (4% rule)
  const fireNumber = annualExpenses * 25;
  const isFireAchieved = totalAtRetirement >= fireNumber;

  return { personalAtRetirement, cpfAtRetirement, totalAtRetirement, inflationAdjusted, monthlyIncome, yearsMoneyLasts, fireNumber, isFireAchieved };
}

export function generateChartData(inputs: RetirementInputs): ChartDataPoint[] {
  const data: ChartDataPoint[] = [];
  for (let age = inputs.currentAge; age <= inputs.lifeExpectancy; age++) {
    const y = age - inputs.currentAge;
    const personal = fvMonthly(inputs.currentPortfolio, inputs.monthlyContribution, inputs.expectedReturn, y * 12);
    const cpf = fvAnnual(inputs.cpfOA, inputs.cpfMonthlyContrib * 12, 2.5, y)
              + fvAnnual(inputs.cpfSA, 0, 4, y)
              + fvAnnual(inputs.cpfMA, 0, 4, y);
    data.push({ age, personal: Math.round(personal), cpf: Math.round(cpf), total: Math.round(personal + cpf) });
  }
  return data;
}

export function generateScenarios(inputs: RetirementInputs) {
  return [
    { label: "Conservative", rate: 5, result: calculate({ ...inputs, expectedReturn: 5 }) },
    { label: "Moderate", rate: 7, result: calculate({ ...inputs, expectedReturn: 7 }) },
    { label: "Aggressive", rate: 10, result: calculate({ ...inputs, expectedReturn: 10 }) },
  ];
}
