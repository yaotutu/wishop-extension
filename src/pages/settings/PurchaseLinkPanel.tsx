import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Space, Switch, Tag, Typography, message } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, LinkOutlined } from '@ant-design/icons';
import type { PurchaseLinkSettings, PurchaseLinkSourceId } from '../../shared/settings';
import { LINK_SOURCE_DEFAULT_ORDER } from '../../shared/settings';
import { useAppSettingsQuery, useUpdateAppSettingsMutation } from '../../hooks/useOrderQueries';

const { Text } = Typography;

// 来源的中文名称和说明。新增来源时在这里加一行，设置页会自动展示。
const SOURCE_META: Record<PurchaseLinkSourceId, { label: string; desc: string; automatic: boolean }> = {
  manual: { label: '手动输入', desc: '用户在订单详情里手动填写的淘宝采购单号', automatic: false },
  merchant_notes: { label: '卖家备注', desc: '同步订单时从微信卖家备注自动提取淘宝单号', automatic: true },
  payment_success: { label: '付款页抓取', desc: '用户去发货付款成功后自动抓取的淘宝单号', automatic: true },
};

/**
 * 采购订单关联设置面板。
 * 用户可以上下移动调整来源优先级，开关控制自动来源是否启用。
 */
const PurchaseLinkPanel: React.FC = () => {
  const settingsQuery = useAppSettingsQuery();
  const updateSettingsMutation = useUpdateAppSettingsMutation();
  const [sourceOrder, setSourceOrder] = useState<PurchaseLinkSourceId[]>([]);
  const [enabledSources, setEnabledSources] = useState<PurchaseLinkSourceId[]>([]);

  useEffect(() => {
    const settings = settingsQuery.data?.purchaseLink;
    if (!settings) return;
    setSourceOrder([...settings.sourceOrder]);
    setEnabledSources([...settings.enabledSources]);
  }, [settingsQuery.data?.purchaseLink]);

  const handleSave = async () => {
    await updateSettingsMutation.mutateAsync({
      purchaseLink: { sourceOrder, enabledSources },
    });
    message.success('采购关联设置已保存');
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sourceOrder.length) return;
    const next = [...sourceOrder];
    [next[index], next[target]] = [next[target], next[index]];
    setSourceOrder(next);
  };

  const toggleSource = (source: PurchaseLinkSourceId, enabled: boolean) => {
    setEnabledSources(prev => enabled
      ? [...prev.filter(id => id !== source), source]
      : prev.filter(id => id !== source),
    );
  };

  const currentSettings = settingsQuery.data?.purchaseLink;
  const dirty = JSON.stringify(sourceOrder) !== JSON.stringify(currentSettings?.sourceOrder ?? [])
    || JSON.stringify(enabledSources) !== JSON.stringify(currentSettings?.enabledSources ?? []);

  return (
    <Card title="采购订单关联设置">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="关联来源优先级"
        description="列表从上到下优先级递减。当不同来源给同一个订单关联了不同的淘宝单号时，高优先级来源会覆盖低优先级来源。手动输入永远可写，不受开关控制。"
      />
      <Space direction="vertical" style={{ width: '100%', maxWidth: 620 }}>
        {sourceOrder.map((source, index) => {
          const meta = SOURCE_META[source];
          const enabled = enabledSources.includes(source);
          return (
            <div
              key={source}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                border: '1px solid #f0f0f0',
                borderRadius: 8,
                background: index === 0 ? '#f6ffed' : undefined,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <LinkOutlined style={{ color: '#0958d9' }} />
                <div>
                  <Space size={8}>
                    <Text strong>{meta.label}</Text>
                    {index === 0 && <Tag color="green">最高优先级</Tag>}
                    {!meta.automatic && <Tag>用户操作</Tag>}
                  </Space>
                  <div><Text type="secondary" style={{ fontSize: 12 }}>{meta.desc}</Text></div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {meta.automatic && (
                  <Switch
                    checked={enabled}
                    onChange={checked => toggleSource(source, checked)}
                    checkedChildren="开"
                    unCheckedChildren="关"
                  />
                )}
                <Space size={4}>
                  <Button
                    size="small"
                    icon={<ArrowUpOutlined />}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  />
                  <Button
                    size="small"
                    icon={<ArrowDownOutlined />}
                    disabled={index === sourceOrder.length - 1}
                    onClick={() => move(index, 1)}
                  />
                </Space>
              </div>
            </div>
          );
        })}
      </Space>
      <div style={{ marginTop: 16, maxWidth: 620 }}>
        <Space>
          <Button
            type="primary"
            onClick={handleSave}
            disabled={!dirty}
            loading={updateSettingsMutation.isPending}
          >
            保存设置
          </Button>
          <Button
            onClick={() => {
              setSourceOrder([...LINK_SOURCE_DEFAULT_ORDER]);
              setEnabledSources(['merchant_notes', 'payment_success']);
            }}
          >
            恢复默认
          </Button>
        </Space>
      </div>
    </Card>
  );
};

export default PurchaseLinkPanel;
