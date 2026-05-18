import React, { useState } from 'react';
import { Modal, Input, message } from 'antd';
import type { Account, Config } from '../shared/types';

interface AccountModalsProps {
  addAccount: (name: string, config: Config) => Promise<Account>;
  updateAccount: (id: string, patch: Partial<Pick<Account, 'name' | 'config'>>) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;
  switchAccount: (id: string) => Promise<void>;
}

const AccountModals = ({ addAccount, updateAccount, removeAccount, switchAccount }: AccountModalsProps) => {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [formState, setFormState] = useState({ name: '', appId: '', appSecret: '' });

  const handleAdd = async () => {
    if (!formState.name || !formState.appId || !formState.appSecret) {
      message.error('请填写完整信息');
      return;
    }
    const account = await addAccount(formState.name, { appId: formState.appId, appSecret: formState.appSecret });
    await switchAccount(account.id);
    setAddModalOpen(false);
    setFormState({ name: '', appId: '', appSecret: '' });
    message.success('店铺已添加');
  };

  const handleEdit = async () => {
    if (!editingAccount || !formState.name) return;
    await updateAccount(editingAccount.id, { name: formState.name });
    setEditModalOpen(false);
    setEditingAccount(null);
    setFormState({ name: '', appId: '', appSecret: '' });
    message.success('店铺已更新');
  };

  const openEditModal = (account: Account) => {
    setEditingAccount(account);
    setFormState({ name: account.name, appId: account.config.appId, appSecret: account.config.appSecret });
    setEditModalOpen(true);
  };

  const openAddModal = () => {
    setFormState({ name: '', appId: '', appSecret: '' });
    setAddModalOpen(true);
  };

  const confirmRemove = (account: Account) => {
    Modal.confirm({
      title: `确认删除店铺「${account.name}」？`,
      content: '删除后该店铺的所有数据将被清除',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        await removeAccount(account.id);
        message.success('店铺已删除');
      },
    });
  };

  return {
    addModalOpen,
    editModalOpen,
    openAddModal,
    openEditModal,
    confirmRemove,
    modals: (
      <>
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
          </div>
        </Modal>
      </>
    ),
  };
};

export default AccountModals;
