import React from 'react';
import { Card } from 'antd';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  color?: string;
  change?: string;
  icon?: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, color, change, icon }) => (
  <Card size="small" style={{ flex: 1 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {icon && (
        <div style={{
          width: 40, height: 40, borderRadius: 8,
          background: `${color || '#1677ff'}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, color: color || '#1677ff',
        }}>
          {icon}
        </div>
      )}
      <div>
        <div style={{ fontSize: 12, color: '#999' }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 600, color: color }}>{value}</div>
      </div>
      {change && <span style={{ marginLeft: 'auto', fontSize: 12, color: '#52c41a' }}>{change}</span>}
    </div>
  </Card>
);

export default StatCard;
