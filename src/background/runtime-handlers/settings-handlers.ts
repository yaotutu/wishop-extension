/**
 * 全局设置 IPC handler。
 *
 * 只保留「读取 settings」和「更新 settings」两个通道。原来 settings 变更后还要重启发货检查
 * 定时任务的逻辑已随调度域整体删除——「复制商品」不需要任何定时任务。
 */
import type { AppSettingsPatch } from '../../shared/settings';
import { getAppSettings, updateAppSettings } from '../store/settings-repository';
import type { RuntimeHandlerMap } from '../router/runtime-router';

export function createSettingsRuntimeHandlers(): RuntimeHandlerMap {
  return {
    async 'settings:get'() {
      return getAppSettings();
    },
    async 'settings:update'(args) {
      return updateAppSettings(args[0] as AppSettingsPatch);
    },
  };
}
