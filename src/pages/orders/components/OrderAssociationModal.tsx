import React, { useEffect } from 'react';
import { Button, Form, Input, Modal, Select } from 'antd';
import type { LinkedPlatformOrder, OrderAssociation } from '../../../shared/types';

interface Props {
  open: boolean;
  association?: OrderAssociation;
  saving: boolean;
  onCancel: () => void;
  onSave: (input: Pick<OrderAssociation, 'internalRemark' | 'linkedOrders'>) => void;
  onLookupTaobaoOrder: (platformOrderId: string) => void;
}

interface FormValue {
  internalRemark: string;
  platform: LinkedPlatformOrder['platform'];
  platformOrderId: string;
  platformOrderStatus: string;
  logisticsStatus: string;
  logisticsCompany: string;
  trackingNumber: string;
  remark: string;
}

const PLATFORM_OPTIONS = [
  { value: 'taobao', label: '淘宝' },
  { value: 'tmall', label: '天猫' },
  { value: '1688', label: '1688' },
  { value: 'manual', label: '手动' },
];

const DEFAULT_VALUE: FormValue = {
  internalRemark: '',
  platform: 'taobao',
  platformOrderId: '',
  platformOrderStatus: '',
  logisticsStatus: '',
  logisticsCompany: '',
  trackingNumber: '',
  remark: '',
};

export const OrderAssociationModal: React.FC<Props> = ({ open, association, saving, onCancel, onSave, onLookupTaobaoOrder }) => {
  const [form] = Form.useForm<FormValue>();

  useEffect(() => {
    const linked = association?.linkedOrders[0];
    form.setFieldsValue({
      ...DEFAULT_VALUE,
      internalRemark: association?.internalRemark || '',
      platform: linked?.platform || 'taobao',
      platformOrderId: linked?.platformOrderId || '',
      platformOrderStatus: linked?.platformOrderStatus || '',
      logisticsStatus: linked?.logisticsStatus || '',
      logisticsCompany: linked?.logisticsCompany || '',
      trackingNumber: linked?.trackingNumber || '',
      remark: linked?.remark || '',
    });
  }, [association, form, open]);

  const handleOk = async () => {
    const value = await form.validateFields();
    const now = Date.now();
    const hasLinkedOrder = [
      value.platformOrderId,
      value.platformOrderStatus,
      value.logisticsStatus,
      value.logisticsCompany,
      value.trackingNumber,
      value.remark,
    ].some(item => item?.trim());
    const existing = association?.linkedOrders[0];
    onSave({
      internalRemark: value.internalRemark || '',
      linkedOrders: hasLinkedOrder
        ? [{
          id: existing?.id || crypto.randomUUID(),
          platform: value.platform,
          platformOrderId: value.platformOrderId || '',
          platformOrderStatus: value.platformOrderStatus || '',
          logisticsStatus: value.logisticsStatus || '',
          logisticsCompany: value.logisticsCompany || '',
          trackingNumber: value.trackingNumber || '',
          remark: value.remark || '',
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        }]
        : [],
    });
  };

  const handleLookupTaobaoOrder = () => {
    const platformOrderId = form.getFieldValue('platformOrderId')?.trim();
    if (!platformOrderId) {
      form.setFields([{ name: 'platformOrderId', errors: ['请先输入淘宝订单号'] }]);
      return;
    }
    form.setFieldsValue({ platform: 'taobao' });
    onLookupTaobaoOrder(platformOrderId);
  };

  return (
    <Modal
      title="编辑采购单详情"
      open={open}
      forceRender
      onCancel={onCancel}
      onOk={handleOk}
      okText="保存"
      confirmLoading={saving}
      width={640}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={DEFAULT_VALUE}>
        <Form.Item name="internalRemark" label="采购备注">
          <Input.TextArea rows={3} placeholder="例如：已在淘宝下单，等商家发货" />
        </Form.Item>
        <Form.Item name="platform" label="发货平台">
          <Select options={PLATFORM_OPTIONS} />
        </Form.Item>
        <Form.Item name="platformOrderId" label="采购单号">
          <Input placeholder="例如淘宝订单号" />
        </Form.Item>
        <Button type="dashed" block onClick={handleLookupTaobaoOrder} style={{ marginBottom: 16 }}>
          打开淘宝工作页读取订单状态
        </Button>
        <Form.Item name="platformOrderStatus" label="采购单状态">
          <Input placeholder="例如：待发货、已发货、已完成" />
        </Form.Item>
        <Form.Item name="logisticsStatus" label="物流状态">
          <Input placeholder="例如：未发货、运输中、已签收" />
        </Form.Item>
        <Form.Item name="logisticsCompany" label="快递公司">
          <Input placeholder="可选" />
        </Form.Item>
        <Form.Item name="trackingNumber" label="快递单号">
          <Input placeholder="可选" />
        </Form.Item>
        <Form.Item name="remark" label="采购单备注">
          <Input.TextArea rows={2} placeholder="可选，例如淘宝侧的补充说明" />
        </Form.Item>
      </Form>
    </Modal>
  );
};
