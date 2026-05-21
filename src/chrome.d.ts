declare namespace chrome {
  namespace runtime {
    interface MessageSender {
      tab?: tabs.Tab;
    }

    interface Manifest {
      version: string;
    }

    const id: string;
    function getURL(path: string): string;
    function getManifest(): Manifest;
    function sendMessage(message: unknown): Promise<unknown>;

    namespace onMessage {
      function addListener(
        callback: (message: any, sender: MessageSender, sendResponse: (response?: any) => void) => boolean | void,
      ): void;
      function removeListener(callback: (message: any, sender: MessageSender, sendResponse: (response?: any) => void) => boolean | void): void;
    }
  }

  namespace storage {
    namespace local {
      function get(keys?: string[] | Record<string, unknown> | string | null): Promise<Record<string, any>>;
      function set(items: Record<string, unknown>): Promise<void>;
    }
  }

  namespace alarms {
    interface Alarm {
      name: string;
      scheduledTime: number;
      periodInMinutes?: number;
    }

    interface AlarmCreateInfo {
      when?: number;
      delayInMinutes?: number;
      periodInMinutes?: number;
    }

    function create(name: string, alarmInfo: AlarmCreateInfo): Promise<void>;
    function clear(name: string): Promise<boolean>;
    function getAll(): Promise<Alarm[]>;

    namespace onAlarm {
      function addListener(callback: (alarm: Alarm) => void): void;
    }
  }

  namespace tabs {
    interface Tab {
      id?: number;
      windowId?: number;
      url?: string;
    }

    interface TabChangeInfo {
      url?: string;
      status?: string;
    }

    function query(queryInfo: { url?: string; active?: boolean; currentWindow?: boolean }): Promise<Tab[]>;
    function update(tabId: number, updateProperties: { active?: boolean; url?: string }): Promise<Tab>;
    function create(createProperties: { url: string; active?: boolean }): Promise<Tab>;

    namespace onRemoved {
      function addListener(callback: (tabId: number) => void): void;
    }

    namespace onUpdated {
      function addListener(callback: (tabId: number, changeInfo: TabChangeInfo, tab: Tab) => void): void;
    }
  }

  namespace windows {
    function update(windowId: number, updateInfo: { focused?: boolean }): Promise<unknown>;
  }

  namespace action {
    namespace onClicked {
      function addListener(callback: (tab: tabs.Tab) => void): void;
    }
  }
}

declare const chrome: any;
