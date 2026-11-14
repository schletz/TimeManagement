import { apiCall } from './client';
import type {
  CatalogItem, DashboardData, Demand, DemandInput, DemandStatus, Employee, FileData, Invoice, InvoiceKind,
  InvoicePreview, InvoiceSelection, Me, Photo, Project, ProjectInput, Purchase, PurchaseInput, Settings,
  TimeEntry, TimeEntryInput,
} from './types';

/** Typed wrappers for all backend actions (see SPEC chapter 7). */
export const api = {
  me: () => apiCall<Me>('me'),

  listProjects: () => apiCall<Project[]>('listProjects'),
  getProject: (projectId: string) => apiCall<Project>('getProject', { projectId }),
  saveProject: (p: ProjectInput) => apiCall<Project>('saveProject', p),
  closeProject: (projectId: string, confirm = false) => apiCall<Project>('closeProject', { projectId, confirm }),
  reopenProject: (projectId: string) => apiCall<Project>('reopenProject', { projectId }),

  listTimeEntries: (projectId: string) => apiCall<TimeEntry[]>('listTimeEntries', { projectId }),
  saveTimeEntry: (t: TimeEntryInput) => apiCall<TimeEntry>('saveTimeEntry', t),
  deleteTimeEntry: (projectId: string, id: string) => apiCall<{ deleted: boolean }>('deleteTimeEntry', { projectId, id }),

  listPurchases: (projectId: string) => apiCall<Purchase[]>('listPurchases', { projectId }),
  savePurchase: (p: PurchaseInput) => apiCall<Purchase>('savePurchase', p),
  deletePurchase: (projectId: string, id: string) => apiCall<{ deleted: boolean }>('deletePurchase', { projectId, id }),
  setReimbursed: (p: { projectId?: string; ids?: string[]; employeeId?: string; reimbursed?: boolean }) =>
    apiCall<{ count: number }>('setReimbursed', p),
  listMyReimbursements: (employeeId?: string) => apiCall<Purchase[]>('listMyReimbursements', { employeeId }),
  uploadReceipt: (projectId: string, id: string, base64: string) =>
    apiCall<{ fileId: string }>('uploadReceipt', { projectId, id, base64 }),
  getReceipt: (projectId: string, purchaseId: string) => apiCall<FileData>('getReceipt', { projectId, purchaseId }),

  listDemands: (projectId: string) => apiCall<Demand[]>('listDemands', { projectId }),
  saveDemand: (d: DemandInput) => apiCall<Demand>('saveDemand', d),
  setDemandStatus: (projectId: string, id: string, status: DemandStatus) =>
    apiCall<Demand>('setDemandStatus', { projectId, id, status }),

  listPhotos: (projectId: string, onlyPreDamage = false) => apiCall<Photo[]>('listPhotos', { projectId, onlyPreDamage }),
  getPhoto: (projectId: string, ref: { photoId?: string; demandId?: string }) =>
    apiCall<FileData>('getPhoto', { projectId, ...ref }),
  uploadPhoto: (p: { id: string; projectId: string; takenAt: string; description: string; preDamage: boolean; base64: string }) =>
    apiCall<Photo>('uploadPhoto', p),
  updatePhoto: (p: { projectId: string; id: string; description?: string; preDamage?: boolean; base64?: string }) =>
    apiCall<Photo>('updatePhoto', p),
  deletePhoto: (projectId: string, id: string) => apiCall<{ deleted: boolean }>('deletePhoto', { projectId, id }),

  previewInvoice: (s: InvoiceSelection) => apiCall<InvoicePreview>('previewInvoice', s),
  createInvoice: (p: InvoiceSelection & { id: string; number: string; date: string; kind: InvoiceKind }) =>
    apiCall<{ invoice: Invoice; file: FileData | null }>('createInvoice', p),
  listInvoices: (projectId: string) => apiCall<Invoice[]>('listInvoices', { projectId }),
  downloadInvoice: (projectId: string, invoiceId: string) => apiCall<FileData>('downloadInvoice', { projectId, invoiceId }),
  setInvoicePaid: (projectId: string, invoiceId: string, paid: boolean, paidAt?: string) =>
    apiCall<Invoice>('setInvoicePaid', { projectId, invoiceId, paid, paidAt }),
  deleteInvoice: (projectId: string, invoiceId: string) => apiCall<{ deleted: boolean }>('deleteInvoice', { projectId, invoiceId }),

  listEmployees: () => apiCall<Employee[]>('listEmployees'),
  saveEmployee: (e: Partial<Employee> & { name: string; email: string }) => apiCall<Employee>('saveEmployee', e),
  listCatalog: () => apiCall<CatalogItem[]>('listCatalog'),
  saveCatalogItem: (c: CatalogItem & { originalCode?: string }) => apiCall<CatalogItem>('saveCatalogItem', c),
  deleteCatalogItem: (code: string) => apiCall<{ deleted: boolean }>('deleteCatalogItem', { code }),
  getSettings: () => apiCall<Settings>('getSettings'),
  saveSettings: (s: Settings) => apiCall<Settings>('saveSettings', s),

  getDashboard: (includeClosed = false) => apiCall<DashboardData>('getDashboard', { includeClosed }),
};
