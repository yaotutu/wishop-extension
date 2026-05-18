import React, { useEffect, useRef, useState } from 'react';
import { extensionApi } from '../../shared/extension-api';
import { Checkbox, InputNumber, Button, Space, Alert, Tag, Divider, Modal, Table, Switch, Input, message, Empty, Popconfirm, Select, Tooltip } from 'antd';
import { PlayCircleOutlined, CloseCircleOutlined, WarningOutlined, DeleteOutlined, ReloadOutlined, ExclamationCircleOutlined, ClockCircleOutlined, PlusOutlined, EditOutlined, StopOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useTaskConfig, useLogs, useQuota, useSchedulers } from '../../hooks/useIpc';
import { useBlacklistRules } from '../../hooks/useBlacklistRules';
import { useSkipKeywords } from '../../hooks/useSkipKeywords';
import { useStatusRules } from '../../hooks/useStatusRules';
import type { TaskConfig, TaskCycleResult, LogEntry, ScheduledTask, BlacklistRule, ErrorCodeSummary, StatusRule } from '../../shared/types';

interface ListingProps {
  accountId: string;
}

const cronPresets = [
  { label: '每天 6:00', value: '0 6 * * *' },
  { label: '每天 9:00', value: '0 9 * * *' },
  { label: '每天 12:00', value: '0 12 * * *' },
  { label: '每天 14:00', value: '0 14 * * *' },
  { label: '每天 18:00', value: '0 18 * * *' },
  { label: '每天 21:00', value: '0 21 * * *' },
  { label: '每 2 小时', value: '0 */2 * * *' },
  { label: '每 4 小时', value: '0 */4 * * *' },
];

function cronToLabel(cron: string): string {
  const preset = cronPresets.find(p => p.value === cron);
  if (preset) return preset.label;
  const m = cron.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/);
  if (m) return `每天 ${m[2]}:${m[1].padStart(2, '0')}`;
  return cron;
}

const defaultTaskConfig: TaskConfig = {
  listUnreviewed: true,
  listUnreviewedQuantity: 0,
  autoDeleteFailed: true,
};

const Listing: React.FC<ListingProps> = ({ accountId }) => {
  const { taskConfig, fetchTaskConfig, saveTaskConfig, runTask } = useTaskConfig(accountId);
  const { logs, fetchLogs, clearLogs } = useLogs(accountId);
  const { quota, fetchQuota } = useQuota(accountId);
  const { tasks, fetchTasks, addTask, updateTask, removeTask } = useSchedulers(accountId);
  const { rules: blacklistRules, fetchRules: fetchBlacklistRules, saveRules: saveBlacklistRules, defaultCodes: blacklistDefaultCodes } = useBlacklistRules();
  const { keywords: skipKeywords, fetchKeywords, saveKeywords } = useSkipKeywords();
  const { rules: statusRules, fetchRules: fetchStatusRules, saveRules: saveStatusRules, resetRules: resetStatusRules } = useStatusRules();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TaskCycleResult | null>(null);
  const [localListedCount, setLocalListedCount] = useState(0);
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    cronExpression: '0 9 * * *',
    dailyLimit: 0,
    enabled: true,
    taskConfig: { ...defaultTaskConfig },
  });

  // 黑名单管理（内部 state，不再单独弹窗）
  const [newRuleCode, setNewRuleCode] = useState('');
  const [newRuleDesc, setNewRuleDesc] = useState('');

  // 跳过关键词管理（内部 state，不再单独弹窗）
  const [newKeyword, setNewKeyword] = useState('');

  // 单商品测试提审
  const [testProductId, setTestProductId] = useState('');

  const [newRuleStatus, setNewRuleStatus] = useState<number | undefined>(undefined);
  const [newRuleLabel, setNewRuleLabel] = useState('');
  const [newRuleAction, setNewRuleAction] = useState<'submit' | 'delete' | 'skip'>('skip');
  const [rulesLocked, setRulesLocked] = useState(true);

  const handleTestList = async () => {
    if (!testProductId.trim()) {
      message.warning('请输入商品ID');
      return;
    }
    try {
      const res = await extensionApi.drafts.list(accountId, testProductId.trim());
      if (res.success) {
        message.success(`商品 ${testProductId} 提审成功`);
      } else {
        message.error(`提审失败: ${res.error}`);
      }
    } catch (e: any) {
      message.error(`提审异常: ${e.message}`);
    }
  };

  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    fetchTaskConfig();
    fetchLogs();
    fetchQuota();
    fetchTasks();
    fetchBlacklistRules();
    fetchKeywords();
    fetchStatusRules();
    return () => {
      unsubscribeRef.current?.();
    };
  }, [accountId]);

  const handleRun = async () => {
    if (quotaExhausted) {
      Modal.confirm({
        title: '今日提审配额已用完',
        content: '配额为 0 时仍可执行任务，但提审步骤会失败。是否继续？',
        okText: '继续执行',
        cancelText: '取消',
        onOk: () => doRun(),
      });
    } else {
      doRun();
    }
  };

  const doRun = async () => {
    setRunning(true);
    setResult(null);
    setLocalListedCount(0);
    const config = { ...taskConfig, listUnreviewedQuantity: quota.quota };
    unsubscribeRef.current = extensionApi.task.onLog(accountId, (log: LogEntry) => {
      fetchLogs();
      if (log.status === 'success' && log.action === 'list') {
        setLocalListedCount(prev => prev + 1);
      }
    });
    try {
      const res = await runTask(config);
      setResult(res);
      fetchQuota();
    } finally {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      setRunning(false);
      setLocalListedCount(0);
      fetchLogs();
    }
  };

  const updateConfig = (patch: Partial<TaskConfig>) => {
    saveTaskConfig({ ...taskConfig, ...patch });
  };

  const openAddModal = () => {
    setEditingTask(null);
    setFormData({ name: '', cronExpression: '0 9 * * *', dailyLimit: 0, enabled: true, taskConfig: { ...defaultTaskConfig } });
    setEditModalOpen(true);
  };

  const openEditModal = (task: ScheduledTask) => {
    setEditingTask(task);
    setFormData({
      name: task.name,
      cronExpression: task.cronExpression,
      dailyLimit: task.dailyLimit,
      enabled: task.enabled,
      taskConfig: { ...task.taskConfig },
    });
    setEditModalOpen(true);
  };

  const handleSaveTask = async () => {
    if (!formData.name.trim()) {
      message.error('请输入任务名称');
      return;
    }
    if (editingTask) {
      await updateTask(editingTask.id, {
        name: formData.name,
        cronExpression: formData.cronExpression,
        dailyLimit: formData.dailyLimit,
        enabled: formData.enabled,
        taskConfig: formData.taskConfig,
      });
      message.success('任务已更新');
    } else {
      await addTask(formData);
      message.success('任务已创建');
    }
    setEditModalOpen(false);
  };

  // 从日志加入黑名单
  const handleAddToBlacklist = async (code: number, errorMsg?: string) => {
    const codes = new Set(blacklistRules.map(r => r.code));
    const newRules: BlacklistRule[] = [];
    if (!codes.has(code)) {
      newRules.push({ code, description: errorMsg?.slice(0, 50) || undefined });
    }
    if (errorMsg) {
      const subCodeRegex = /错误码:(\d+)/g;
      let match;
      while ((match = subCodeRegex.exec(errorMsg)) !== null) {
        const subCode = parseInt(match[1], 10);
        if (!codes.has(subCode)) {
          codes.add(subCode);
          newRules.push({ code: subCode, description: errorMsg?.slice(0, 50) || undefined });
        }
      }
    }
    if (newRules.length === 0) {
      message.info('已在黑名单中');
      return;
    }
    await saveBlacklistRules([...blacklistRules, ...newRules]);
    message.success(`已将 ${newRules.map(r => r.code).join(', ')} 加入黑名单`);
  };

  // 删除黑名单规则（默认规则不可删除）
  const handleDeleteRule = async (code: number) => {
    if (blacklistDefaultCodes.has(code)) {
      message.warning('默认规则不可删除');
      return;
    }
    await saveBlacklistRules(blacklistRules.filter(r => r.code !== code));
    message.success('已删除');
  };

  // 手动添加黑名单规则
  const handleAddRule = async () => {
    const code = parseInt(newRuleCode.trim(), 10);
    if (isNaN(code)) {
      message.error('请输入有效的错误码');
      return;
    }
    if (blacklistRules.some(r => r.code === code)) {
      message.error('该错误码已存在');
      return;
    }
    await saveBlacklistRules([...blacklistRules, { code, description: newRuleDesc.trim() || undefined }]);
    setNewRuleCode('');
    setNewRuleDesc('');
    message.success('已添加');
  };

  // 删除跳过关键词
  const handleDeleteKeyword = async (kw: string) => {
    await saveKeywords(skipKeywords.filter(k => k !== kw));
    message.success('已删除');
  };

  // 手动添加跳过关键词
  const handleAddKeyword = async () => {
    const kw = newKeyword.trim();
    if (!kw) {
      message.error('请输入关键词');
      return;
    }
    if (skipKeywords.includes(kw)) {
      message.error('该关键词已存在');
      return;
    }
    await saveKeywords([...skipKeywords, kw]);
    setNewKeyword('');
    message.success('已添加');
  };

  // 从日志提取关键词加入跳过列表
  const handleAddKeywordFromLog = async (keyword: string) => {
    if (skipKeywords.includes(keyword)) {
      message.info('已在跳过列表中');
      return;
    }
    await saveKeywords([...skipKeywords, keyword]);
    message.success(`已将「${keyword}」加入跳过列表`);
  };

  // --- 解锁运行规则 ---
  const handleUnlockRules = () => {
    Modal.confirm({
      title: '确认修改运行规则？',
      content: '当前配置已经是最优解，除非你清楚每个规则的作用，否则不建议修改。错误的配置可能导致商品被误删或提审失败。',
      okText: '我了解风险，继续',
      cancelText: '算了',
      okButtonProps: { danger: true },
      onOk: () => setRulesLocked(false),
    });
  };

  // --- 处理规则 CRUD ---

  // 更新单条规则的操作类型
  const handleUpdateStatusRule = async (editStatus: number, newAction: 'submit' | 'delete' | 'skip') => {
    const updated = statusRules.map(r =>
      r.editStatus === editStatus ? { ...r, action: newAction } : r
    );
    await saveStatusRules(updated);
    message.success('已更新');
  };

  // 删除单条规则
  const handleDeleteStatusRule = async (editStatus: number) => {
    await saveStatusRules(statusRules.filter(r => r.editStatus !== editStatus));
    message.success('已删除');
  };

  // 手动添加新规则
  const handleAddStatusRule = async () => {
    if (newRuleStatus === undefined || isNaN(newRuleStatus)) {
      message.error('请输入有效的状态码');
      return;
    }
    if (statusRules.some(r => r.editStatus === newRuleStatus)) {
      message.error('该状态码已存在');
      return;
    }
    if (!newRuleLabel.trim()) {
      message.error('请输入标签');
      return;
    }
    await saveStatusRules([...statusRules, { editStatus: newRuleStatus, label: newRuleLabel.trim(), action: newRuleAction }]);
    setNewRuleStatus(undefined);
    setNewRuleLabel('');
    setNewRuleAction('skip');
    message.success('已添加');
  };

  // 恢复默认规则
  const handleResetStatusRules = async () => {
    await resetStatusRules();
    message.success('已恢复默认规则');
  };

  const displayQuota = running ? quota.quota - localListedCount : quota.quota;
  const quotaExhausted = displayQuota <= 0 && quota.total > 0;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 任务配置 + 执行 */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid #f0f0f0', paddingBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space size={24}>
            <Space size={8}>
              <Checkbox
                checked={taskConfig.listUnreviewed}
                onChange={e => updateConfig({ listUnreviewed: e.target.checked })}
              >
                提交未审核
              </Checkbox>
              <InputNumber
                controls={false}
                size="small" min={0} value={quota.quota}
                disabled={!taskConfig.listUnreviewed}
                style={{ width: 60 }}
              />
              <span style={{ color: '#666' }}>条</span>
            </Space>
            <Checkbox
              checked={taskConfig.autoDeleteFailed !== false}
              onChange={e => updateConfig({ autoDeleteFailed: e.target.checked })}
            >
              失败自动删除
              <Tooltip title="上架失败的商品自动删除。开启后，可配合「保留关键词」排除不需要删除的情况">
                <QuestionCircleOutlined style={{ color: '#999', marginLeft: 4, fontSize: 12 }} />
              </Tooltip>
            </Checkbox>
          </Space>
          <Space>
            <Button
              size="small"
              icon={<ClockCircleOutlined />}
              onClick={() => setSchedulerOpen(!schedulerOpen)}
              type={schedulerOpen ? 'primary' : 'default'}
              ghost={schedulerOpen}
            >
              定时任务{tasks.length > 0 ? ` (${tasks.length})` : ''}
            </Button>
            {quota.total > 0 && (
              <Tag color={quotaExhausted ? 'red' : 'green'}>
                配额 {displayQuota}/{quota.total}
              </Tag>
            )}
            <Input
              size="small"
              placeholder="商品ID"
              value={testProductId}
              onChange={e => setTestProductId(e.target.value)}
              style={{ width: 140 }}
              onPressEnter={handleTestList}
            />
            <Button
              size="small"
              onClick={handleTestList}
            >
              测试提审
            </Button>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleRun}
              loading={running}
              disabled={!taskConfig.listUnreviewed}
              style={running ? { display: 'none' } : undefined}
            >
              开始执行
            </Button>
            <Button
              danger
              icon={<CloseCircleOutlined />}
              onClick={() => extensionApi.task.stop(accountId)}
              style={!running ? { display: 'none' } : undefined}
            >
              停止
            </Button>
          </Space>
        </div>
        {quotaExhausted && (
          <div style={{ marginTop: 8, color: '#ff4d4f', fontSize: 12 }}>
            今日提审配额已用完，请明天再试
          </div>
        )}
        {running && (
          <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>执行中，请勿重复操作...</div>
        )}
      </div>

      {/* 执行结果 */}
      {result && (
        <Alert
          type={result.stopped ? 'warning' : 'success'}
          showIcon={false}
          style={{ padding: '8px 16px' }}
          title={
            <Space size={16} wrap>
              <span>扫描 {result.scanned}</span>
              {result.listed > 0 && <Tag color="success">上架成功 {result.listed}</Tag>}
              {result.deleted > 0 && <Tag color="blue">已删除 {result.deleted}</Tag>}
              {result.skipped > 0 && <Tag>跳过 {result.skipped}</Tag>}
              {(result.pendingCount ?? 0) > 0 && <Tag color="orange">待处理 {result.pendingCount}</Tag>}
              {result.errors > 0 && <Tag color="error">删除失败 {result.errors}</Tag>}
              {result.stopped && <Tag color="warning">已停止: {result.reason}</Tag>}
            </Space>
          }
        />
      )}

      {/* 定时任务弹窗 */}
      <Modal
        title="定时任务"
        open={schedulerOpen}
        onCancel={() => setSchedulerOpen(false)}
        footer={null}
        width={720}
        centered
      >
        <div style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>添加任务</Button>
        </div>
        {tasks.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无定时任务" style={{ padding: '32px 0' }}>
            <Button type="primary" onClick={openAddModal}>创建第一个任务</Button>
          </Empty>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tasks.map(task => (
              <div key={task.id} style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '14px 16px', background: '#fafafa', borderRadius: 8,
              }}>
                <Switch
                  checked={task.enabled}
                  onChange={checked => updateTask(task.id, { enabled: checked })}
                />
                <span style={{ fontWeight: 500, fontSize: 14, minWidth: 100 }}>{task.name}</span>
                <Tag color={task.enabled ? 'blue' : 'default'}>{cronToLabel(task.cronExpression)}</Tag>
                <span style={{ color: '#999', fontSize: 13 }}>
                  今日 {task.todayListedCount}{task.dailyLimit > 0 ? `/${task.dailyLimit}` : ''}
                </span>
                <span style={{ flex: 1 }} />
                <Button type="text" icon={<EditOutlined />} onClick={() => openEditModal(task)}>编辑</Button>
                <Popconfirm title="确认删除此任务？" onConfirm={() => removeTask(task.id)} okText="删除" cancelText="取消">
                  <Button type="text" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* 运行规则 — 默认锁定 */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid #f0f0f0', paddingBottom: 10, opacity: rulesLocked ? 0.75 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontWeight: 500 }}>运行规则</span>
          <Button
            size="small"
            type="text"
            onClick={() => rulesLocked ? handleUnlockRules() : setRulesLocked(true)}
          >
            {rulesLocked ? '🔒 已锁定' : '🔓 已解锁'}
          </Button>
        </div>
        {/* 扫描商品时：按状态码决定处理方式 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>扫描商品时</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {statusRules.map(rule => (
              <Tag key={rule.editStatus} style={{ fontSize: 12, padding: '2px 8px' }}>
                {rule.editStatus}({rule.label}) →
                <Select
                  value={rule.action}
                  size="small"
                  variant="borderless"
                  disabled={rulesLocked}
                  style={{ width: 90, marginLeft: 4, verticalAlign: 'middle' }}
                  onChange={(v: 'submit' | 'delete' | 'skip') => handleUpdateStatusRule(rule.editStatus, v)}
                  options={[
                    { value: 'submit', label: '提交审核' },
                    { value: 'delete', label: '直接删除' },
                    { value: 'skip', label: '跳过' },
                  ]}
                />
              </Tag>
            ))}
            {!rulesLocked && (
              <Popconfirm title="恢复默认规则？" onConfirm={handleResetStatusRules}>
                <Button size="small" type="link">恢复默认</Button>
              </Popconfirm>
            )}
          </div>
          {!rulesLocked && (
            <Space wrap style={{ marginTop: 8 }}>
              <InputNumber
                controls={false}
                placeholder="状态码"
                value={newRuleStatus}
                onChange={v => setNewRuleStatus(v ?? undefined)}
                style={{ width: 80 }}
                min={0}
                size="small"
              />
              <Input
                placeholder="含义"
                value={newRuleLabel}
                onChange={e => setNewRuleLabel(e.target.value)}
                style={{ width: 100 }}
                size="small"
                onPressEnter={handleAddStatusRule}
              />
              <Select
                value={newRuleAction}
                onChange={(v: 'submit' | 'delete' | 'skip') => setNewRuleAction(v)}
                style={{ width: 100 }}
                size="small"
                options={[
                  { value: 'submit', label: '提交审核' },
                  { value: 'delete', label: '直接删除' },
                  { value: 'skip', label: '跳过' },
                ]}
              />
              <Button size="small" icon={<PlusOutlined />} onClick={handleAddStatusRule}>添加</Button>
            </Space>
          )}
        </div>

        <Divider style={{ margin: '8px 0 12px' }} />

        {/* 提审失败时：按错误码/关键词决定处理方式 */}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>提审失败时</div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {/* 立即停止 */}
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>遇到这些错误码 → 停止任务</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                {blacklistRules.map(r => {
                  const isDefault = blacklistDefaultCodes.has(r.code);
                  return (
                    <Tooltip key={r.code} title={isDefault ? '系统默认规则，不可删除' : undefined}>
                      <Tag
                        closable={!rulesLocked && !isDefault}
                        onClose={() => handleDeleteRule(r.code)}
                        color={isDefault ? '#cf1322' : 'red'}
                        style={{ fontSize: 11, ...(isDefault ? { borderStyle: 'solid', opacity: 0.75 } : {}) }}
                      >
                        {r.code}
                      </Tag>
                    </Tooltip>
                  );
                })}
                {!rulesLocked && (
                  <>
                    <Input
                      placeholder="错误码"
                      value={newRuleCode}
                      onChange={e => setNewRuleCode(e.target.value)}
                      style={{ width: 100 }}
                      size="small"
                      onPressEnter={handleAddRule}
                    />
                    <Button size="small" icon={<PlusOutlined />} onClick={handleAddRule} />
                  </>
                )}
              </div>
            </div>
            {/* 不删除 */}
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>错误信息包含这些词 → 不删商品</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                {skipKeywords.map(kw => (
                  <Tag
                    key={kw}
                    closable={!rulesLocked}
                    onClose={() => handleDeleteKeyword(kw)}
                    color="orange"
                    style={{ fontSize: 11 }}
                  >
                    {kw}
                  </Tag>
                ))}
                {!rulesLocked && (
                  <>
                    <Input
                      placeholder="关键词"
                      value={newKeyword}
                      onChange={e => setNewKeyword(e.target.value)}
                      style={{ width: 100 }}
                      size="small"
                      onPressEnter={handleAddKeyword}
                    />
                    <Button size="small" icon={<PlusOutlined />} onClick={handleAddKeyword} />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 执行记录 */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', paddingTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexShrink: 0 }}>
          <span style={{ fontWeight: 500 }}>执行记录</span>
          <Space size={4}>
            <Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => { fetchLogs(); fetchQuota(); }} />
            <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={clearLogs} />
          </Space>
        </div>
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {logs.length === 0 ? (
          <div style={{ color: '#999', textAlign: 'center', padding: 32 }}>暂无记录</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ color: '#bbb', fontSize: 11, textAlign: 'center' }}>最新</div>
            {[...logs].reverse().map((log, index, arr) => {
              const nextLog = arr[index - 1];
              const showDivider = index > 0 && log.runId !== nextLog?.runId;
              const isSuccess = log.status === 'success';
              const isSkipAction = log.action === 'skip';
              const actionLabel = log.action === 'delete' ? '删除' : log.action === 'check' ? '检查' : log.action === 'skip' ? '待处理' : '上架';
              const actionColor = log.action === 'delete' ? '#fa8c16' : log.action === 'check' ? '#52c41a' : isSkipAction ? '#fa8c16' : '#1677ff';
              const inBlacklist = log.errorCode != null && blacklistRules.some(r =>
                r.code === log.errorCode || (log.errorMsg && log.errorMsg.includes(`错误码:${r.code}`))
              );
              return (
                <React.Fragment key={log.id}>
                  {showDivider && <Divider style={{ margin: '4px 0' }} />}
                  <div style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: isSuccess ? '#f6ffed' : isSkipAction ? '#fff7e6' : '#fff2f0',
                    borderLeft: `3px solid ${isSuccess ? '#b7eb8f' : isSkipAction ? '#ffd591' : '#ffccc7'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: actionColor }}>{actionLabel}</span>
                      <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.productTitle || log.productId || ''}
                      </span>
                      <span style={{ color: '#bbb', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {new Date(log.timestamp).toLocaleTimeString('zh-CN')}
                      </span>
                    </div>
                    {log.errorMsg && (
                      <div style={{ color: '#cf1322', fontSize: 12, marginTop: 4, lineHeight: 1.6, wordBreak: 'break-all' }}>
                        {log.errorCode != null && (
                          <Tag color="error" style={{ fontSize: 11, marginRight: 4, lineHeight: '18px', padding: '0 4px' }}>errcode:{log.errorCode}</Tag>
                        )}
                        {log.errorMsg}
                        {isSkipAction && (
                          <Tag color="orange" style={{ fontSize: 10, marginLeft: 4, lineHeight: '16px', padding: '0 4px', verticalAlign: 'middle' }}>待处理</Tag>
                        )}
                        {log.errorCode != null && !inBlacklist && !isSkipAction && log.action === 'list' && (
                          <Tooltip title="将此错误码加入停止黑名单，以后遇到时立即停止任务">
                            <Button
                              type="link"
                              size="small"
                              style={{ fontSize: 11, padding: '0 4px', height: 'auto', marginLeft: 4, verticalAlign: 'middle', color: '#ff4d4f' }}
                              onClick={() => handleAddToBlacklist(log.errorCode!, log.errorMsg)}
                            >
                              停止黑名单
                            </Button>
                          </Tooltip>
                        )}
                        {log.errorCode != null && !inBlacklist && !isSkipAction && log.action === 'list' && (
                          <Tooltip title="添加关键词，以后错误信息包含该词时保留商品不删除">
                            <Button
                              type="link"
                              size="small"
                              style={{ fontSize: 11, padding: '0 4px', height: 'auto', marginLeft: 4, verticalAlign: 'middle', color: '#fa8c16' }}
                              onClick={() => {
                                const kw = window.prompt('输入关键词，以后错误信息包含该词时保留商品不删除', '');
                                if (kw?.trim()) handleAddKeywordFromLog(kw.trim());
                              }}
                            >
                              保留不删
                            </Button>
                          </Tooltip>
                        )}
                        {inBlacklist && (
                          <Tag color="red" style={{ fontSize: 10, marginLeft: 4, lineHeight: '16px', padding: '0 4px', verticalAlign: 'middle' }}>黑名单</Tag>
                        )}
                      </div>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}
        </div>
      </div>

      {/* 新建/编辑定时任务弹窗 */}
      <Modal
        title={editingTask ? '编辑定时任务' : '新建定时任务'}
        open={editModalOpen}
        onOk={handleSaveTask}
        onCancel={() => setEditModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>任务名称</div>
            <Input
              placeholder="如：早间上架、午间清理"
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>执行时间</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {cronPresets.map(preset => (
                <Tag
                  key={preset.value}
                  color={formData.cronExpression === preset.value ? 'blue' : 'default'}
                  style={{ cursor: 'pointer', padding: '2px 8px' }}
                  onClick={() => setFormData(prev => ({ ...prev, cronExpression: preset.value }))}
                >
                  {preset.label}
                </Tag>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#666' }}>自定义时间：</span>
              <Input
                placeholder="HH:mm"
                value={formData.cronExpression.split(' ').slice(0, 2).reverse().join(':').replace(/^\d{1,2}:/, m => m.padStart(3, '0'))}
                onChange={e => {
                  const match = e.target.value.match(/^(\d{1,2}):(\d{1,2})$/);
                  if (match) {
                    setFormData(prev => ({ ...prev, cronExpression: `${match[2]} ${match[1]} * * *` }));
                  }
                }}
                style={{ width: 100 }}
              />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Checkbox
                checked={formData.dailyLimit > 0}
                onChange={e => setFormData(prev => ({ ...prev, dailyLimit: e.target.checked ? 100 : 0 }))}
              >
                <span style={{ fontSize: 13, fontWeight: 500 }}>限制每日上限</span>
              </Checkbox>
            </div>
            {formData.dailyLimit > 0 && (
              <InputNumber controls={false} min={1} max={1000} value={formData.dailyLimit} onChange={v => setFormData(prev => ({ ...prev, dailyLimit: v || 100 }))} style={{ width: 200 }} />
            )}
          </div>
          <div>
            <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 500 }}>任务配置</div>
            <Space direction="vertical">
              <Checkbox
                checked={formData.taskConfig.listUnreviewed}
                onChange={e => setFormData(prev => ({
                  ...prev,
                  taskConfig: { ...prev.taskConfig, listUnreviewed: e.target.checked },
                }))}
              >
                提交未审核商品
              </Checkbox>
              {formData.taskConfig.listUnreviewed && (
                <Space style={{ marginLeft: 24 }}>
                  <span style={{ color: '#666', fontSize: 12 }}>每次</span>
                  <InputNumber size="small" controls={false} min={0} value={quota.quota} disabled style={{ width: 60 }} />
                  <span style={{ color: '#666', fontSize: 12 }}>条</span>
                </Space>
              )}
            </Space>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Switch checked={formData.enabled} onChange={checked => setFormData(prev => ({ ...prev, enabled: checked }))} />
            <span>{formData.enabled ? '创建后立即启用' : '创建后不启用'}</span>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default React.memo(Listing);
