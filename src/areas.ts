// Areas are how the return is reviewed: each one owns a set of lines and documents, has a
// budget, an assignee, findings, and sign-offs. Lines are mapped to areas by form and line.

export interface Area {
  id: string
  name: string
  short: string
  budget?: string // key into firm.budget_hours
  blurb: string
  headline: string[] // lines shown on the area card
  docs: string[]
}

export const AREAS: Area[] = [
  { id: 'intake', name: 'Engagement & household', short: 'Intake', budget: 'intake_and_engagement', blurb: 'Engagement, consents, identity, dependents, residency.', headline: [], docs: ['D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D71'] },
  { id: 'wages', name: 'Wages & stock compensation', short: 'Wages', budget: 'wages_and_stock_compensation', blurb: 'Forms W-2, stock compensation (RSU, ESPP, ISO and its AMT effect), excess social security.', headline: ['F1040.1z', 'F6251.2i', 'Sch3.11'], docs: ['D08', 'D09', 'D10', 'D11', 'D12', 'D13', 'D73'] },
  { id: 'investments', name: 'Investments & digital assets', short: 'Investments', budget: 'investments_and_digital_assets', blurb: 'Brokerage and crypto sales, interest and dividends, foreign accounts.', headline: ['F1040.2b', 'F1040.3b', 'F1040.7'], docs: ['D28', 'D29', 'D30', 'D31', 'D32', 'D33', 'D34', 'D35', 'D36', 'D74'] },
  { id: 'business', name: 'Business (Schedule C)', short: 'Business', budget: 'business', blurb: 'Books to tax, 1099 matching, equipment, vehicle, home office, SE tax, SEP, QBI.', headline: ['SchC.1', 'SchC.31', 'Sch1.16'], docs: ['D14', 'D15', 'D16', 'D17', 'D18', 'D19', 'D20', 'D21', 'D22', 'D23', 'D24', 'D25', 'D26', 'D27'] },
  { id: 'rentals', name: 'Rentals & property sales', short: 'Rentals', budget: 'rentals_and_sale', blurb: 'Rental properties, sales of business property (Form 4797), passive losses.', headline: ['SchE.21A', 'SchE.21B', 'F4797.25'], docs: ['D46', 'D47', 'D48', 'D49', 'D50', 'D51', 'D52', 'D53'] },
  { id: 'passthrough', name: 'K-1s & basis', short: 'K-1s', budget: 'pass_throughs_and_basis', blurb: 'Partnership and S corporation K-1s, stock basis and capital accounts.', headline: ['SchE.32', 'F7203.excess'], docs: ['D37', 'D38', 'D39', 'D40'] },
  { id: 'retirement', name: 'Retirement, HSA & foreign', short: 'Retirement', budget: 'deductions_and_credits', blurb: 'IRAs and Roth conversions (Form 8606), HSA, foreign financial assets (Form 8938).', headline: ['F1040.4b', 'F8938.1.max'], docs: ['D41', 'D42', 'D43', 'D44', 'D45', 'D36'] },
  { id: 'deductions', name: 'Deductions & credits', short: 'Deductions', budget: 'deductions_and_credits', blurb: 'Itemized deductions, charitable gifts, child, education and dependent-care credits.', headline: ['SchA.17', 'F1040.19'], docs: ['D54', 'D55', 'D56', 'D57', 'D58', 'D59', 'D60', 'D61', 'D62', 'D63', 'D64', 'D65', 'D66'] },
  { id: 'tax', name: 'Tax & payments', short: 'Tax & payments', budget: undefined, blurb: 'Tax computation, AMT, other taxes, estimates, extension, penalty.', headline: ['F1040.24', 'F1040.33', 'F1040.37'], docs: ['D67', 'D69', 'D70', 'D72'] },
  { id: 'california', name: 'California (540NR)', short: 'California', budget: 'california', blurb: 'Residency split, California-source income, California payments.', headline: ['F540NR.32', 'F540NR.64', 'F540NR.97'], docs: ['D68'] },
]

export const AREA_BY_ID = new Map(AREAS.map(a => [a.id, a]))

export function areaOfLine(key: string): string {
  const [form, ...rest] = key.split('.')
  const line = rest.join('.')
  if (form === 'F1040') {
    if (/^1[a-z]$/.test(line)) return 'wages'
    if (/^(2a|2b|3a|3b|7)$/.test(line)) return 'investments'
    if (/^[456][a-z]$/.test(line)) return 'retirement'
    if (/^(12|13|14|19|20)$/.test(line)) return 'deductions'
    return 'tax'
  }
  if (form === 'SchB') return line.startsWith('7') || line.startsWith('8') ? 'retirement' : 'investments'
  if (form === 'F8949') return line.startsWith('F.') ? 'passthrough' : 'investments'
  if (form === 'SchD') return line === '12' ? 'passthrough' : line === '11' ? 'rentals' : 'investments'
  if (form === 'F8960' || form === 'Sch3' && line === '1') return 'investments'
  if (['SchC', 'SchSE', 'F4562-C', 'F8995'].includes(form)) return 'business'
  if (form === 'Sch1') {
    if (line === '3' || line === '15' || line === '16' || line === '17') return 'business'
    if (line === '5') return 'rentals'
    if (line === '13') return 'retirement'
    return 'tax'
  }
  if (form === 'SchE') return /^(28|32)/.test(line) ? 'passthrough' : 'rentals'
  if (['F4562-E', 'F4797', 'F8582'].includes(form)) return 'rentals'
  if (form === 'F7203') return 'passthrough'
  if (['F8606', 'F8889', 'F8938'].includes(form)) return 'retirement'
  if (['SchA', 'F8283', 'F8812', 'F8863', 'F2441', 'F8867'].includes(form)) return 'deductions'
  if (form === 'Sch3') return line === '8' ? 'deductions' : 'tax'
  if (form === 'F6251') return line === '2i' ? 'wages' : 'tax'
  if (form === 'F8959') return 'wages'
  if (['Sch2', 'F2210'].includes(form)) return 'tax'
  if (['SchCA540NR', 'F540NR', 'FTB3885A', 'FTB5805', 'ScheduleS'].includes(form)) return 'california'
  return 'tax'
}

// Tax-effect categories (README: multiply a change by the matching rate). Each category has
// a "driver" line: an adjustment's delta is propagated through the line graph and the change
// that reaches the driver is what gets multiplied - so an expense decrease correctly raises profit.
export const CATEGORIES: { id: string; label: string; driver?: string; help: string }[] = [
  { id: 'wages', label: 'Wages', driver: 'F1040.1z', help: 'Wages (federal and California-source)' },
  { id: 'interest', label: 'Interest / dividends', driver: 'F1040.9', help: 'Interest and dividends' },
  { id: 'schc_profit', label: 'Schedule C profit', driver: 'SchC.31', help: 'Drives SE tax and QBI too' },
  { id: 'stcg', label: 'Short-term gain', driver: 'SchD.7', help: 'Short-term capital gain' },
  { id: 'ltcg', label: 'Long-term gain', driver: 'SchD.15', help: 'Long-term capital gain' },
  { id: 'ordinary_income', label: 'Other income', driver: 'F1040.8', help: 'Other ordinary income' },
  { id: 'adjustment', label: 'Adjustment to income', driver: 'F1040.10', help: 'Adjustments to income' },
  { id: 'salt', label: 'State & local tax', driver: 'SchA.5d', help: 'Subject to the SALT cap' },
  { id: 'itemized', label: 'Other itemized', driver: 'SchA.17', help: 'Other itemized deductions' },
  { id: 'ca_source_income', label: 'CA-source only', help: 'Changes only the California-source amount' },
  { id: 'credit', label: 'Credit (1:1)', help: 'Credits change tax 1:1' },
  { id: 'payment', label: 'Payment (1:1)', help: 'Payments change the balance 1:1' },
  { id: 'none', label: 'No tax effect', help: 'Informational or text line' },
  { id: 'custom', label: 'Engine / manual effect', help: 'Effect taken from an engine what-if or computed by hand' },
]

export function defaultCategory(key: string): string {
  const a = areaOfLine(key)
  if (key.startsWith('F540NR.7') || key.startsWith('F1040.2') && key !== 'F1040.2b' || key === 'F1040.26' || key === 'Sch3.10') return 'payment'
  if (key.startsWith('SchCA540NR.') && key.endsWith('.E')) return 'ca_source_income'
  if (key.startsWith('SchC.') && /\.(4[3-4]|I|J)/.test(key)) return 'none'
  if (a === 'business') return key.startsWith('Sch1.1') ? 'adjustment' : 'schc_profit'
  if (key.startsWith('SchB.') || key.startsWith('F1040.2') || key.startsWith('F1040.3')) return 'interest'
  if (key.startsWith('F8949.') || key.startsWith('SchD.')) {
    const box = key.split('.')[1]
    return 'ABCGHI'.includes(box[0]) || ['1b', '2', '3', '6', '7'].includes(box) ? 'stcg' : 'ltcg'
  }
  if (key.startsWith('SchA.5') ) return 'salt'
  if (key.startsWith('SchA.') || key.startsWith('F8283')) return 'itemized'
  if (key.startsWith('Sch1.')) return 'adjustment'
  if (key.startsWith('F1040.1')) return 'wages'
  if (key.startsWith('SchE.') || key.startsWith('F4797')) return 'ordinary_income'
  if (key.startsWith('F8812') || key.startsWith('F2441') || key.startsWith('F8863') || key.startsWith('Sch3.')) return 'credit'
  return 'ordinary_income'
}

export const BUDGET_LABEL: Record<string, string> = {
  intake_and_engagement: 'Intake & engagement',
  wages_and_stock_compensation: 'Wages & stock comp',
  investments_and_digital_assets: 'Investments & digital assets',
  business: 'Business',
  rentals_and_sale: 'Rentals & sale',
  pass_throughs_and_basis: 'Pass-throughs & basis',
  deductions_and_credits: 'Deductions & credits',
  california: 'California',
  partner_review: 'Partner review',
}
