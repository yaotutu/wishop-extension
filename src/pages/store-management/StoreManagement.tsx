import React, { useState } from 'react';
import { Alert, Button, Card, Input, message, Modal, Popconfirm, Space, Table, Tag, Upload } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined, DownloadOutlined, CopyOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import type { Account, Config } from '../../shared/types';
import { parseAccountImportJson } from './import-accounts';
import type { AccountImportParseResult, AccountImportSkip } from './import-accounts';

const ACCOUNT_IMPORT_EXAMPLE_FILENAME = '店铺导入示例.json';

const ACCOUNT_IMPORT_EXAMPLE = JSON.stringify([
  {
    name: '店铺A',
    appId: 'wx_appid_1',
    appSecret: 'app_secret_1',
  },
  {
    name: '店铺B',
    appId: 'wx_appid_2',
    appSecret: 'app_secret_2',
  },
], null, 2);

const stackedLayoutStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const importExampleStyle: React.CSSProperties = {
  margin: 0,
  padding: 12,
  maxHeight: 220,
  overflow: 'auto',
  background: '#f6f8fa',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  fontSize: 12,
  lineHeight: 1.5,
};

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
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [formState, setFormState] = useState({ name: '', appId: '', appSecret: '' });
  const [importPreview, setImportPreview] = useState<AccountImportParseResult | null>(null);
  const [importFailures, setImportFailures] = useState<AccountImportSkip[]>([]);

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

  const resetImportState = () => {
    setImportPreview(null);
    setImportFailures([]);
    setImporting(false);
  };

  const handleDownloadImportExample = () => {
    const blob = new Blob([ACCOUNT_IMPORT_EXAMPLE], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = ACCOUNT_IMPORT_EXAMPLE_FILENAME;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyImportExample = async () => {
    await navigator.clipboard.writeText(ACCOUNT_IMPORT_EXAMPLE);
    message.success('JSON 示例已复制');
  };

  const handleImportFile: UploadProps['beforeUpload'] = async file => {
    try {
      const text = await file.text();
      const result = parseAccountImportJson(text, accounts.map(account => account.config.appId));
      setImportPreview(result);
      setImportFailures([]);
      if (result.accounts.length === 0) {
        message.warning('没有可导入的店铺');
      } else {
        message.success(`已识别 ${result.accounts.length} 个可导入店铺`);
      }
    } catch (error) {
      setImportPreview(null);
      setImportFailures([]);
      message.error(error instanceof Error ? error.message : 'JSON 解析失败');
    }
    return Upload.LIST_IGNORE;
  };

  const handleImportAccounts = async () => {
    if (!importPreview || importPreview.accounts.length === 0) {
      message.warning('请先选择包含店铺信息的 JSON 文件');
      return;
    }

    setImporting(true);
    const failures: AccountImportSkip[] = [];
    let firstImportedAccountId = '';
    let successCount = 0;

    try {
      for (const item of importPreview.accounts) {
        try {
          const account = await addAccount(item.name, {
            appId: item.appId,
            appSecret: item.appSecret,
          });
          successCount += 1;
          if (!firstImportedAccountId) {
            firstImportedAccountId = account.id;
          }
        } catch (error) {
          failures.push({
            row: item.row,
            name: item.name,
            appId: item.appId,
            reason: error instanceof Error ? error.message : '导入失败',
          });
        }
      }

      if (firstImportedAccountId) {
        await switchAccount(firstImportedAccountId);
      }

      setImportFailures(failures);
      if (successCount > 0) {
        message.success(`已导入 ${successCount} 个店铺`);
      }
      if (failures.length > 0) {
        message.warning(`${failures.length} 个店铺导入失败`);
      }
    } finally {
      setImporting(false);
    }
  };

  const importSkipRows = [...(importPreview?.skipped || []), ...importFailures];

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
          <Space size={8}>
            <Button icon={<UploadOutlined />} onClick={() => {
              resetImportState();
              setImportModalOpen(true);
            }}>
              导入店铺
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => {
              setFormState({ name: '', appId: '', appSecret: '' });
              setAddModalOpen(true);
            }}>
              添加店铺
            </Button>
          </Space>
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
        <div style={stackedLayoutStyle}>
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

      {/* 批量导入店铺弹窗 */}
      <Modal
        title="导入店铺"
        open={importModalOpen}
        onOk={handleImportAccounts}
        onCancel={() => { setImportModalOpen(false); resetImportState(); }}
        okText="开始导入"
        cancelText="取消"
        confirmLoading={importing}
        okButtonProps={{ disabled: !importPreview?.accounts.length }}
        width={640}
      >
        <div style={stackedLayoutStyle}>
          <Space size={8} wrap>
            <Upload
              accept="application/json,.json"
              beforeUpload={handleImportFile}
              maxCount={1}
              showUploadList={false}
            >
              <Button icon={<UploadOutlined />}>选择 JSON 文件</Button>
            </Upload>
            <Button icon={<DownloadOutlined />} onClick={handleDownloadImportExample}>
              下载 JSON 示例
            </Button>
            <Button icon={<CopyOutlined />} onClick={handleCopyImportExample}>
              复制示例
            </Button>
          </Space>

          <pre style={importExampleStyle}>
            {ACCOUNT_IMPORT_EXAMPLE}
          </pre>

          {importPreview && (
            <Alert
              showIcon
              type={importPreview.accounts.length > 0 ? 'success' : 'warning'}
              title={`可导入 ${importPreview.accounts.length} 个店铺，跳过 ${importPreview.skipped.length} 个`}
            />
          )}

          {importPreview?.accounts.length ? (
            <Table
              dataSource={importPreview.accounts}
              rowKey="appId"
              size="small"
              pagination={{ pageSize: 5, size: 'small' }}
              columns={[
                { title: '行号', dataIndex: 'row', key: 'row', width: 70 },
                { title: '店铺名称', dataIndex: 'name', key: 'name' },
                { title: 'AppID', dataIndex: 'appId', key: 'appId', ellipsis: true },
              ]}
            />
          ) : null}

          {importSkipRows.length > 0 && (
            <Table
              dataSource={importSkipRows}
              rowKey={record => `${record.row}-${record.appId || record.reason}`}
              size="small"
              pagination={{ pageSize: 5, size: 'small' }}
              columns={[
                { title: '行号', dataIndex: 'row', key: 'row', width: 70 },
                { title: '店铺名称', dataIndex: 'name', key: 'name', ellipsis: true },
                { title: 'AppID', dataIndex: 'appId', key: 'appId', ellipsis: true },
                { title: '原因', dataIndex: 'reason', key: 'reason' },
              ]}
            />
          )}
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
        <div style={stackedLayoutStyle}>
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
