import type { GlossaryTerm } from './schema';

/**
 * Jargon underlined in selected client surfaces (F2). `short` is one line
 * (≤ 120 chars); `topicSlug` powers "Explain more".
 */
export const GLOSSARY: readonly GlossaryTerm[] = [
  { term: 'SPICe+', aliases: ['SPICe Plus', 'Spice Part A', 'Spice Part B', 'Spice A', 'Spice B', 'INC-32'], short: 'The single online form used to incorporate a company in India.', topicSlug: 'spice-plus-part-a' },
  { term: 'DIN', aliases: ['Director Identification Number'], short: 'A unique number every company director in India holds.', topicSlug: 'director-kyc' },
  { term: 'DSC', aliases: ['Digital Signature Certificate'], short: 'An electronic signature used to sign government filings online.' },
  { term: 'MOA', aliases: ['Memorandum of Association'], short: "The company's charter: its name, objects and share capital." },
  { term: 'AOA', aliases: ['Articles of Association'], short: 'The rules for how the company is run internally.' },
  { term: 'COI', aliases: ['Certificate of Incorporation'], short: 'The certificate that proves the company legally exists.' },
  { term: 'CIN', aliases: ['Corporate Identification Number'], short: 'The 21-character number that identifies a company.' },
  { term: 'PAN', aliases: ['Permanent Account Number'], short: 'The income-tax identity number for a person or company.' },
  { term: 'TAN', aliases: ['Tax Deduction and Collection Account Number'], short: 'The number a business uses to deduct and pay tax at source.' },
  { term: 'GST', aliases: ['Goods and Services Tax'], short: "India's tax on the supply of goods and services.", topicSlug: 'gst-basics' },
  { term: 'GSTIN', aliases: [], short: 'The 15-character GST registration number.', topicSlug: 'gst-basics' },
  { term: 'TDS', aliases: ['Tax Deducted at Source'], short: 'Tax a payer deducts from certain payments and pays to the government.' },
  { term: 'FEMA', aliases: ['Foreign Exchange Management Act'], short: 'The law governing foreign investment and foreign exchange in India.', topicSlug: 'fc-gpr' },
  { term: 'FC-GPR', aliases: ['FCGPR'], short: 'Report to the RBI after shares are issued to a foreign investor.', topicSlug: 'fc-gpr', appliesTo: { legalForms: [], residency: ['foreign'] } },
  { term: 'ROC', aliases: ['Registrar of Companies'], short: 'The government office that registers companies and receives their filings.' },
  { term: 'INC-20A', aliases: [], short: 'The declaration that the company has started business and received share money.', topicSlug: 'after-incorporation' },
  { term: 'ADT-1', aliases: [], short: 'The form reporting the appointment of the company auditor.', topicSlug: 'after-incorporation' },
  { term: 'IEC', aliases: ['Importer Exporter Code'], short: 'The code a business needs to import or export goods and services.' },
  { term: 'LUT', aliases: ['Letter of Undertaking'], short: 'Lets an exporter supply without paying GST upfront.' },
  { term: 'PF', aliases: ['Provident Fund', 'EPFO'], short: 'Retirement savings scheme employers register for and contribute to.' },
  { term: 'ESI', aliases: ["Employees' State Insurance", 'ESIC'], short: 'Health insurance scheme for employees below a salary limit.' },
  { term: 'Professional Tax', aliases: ['PT'], short: 'A state tax on employment, deducted from salaries in some states.' },
  { term: 'LLP', aliases: ['Limited Liability Partnership'], short: 'A partnership whose partners have limited liability.', topicSlug: 'fillip-llp-incorporation' },
  { term: 'FiLLiP', aliases: [], short: 'The online form used to incorporate an LLP.', topicSlug: 'fillip-llp-incorporation' },
];
