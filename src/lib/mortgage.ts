import type { LoanType, MortgageCalculation, AmortizationRow } from '@/types';

// King County, WA FHA limits (2025)
export const FHA_LOAN_LIMIT_KING_COUNTY = 977500;
export const FHA_DOWN_PAYMENT_PERCENT = 3.5;
export const FHA_MIN_CREDIT_SCORE = 580;
export const FHA_UPFRONT_MIP_RATE = 0.0175; // 1.75%
export const FHA_ANNUAL_MIP_RATE = 0.0055; // 0.55%

export const CONVENTIONAL_MIN_DOWN_PERCENT = 5;
export const CONVENTIONAL_PMI_RATE = 0.005; // ~0.5% annual (varies)

export const VA_FUNDING_FEE_FIRST_USE = 0.023; // 2.3% first use
export const VA_DOWN_PAYMENT_PERCENT = 0;

export const KING_COUNTY_PROPERTY_TAX_RATE = 0.01; // ~1%

export function calculateMortgage(params: {
  loanType: LoanType;
  purchasePrice: number;
  downPaymentPercent: number;
  interestRate: number;
  loanTermYears: number;
  hoaMonthly?: number;
  propertyTaxAnnual?: number;
}): MortgageCalculation {
  const {
    loanType,
    purchasePrice,
    downPaymentPercent,
    interestRate,
    loanTermYears,
    hoaMonthly = 0,
  } = params;

  const downPaymentAmount = purchasePrice * (downPaymentPercent / 100);
  let loanAmount = purchasePrice - downPaymentAmount;

  // FHA upfront MIP gets rolled into loan
  let upfrontMip = 0;
  if (loanType === 'FHA') {
    upfrontMip = loanAmount * FHA_UPFRONT_MIP_RATE;
    loanAmount += upfrontMip;
  }

  const monthlyRate = interestRate / 100 / 12;
  const totalPayments = loanTermYears * 12;

  let monthlyPrincipalAndInterest: number;
  if (monthlyRate === 0) {
    monthlyPrincipalAndInterest = loanAmount / totalPayments;
  } else {
    monthlyPrincipalAndInterest =
      (loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, totalPayments))) /
      (Math.pow(1 + monthlyRate, totalPayments) - 1);
  }

  // Monthly MIP/PMI
  let monthlyMipOrPmi = 0;
  if (loanType === 'FHA') {
    monthlyMipOrPmi = ((purchasePrice - downPaymentAmount) * FHA_ANNUAL_MIP_RATE) / 12;
  } else if (loanType === 'Conventional' && downPaymentPercent < 20) {
    monthlyMipOrPmi = ((purchasePrice - downPaymentAmount) * CONVENTIONAL_PMI_RATE) / 12;
  }

  const propertyTaxAnnual =
    params.propertyTaxAnnual ?? purchasePrice * KING_COUNTY_PROPERTY_TAX_RATE;
  const monthlyPropertyTax = propertyTaxAnnual / 12;

  const totalMonthlyPayment =
    monthlyPrincipalAndInterest + monthlyMipOrPmi + monthlyPropertyTax + hoaMonthly;

  return {
    loanType,
    purchasePrice,
    downPaymentPercent,
    downPaymentAmount,
    loanAmount,
    interestRate,
    loanTermYears,
    monthlyPrincipalAndInterest,
    monthlyMipOrPmi,
    monthlyPropertyTax,
    monthlyHoa: hoaMonthly,
    totalMonthlyPayment,
    upfrontMip,
  };
}

export function generateAmortizationSchedule(
  loanAmount: number,
  interestRate: number,
  loanTermYears: number
): AmortizationRow[] {
  const monthlyRate = interestRate / 100 / 12;
  const totalPayments = loanTermYears * 12;

  let monthlyPayment: number;
  if (monthlyRate === 0) {
    monthlyPayment = loanAmount / totalPayments;
  } else {
    monthlyPayment =
      (loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, totalPayments))) /
      (Math.pow(1 + monthlyRate, totalPayments) - 1);
  }

  const schedule: AmortizationRow[] = [];
  let balance = loanAmount;

  for (let month = 1; month <= totalPayments; month++) {
    const interest = balance * monthlyRate;
    const principal = monthlyPayment - interest;
    balance = Math.max(0, balance - principal);

    schedule.push({
      month,
      payment: monthlyPayment,
      principal,
      interest,
      balance,
    });
  }

  return schedule;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatCurrencyDetailed(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export const DEFAULT_CHECKLIST_ITEMS = [
  { title: 'Check credit score & reports', description: 'Review all three credit bureau reports for accuracy', sort_order: 1 },
  { title: 'Get pre-approved for mortgage', description: 'Contact lenders and get a pre-approval letter', sort_order: 2 },
  { title: 'Determine budget', description: 'Calculate how much house you can afford based on income and debts', sort_order: 3 },
  { title: 'Find a real estate agent', description: 'Interview and select a buyer\'s agent', sort_order: 4 },
  { title: 'Start house hunting', description: 'Tour properties that meet your criteria', sort_order: 5 },
  { title: 'Make an offer', description: 'Submit offer with your agent\'s guidance', sort_order: 6 },
  { title: 'Home inspection', description: 'Hire a licensed inspector to evaluate the property', sort_order: 7 },
  { title: 'Appraisal', description: 'Lender orders appraisal to confirm property value', sort_order: 8 },
  { title: 'Final loan approval', description: 'Submit all required documents for underwriting', sort_order: 9 },
  { title: 'Final walkthrough', description: 'Inspect property one last time before closing', sort_order: 10 },
  { title: 'Closing day', description: 'Sign documents, pay closing costs, get your keys!', sort_order: 11 },
];

export const WSHFC_PROGRAMS = [
  {
    name: 'Home Advantage Program',
    description: 'Below-market interest rates for first-time and repeat homebuyers',
    url: 'https://www.wshfc.org/buyers/homeadvantage.htm',
  },
  {
    name: 'House Key Opportunity Program',
    description: 'Down payment assistance for first-time homebuyers',
    url: 'https://www.wshfc.org/buyers/housekeyopportunity.htm',
  },
  {
    name: 'Home Advantage DPA',
    description: 'Up to 4% down payment assistance as a second mortgage',
    url: 'https://www.wshfc.org/buyers/dpa.htm',
  },
];
