import { VehicleCanonical, ImportBatch, DataQualityIssue, Notification, AuditLog, Branch, Company, User, SlaPolicy, PlatformModule } from '@/types';
import { KPI_DEFINITIONS } from './kpi-definitions';

export const demoVehicles: VehicleCanonical[] = [];

export const demoCompany: Company = { id: 'c1', name: 'FLC Auto Group', code: 'FLC' };

const branches = ['KK', 'TWU', 'SDK', 'LDU', 'BTU', 'MYY', 'SBW'];
export const demoBranches: Branch[] = branches.map((b, i) => ({ id: `br-${i}`, name: b, code: b, companyId: 'c1' }));

export const demoUser: User = {
  id: 'u1', email: 'director@flc.com', name: 'Sarah Chen', role: 'director', companyId: 'c1', accessScope: 'company',
};

export const demoImportBatches: ImportBatch[] = [];

export const demoQualityIssues: DataQualityIssue[] = [];

export const demoSLAs: SlaPolicy[] = KPI_DEFINITIONS.map(k => ({
  id: `sla-${k.id}`, kpiId: k.id, label: k.shortLabel, slaDays: k.slaDefault, companyId: 'c1',
}));

export const demoNotifications: Notification[] = [];

export const demoAuditLogs: AuditLog[] = [];

export const platformModules: PlatformModule[] = [
  { id: 'auto-aging', name: 'Auto Aging', description: 'Vehicle aging analysis across operational milestones', icon: 'Timer', status: 'active', path: '/auto-aging' },
  { id: 'finance', name: 'Finance Intelligence', description: 'Financial performance analytics and reporting', icon: 'DollarSign', status: 'coming_soon' },
  { id: 'sales', name: 'Sales Intelligence', description: 'Sales pipeline and performance tracking', icon: 'TrendingUp', status: 'coming_soon' },
  { id: 'operations', name: 'Operations Intelligence', description: 'Operational efficiency and bottleneck analysis', icon: 'Settings', status: 'coming_soon' },
  { id: 'inventory', name: 'Inventory Intelligence', description: 'Stock management and movement tracking', icon: 'Package', status: 'planned' },
  { id: 'crm', name: 'CRM / Customer Intelligence', description: 'Customer relationship and satisfaction insights', icon: 'Users', status: 'planned' },
  { id: 'hr', name: 'HR / People Intelligence', description: 'Workforce analytics and talent management', icon: 'UserCheck', status: 'planned' },
  { id: 'forecasting', name: 'Forecasting & AI Insights', description: 'Predictive analytics and AI recommendations', icon: 'Brain', status: 'planned' },
];

export function computeKpiSummaries(vehicles: VehicleCanonical[], slas: SlaPolicy[]): import('@/types').KpiSummary[] {
  return KPI_DEFINITIONS.map(kpi => {
    const sla = slas.find(s => s.kpiId === kpi.id);
    const slaDays = sla?.slaDays ?? kpi.slaDefault;
    const values: number[] = [];
    let invalidCount = 0;
    let missingCount = 0;

    vehicles.forEach(v => {
      const val = v[kpi.computedField] as number | null | undefined;
      if (val === null || val === undefined) missingCount++;
      else if (val < 0) invalidCount++;
      else values.push(val);
    });

    values.sort((a, b) => a - b);
    const validCount = values.length;
    const median = validCount > 0 ? values[Math.floor(validCount / 2)] : 0;
    const average = validCount > 0 ? Math.round(values.reduce((s, v) => s + v, 0) / validCount) : 0;
    const p90 = validCount > 0 ? values[Math.floor(validCount * 0.9)] : 0;
    const overdueCount = values.filter(v => v > slaDays).length;

    return { kpiId: kpi.id, label: kpi.label, shortLabel: kpi.shortLabel, validCount, invalidCount, missingCount, median, average, p90, overdueCount, slaDays };
  });
}
