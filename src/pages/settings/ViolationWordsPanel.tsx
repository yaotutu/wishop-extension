import React, { useEffect, useState } from 'react';
import { extensionApi } from '../../shared/extension-api';
import { Card, Button, Space, Input, Tag, Modal, Alert, message, Popconfirm, Upload, Switch, Spin } from 'antd';
import { UploadOutlined, DeleteOutlined, EyeOutlined, SafetyOutlined, ReloadOutlined, CloudOutlined, DesktopOutlined } from '@ant-design/icons';
import { useAppSettingsQuery, useUpdateAppSettingsMutation } from '../../hooks/useOrderQueries';

/**
 * 设置页 - 违禁词管理面板。
 *
 * 违禁词分两层，互不污染：
 * 1. 系统默认词（只读）：随扩展打包的基础违禁词，后期会从云端刷新。用户可开关是否并入扫描。
 * 2. 我的自定义词（可写）：用户上传/编辑/清空，只管理自己的词。
 * 扫描最终生效词 = （开关开）系统默认词 ∪ 自定义词，详见后端 resolveScanWords。
 */
const ViolationWordsPanel: React.FC = () => {
  // ===== 自定义词（用户词）状态 =====
  const [words, setWords] = useState<string[]>([]);
  const [wordsExpanded, setWordsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [previewWords, setPreviewWords] = useState<string[]>([]);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  // ===== 系统默认词（只读，分类）状态 =====
  const [defaultViolationWords, setDefaultViolationWords] = useState<string[]>([]);
  const [defaultBrands, setDefaultBrands] = useState<string[]>([]);
  const [defaultMeta, setDefaultMeta] = useState<{ source: string; updatedAt: string; version: number }>({ source: 'builtin', updatedAt: '', version: 1 });
  const [defaultsExpanded, setDefaultsExpanded] = useState(false);
  const [defaultsLoading, setDefaultsLoading] = useState(false);

  // ===== 设置（开关）状态：走 AppSettings =====
  const settingsQuery = useAppSettingsQuery();
  const updateSettingsMutation = useUpdateAppSettingsMutation();
  const defaultWordsEnabled = settingsQuery.data?.violationWords?.defaultWordsEnabled ?? true;
  const settingsLoading = settingsQuery.isLoading;

  useEffect(() => {
    void loadWords();
    void loadDefaults();
  }, []);

  const loadWords = async () => {
    setLoading(true);
    try {
      setWords(await extensionApi.violationWords.getGlobal());
    } finally {
      setLoading(false);
    }
  };

  const loadDefaults = async () => {
    setDefaultsLoading(true);
    try {
      const data = await extensionApi.violationWords.getDefaults();
      setDefaultViolationWords(data.violationWords);
      setDefaultBrands(data.brands);
      setDefaultMeta({ source: data.source, updatedAt: data.updatedAt, version: data.version });
    } finally {
      setDefaultsLoading(false);
    }
  };

  // 开关切换：写 AppSettings.violationWords.defaultWordsEnabled
  const handleToggleDefaultWords = async (enabled: boolean) => {
    await updateSettingsMutation.mutateAsync({ violationWords: { defaultWordsEnabled: enabled } });
    message.success(enabled ? '已启用系统默认违禁词' : '已关闭系统默认违禁词');
  };

  // ===== 自定义词 CRUD =====
  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = [...new Set(
        text.split(/\r?\n/)
          .map(line => line.trim())
          .filter(line => line.length > 0)
      )];
      if (parsed.length === 0) {
        message.warning('文件内容为空');
        return;
      }
      setPreviewWords(parsed);
      setPreviewModalOpen(true);
    };
    reader.readAsText(file);
    return false;
  };

  const handleConfirmImport = async () => {
    await extensionApi.violationWords.setGlobal(previewWords);
    setWords(previewWords);
    setPreviewModalOpen(false);
    setPreviewWords([]);
    message.success(`已导入 ${previewWords.length} 个违禁词`);
  };

  const handleClear = async () => {
    await extensionApi.violationWords.setGlobal([]);
    setWords([]);
    setEditing(false);
    message.success('已清空自定义词');
  };

  const handleStartEdit = () => {
    setDraftText(words.join('\n'));
    setEditing(true);
    setWordsExpanded(false);
  };

  const handleSaveEdit = async () => {
    const parsed = [...new Set(
      draftText.split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0)
    )];
    await extensionApi.violationWords.setGlobal(parsed);
    setWords(parsed);
    setEditing(false);
    message.success(`已保存 ${parsed.length} 个违禁词`);
  };

  const handleCancelEdit = () => {
    setEditing(false);
  };

  const sourceMeta = defaultMeta.source === 'cloud'
    ? { icon: <CloudOutlined />, label: '云端', color: 'blue' as const }
    : { icon: <DesktopOutlined />, label: '本地默认', color: 'default' as const };

  return (
    <Spin spinning={settingsLoading}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {/* Card A：系统默认词（只读 + 开关） */}
        <Card
          title={<Space><SafetyOutlined /> 系统默认违禁词</Space>}
          extra={<Button size="small" icon={<ReloadOutlined />} onClick={loadDefaults} loading={defaultsLoading}>刷新</Button>}
        >
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="系统预置的基础违禁词"
            description="这份词随版本更新，后期支持从云端刷新。用户不可编辑默认词；如不需要可关闭下方开关。"
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <Space size={16} wrap>
              <Space size={6}>
                <Switch checked={defaultWordsEnabled} loading={updateSettingsMutation.isPending} onChange={handleToggleDefaultWords} />
                <span style={{ fontSize: 13 }}>{defaultWordsEnabled ? '已启用' : '已关闭'}</span>
              </Space>
              <Tag color={sourceMeta.color}>{sourceMeta.icon} {sourceMeta.label}</Tag>
              <Tag color="orange">违规词 {defaultViolationWords.length}</Tag>
              <Tag color="purple">违品牌 {defaultBrands.length}</Tag>
              {defaultMeta.updatedAt && <span style={{ color: '#999', fontSize: 12 }}>更新于 {defaultMeta.updatedAt}</span>}
              {(defaultViolationWords.length > 0 || defaultBrands.length > 0) && (
                <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => setDefaultsExpanded(!defaultsExpanded)}>
                  {defaultsExpanded ? '收起' : '查看'}
                </Button>
              )}
            </Space>
          </div>
          {defaultsExpanded && (defaultViolationWords.length > 0 || defaultBrands.length > 0) && (
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {defaultViolationWords.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>违规词（品类/敏感词）{defaultViolationWords.length} 个</div>
                  <Input.TextArea
                    value={defaultViolationWords.join('\n')}
                    readOnly
                    autoSize={{ minRows: 3, maxRows: 10 }}
                    style={{ fontFamily: 'monospace', fontSize: 12, color: '#888', background: '#fafafa' }}
                  />
                </div>
              )}
              {defaultBrands.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>违品牌（商标侵权）{defaultBrands.length} 个</div>
                  <Input.TextArea
                    value={defaultBrands.join('\n')}
                    readOnly
                    autoSize={{ minRows: 3, maxRows: 10 }}
                    style={{ fontFamily: 'monospace', fontSize: 12, color: '#888', background: '#fafafa' }}
                  />
                </div>
              )}
            </Space>
          )}
        </Card>

        {/* Card B：我的自定义词（可写） */}
        <Card
          title="我的自定义违禁词"
          extra={<Button size="small" icon={<ReloadOutlined />} onClick={loadWords} loading={loading}>刷新</Button>}
        >
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="这些词会与系统默认词一起用于扫描（默认词开关在上方）"
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <Space size={16}>
              {words.length > 0 ? (
                <>
                  <Tag color="green">已加载 {words.length} 个词</Tag>
                  {!editing && (
                    <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => setWordsExpanded(!wordsExpanded)}>
                      {wordsExpanded ? '收起' : '查看'}
                    </Button>
                  )}
                </>
              ) : (
                <span style={{ color: '#999', fontSize: 13 }}>暂无自定义词</span>
              )}
            </Space>
            <Space size={8}>
              {editing ? (
                <>
                  <Button size="small" onClick={handleCancelEdit}>取消</Button>
                  <Button size="small" type="primary" onClick={handleSaveEdit}>保存</Button>
                </>
              ) : (
                <>
                  {words.length > 0 && (
                    <>
                      <Button size="small" onClick={handleStartEdit}>编辑</Button>
                      <Popconfirm
                        title="确认清空自定义词？"
                        description="清空后只剩系统默认词（若上方开关开启）。"
                        onConfirm={handleClear}
                        okText="清空"
                        cancelText="取消"
                      >
                        <Button size="small" danger icon={<DeleteOutlined />}>清空</Button>
                      </Popconfirm>
                    </>
                  )}
                  <Upload accept=".txt" showUploadList={false} beforeUpload={handleFileUpload}>
                    <Button size="small" type="primary" icon={<UploadOutlined />}>上传词文件</Button>
                  </Upload>
                </>
              )}
            </Space>
          </div>

          {editing && (
            <Input.TextArea
              value={draftText}
              onChange={e => setDraftText(e.target.value)}
              autoSize={{ minRows: 6, maxRows: 20 }}
              placeholder="每行一个违禁词，保存时会自动去重、去空行"
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          )}
          {!editing && wordsExpanded && words.length > 0 && (
            <Input.TextArea
              value={words.join('\n')}
              readOnly
              autoSize={{ minRows: 3, maxRows: 12 }}
              style={{ fontFamily: 'monospace', fontSize: 12, color: '#666' }}
            />
          )}
          {!editing && !wordsExpanded && words.length === 0 && (
            <div style={{ color: '#bbb', textAlign: 'center', padding: 24, fontSize: 13 }}>
              请上传 .txt 违禁词文件（每行一个词）或点击「编辑」手动录入
            </div>
          )}
        </Card>

        {/* 合并预览：默认词（违规词 ∪ 违品牌）+ 自定义词，去重后总数 */}
        {(() => {
          const allDefaults = [...new Set([...defaultViolationWords, ...defaultBrands])];
          const effective = defaultWordsEnabled ? new Set([...allDefaults, ...words]).size : words.length;
          return (
            <div style={{ textAlign: 'center', color: '#999', fontSize: 13, paddingBottom: 8 }}>
              当前扫描生效词 = {defaultWordsEnabled ? `默认 ${allDefaults.length} + ` : ''}自定义 {words.length}
              {' = '}
              <b style={{ color: '#1677ff' }}>{effective} 个</b>
            </div>
          );
        })()}
      </Space>

      {/* 文件上传预览确认弹窗 */}
      <Modal
        title="确认导入违禁词"
        open={previewModalOpen}
        onCancel={() => { setPreviewModalOpen(false); setPreviewWords([]); }}
        footer={[
          <Button key="cancel" onClick={() => { setPreviewModalOpen(false); setPreviewWords([]); }}>
            取消
          </Button>,
          <Button key="confirm" type="primary" onClick={handleConfirmImport}>
            确认导入 ({previewWords.length} 个词)
          </Button>,
        ]}
        width={500}
        centered
      >
        <div style={{ marginBottom: 12, color: '#666' }}>
          从文件中解析到 <b style={{ color: '#1677ff' }}>{previewWords.length}</b> 个违禁词，
          {words.length > 0 && <span style={{ color: '#ff4d4f' }}>将替换当前已有的 {words.length} 个自定义词</span>}
          {words.length === 0 && '确认后将作为当前自定义词库'}
        </div>
        <Input.TextArea
          value={previewWords.join('\n')}
          readOnly
          autoSize={{ minRows: 6, maxRows: 16 }}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
      </Modal>
    </Spin>
  );
};

export default ViolationWordsPanel;
