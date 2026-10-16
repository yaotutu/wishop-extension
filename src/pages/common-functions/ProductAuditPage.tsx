import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Collapse, Divider, Empty, Input, InputNumber, message, Modal, Popconfirm, Select, Space, Switch, Tag, Tooltip } from 'antd';
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FileProtectOutlined,
  InfoCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { extensionApi } from '../../shared/extension-api';
import { useGlobalSchedulers, useProductAuditConfig, useProductAuditLogs, useQuota, useSchedulers } from '../../hooks/useIpc';
import type { ProductAuditScheduledJob } from '../../hooks/useIpc';
import { useProductAuditFailurePolicy } from '../../hooks/useProductAuditFailurePolicy';
import { useStatusRules } from '../../hooks/useStatusRules';
import type {
  Account,
  LogEntry,
  ProductAuditFailureAction,
  ProductAuditFailureRule,
  ProductAuditFailureRuleMatch,
  ProductAuditTaskConfig,
  ProductAuditTaskResult,
} from '../../shared/types';
import {
  cronPresets,
  cronToLabel,
  cronToTimeInput,
  getGlobalTaskWindowLabel,
  timeInputToCron,
} from './listing-schedule-utils';

interface ProductAuditPageProps {
  accountId: string;
  accounts: Account[];
  scope?: 'global' | 'account';
  globalView?: 'tasks' | 'rules';
}

type AccountProductAuditScheduledJob = Extract<ProductAuditScheduledJob, { scope: 'account' }>;
type GlobalProductAuditScheduledJob = Extract<ProductAuditScheduledJob, { scope: 'global' }>;
type ProductAuditRuleMatchType = ProductAuditFailureRuleMatch['type'];
type ConfigurableFailureAction = Extract<ProductAuditFailureAction, 'stopTask' | 'keepDraft'>;

interface FailureRuleModalState {
  mode: 'add' | 'edit';
  action: ConfigurableFailureAction;
  ruleId?: string;
}

interface ProductAuditJobFormData {
  name: string;
  cronExpression: string;
  dailyLimit?: number;
  staggerMinutes: number;
  enabled: boolean;
  excludedAccountIds: string[];
  productAuditConfig: ProductAuditTaskConfig;
}

const defaultProductAuditConfig: ProductAuditTaskConfig = {
  submitUnauditedDrafts: true,
  submitLimit: 0,
};

const defaultGlobalProductAuditConfig: ProductAuditTaskConfig = {
  submitUnauditedDrafts: true,
  submitLimit: 150,
};

const actionLabels: Record<ProductAuditFailureAction, string> = {
  stopTask: '停止任务',
  keepDraft: '保留草稿',
  deleteDraft: '删除草稿',
};

const actionColors: Record<ProductAuditFailureAction, string> = {
  stopTask: 'red',
  keepDraft: 'orange',
  deleteDraft: 'blue',
};

const matchTypeLabels: Record<ProductAuditRuleMatchType, string> = {
  outerErrorCode: '外层错误码',
  embeddedErrorCode: '内层错误码',
  keyword: '错误关键词',
};

const configurableFailureActions: ConfigurableFailureAction[] = ['stopTask', 'keepDraft'];

function formatQuotaFetchedAt(timestamp?: number): string {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function failureRuleMatchLabel(match: ProductAuditFailureRuleMatch): string {
  if (match.type === 'keyword') return `关键词：${match.keyword}`;
  return `${matchTypeLabels[match.type]}：${match.code}`;
}

function createFailureRule(
  action: ProductAuditFailureAction,
  matchType: ProductAuditRuleMatchType,
  rawValue: string,
  description: string,
): ProductAuditFailureRule | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const match: ProductAuditFailureRuleMatch = matchType === 'keyword'
    ? { type: 'keyword', keyword: trimmed }
    : { type: matchType, code: Number(trimmed) };

  if (match.type !== 'keyword' && (!Number.isInteger(match.code) || match.code <= 0)) {
    return null;
  }

  return {
    id: `${action}-${match.type}-${match.type === 'keyword' ? encodeURIComponent(match.keyword) : match.code}-${Date.now()}`,
    enabled: true,
    action,
    match,
    description: description.trim() || undefined,
  };
}

function sameFailureRuleMatch(a: ProductAuditFailureRuleMatch, b: ProductAuditFailureRuleMatch): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'keyword' && b.type === 'keyword') return a.keyword === b.keyword;
  if (a.type !== 'keyword' && b.type !== 'keyword') return a.code === b.code;
  return false;
}

const ProductAuditPage: React.FC<ProductAuditPageProps> = ({ accountId, accounts, scope = 'account', globalView = 'tasks' }) => {
  const { productAuditConfig, fetchProductAuditConfig, saveProductAuditConfig } = useProductAuditConfig(accountId);
  const { logs, fetchLogs, clearLogs } = useProductAuditLogs(accountId);
  const { quota, loading: quotaLoading, error: quotaError, fetchQuota } = useQuota(accountId);
  const { tasks, fetchTasks, addTask, updateTask, removeTask } = useSchedulers(accountId);
  const { tasks: globalTasks, fetchTasks: fetchGlobalTasks, addTask: addGlobalTask, updateTask: updateGlobalTask, removeTask: removeGlobalTask } = useGlobalSchedulers();
  const globalRulesEnabled = scope === 'global';
  const { policy: failurePolicy, defaultPolicy, fetchPolicy: fetchFailurePolicy, savePolicy: saveFailurePolicy } = useProductAuditFailurePolicy(globalRulesEnabled);
  const { rules: statusRules, fetchRules: fetchStatusRules } = useStatusRules(globalRulesEnabled);

  const [runningAccountIds, setRunningAccountIds] = useState<Set<string>>(() => new Set());
  const [resultsByAccountId, setResultsByAccountId] = useState<Record<string, ProductAuditTaskResult | null>>({});
  const [localSubmittedCountsByAccountId, setLocalSubmittedCountsByAccountId] = useState<Record<string, number>>({});
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<AccountProductAuditScheduledJob | null>(null);
  const [globalEditModalOpen, setGlobalEditModalOpen] = useState(false);
  const [editingGlobalTask, setEditingGlobalTask] = useState<GlobalProductAuditScheduledJob | null>(null);
  const [formData, setFormData] = useState<ProductAuditJobFormData>({
    name: '',
    cronExpression: '0 9 * * *',
    dailyLimit: 0,
    staggerMinutes: 3,
    enabled: true,
    excludedAccountIds: [],
    productAuditConfig: { ...defaultProductAuditConfig },
  });
  const [globalFormData, setGlobalFormData] = useState<ProductAuditJobFormData>({
    name: '每日全账号提审',
    cronExpression: '0 9 * * *',
    staggerMinutes: 3,
    enabled: true,
    excludedAccountIds: [],
    productAuditConfig: { ...defaultGlobalProductAuditConfig },
  });
  const [globalTimeInput, setGlobalTimeInput] = useState('09:00');
  const [failureRuleModal, setFailureRuleModal] = useState<FailureRuleModalState | null>(null);
  const [newFailureRuleMatchType, setNewFailureRuleMatchType] = useState<ProductAuditRuleMatchType>('embeddedErrorCode');
  const [newFailureRuleValue, setNewFailureRuleValue] = useState('');
  const [newFailureRuleDesc, setNewFailureRuleDesc] = useState('');
  const [deletingDraftProductIds, setDeletingDraftProductIds] = useState<Set<string>>(() => new Set());

  const currentAccountIdRef = useRef(accountId);
  const taskUnsubscribersRef = useRef(new Map<string, () => void>());

  useEffect(() => {
    currentAccountIdRef.current = accountId;
    if (scope === 'account') {
      fetchProductAuditConfig();
      fetchLogs();
      fetchQuota();
      fetchTasks();
      return;
    }
    fetchGlobalTasks();
    fetchFailurePolicy();
    fetchStatusRules();
  }, [accountId, scope]);

  useEffect(() => {
    return () => {
      taskUnsubscribersRef.current.forEach(unsubscribe => unsubscribe());
      taskUnsubscribersRef.current.clear();
    };
  }, []);

  const running = runningAccountIds.has(accountId);
  const result = resultsByAccountId[accountId];
  const displayedSubmittedCount = running ? localSubmittedCountsByAccountId[accountId] || 0 : result?.submitted || 0;
  const quotaExhausted = !quotaLoading && !quotaError && quota.quota <= 0;
  const quotaTagColor = quotaError ? 'red' : quotaExhausted ? 'red' : quota.quota <= 10 ? 'orange' : 'green';
  const quotaTagText = quotaError
    ? '配额获取失败'
    : quota.fetchedAt
      ? `今日剩余 ${quota.quota}/${quota.total}`
      : '尚未获取提审配额';
  const quotaTooltip = quotaError
    ? quotaError.message || '获取提审配额失败'
    : quota.fetchedAt
      ? `来源：${quota.source === 'cache' ? '缓存' : '接口'}，刷新时间：${formatQuotaFetchedAt(quota.fetchedAt)}`
      : '尚未获取提审配额';

  const deletedProductIds = useMemo(() => {
    const ids = new Set<string>();
    for (const log of logs) {
      if (log.productId && log.action === 'delete' && log.status === 'success') {
        ids.add(log.productId);
      }
    }
    return ids;
  }, [logs]);

  const failureRules = failurePolicy.rules;
  const failureRulesByAction = useMemo(() => ({
    stopTask: failureRules.filter(rule => rule.action === 'stopTask'),
    keepDraft: failureRules.filter(rule => rule.action === 'keepDraft'),
    deleteDraft: failureRules.filter(rule => rule.action === 'deleteDraft'),
  }), [failureRules]);

  function setAccountRunning(targetAccountId: string, isRunning: boolean): void {
    setRunningAccountIds(prev => {
      const next = new Set(prev);
      if (isRunning) next.add(targetAccountId);
      else next.delete(targetAccountId);
      return next;
    });
  }

  async function doRun(): Promise<void> {
    const targetAccountId = accountId;
    const config = { ...productAuditConfig, submitLimit: quota.quota };
    setAccountRunning(targetAccountId, true);
    setResultsByAccountId(prev => ({ ...prev, [targetAccountId]: null }));
    setLocalSubmittedCountsByAccountId(prev => ({ ...prev, [targetAccountId]: 0 }));
    taskUnsubscribersRef.current.get(targetAccountId)?.();
    const unsubscribe = extensionApi.productAudit.onLogAdded(targetAccountId, (log: LogEntry) => {
      if (log.status === 'success' && log.action === 'submitAudit') {
        setLocalSubmittedCountsByAccountId(prev => ({
          ...prev,
          [targetAccountId]: (prev[targetAccountId] || 0) + 1,
        }));
      }
    });
    taskUnsubscribersRef.current.set(targetAccountId, unsubscribe);

    try {
      const nextResult = await extensionApi.productAudit.run(targetAccountId, config);
      setResultsByAccountId(prev => ({ ...prev, [targetAccountId]: nextResult }));
      if (currentAccountIdRef.current === targetAccountId) fetchQuota(true);
    } finally {
      taskUnsubscribersRef.current.get(targetAccountId)?.();
      taskUnsubscribersRef.current.delete(targetAccountId);
      setAccountRunning(targetAccountId, false);
      setLocalSubmittedCountsByAccountId(prev => ({ ...prev, [targetAccountId]: 0 }));
      if (currentAccountIdRef.current === targetAccountId) fetchLogs();
    }
  }

  function handleRun(): void {
    if (quotaExhausted) {
      Modal.confirm({
        title: '今日提审配额已用完',
        content: '配额为 0 时仍可执行任务，但提审步骤会失败。是否继续？',
        okText: '继续执行',
        cancelText: '取消',
        onOk: () => doRun(),
      });
      return;
    }
    void doRun();
  }

  function updateConfig(patch: Partial<ProductAuditTaskConfig>): void {
    saveProductAuditConfig({ ...productAuditConfig, ...patch });
  }

  function openAddModal(): void {
    setEditingTask(null);
    setFormData({
      name: '',
      cronExpression: '0 9 * * *',
      dailyLimit: 0,
      staggerMinutes: 3,
      enabled: true,
      excludedAccountIds: [],
      productAuditConfig: { ...defaultProductAuditConfig },
    });
    setEditModalOpen(true);
  }

  function openEditModal(task: AccountProductAuditScheduledJob): void {
    setEditingTask(task);
    setFormData({
      name: task.name,
      cronExpression: task.cronExpression,
      dailyLimit: task.dailyLimit,
      staggerMinutes: 3,
      enabled: task.enabled,
      excludedAccountIds: [],
      productAuditConfig: { ...defaultProductAuditConfig, ...task.payload },
    });
    setEditModalOpen(true);
  }

  function openAddGlobalModal(): void {
    setEditingGlobalTask(null);
    setGlobalTimeInput('09:00');
    setGlobalFormData({
      name: '每日全账号提审',
      cronExpression: '0 9 * * *',
      staggerMinutes: 3,
      enabled: true,
      excludedAccountIds: [],
      productAuditConfig: { ...defaultGlobalProductAuditConfig },
    });
    setGlobalEditModalOpen(true);
  }

  function openEditGlobalModal(task: GlobalProductAuditScheduledJob): void {
    setEditingGlobalTask(task);
    setGlobalTimeInput(cronToTimeInput(task.cronExpression));
    setGlobalFormData({
      name: task.name,
      cronExpression: task.cronExpression,
      staggerMinutes: task.staggerMinutes,
      enabled: task.enabled,
      excludedAccountIds: task.excludedAccountIds,
      productAuditConfig: { ...defaultGlobalProductAuditConfig, ...task.payload },
    });
    setGlobalEditModalOpen(true);
  }

  async function handleSaveTask(): Promise<void> {
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
        payload: formData.productAuditConfig,
      });
      message.success('任务已更新');
    } else {
      await addTask({
        name: formData.name,
        enabled: formData.enabled,
        module: 'productAudit',
        jobType: 'productAudit.submitDrafts',
        scope: 'account',
        accountId,
        runMode: 'recurring',
        cronExpression: formData.cronExpression,
        dailyLimit: formData.dailyLimit || 0,
        completedAt: null,
        payload: formData.productAuditConfig,
      });
      message.success('任务已创建');
    }
    setEditModalOpen(false);
  }

  async function handleSaveGlobalTask(): Promise<void> {
    if (!globalFormData.name.trim()) {
      message.error('请输入任务名称');
      return;
    }
    if (accounts.length === globalFormData.excludedAccountIds.length) {
      message.error('至少选择一个参与账号');
      return;
    }
    const cron = timeInputToCron(globalTimeInput);
    if (!cron) {
      message.error('请输入有效时间，例如 09:00');
      return;
    }
    const quantity = globalFormData.productAuditConfig.submitLimit;
    if (!Number.isFinite(quantity) || quantity < 1) {
      message.error('请输入有效的提审数量');
      return;
    }

    const normalizedConfig = {
      ...defaultGlobalProductAuditConfig,
      ...globalFormData.productAuditConfig,
      submitLimit: quantity,
    };
    if (editingGlobalTask) {
      await updateGlobalTask(editingGlobalTask.id, {
        name: globalFormData.name,
        enabled: globalFormData.enabled,
        cronExpression: cron,
        staggerMinutes: globalFormData.staggerMinutes,
        excludedAccountIds: globalFormData.excludedAccountIds,
        payload: normalizedConfig,
      });
      message.success('全账号任务已更新');
    } else {
      await addGlobalTask({
        name: globalFormData.name,
        enabled: globalFormData.enabled,
        module: 'productAudit',
        jobType: 'productAudit.submitDrafts',
        scope: 'global',
        runMode: 'recurring',
        cronExpression: cron,
        staggerMinutes: globalFormData.staggerMinutes,
        excludedAccountIds: globalFormData.excludedAccountIds,
        dailyLimit: 0,
        completedAt: null,
        payload: normalizedConfig,
        accountStats: {},
      });
      message.success('全账号任务已创建');
    }
    setGlobalEditModalOpen(false);
  }

  function openAddFailureRuleModal(action: ConfigurableFailureAction): void {
    setFailureRuleModal({ mode: 'add', action });
    setNewFailureRuleMatchType(action === 'stopTask' ? 'outerErrorCode' : 'embeddedErrorCode');
    setNewFailureRuleValue('');
    setNewFailureRuleDesc('');
  }

  function openEditFailureRuleModal(rule: ProductAuditFailureRule): void {
    if (rule.action === 'deleteDraft') return;
    setFailureRuleModal({ mode: 'edit', action: rule.action, ruleId: rule.id });
    setNewFailureRuleMatchType(rule.match.type);
    setNewFailureRuleValue(rule.match.type === 'keyword' ? rule.match.keyword : String(rule.match.code));
    setNewFailureRuleDesc(rule.description || '');
  }

  function closeFailureRuleModal(): void {
    setFailureRuleModal(null);
    setNewFailureRuleValue('');
    setNewFailureRuleDesc('');
  }

  async function handleSaveFailureRule(): Promise<void> {
    if (!failureRuleModal) return;
    const nextRule = createFailureRule(failureRuleModal.action, newFailureRuleMatchType, newFailureRuleValue, newFailureRuleDesc);
    if (!nextRule) {
      message.error(newFailureRuleMatchType === 'keyword' ? '请输入关键词' : '请输入有效错误码');
      return;
    }
    if (failureRules.some(rule => rule.id !== failureRuleModal.ruleId && rule.action === nextRule.action && sameFailureRuleMatch(rule.match, nextRule.match))) {
      message.info('相同失败处理规则已存在');
      return;
    }

    const nextRules = failureRuleModal.mode === 'edit'
      ? failureRules.map(rule => {
        if (rule.id !== failureRuleModal.ruleId) return rule;
        return {
          ...nextRule,
          id: rule.id,
          enabled: rule.enabled,
          priority: rule.priority,
        };
      })
      : [...failureRules, nextRule];

    await saveFailurePolicy({
      ...failurePolicy,
      rules: nextRules.filter(rule => rule.action !== 'deleteDraft'),
      defaultAction: 'deleteDraft',
    });
    closeFailureRuleModal();
    message.success(failureRuleModal.mode === 'edit' ? '失败处理规则已更新' : '失败处理规则已添加');
  }

  async function handleRemoveFailureRule(ruleId: string): Promise<void> {
    await saveFailurePolicy({
      ...failurePolicy,
      rules: failureRules.filter(rule => rule.id !== ruleId && rule.action !== 'deleteDraft'),
      defaultAction: 'deleteDraft',
    });
    message.success('失败处理规则已删除');
  }

  async function handleToggleFailureRule(ruleId: string, enabled: boolean): Promise<void> {
    await saveFailurePolicy({
      ...failurePolicy,
      rules: failureRules
        .filter(rule => rule.action !== 'deleteDraft')
        .map(rule => (rule.id === ruleId ? { ...rule, enabled } : rule)),
      defaultAction: 'deleteDraft',
    });
  }

  async function handleResetFailureRules(): Promise<void> {
    await saveFailurePolicy({
      ...defaultPolicy,
      rules: defaultPolicy.rules.filter(rule => rule.action !== 'deleteDraft'),
      defaultAction: 'deleteDraft',
    });
    message.success('已恢复默认失败处理规则');
  }

  async function handleDeleteDraftFromLog(log: LogEntry): Promise<void> {
    if (!log.productId) return;
    setDeletingDraftProductIds(prev => new Set(prev).add(log.productId));
    try {
      const result = await extensionApi.drafts.delete(accountId, {
        productId: log.productId,
        productTitle: log.productTitle,
        runId: log.runId,
      });
      if (result.success) {
        message.success('草稿已删除');
      } else {
        message.error(result.error || '草稿删除失败');
      }
      await fetchLogs();
    } catch (error: any) {
      message.error(error?.message || '草稿删除失败');
    } finally {
      setDeletingDraftProductIds(prev => {
        const next = new Set(prev);
        next.delete(log.productId);
        return next;
      });
    }
  }

  const renderWorkflowNode = (title: string, description: string, icon: React.ReactNode, color: string) => (
    <div style={{
      flex: '1 1 180px',
      minWidth: 180,
      border: '1px solid #f0f0f0',
      borderRadius: 6,
      padding: 12,
      background: '#fff',
    }}>
      <Space size={8} align="start">
        <span style={{ color, fontSize: 18, lineHeight: '22px' }}>{icon}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: '#222' }}>{title}</div>
          <div style={{ marginTop: 4, color: '#666', fontSize: 12, lineHeight: 1.6 }}>{description}</div>
        </div>
      </Space>
    </div>
  );

  const renderWorkflowArrow = () => (
    <div style={{ display: 'flex', alignItems: 'center', color: '#bfbfbf', paddingTop: 22, flex: '0 0 auto' }}>
      <ArrowRightOutlined />
    </div>
  );

  const renderFailureWorkflow = () => (
    <div style={{
      border: '1px solid #f0f0f0',
      borderRadius: 6,
      padding: 16,
      background: '#fafafa',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <Space size={8}>
          <InfoCircleOutlined style={{ color: '#1677ff' }} />
          <span style={{ fontWeight: 600 }}>提审失败后的处理顺序</span>
        </Space>
        <Popconfirm title="恢复默认失败处理规则？" onConfirm={handleResetFailureRules} okText="恢复" cancelText="取消">
          <Button type="text" size="small" icon={<ReloadOutlined />} aria-label="恢复默认规则" title="恢复默认规则" />
        </Popconfirm>
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 10, flexWrap: 'wrap' }}>
        {renderWorkflowNode('商品提审失败', '接口返回失败后才进入这套规则管道，成功提审不会触发。', <ExclamationCircleOutlined />, '#fa8c16')}
        {renderWorkflowArrow()}
        {renderWorkflowNode('停止任务规则', '先判断是否需要停止整个任务；命中后不再处理后续草稿。', <StopOutlined />, '#cf1322')}
        {renderWorkflowArrow()}
        {renderWorkflowNode('保留草稿规则', '未停止时继续判断保留规则；命中后保留当前草稿并继续下一个。', <FileProtectOutlined />, '#d48806')}
        {renderWorkflowArrow()}
        {renderWorkflowNode('删除草稿', '前两类都未命中时进入默认兜底，直接删除失败草稿。', <DeleteOutlined />, '#1677ff')}
      </div>
    </div>
  );

  const renderFailureRuleRows = (action: ConfigurableFailureAction) => {
    const rules = failureRulesByAction[action];
    return (
      <div style={{ border: '1px solid #f0f0f0', borderRadius: 6, overflow: 'hidden', background: '#fff' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600 }}>{actionLabels[action]}</div>
            <div style={{ color: '#999', fontSize: 12, marginTop: 2 }}>
              {action === 'stopTask'
                ? '命中后停止当前全账号提审任务，适合配额、封禁、能力受限这类不可继续的失败。'
                : '命中后保留当前失败草稿，适合需要人工补资料、开通服务或复核资质的失败。'}
            </div>
          </div>
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => openAddFailureRuleModal(action)}>
            {action === 'stopTask' ? '添加停止规则' : '添加保留规则'}
          </Button>
        </div>

        {rules.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`暂无${actionLabels[action]}规则`} style={{ padding: '28px 0' }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {rules.map(rule => (
              <div key={rule.id} style={{ minHeight: 56, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #f5f5f5' }}>
                <Switch size="small" checked={rule.enabled} onChange={enabled => handleToggleFailureRule(rule.id, enabled)} />
                <Tag color={actionColors[action]} style={{ margin: 0, flexShrink: 0 }}>{failureRuleMatchLabel(rule.match)}</Tag>
                <div style={{ flex: 1, minWidth: 0, color: rule.enabled ? '#333' : '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {rule.description || '未填写规则说明'}
                </div>
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditFailureRuleModal(rule)}>编辑</Button>
                <Popconfirm title="确认删除此失败处理规则？" onConfirm={() => handleRemoveFailureRule(rule.id)} okText="删除" cancelText="取消">
                  <Button type="text" size="small" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderDefaultDeleteRule = () => (
    <div style={{ border: '1px solid #f0f0f0', borderRadius: 6, padding: 16, background: '#fff' }}>
      <Space align="start" size={10}>
        <CheckCircleOutlined style={{ color: '#1677ff', fontSize: 18, marginTop: 2 }} />
        <div>
          <div style={{ fontWeight: 600 }}>删除草稿</div>
          <div style={{ color: '#666', fontSize: 13, lineHeight: 1.7, marginTop: 4 }}>
            这是固定的默认兜底动作，不需要配置规则。失败草稿没有命中停止任务规则，也没有命中保留草稿规则时，会自动删除并继续后续草稿。
          </div>
        </div>
      </Space>
    </div>
  );

  const renderStatusRuleDocs = () => (
    <Collapse
      size="small"
      ghost
      items={[{
        key: 'statusRules',
        label: '草稿状态说明',
        children: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
            {statusRules.map(rule => (
              <div key={rule.editStatus} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 26 }}>
                <Tag style={{ margin: 0 }}>edit_status:{rule.editStatus}</Tag>
                <span style={{ minWidth: 80 }}>{rule.label}</span>
                <Tag color={rule.action === 'submit' ? 'blue' : rule.action === 'delete' ? 'red' : 'default'}>
                  {rule.action === 'submit' ? '提交提审' : rule.action === 'delete' ? '删除草稿' : '跳过'}
                </Tag>
              </div>
            ))}
          </div>
        ),
      }]}
    />
  );

  const renderFailureRuleModal = () => (
    <Modal
      title={failureRuleModal?.mode === 'edit' ? `编辑${actionLabels[failureRuleModal.action]}规则` : `添加${failureRuleModal ? actionLabels[failureRuleModal.action] : ''}规则`}
      open={Boolean(failureRuleModal)}
      onCancel={closeFailureRuleModal}
      onOk={handleSaveFailureRule}
      okText="保存"
      cancelText="取消"
      width={560}
    >
      <Space vertical style={{ width: '100%' }} size={12}>
        <Alert
          type={failureRuleModal?.action === 'stopTask' ? 'warning' : 'info'}
          showIcon
          title={failureRuleModal?.action === 'stopTask'
            ? '停止任务规则命中后会结束当前任务，不再继续处理后续草稿。'
            : '保留草稿规则命中后只保留当前失败草稿，任务会继续处理后续草稿。'}
        />
        <Select
          value={newFailureRuleMatchType}
          onChange={setNewFailureRuleMatchType}
          options={[
            { label: '外层错误码', value: 'outerErrorCode' },
            { label: '内层错误码', value: 'embeddedErrorCode' },
            { label: '错误关键词', value: 'keyword' },
          ]}
          style={{ width: '100%' }}
        />
        <Input
          value={newFailureRuleValue}
          onChange={event => setNewFailureRuleValue(event.target.value)}
          placeholder={newFailureRuleMatchType === 'keyword' ? '例如：品牌授权' : '例如：6600144'}
        />
        <Input
          value={newFailureRuleDesc}
          onChange={event => setNewFailureRuleDesc(event.target.value)}
          placeholder="给用户看的规则说明"
        />
      </Space>
    </Modal>
  );

  const renderRulesSection = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {renderFailureWorkflow()}
      {configurableFailureActions.map(action => (
        <React.Fragment key={action}>
          {renderFailureRuleRows(action)}
        </React.Fragment>
      ))}
      {renderDefaultDeleteRule()}
      <div style={{ alignSelf: 'flex-start', minWidth: 260 }}>
        {renderStatusRuleDocs()}
      </div>
      {renderFailureRuleModal()}
    </div>
  );

  const renderTaskModal = () => (
    <Modal
      title={editingTask ? '编辑单账号提审任务' : '新建单账号提审任务'}
      open={editModalOpen}
      onCancel={() => setEditModalOpen(false)}
      onOk={handleSaveTask}
      okText="保存"
      cancelText="取消"
    >
      <Space vertical style={{ width: '100%' }} size={12}>
        <Input value={formData.name} onChange={event => setFormData(prev => ({ ...prev, name: event.target.value }))} placeholder="任务名称" />
        <Select
          value={formData.cronExpression}
          onChange={value => setFormData(prev => ({ ...prev, cronExpression: value }))}
          options={cronPresets}
          style={{ width: '100%' }}
        />
        <Space>
          <span>每日上限</span>
          <InputNumber min={0} value={formData.dailyLimit} onChange={value => setFormData(prev => ({ ...prev, dailyLimit: value || 0 }))} />
          <span style={{ color: '#999' }}>0 表示不限</span>
        </Space>
        <Switch checked={formData.enabled} onChange={enabled => setFormData(prev => ({ ...prev, enabled }))} checkedChildren="启用" unCheckedChildren="停用" />
      </Space>
    </Modal>
  );

  const renderGlobalTaskModal = () => (
    <Modal
      title={editingGlobalTask ? '编辑全账号提审任务' : '新建全账号提审任务'}
      open={globalEditModalOpen}
      onCancel={() => setGlobalEditModalOpen(false)}
      onOk={handleSaveGlobalTask}
      okText="保存"
      cancelText="取消"
      width={680}
    >
      <Space vertical style={{ width: '100%' }} size={12}>
        <Input value={globalFormData.name} onChange={event => setGlobalFormData(prev => ({ ...prev, name: event.target.value }))} placeholder="任务名称" />
        <Space wrap>
          <span>每天</span>
          <Input value={globalTimeInput} onChange={event => setGlobalTimeInput(event.target.value)} placeholder="09:00" style={{ width: 100 }} />
          <span>开始，错峰</span>
          <InputNumber min={0} value={globalFormData.staggerMinutes} onChange={value => setGlobalFormData(prev => ({ ...prev, staggerMinutes: value || 0 }))} />
          <span>分钟/账号</span>
        </Space>
        <Space wrap>
          <span>每个账号提审</span>
          <InputNumber
            min={1}
            value={globalFormData.productAuditConfig.submitLimit}
            onChange={value => setGlobalFormData(prev => ({
              ...prev,
              productAuditConfig: { ...prev.productAuditConfig, submitLimit: value || defaultGlobalProductAuditConfig.submitLimit },
            }))}
          />
          <span>个草稿</span>
        </Space>
        <Select
          mode="multiple"
          allowClear
          value={globalFormData.excludedAccountIds}
          onChange={excludedAccountIds => setGlobalFormData(prev => ({ ...prev, excludedAccountIds }))}
          placeholder="排除账号，不选表示全部参与"
          options={accounts.map(account => ({ label: account.name, value: account.id }))}
          style={{ width: '100%' }}
        />
        <Switch checked={globalFormData.enabled} onChange={enabled => setGlobalFormData(prev => ({ ...prev, enabled }))} checkedChildren="启用" unCheckedChildren="停用" />
      </Space>
    </Modal>
  );

  const renderExecutionLogs = () => (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', paddingTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexShrink: 0 }}>
        <span style={{ fontWeight: 500 }}>执行记录</span>
        <Space size={4}>
          <Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => { fetchLogs(); fetchQuota(true); }} />
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
              const actionLabel = log.action === 'delete'
                ? '删除'
                : log.action === 'check'
                  ? '检查'
                  : log.action === 'keepDraft'
                    ? '保留'
                    : log.action === 'stopTask'
                      ? '停止'
                      : '提审';
              const canDeleteDraft = Boolean(log.productId) && log.action === 'submitAudit' && !deletedProductIds.has(log.productId);
              return (
                <React.Fragment key={log.id}>
                  {showDivider && <Divider style={{ margin: '4px 0' }} />}
                  <div style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: isSuccess ? '#f6ffed' : log.action === 'keepDraft' ? '#fff7e6' : '#fff2f0',
                    borderLeft: `3px solid ${isSuccess ? '#b7eb8f' : log.action === 'keepDraft' ? '#ffd591' : '#ffccc7'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: log.action === 'delete' ? '#fa8c16' : log.action === 'keepDraft' ? '#fa8c16' : log.action === 'stopTask' ? '#cf1322' : '#1677ff' }}>{actionLabel}</span>
                      <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.productTitle || log.productId || ''}
                      </span>
                      <span style={{ color: '#bbb', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {new Date(log.timestamp).toLocaleTimeString('zh-CN')}
                      </span>
                      {canDeleteDraft && (
                        <Popconfirm
                          title="从草稿箱删除商品？"
                          description="将调用微信小店草稿删除接口，删除后无法撤销。"
                          okText="删除"
                          cancelText="取消"
                          okButtonProps={{ danger: true, loading: deletingDraftProductIds.has(log.productId) }}
                          disabled={running || deletingDraftProductIds.has(log.productId)}
                          onConfirm={() => handleDeleteDraftFromLog(log)}
                        >
                          <Button
                            type="link"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            loading={deletingDraftProductIds.has(log.productId)}
                            disabled={running}
                            style={{ padding: '0 4px', height: 20, fontSize: 11, flexShrink: 0 }}
                          >
                            删除草稿
                          </Button>
                        </Popconfirm>
                      )}
                    </div>
                    {(log.errorMsg || log.decisionReason) && (
                      <div style={{ color: isSuccess ? '#389e0d' : '#cf1322', fontSize: 12, marginTop: 4, lineHeight: 1.6, wordBreak: 'break-all' }}>
                        {log.errorCode != null && <Tag color="error" style={{ fontSize: 11, marginRight: 4, lineHeight: '18px', padding: '0 4px' }}>errcode:{log.errorCode}</Tag>}
                        {log.errorMsg}
                        {log.decisionAction && <Tag color={actionColors[log.decisionAction]} style={{ fontSize: 10, marginLeft: 4, lineHeight: '16px', padding: '0 4px', verticalAlign: 'middle' }}>{actionLabels[log.decisionAction]}</Tag>}
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
  );

  const renderGlobalTasksSection = () => (
    <div style={{ border: '1px solid #f0f0f0', borderRadius: 6 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600 }}>任务列表</span>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openAddGlobalModal}>新建任务</Button>
      </div>
      {globalTasks.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无全账号提审任务" style={{ padding: '48px 0' }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {globalTasks.map(task => {
            const includedCount = accounts.filter(account => !task.excludedAccountIds.includes(account.id)).length;
            return (
              <div key={task.id} style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 16, borderBottom: '1px solid #f5f5f5' }}>
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
  );

  if (scope === 'global') {
    const globalTitle = globalView === 'rules' ? '失败处理规则' : '每日自动提审';
    const globalDescription = globalView === 'tasks'
      ? '为全部账号配置每天自动提审任务，系统会按账号错峰执行。'
      : '';
    return (
      <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{globalTitle}</div>
          {globalDescription && <div style={{ marginTop: 4, color: '#666', fontSize: 13 }}>{globalDescription}</div>}
        </div>
        {globalView === 'tasks' ? renderGlobalTasksSection() : renderRulesSection()}
        {renderGlobalTaskModal()}
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, borderBottom: '1px solid #f0f0f0', paddingBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space size={24}>
            <Space size={8}>
              <Checkbox
                checked={productAuditConfig.submitUnauditedDrafts}
                onChange={event => updateConfig({ submitUnauditedDrafts: event.target.checked })}
              >
                提交未审核草稿
              </Checkbox>
              <InputNumber controls={false} size="small" min={0} value={quota.quota} disabled={!productAuditConfig.submitUnauditedDrafts} style={{ width: 60 }} />
              <span style={{ color: '#666' }}>条</span>
            </Space>
          </Space>
          <Space>
            <Button size="small" icon={<ClockCircleOutlined />} onClick={() => setSchedulerOpen(!schedulerOpen)} type={schedulerOpen ? 'primary' : 'default'} ghost={schedulerOpen}>
              定时任务{tasks.length > 0 ? ` (${tasks.length})` : ''}
            </Button>
            <Tooltip title={quotaTooltip}>
              <Tag color={quotaTagColor}>{quotaTagText}</Tag>
            </Tooltip>
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleRun} loading={running} disabled={!productAuditConfig.submitUnauditedDrafts}>
              开始提审
            </Button>
            {running && (
              <Button danger icon={<StopOutlined />} onClick={() => extensionApi.productAudit.stop(accountId)}>
                停止
              </Button>
            )}
          </Space>
        </div>

        {schedulerOpen && (
          <div style={{ marginTop: 12, border: '1px solid #f0f0f0', borderRadius: 6 }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>单账号定时提审</span>
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openAddModal}>新建任务</Button>
            </div>
            {tasks.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无单账号定时任务" style={{ padding: '24px 0' }} />
            ) : tasks.map(task => (
              <div key={task.id} style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #f5f5f5' }}>
                <Switch size="small" checked={task.enabled} onChange={checked => updateTask(task.id, { enabled: checked })} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Space size={8} wrap>
                    <span style={{ fontWeight: 600 }}>{task.name}</span>
                    <Tag color="blue">{cronToLabel(task.cronExpression)}</Tag>
                    <Tag>今日 {task.stats.todayRunCount}/{task.dailyLimit || '不限'}</Tag>
                  </Space>
                </div>
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditModal(task)}>编辑</Button>
                <Popconfirm title="确认删除此任务？" onConfirm={() => removeTask(task.id)} okText="删除" cancelText="取消">
                  <Button type="text" size="small" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              </div>
            ))}
          </div>
        )}

        {running && (
          <Alert
            style={{ marginTop: 10 }}
            type="info"
            showIcon
            icon={<ExclamationCircleOutlined />}
            title={`正在提审，已成功提交 ${displayedSubmittedCount} 个草稿`}
          />
        )}
        {result && !running && (
          <Alert
            style={{ marginTop: 10 }}
            type={result.stopped ? 'warning' : 'success'}
            showIcon
            title={
              <Space wrap>
                <span>扫描 {result.scanned}</span>
                {result.submitted > 0 && <Tag color="success">提审成功 {result.submitted}</Tag>}
                {result.kept > 0 && <Tag color="orange">保留草稿 {result.kept}</Tag>}
                {result.deleted > 0 && <Tag color="blue">删除草稿 {result.deleted}</Tag>}
                {result.skipped > 0 && <Tag>跳过 {result.skipped}</Tag>}
                {result.errors > 0 && <Tag color="error">错误 {result.errors}</Tag>}
                {result.stopped && <Tag color="warning">已停止: {result.reason}</Tag>}
              </Space>
            }
          />
        )}
      </div>

      {renderExecutionLogs()}
      {renderTaskModal()}
    </div>
  );
};

export default ProductAuditPage;
