/**
 * 店铺管理页面（次要功能）。
 *
 * 「复制商品」业务域下，店铺管理只做四件事：
 *  1. 列出已绑定的微信小店账号
 *  2. 切换当前激活账号
 *  3. 绑定新店铺（账号名 + AppID + AppSecret）
 *  4. 解绑已存在店铺
 *
 * 不做：批量导入、编辑现有店铺（先把"能加能删"做出来）。
 */
import React, { useState } from 'react';
import { Alert, Button, Empty, Form, Input, Modal, Popconfirm, Space, Table, Tag, message } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { Account, Config } from '../../shared/types';

interface StoreManagementPageProps {
  accounts: Account[];
  activeAccountId: string;
  addAccount: (name: string, config: Config) => Promise<Account>;
  removeAccount: (id: string) => Promise<void>;
  switchAccount: (id: string) => Promise<void>;
}

interface BindFormValues {
  name: string;
  appId: string;
  appSecret: string;
}

const StoreManagementPage: React.FC<StoreManagementPageProps> = ({
  accounts, activeAccountId, addAccount, removeAccount, switchAccount,
}) => {
  const [bindOpen, setBindOpen] = useState(false);
  const [binding, setBinding] = useState(false);
  const [form] = Form.useForm<BindFormValues>();

  const handleBind = async () => {
    try {
      const values = await form.validateFields();
      setBinding(true);
      const account = await addAccount(values.name, {
        appId: values.appId.trim(),
        appSecret: values.appSecret.trim(),
      });
      message.success(`已绑定「${account.name}」`);
      form.resetFields();
      setBindOpen(false);
    } catch (error) {
      if (error instanceof Error) message.error(error.message);
    } finally {
      setBinding(false);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Alert
        type="info"
        showIcon
        message="绑定店铺只是次要功能"
        description="插件主功能是「复制商品」。这里的账号用于在主功能里选择用哪个微信小店来生成草稿。AppID / AppSecret 在微信公众平台获取。"
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>已绑定店铺（{accounts.length}）</div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setBindOpen(true)}>
          绑定新店铺
        </Button>
      </div>
      {accounts.length === 0 ? (
        <Empty
          description="还没有绑定任何店铺。点击右上角「绑定新店铺」开始。"
          style={{ marginTop: 40 }}
        />
      ) : (
        <Table<Account>
          rowKey="id"
          dataSource={accounts}
          pagination={false}
          size="middle"
          columns={[
            {
              title: '店铺名',
              dataIndex: 'name',
              render: (name: string, record) => (
                <Space>
                  <span>{name}</span>
                  {record.id === activeAccountId && <Tag color="blue">当前激活</Tag>}
                </Space>
              ),
            },
            {
              title: 'AppID',
              dataIndex: ['config', 'appId'],
              render: (appId: string) => <code style={{ fontSize: 12 }}>{appId || '—'}</code>,
            },
            {
              title: '操作',
              key: 'actions',
              width: 220,
              render: (_: unknown, record: Account) => (
                <Space>
                  {record.id !== activeAccountId && (
                    <Button size="small" onClick={() => switchAccount(record.id)}>
                      设为当前
                    </Button>
                  )}
                  <Popconfirm
                    title="确定解绑该店铺？"
                    description="解绑后，复制商品时不能再用该店铺的草稿箱。"
                    okText="解绑"
                    cancelText="取消"
                    onConfirm={async () => {
                      await removeAccount(record.id);
                      message.success('已解绑');
                    }}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />}>
                      解绑
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      )}

      <Modal
        title="绑定新店铺"
        open={bindOpen}
        onCancel={() => { if (!binding) { setBindOpen(false); form.resetFields(); } }}
        onOk={handleBind}
        confirmLoading={binding}
        okText="绑定"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="name"
            label="店铺名（自己起，方便区分）"
            rules={[{ required: true, message: '请填店铺名' }]}
          >
            <Input placeholder="例如：主店" maxLength={50} />
          </Form.Item>
          <Form.Item
            name="appId"
            label="AppID"
            rules={[{ required: true, message: '请填 AppID' }]}
          >
            <Input placeholder="微信公众平台 → 开发管理 → 开发者ID" />
          </Form.Item>
          <Form.Item
            name="appSecret"
            label="AppSecret"
            rules={[{ required: true, message: '请填 AppSecret' }]}
          >
            <Input.Password placeholder="仅本机存储，不会上传" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default StoreManagementPage;
