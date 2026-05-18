import React, { useState } from 'react';
import { Card, Table, Button, Space, Modal, Input, message, Tag, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { Account, Config } from '../../shared/types';

interface StoreManagementProps {
  accounts: Account[];
  addAccount: (name: string, config: Config) => Promise<Account>;
  updateAccount: (id: string, patch: Partial<Pick<Account, 'name' | 'config'>>) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;
  switchAccount: (id: string) => Promise<void>;
  activeAccountId?: string;
}

const StoreManagement: React.FC<StoreManagementProps> = ({
  accounts, addAccount, updateAccount, removeAccount, switchAccount, activeAccountId,
}) => {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [formState, setFormState] = useState({ name: '', appId: '', appSecret: '' });

  const handleAdd = async () => {
    if (!formState.name || !formState.appId || !formState.appSecret) {
      message.error('请填写完整信息');
      return;
    }
    const account = await addAccount(formState.name, {
      appId: formState.appId,
      appSecret: formState.appSecret,
    });
    await switchAccount(account.id);
    setAddModalOpen(false);
    setFormState({ name: '', appId: '', appSecret: '' });
    message.success('店铺已添加');
  };

  const openEditModal = (account: Account) => {
    setEditingAccount(account);
    setFormState({ name: account.name, appId: account.config.appId, appSecret: account.config.appSecret });
    setEditModalOpen(true);
  };

  const handleEdit = async () => {
    if (!editingAccount || !formState.name) return;
    await updateAccount(editingAccount.id, {
      name: formState.name,
      config: { appId: formState.appId, appSecret: formState.appSecret },
    });
    setEditModalOpen(false);
    setEditingAccount(null);
    setFormState({ name: '', appId: '', appSecret: '' });
    message.success('店铺已更新');
  };

  const handleRemove = async (account: Account) => {
    await removeAccount(account.id);
    message.success('店铺已删除');
  };

  const columns = [
    {
      title: '序号',
      width: 60,
      render: (_: unknown, __: unknown, index: number) => index + 1,
    },
    {
      title: '店铺名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Account) => (
        <span style={{ fontWeight: record.id === activeAccountId ? 600 : 400 }}>
          {name}
          {record.id === activeAccountId && (
            <Tag color="blue" style={{ marginLeft: 8, fontSize: 11 }}>当前</Tag>
          )}
        </span>
      ),
    },
    {
      title: 'AppID',
      dataIndex: ['config', 'appId'],
      key: 'appId',
      ellipsis: true,
    },
    {
      title: '添加时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (ts: number) => new Date(ts).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_: unknown, record: Account) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
            编辑
          </Button>
          <Popconfirm
            title={`确认删除店铺「${record.name}」？`}
            description="删除后该店铺的所有数据将被清除"
            onConfirm={() => handleRemove(record)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card
        size="small"
        title="店铺管理"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => {
            setFormState({ name: '', appId: '', appSecret: '' });
            setAddModalOpen(true);
          }}>
            添加店铺
          </Button>
        }
      >
        <Table
          dataSource={accounts}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={false}
          locale={{ emptyText: '暂无店铺，点击上方按钮添加' }}
        />
      </Card>

      {/* 添加店铺弹窗 */}
      <Modal
        title="添加店铺"
        open={addModalOpen}
        onOk={handleAdd}
        onCancel={() => setAddModalOpen(false)}
        okText="添加"
        cancelText="取消"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            placeholder="店铺名称"
            value={formState.name}
            onChange={e => setFormState(s => ({ ...s, name: e.target.value }))}
          />
          <Input
            placeholder="AppID"
            value={formState.appId}
            onChange={e => setFormState(s => ({ ...s, appId: e.target.value }))}
          />
          <Input.Password
            placeholder="AppSecret"
            value={formState.appSecret}
            onChange={e => setFormState(s => ({ ...s, appSecret: e.target.value }))}
          />
        </div>
      </Modal>

      {/* 编辑店铺弹窗 */}
      <Modal
        title="编辑店铺"
        open={editModalOpen}
        onOk={handleEdit}
        onCancel={() => { setEditModalOpen(false); setEditingAccount(null); }}
        okText="保存"
        cancelText="取消"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            placeholder="店铺名称"
            value={formState.name}
            onChange={e => setFormState(s => ({ ...s, name: e.target.value }))}
          />
          <Input
            placeholder="AppID"
            value={formState.appId}
            onChange={e => setFormState(s => ({ ...s, appId: e.target.value }))}
          />
          <Input.Password
            placeholder="AppSecret"
            value={formState.appSecret}
            onChange={e => setFormState(s => ({ ...s, appSecret: e.target.value }))}
          />
        </div>
      </Modal>
    </div>
  );
};

export default StoreManagement;
