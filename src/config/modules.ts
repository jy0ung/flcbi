import { PlatformModule } from '@/types';

export const platformModules: PlatformModule[] = [
  {
    id: 'auto-aging',
    name: 'Auto Aging',
    description: 'Vehicle aging analysis across operational milestones',
    icon: 'Timer',
    status: 'active',
    path: '/auto-aging',
  },
  {
    id: 'finance',
    name: 'Finance Intelligence',
    description: 'Financial performance analytics and reporting',
    icon: 'DollarSign',
    status: 'coming_soon',
  },
  {
    id: 'sales',
    name: 'Sales Intelligence',
    description: 'Sales pipeline and performance tracking',
    icon: 'TrendingUp',
    status: 'coming_soon',
  },
  {
    id: 'operations',
    name: 'Operations Intelligence',
    description: 'Operational efficiency and bottleneck analysis',
    icon: 'Settings',
    status: 'coming_soon',
  },
  {
    id: 'inventory',
    name: 'Inventory Intelligence',
    description: 'Stock management and movement tracking',
    icon: 'Package',
    status: 'planned',
  },
  {
    id: 'crm',
    name: 'CRM / Customer Intelligence',
    description: 'Customer relationship and satisfaction insights',
    icon: 'Users',
    status: 'planned',
  },
  {
    id: 'hr',
    name: 'HR / People Intelligence',
    description: 'Workforce analytics and talent management',
    icon: 'UserCheck',
    status: 'planned',
  },
  {
    id: 'forecasting',
    name: 'Forecasting & AI Insights',
    description: 'Predictive analytics and AI recommendations',
    icon: 'Brain',
    status: 'planned',
  },
];
