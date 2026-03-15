export interface Profile {
  id: string;
  email: string;
  name: string | null;
  role: 'buyer' | 'advisor';
  income: number | null;
  credit_score: number | null;
  monthly_debt: number | null;
  savings: number | null;
  target_location: string | null;
  created_at: string;
}

export interface Property {
  id: string;
  user_id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number;
  sqft: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  hoa_monthly: number | null;
  property_tax_annual: number | null;
  year_built: number | null;
  listing_url: string | null;
  notes: string | null;
  created_at: string;
}

export type LoanType = 'FHA' | 'Conventional' | 'VA';

export interface MortgageScenario {
  id: string;
  property_id: string;
  user_id: string;
  loan_type: LoanType;
  purchase_price: number;
  down_payment_percent: number;
  down_payment_amount: number;
  interest_rate: number;
  loan_term_years: number;
  monthly_payment: number;
  monthly_mip_or_pmi: number;
  total_monthly_cost: number;
  created_at: string;
}

export interface BudgetItem {
  id: string;
  user_id: string;
  category: string;
  description: string;
  amount: number;
  is_income: boolean;
  created_at: string;
}

export interface ChecklistItem {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'complete';
  due_date: string | null;
  sort_order: number;
  created_at: string;
}

export interface AdvisorAccess {
  id: string;
  buyer_id: string;
  advisor_id: string;
  created_at: string;
}

export interface MortgageCalculation {
  loanType: LoanType;
  purchasePrice: number;
  downPaymentPercent: number;
  downPaymentAmount: number;
  loanAmount: number;
  interestRate: number;
  loanTermYears: number;
  monthlyPrincipalAndInterest: number;
  monthlyMipOrPmi: number;
  monthlyPropertyTax: number;
  monthlyHoa: number;
  totalMonthlyPayment: number;
  upfrontMip: number;
}

export interface AmortizationRow {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}
