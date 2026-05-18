import React, { useEffect, useRef, useState } from 'react';
import { extensionApi } from '../../shared/extension-api';
import { Card, Button, Space, Input, InputNumber, Table, Tag, Radio, Modal, Alert, message, Popconfirm, Upload, Divider } from 'antd';
import { UploadOutlined, DeleteOutlined, SearchOutlined, StopOutlined, ExclamationCircleOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ViolationMatch, LogEntry } from '../../shared/types';

interface ViolationProps {
  accountId: string;
}

const ViolationPage: React.FC<ViolationProps> = ({ accountId }) => {
  const [words, setWords] = useState<string[]>([]);
  const [wordsExpanded, setWordsExpanded] = useState(false);
  const [mode, setMode] = useState<'batch' | 'onebyone'>('batch');
  const [scanLimit, setScanLimit] = useState(100);
  const [scanning, setScanning] = useState(false);
  const [violations, setViolations] = useState<ViolationMatch[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [deleting, setDeleting] = useState(false);

  // file upload preview
  const [previewWords, setPreviewWords] = useState<string[]>([]);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  // one-by-one state
  const [currentViolation, setCurrentViolation] = useState<(ViolationMatch & { scanned: number }) | null>(null);
  const [oneByOneScanning, setOneByOneScanning] = useState(false);
  const stoppedRef = useRef(false);

  // logs
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // scan result summary
  const [scanResult, setScanResult] = useState<{ scanned: number; total: number } | null>(null);

  // result area tab
  const [activeResultTab, setActiveResultTab] = useState<'result' | 'logs'>('result');

  useEffect(() => {
    loadWords();
    return () => {
      unsubscribeRef.current?.();
    };
  }, [accountId]);

  const loadWords = async () => {
    const data = await extensionApi.violation.getWords(accountId);
    setWords(data);
  };

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
    await extensionApi.violation.setWords(accountId, previewWords);
    setWords(previewWords);
    setPreviewModalOpen(false);
    setPreviewWords([]);
    message.success(`已导入 ${previewWords.length} 个违规词`);
  };

  const subscribeLogs = () => {
    unsubscribeRef.current = extensionApi.violation.onLog(accountId, (log: LogEntry) => {
      setLogs(prev => [...prev, log]);
    });
  };

  const unsubscribeLogs = () => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  };

  // --- Batch scan ---
  const handleBatchScan = async () => {
    if (words.length === 0) {
      message.warning('请先上传违规词文件');
      return;
    }
    setScanning(true);
    setViolations([]);
    setSelectedKeys([]);
    setScanResult(null);
    setLogs([]);
    setActiveResultTab('logs');
    subscribeLogs();
    try {
      const result = await extensionApi.violation.batchScan(accountId, scanLimit);
      setViolations(result.violations);
      setScanResult({ scanned: result.scanned, total: result.violations.length });
      setActiveResultTab('result');
      if (result.stopped) {
        message.warning(result.reason || '扫描已停止');
      }
    } finally {
      unsubscribeLogs();
      setScanning(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedKeys.length === 0) return;
    const toDelete = violations.filter(v => selectedKeys.includes(v.productId));
    setDeleting(true);
    subscribeLogs();
    try {
      const result = await extensionApi.violation.batchDelete(accountId, toDelete);
      message.success(`已删除 ${result.deleted} 条，失败 ${result.errors} 条`);
      setSelectedKeys([]);
      setViolations(prev => prev.filter(v => !toDelete.some(d => d.productId === v.productId)));
      if (scanResult) {
        setScanResult({ ...scanResult, total: violations.length - toDelete.length });
      }
    } finally {
      unsubscribeLogs();
      setDeleting(false);
    }
  };

  // --- One-by-one scan ---
  const handleOneByOneStart = async () => {
    if (words.length === 0) {
      message.warning('请先上传违规词文件');
      return;
    }
    setOneByOneScanning(true);
    stoppedRef.current = false;
    setLogs([]);
    setScanResult(null);
    setActiveResultTab('logs');
    subscribeLogs();
    await handleNextViolation();
  };

  const handleNextViolation = async () => {
    if (stoppedRef.current) return;
    const result = await extensionApi.violation.scanStep(accountId, 'next');
    if (stoppedRef.current) return;
    if (result.type === 'done') {
      setCurrentViolation(null);
      setOneByOneScanning(false);
      unsubscribeLogs();
      if (result.reason) {
        message.warning(result.reason);
      } else {
        message.info('扫描完成，未发现违规商品');
      }
    } else if (result.type === 'stopped') {
      setCurrentViolation(null);
      setOneByOneScanning(false);
      unsubscribeLogs();
      message.warning(result.reason || '已停止');
    } else if (result.type === 'violation') {
      setCurrentViolation(result);
    }
  };

  const handleOneByOneSkip = async () => {
    setCurrentViolation(null);
    await handleNextViolation();
  };

  const handleOneByOneDelete = async () => {
    if (!currentViolation || stoppedRef.current) return;
    const result = await extensionApi.violation.scanStep(accountId, 'delete');
    if (stoppedRef.current) return;
    if (result.type === 'stopped') {
      setCurrentViolation(null);
      setOneByOneScanning(false);
      unsubscribeLogs();
      message.warning(result.reason || '已停止');
    } else {
      setCurrentViolation(null);
      await handleNextViolation();
    }
  };

  const handleStop = async () => {
    stoppedRef.current = true;
    await extensionApi.violation.stop(accountId);
    setScanning(false);
    setOneByOneScanning(false);
    setCurrentViolation(null);
    unsubscribeLogs();
  };

  const highlightTitle = (title: string, matchedWords: string[]) => {
    let parts: { text: string; highlight: boolean }[] = [{ text: title, highlight: false }];
    for (const word of matchedWords) {
      const newParts: { text: string; highlight: boolean }[] = [];
      for (const part of parts) {
        if (part.highlight) {
          newParts.push(part);
          continue;
        }
        const lower = part.text.toLowerCase();
        const idx = lower.indexOf(word.toLowerCase());
        if (idx === -1) {
          newParts.push(part);
          continue;
        }
        if (idx > 0) newParts.push({ text: part.text.slice(0, idx), highlight: false });
        newParts.push({ text: part.text.slice(idx, idx + word.length), highlight: true });
        if (idx + word.length < part.text.length) {
          newParts.push({ text: part.text.slice(idx + word.length), highlight: false });
        }
      }
      parts = newParts;
    }
    return parts;
  };

  const isRunning = scanning || oneByOneScanning;

  const columns = [
    {
      title: '商品标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (title: string, record: ViolationMatch) => {
        const parts = highlightTitle(title, record.matchedWords);
        return <span>{parts.map((p, i) => p.highlight
          ? <Tag key={i} color="red" style={{ margin: 0 }}>{p.text}</Tag>
          : <span key={i}>{p.text}</span>
        )}</span>;
      },
    },
    {
      title: '匹配词',
      dataIndex: 'matchedWords',
      key: 'matchedWords',
      width: 200,
      render: (matchedWords: string[]) => matchedWords.map(w => (
        <Tag key={w} color="orange">{w}</Tag>
      )),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, record: ViolationMatch) => (
        <Popconfirm
          title="确认删除此商品？"
          onConfirm={async () => {
            subscribeLogs();
            try {
              const result = await extensionApi.violation.batchDelete(accountId, [record]);
              if (result.deleted > 0) {
                message.success('已删除');
                setViolations(prev => prev.filter(v => v.productId !== record.productId));
              } else {
                message.error('删除失败');
              }
            } finally {
              unsubscribeLogs();
            }
          }}
          okText="删除"
          cancelText="取消"
        >
          <Button type="link" danger size="small">删除</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 操作栏 */}
      <Card size="small">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          {/* 左侧：词库状态 */}
          <Space size={16}>
            {words.length > 0 ? (
              <>
                <Tag color="green">已加载 {words.length} 个违规词</Tag>
                <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => setWordsExpanded(!wordsExpanded)}>
                  {wordsExpanded ? '收起' : '查看'}
                </Button>
              </>
            ) : (
              <span style={{ color: '#999', fontSize: 13 }}>暂未加载违规词</span>
            )}
          </Space>
          {/* 右侧：按钮组 */}
          <Space size={8}>
            {words.length > 0 && (
              <Popconfirm
                title="确认清空违规词库？"
                onConfirm={async () => {
                  await extensionApi.violation.setWords(accountId, []);
                  setWords([]);
                  message.success('已清空');
                }}
                okText="清空"
                cancelText="取消"
              >
                <Button size="small" icon={<DeleteOutlined />}>清空词库</Button>
              </Popconfirm>
            )}
            <Upload accept=".txt" showUploadList={false} beforeUpload={handleFileUpload}>
              <Button size="small" type="primary" icon={<UploadOutlined />}>上传违规词文件</Button>
            </Upload>
          </Space>
        </div>
        {/* 词库展开区 */}
        {wordsExpanded && words.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <Input.TextArea
              value={words.join('\n')}
              readOnly
              autoSize={{ minRows: 3, maxRows: 10 }}
              style={{ fontFamily: 'monospace', fontSize: 12, color: '#666' }}
            />
          </div>
        )}
      </Card>

      {/* 扫描控制 */}
      <Card size="small">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space size={16}>
            <Space size={4}>
              <Tag color="blue">草稿箱</Tag>
              <Radio.Group value={mode} onChange={e => setMode(e.target.value)} size="small">
                <Radio.Button value="batch">批量扫描</Radio.Button>
                <Radio.Button value="onebyone">逐个提示</Radio.Button>
              </Radio.Group>
            </Space>
            <Space size={4}>
              <span style={{ color: '#999', fontSize: 12 }}>上限</span>
              <InputNumber size="small" min={1} max={10000} value={scanLimit} onChange={v => setScanLimit(v || 100)} style={{ width: 64 }} />
              <span style={{ color: '#999', fontSize: 12 }}>条</span>
            </Space>
          </Space>
          <Space>
            {isRunning && <span style={{ color: '#999', fontSize: 12 }}>执行中...</span>}
            {isRunning ? (
              <Button danger size="small" icon={<StopOutlined />} onClick={handleStop}>停止</Button>
            ) : (
              <Button
                type="primary"
                size="small"
                icon={<SearchOutlined />}
                onClick={mode === 'batch' ? handleBatchScan : handleOneByOneStart}
                disabled={words.length === 0}
              >
                开始扫描
              </Button>
            )}
          </Space>
        </div>
      </Card>

      {/* 结果区：Tab 切换扫描结果 / 执行日志 */}
      {(scanResult || logs.length > 0 || isRunning) && (
        <Card
          size="small"
          style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
          styles={{ body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 0 } }}
          tabList={[
            { key: 'result', tab: <span>扫描结果{scanResult ? ` (${scanResult.scanned})` : ''}</span> },
            { key: 'logs', tab: <span>执行日志{logs.length > 0 ? ` (${logs.length})` : ''}</span> },
          ]}
          activeTabKey={activeResultTab}
          onTabChange={(key) => setActiveResultTab(key as 'result' | 'logs')}
        >
          {/* 扫描结果 tab */}
          {activeResultTab === 'result' && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {/* 摘要 + 操作栏 */}
              {scanResult && mode === 'batch' && (
                <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Space size={12}>
                    <span style={{ fontSize: 13 }}>已扫描 <b>{scanResult.scanned}</b> 条</span>
                    {scanResult.total > 0 ? (
                      <Tag color="error">{scanResult.total} 条违规</Tag>
                    ) : (
                      <Tag color="success">无违规</Tag>
                    )}
                  </Space>
                  {violations.length > 0 && (
                    <Space size={8}>
                      <Button
                        size="small"
                        onClick={() => {
                          const allKeys = violations.map(v => v.productId);
                          setSelectedKeys(selectedKeys.length === allKeys.length ? [] : allKeys);
                        }}
                      >
                        {selectedKeys.length === violations.length ? '取消全选' : '全选'}
                      </Button>
                      <Button
                        size="small"
                        type="primary"
                        danger
                        icon={<DeleteOutlined />}
                        disabled={selectedKeys.length === 0}
                        loading={deleting}
                        onClick={handleBatchDelete}
                      >
                        删除选中 ({selectedKeys.length})
                      </Button>
                    </Space>
                  )}
                </div>
              )}
              {/* 表格 */}
              {mode === 'batch' && violations.length > 0 ? (
                <div style={{ flex: 1, overflow: 'auto' }}>
                  <Table
                    dataSource={violations}
                    rowKey="productId"
                    size="small"
                    pagination={false}
                    rowSelection={{
                      selectedRowKeys: selectedKeys,
                      onChange: keys => setSelectedKeys(keys),
                    }}
                    columns={columns}
                  />
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb' }}>
                  {scanResult ? '无违规商品' : '尚未扫描'}
                </div>
              )}
            </div>
          )}

          {/* 执行日志 tab */}
          {activeResultTab === 'logs' && (
            <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
              {logs.length === 0 ? (
                <div style={{ color: '#bbb', textAlign: 'center', padding: 32 }}>暂无日志</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {[...logs].reverse().map(log => {
                    const isSuccess = log.status === 'success';
                    return (
                      <div key={log.id} style={{
                        padding: '4px 8px',
                        borderRadius: 4,
                        background: isSuccess ? '#f6ffed' : '#fff2f0',
                        borderLeft: `3px solid ${isSuccess ? '#b7eb8f' : '#ffccc7'}`,
                        fontSize: 12,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 600, color: isSuccess ? '#52c41a' : '#cf1322', flexShrink: 0 }}>
                            {log.action === 'delete' ? '删除' : '检查'}
                          </span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {log.productTitle || log.productId || ''}
                          </span>
                          <span style={{ color: '#bbb', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {new Date(log.timestamp).toLocaleTimeString('zh-CN')}
                          </span>
                        </div>
                        {log.errorMsg && (
                          <div style={{ color: '#cf1322', marginTop: 2, lineHeight: 1.6, wordBreak: 'break-all' }}>
                            {log.errorCode != null && <Tag color="error" style={{ fontSize: 11, marginRight: 4, lineHeight: '18px', padding: '0 4px' }}>errcode:{log.errorCode}</Tag>}
                            {log.errorMsg}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* 逐个模式弹窗 */}
      <Modal
        open={!!currentViolation}
        closable={false}
        footer={null}
        width={500}
        centered
      >
        {currentViolation && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <Space>
                <ExclamationCircleOutlined style={{ color: '#faad14', fontSize: 18 }} />
                <span style={{ fontWeight: 600, fontSize: 15 }}>发现违规商品</span>
              </Space>
            </div>
            <div style={{ marginBottom: 8, color: '#999', fontSize: 13 }}>
              已扫描 {currentViolation.scanned} 条商品
            </div>
            <div style={{
              padding: '12px 16px',
              background: '#fff7e6',
              border: '1px solid #ffd591',
              borderRadius: 8,
              marginBottom: 12,
            }}>
              <div style={{ fontSize: 14, lineHeight: 1.8, wordBreak: 'break-all' }}>
                {highlightTitle(currentViolation.title, currentViolation.matchedWords).map((p, i) =>
                  p.highlight
                    ? <Tag key={i} color="red" style={{ margin: '2px 1px' }}>{p.text}</Tag>
                    : <span key={i}>{p.text}</span>
                )}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <span style={{ color: '#999', fontSize: 13, marginRight: 8 }}>匹配到违规词：</span>
              {currentViolation.matchedWords.map(w => (
                <Tag key={w} color="orange">{w}</Tag>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button danger icon={<StopOutlined />} onClick={handleStop}>停止扫描</Button>
              <Button onClick={handleOneByOneSkip}>跳过继续</Button>
              <Button type="primary" danger icon={<DeleteOutlined />} onClick={handleOneByOneDelete}>删除此商品</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 文件上传预览确认弹窗 */}
      <Modal
        title="确认导入违规词"
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
          从文件中解析到 <b style={{ color: '#1677ff' }}>{previewWords.length}</b> 个违规词，
          {words.length > 0 && <span style={{ color: '#ff4d4f' }}>将替换当前已有的 {words.length} 个词</span>}
          {words.length === 0 && '确认后将作为当前违规词库'}
        </div>
        <Input.TextArea
          value={previewWords.join('\n')}
          readOnly
          autoSize={{ minRows: 6, maxRows: 16 }}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
      </Modal>
    </div>
  );
};

export default React.memo(ViolationPage);
