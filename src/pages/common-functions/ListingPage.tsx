import React, { useEffect, useRef, useState } from 'react';
import { extensionApi } from '../../shared/extension-api';
import { Checkbox, InputNumber, Button, Space, Alert, Tag, Divider, Modal, Table, Switch, Input, message, Empty, Popconfirm, Select, Tooltip } from 'antd';
import { PlayCircleOutlined, CloseCircleOutlined, WarningOutlined, DeleteOutlined, ReloadOutlined, ExclamationCircleOutlined, ClockCircleOutlined, PlusOutlined, EditOutlined, StopOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useTaskConfig, useLogs, useQuota, useSchedulers, useGlobalSchedulers } from '../../hooks/useIpc';
import { useBlacklistRules } from '../../hooks/useBlacklistRules';
import { useSkipKeywords } from '../../hooks/useSkipKeywords';
import { useStatusRules } from '../../hooks/useStatusRules';
import type { Account, TaskConfig, TaskCycleResult, LogEntry, ScheduledTask, GlobalScheduledTask, BlacklistRule, ErrorCodeSummary, StatusRule } from '../../shared/types';
import {
  cronPresets,
  cronToLabel,
  cronToTimeInput,
  getGlobalTaskWindowLabel,
  timeInputToCron,
} from './listing-schedule-utils';

interface ListingProps {
  accountId: string;
  accounts: Account[];
  scope?: 'global' | 'account';
}

const defaultTaskConfig: TaskConfig = {
  listUnreviewed: true,
  listUnreviewedQuantity: 0,
  autoDeleteFailed: true,
};

const defaultGlobalTaskConfig: TaskConfig = {
  listUnreviewed: true,
  listUnreviewedQuantity: 150,
  autoDeleteFailed: true,
};

const Listing: React.FC<ListingProps> = ({ accountId, accounts, scope = 'account' }) => {
  const { taskConfig, fetchTaskConfig, saveTaskConfig } = useTaskConfig(accountId);
  const { logs, fetchLogs, clearLogs } = useLogs(accountId);
  const { quota, fetchQuota } = useQuota(accountId);
  const { tasks, fetchTasks, addTask, updateTask, removeTask } = useSchedulers(accountId);
  const { tasks: globalTasks, fetchTasks: fetchGlobalTasks, addTask: addGlobalTask, updateTask: updateGlobalTask, removeTask: removeGlobalTask } = useGlobalSchedulers();
  const { rules: blacklistRules, fetchRules: fetchBlacklistRules, saveRules: saveBlacklistRules, defaultCodes: blacklistDefaultCodes } = useBlacklistRules();
  const { keywords: skipKeywords, fetchKeywords, saveKeywords } = useSkipKeywords();
  const { rules: statusRules, fetchRules: fetchStatusRules, saveRules: saveStatusRules, resetRules: resetStatusRules } = useStatusRules();
  const [runningAccountIds, setRunningAccountIds] = useState<Set<string>>(() => new Set());
  const [resultsByAccountId, setResultsByAccountId] = useState<Record<string, TaskCycleResult | null>>({});
  const [localListedCountsByAccountId, setLocalListedCountsByAccountId] = useState<Record<string, number>>({});
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const [globalEditModalOpen, setGlobalEditModalOpen] = useState(false);
  const [editingGlobalTask, setEditingGlobalTask] = useState<GlobalScheduledTask | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    cronExpression: '0 9 * * *',
    dailyLimit: 0,
    enabled: true,
    taskConfig: { ...defaultTaskConfig },
  });
  const [globalFormData, setGlobalFormData] = useState<Omit<GlobalScheduledTask, 'id' | 'accountStats'>>({
    name: '每日全账号提审',
    cronExpression: '0 9 * * *',
    staggerMinutes: 3,
    enabled: true,
    excludedAccountIds: [],
    taskConfig: { ...defaultGlobalTaskConfig },
  });
  const [globalTimeInput, setGlobalTimeInput] = useState('09:00');

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

  const currentAccountIdRef = useRef(accountId);
  const taskUnsubscribersRef = useRef(new Map<string, () => void>());

  useEffect(() => {
    currentAccountIdRef.current = accountId;
    fetchTaskConfig();
    fetchLogs();
    fetchQuota();
    fetchTasks();
    fetchGlobalTasks();
    fetchBlacklistRules();
    fetchKeywords();
    fetchStatusRules();
  }, [accountId]);

  useEffect(() => {
    return () => {
      taskUnsubscribersRef.current.forEach(unsubscribe => unsubscribe());
      taskUnsubscribersRef.current.clear();
    };
  }, []);

  const setAccountRunning = (targetAccountId: string, isRunning: boolean) => {
    setRunningAccountIds(prev => {
      const next = new Set(prev);
      if (isRunning) {
        next.add(targetAccountId);
      } else {
        next.delete(targetAccountId);
      }
      return next;
    });
  };

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
    const targetAccountId = accountId;
    const config = { ...taskConfig, listUnreviewedQuantity: quota.quota };
    setAccountRunning(targetAccountId, true);
    setResultsByAccountId(prev => ({ ...prev, [targetAccountId]: null }));
    setLocalListedCountsByAccountId(prev => ({ ...prev, [targetAccountId]: 0 }));
    taskUnsubscribersRef.current.get(targetAccountId)?.();
    const unsubscribe = extensionApi.task.onLog(targetAccountId, (log: LogEntry) => {
      if (currentAccountIdRef.current === targetAccountId) fetchLogs();
      if (log.status === 'success' && log.action === 'list') {
        setLocalListedCountsByAccountId(prev => ({
          ...prev,
          [targetAccountId]: (prev[targetAccountId] || 0) + 1,
        }));
      }
    });
    taskUnsubscribersRef.current.set(targetAccountId, unsubscribe);
    try {
      const res = await extensionApi.task.run(targetAccountId, config);
      setResultsByAccountId(prev => ({ ...prev, [targetAccountId]: res }));
      if (currentAccountIdRef.current === targetAccountId) fetchQuota();
    } finally {
      taskUnsubscribersRef.current.get(targetAccountId)?.();
      taskUnsubscribersRef.current.delete(targetAccountId);
      setAccountRunning(targetAccountId, false);
      setLocalListedCountsByAccountId(prev => ({ ...prev, [targetAccountId]: 0 }));
      if (currentAccountIdRef.current === targetAccountId) fetchLogs();
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

  const openAddGlobalModal = () => {
    setEditingGlobalTask(null);
    setGlobalTimeInput('09:00');
    setGlobalFormData({
      name: '每日全账号提审',
      cronExpression: '0 9 * * *',
      staggerMinutes: 3,
      enabled: true,
      excludedAccountIds: [],
      taskConfig: { ...defaultGlobalTaskConfig },
    });
    setGlobalEditModalOpen(true);
  };

  const openEditGlobalModal = (task: GlobalScheduledTask) => {
    setEditingGlobalTask(task);
    setGlobalTimeInput(cronToTimeInput(task.cronExpression));
    setGlobalFormData({
      name: task.name,
      cronExpression: task.cronExpression,
      staggerMinutes: task.staggerMinutes,
      enabled: task.enabled,
      excludedAccountIds: task.excludedAccountIds || [],
      taskConfig: {
        ...defaultGlobalTaskConfig,
        listUnreviewedQuantity: task.taskConfig?.listUnreviewedQuantity || defaultGlobalTaskConfig.listUnreviewedQuantity,
      },
    });
    setGlobalEditModalOpen(true);
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

  const handleSaveGlobalTask = async () => {
    if (!globalFormData.name.trim()) {
      message.error('请输入任务名称');
      return;
    }
    if (accounts.length === globalFormData.excludedAccountIds.length) {
      message.error('至少选择一个参与账号');
      return;
    }
    if (!timeInputToCron(globalTimeInput)) {
      message.error('请输入有效时间，例如 09:00');
      return;
    }
    const quantity = globalFormData.taskConfig.listUnreviewedQuantity;
    if (!Number.isFinite(quantity) || quantity < 1) {
      message.error('请输入有效的提审数量');
      return;
    }
    const normalizedTask = {
      ...globalFormData,
      taskConfig: {
        ...defaultGlobalTaskConfig,
        listUnreviewedQuantity: quantity,
      },
    };
    if (editingGlobalTask) {
      await updateGlobalTask(editingGlobalTask.id, normalizedTask);
      message.success('全账号任务已更新');
    } else {
      await addGlobalTask(normalizedTask);
      message.success('全账号任务已创建');
    }
    setGlobalEditModalOpen(false);
  };

  const renderGlobalTaskModal = () => (
    <Modal
      title={editingGlobalTask ? '编辑全账号任务' : '新建全账号任务'}
      open={globalEditModalOpen}
      onOk={handleSaveGlobalTask}
      onCancel={() => setGlobalEditModalOpen(false)}
      okText="保存"
      cancelText="取消"
      width={640}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
        <div>
          <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>任务名称</div>
          <Input
            placeholder="如：每日全账号提审"
            value={globalFormData.name}
            onChange={e => setGlobalFormData(prev => ({ ...prev, name: e.target.value }))}
          />
        </div>
        <div>
          <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>开始时间</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {cronPresets.filter(preset => /^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/.test(preset.value)).map(preset => (
              <Tag
                key={preset.value}
                color={globalFormData.cronExpression === preset.value ? 'blue' : 'default'}
                style={{ cursor: 'pointer', padding: '2px 8px' }}
                onClick={() => {
                  setGlobalTimeInput(cronToTimeInput(preset.value));
                  setGlobalFormData(prev => ({ ...prev, cronExpression: preset.value }));
                }}
              >
                {preset.label}
              </Tag>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#666' }}>自定义时间：</span>
            <Input
              placeholder="HH:mm"
              value={globalTimeInput}
              onChange={e => {
                const nextValue = e.target.value;
                setGlobalTimeInput(nextValue);
                const cron = timeInputToCron(nextValue);
                if (cron) {
                  setGlobalFormData(prev => ({ ...prev, cronExpression: cron }));
                }
              }}
              style={{ width: 100 }}
            />
          </div>
        </div>
        <div>
          <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>错峰间隔</div>
          <Space>
            <Select
              value={globalFormData.staggerMinutes}
              onChange={(value: number) => setGlobalFormData(prev => ({ ...prev, staggerMinutes: value }))}
              style={{ width: 160 }}
              options={[
                { value: 1, label: '1 分钟/账号' },
                { value: 3, label: '3 分钟/账号' },
                { value: 5, label: '5 分钟/账号' },
                { value: 10, label: '10 分钟/账号' },
              ]}
            />
            <span style={{ color: '#999', fontSize: 12 }}>
              预计 {getGlobalTaskWindowLabel(
                globalFormData,
                accounts.filter(account => !globalFormData.excludedAccountIds.includes(account.id)).length,
              )} 依次启动
            </span>
          </Space>
        </div>
        <div>
          <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>提审数量</div>
          <Space>
            <InputNumber
              controls={false}
              min={1}
              max={1000}
              value={globalFormData.taskConfig.listUnreviewedQuantity}
              onChange={value => setGlobalFormData(prev => ({
                ...prev,
                taskConfig: {
                  ...prev.taskConfig,
                  listUnreviewedQuantity: value || defaultGlobalTaskConfig.listUnreviewedQuantity,
                },
              }))}
              style={{ width: 120 }}
            />
            <span style={{ color: '#666', fontSize: 12 }}>每个账号每次最多提审，默认 150；执行时不会超过该账号实时剩余配额</span>
          </Space>
        </div>
        <div>
          <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 500 }}>账号范围</div>
          <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 6, padding: 8 }}>
            {accounts.map(account => {
              const included = !globalFormData.excludedAccountIds.includes(account.id);
              return (
                <div key={account.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 4px' }}>
                  <Checkbox
                    checked={included}
                    onChange={e => setGlobalFormData(prev => ({
                      ...prev,
                      excludedAccountIds: e.target.checked
                        ? prev.excludedAccountIds.filter(id => id !== account.id)
                        : [...prev.excludedAccountIds, account.id],
                    }))}
                  >
                    {account.name}
                  </Checkbox>
                  <Tag color={included ? 'green' : 'default'}>{included ? '参与' : '排除'}</Tag>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 500 }}>执行规则</div>
          <div style={{ padding: '10px 12px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 6, color: '#666', fontSize: 12, lineHeight: 1.8 }}>
            <div>使用「全部账号」里的全局运行规则。</div>
            <div>全局规则同时作用于全账号任务、单账号手动执行、单账号定时任务。</div>
            <div>如需调整状态处理、停止错误码或保留关键词，请在全部账号页面的「全局运行规则」中修改。</div>
            <div>数量：按上方设置的每账号上限执行，并自动受当天实时剩余配额限制。</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Switch checked={globalFormData.enabled} onChange={checked => setGlobalFormData(prev => ({ ...prev, enabled: checked }))} />
          <span>{globalFormData.enabled ? '保存后立即启用' : '保存后不启用'}</span>
        </div>
      </div>
    </Modal>
  );

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

  const running = runningAccountIds.has(accountId);
  const result = resultsByAccountId[accountId] || null;
  const localListedCount = localListedCountsByAccountId[accountId] || 0;
  const displayQuota = running ? quota.quota - localListedCount : quota.quota;
  const quotaExhausted = displayQuota <= 0 && quota.total > 0;
  const renderRulesSection = () => (
    <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, background: '#fff', opacity: rulesLocked ? 0.75 : 1 }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 600 }}>全局运行规则</div>
          <div style={{ color: '#999', fontSize: 12, marginTop: 2 }}>所有账号的手动提审、单账号定时任务、全账号任务都使用这一套规则</div>
        </div>
        <Button
          size="small"
          type="text"
          onClick={() => rulesLocked ? handleUnlockRules() : setRulesLocked(true)}
        >
          {rulesLocked ? '🔒 已锁定' : '🔓 已解锁'}
        </Button>
      </div>
      <div style={{ padding: 16 }}>
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

        <div>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>提审失败时</div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
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
    </div>
  );

  if (scope === 'global') {
    return (
      <div style={{ height: '100%', overflow: 'auto' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '1px solid #f0f0f0' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>全部账号提审</div>
              <div style={{ marginTop: 4, color: '#666', fontSize: 13 }}>商品提审的全局作用域，独立于左侧任意单个账号</div>
            </div>
          </div>

          <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, background: '#fff' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Space wrap size={8}>
                <span style={{ fontWeight: 600 }}>每日自动提审</span>
                <Tag color="blue">全部账号</Tag>
                {globalTasks.some(task => task.enabled) && <Tag color="green">已启用</Tag>}
              </Space>
              {globalTasks.length > 0 && (
                <Button size="small" icon={<PlusOutlined />} onClick={openAddGlobalModal}>新增任务</Button>
              )}
            </div>

            {globalTasks.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无全账号提审任务" style={{ padding: '48px 0' }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={openAddGlobalModal}>创建每日全账号提审</Button>
              </Empty>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {globalTasks.map(task => {
                  const includedCount = accounts.filter(account => !task.excludedAccountIds.includes(account.id)).length;
                  return (
                    <div key={task.id} style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 16, borderBottom: '1px solid #f5f5f5' }}>
                      <Switch checked={task.enabled} onChange={checked => updateGlobalTask(task.id, { enabled: checked })} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Space wrap size={8}>
                          <span style={{ fontWeight: 600 }}>{task.name}</span>
                          <Tag color={task.enabled ? 'green' : 'default'}>{task.enabled ? '已启用' : '已停用'}</Tag>
                          <Tag color="blue">{cronToLabel(task.cronExpression)}</Tag>
                          <Tag>错峰 {task.staggerMinutes} 分钟/账号</Tag>
                        </Space>
                        <div style={{ marginTop: 8, color: '#666', fontSize: 13 }}>
                          覆盖 {includedCount}/{accounts.length} 个账号，预计 {getGlobalTaskWindowLabel(task, includedCount)} 依次启动
                        </div>
                      </div>
                      <Button type="text" icon={<EditOutlined />} onClick={() => openEditGlobalModal(task)}>编辑</Button>
                      <Popconfirm title="确认删除此全账号任务？" onConfirm={() => removeGlobalTask(task.id)} okText="删除" cancelText="取消">
                        <Button type="text" danger icon={<DeleteOutlined />}>删除</Button>
                      </Popconfirm>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {renderRulesSection()}
        </div>

        {renderGlobalTaskModal()}
      </div>
    );
  }

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
        width={780}
        centered
      >
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600 }}>当前账号定时任务</div>
            <div style={{ color: '#999', fontSize: 12, marginTop: 2 }}>仅作用于当前左侧选中的店铺</div>
          </div>
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

      <div style={{ flexShrink: 0, borderBottom: '1px solid #f0f0f0', padding: '8px 0', color: '#999', fontSize: 12 }}>
        运行规则由「全部账号」统一配置，当前账号执行时会使用同一套全局规则。
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Switch checked={formData.enabled} onChange={checked => setFormData(prev => ({ ...prev, enabled: checked }))} />
            <span>{formData.enabled ? '创建后立即启用' : '创建后不启用'}</span>
          </div>
        </div>
      </Modal>

      {renderGlobalTaskModal()}

    </div>
  );
};

export default React.memo(Listing);
