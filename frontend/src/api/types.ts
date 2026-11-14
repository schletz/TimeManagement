/**
 * DTOs exchanged with the Apps Script backend (see backend/src). Dates are `YYYY-MM-DD`,
 * times `HH:MM`, timestamps `YYYY-MM-DDTHH:MM:SS`, amounts in Euro.
 */

export type Role = 'chef' | 'employee';
export type ItemStatus = 'open' | 'invoiced' | 'paid';
export type ProjectStatus = 'active' | 'closed';
export type DemandStatus = 'open' | 'ordered' | 'done';
export type Urgency = 'normal' | 'urgent';
export type InvoiceKind = 'invoice' | 'partial' | 'final';
export type InvoiceStatus = 'created' | 'paid';

export interface EmployeeRef {
  id: string;
  name: string;
  shortName: string;
  active?: boolean;
}

export interface Me {
  email: string;
  role: Role;
  employee: EmployeeRef | null;
  /** Only for the chef: all employees for selection fields. */
  employees?: EmployeeRef[];
}

export interface Employee extends EmployeeRef {
  email: string;
  hourlyRate: number;
  active: boolean;
}

export interface Project {
  id: string;
  name: string;
  client: string;
  address: string;
  siteManager: string;
  status: ProjectStatus;
  /** Chef only. */
  markupPercent?: number | null;
  effectiveMarkupPercent?: number;
  createdAt?: string;
  closedAt?: string;
}

export interface ProjectInput {
  id: string;
  name: string;
  client: string;
  address: string;
  siteManager: string;
  markupPercent: string;
}

export interface TimeEntry {
  id: string;
  date: string;
  employeeId: string;
  employeeName: string;
  from: string;
  to: string;
  hours: number;
  description: string;
  status: ItemStatus;
  invoiceId: string;
  createdAt: string;
  updatedAt: string;
  /** Frozen rate (chef only; in invoice previews the current rate). */
  rate?: number | null;
}

export interface TimeEntryInput {
  id: string;
  projectId: string;
  employeeId?: string;
  date: string;
  from: string;
  to: string;
  description: string;
  confirmOverlap?: boolean;
}

export type PurchaseSource = 'qr' | 'manual';

export interface Purchase {
  id: string;
  date: string;
  buyerId: string;
  buyerName: string;
  article: string;
  amount: number;
  source: PurchaseSource;
  cashRegisterId: string;
  receiptNumber: string;
  hasReceipt: boolean;
  receiptFileId: string;
  status: ItemStatus;
  invoiceId: string;
  reimbursed: boolean;
  reimbursedAt: string;
  createdAt: string;
  updatedAt: string;
  projectId?: string;
  projectName?: string;
}

export interface PurchaseInput {
  id: string;
  projectId: string;
  buyerId?: string;
  date: string;
  article: string;
  amount: number;
  source: PurchaseSource;
  cashRegisterId: string;
  receiptNumber: string;
  receiptFileId: string;
}

export interface Demand {
  id: string;
  date: string;
  reporterId: string;
  reporterName: string;
  material: string;
  quantity: number;
  unit: string;
  urgency: Urgency;
  note: string;
  hasPhoto: boolean;
  status: DemandStatus;
  updatedBy: string;
  updatedAt: string;
  projectId?: string;
  projectName?: string;
}

export interface DemandInput {
  id: string;
  projectId: string;
  material: string;
  quantity: number;
  unit: string;
  urgency: Urgency;
  note: string;
  photoBase64?: string;
}

export interface Photo {
  id: string;
  takenAt: string;
  uploaderId: string;
  uploaderName: string;
  description: string;
  preDamage: boolean;
  createdAt: string;
  updatedAt: string;
  /** Base64 JPEG thumbnail, null while Drive has not generated one yet. */
  thumbnail: string | null;
}

export interface FileData {
  base64: string;
  mimeType: string;
  name: string;
}

export interface CatalogItem {
  code: string;
  description: string;
  unit: string;
  price: number;
}

export interface ExtraItem {
  code: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

export interface LaborLine {
  employeeId: string;
  employeeName: string;
  hours: number;
  rate: number;
  amount: number;
}

export interface InvoiceCalc {
  laborLines: LaborLine[];
  laborTotal: number;
  totalHours: number;
  extraLines: (ExtraItem & { total: number })[];
  extrasTotal: number;
  materialBase: number;
  markupPercent: number;
  markupAmount: number;
  materialTotal: number;
  netTotal: number;
  vatPercent: number;
  vatAmount: number;
  grossTotal: number;
  periodFrom: string;
  periodTo: string;
}

export interface InvoicePreview {
  cutoffDate: string;
  timeEntries: TimeEntry[];
  purchases: Purchase[];
  calc: InvoiceCalc;
  suggestedNumber: string;
  defaultKind: InvoiceKind;
  catalog: CatalogItem[];
}

export interface InvoiceSelection {
  projectId: string;
  cutoffDate: string;
  timeEntryIds?: string[];
  purchaseIds?: string[];
  extraItems?: ExtraItem[];
}

export interface Invoice {
  id: string;
  number: string;
  kind: InvoiceKind;
  date: string;
  cutoffDate: string;
  periodFrom: string;
  periodTo: string;
  status: InvoiceStatus;
  paidAt: string;
  laborTotal: number;
  extrasTotal: number;
  materialBase: number;
  markupPercent: number;
  markupAmount: number;
  netTotal: number;
  hasDocument: boolean;
  createdAt: string;
  extraItems?: (ExtraItem & { total: number })[];
}

export interface Settings {
  chefEmail: string;
  materialMarkupPercent: number;
  reverseChargeText: string;
}

export interface StatusSums {
  total: number;
  open: number;
  invoiced: number;
  paid: number;
}

export interface DashboardData {
  projects: {
    id: string;
    name: string;
    client: string;
    status: ProjectStatus;
    hours: StatusSums;
    material: StatusSums;
    hoursPerEmployee: { employeeId: string; employeeName: string; hours: number; openHours: number }[];
  }[];
  openDemands: Demand[];
  openReimbursements: { employeeId: string; employeeName: string; count: number; amount: number }[];
}

/** Details of the CONFIRM_REQUIRED error when closing a project with open items. */
export interface OpenItemsSummary {
  hoursCount: number;
  hours: number;
  purchasesCount: number;
  purchasesAmount: number;
}
