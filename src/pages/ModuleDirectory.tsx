import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { platformModules } from '@/config/modules';
import { Timer, DollarSign, TrendingUp, Settings, Package, Users, UserCheck, Brain } from 'lucide-react';

const iconMap: Record<string, React.ElementType> = { Timer, DollarSign, TrendingUp, Settings, Package, Users, UserCheck, Brain };

export default function ModuleDirectory() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Module Directory" description="UBS platform modules and capabilities" />

      <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {platformModules.map(mod => {
          const Icon = iconMap[mod.icon] || Settings;
          return (
            <div
              key={mod.id}
              className={`glass-panel p-5 transition-all ${mod.status === 'active' ? 'cursor-pointer hover:border-primary/30 hover:scale-[1.02]' : 'opacity-60'}`}
              onClick={() => mod.path && navigate(mod.path)}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <StatusBadge status={mod.status} />
              </div>
              <h3 className="text-foreground font-semibold mb-1">{mod.name}</h3>
              <p className="text-xs text-muted-foreground">{mod.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
