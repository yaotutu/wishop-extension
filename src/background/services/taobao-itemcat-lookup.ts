import type { TaobaoProductSnapshot, TaobaoProductSourceCategorySnapshot } from '../../shared/types.ts';

interface TaobaoItemcatRuntimeNode {
  name: string;
  path: string[];
  parentId: string;
  isParent: boolean;
}

interface TaobaoItemcatRuntimeData {
  source: string;
  updatedAt: string;
  byId: Record<string, TaobaoItemcatRuntimeNode>;
}

let cachedLookup: Promise<TaobaoItemcatRuntimeData> | undefined;

function normalizeCategoryId(id?: string): string {
  return String(id || '').trim();
}

function enrichSourceCategoryWithLookup(
  sourceCategory: TaobaoProductSourceCategorySnapshot | undefined,
  lookup: TaobaoItemcatRuntimeData,
): TaobaoProductSourceCategorySnapshot | undefined {
  const id = normalizeCategoryId(sourceCategory?.id);
  if (!id) return sourceCategory;

  const itemcat = lookup.byId[id];
  if (!itemcat?.name) return { id };

  return {
    id,
    name: itemcat.name,
    path: itemcat.path.length > 0 ? itemcat.path : [itemcat.name],
  };
}

async function loadTaobaoItemcatRuntimeData(): Promise<TaobaoItemcatRuntimeData> {
  if (!cachedLookup) {
    cachedLookup = fetch(chrome.runtime.getURL('data/taobao-itemcats/taobao-itemcats-runtime.json'))
      .then(async response => {
        if (!response.ok) throw new Error(`读取淘宝类目字典失败：${response.status}`);
        return await response.json() as TaobaoItemcatRuntimeData;
      });
  }
  return await cachedLookup;
}

export function enrichTaobaoProductSnapshotWithItemcatLookup(
  snapshot: TaobaoProductSnapshot,
  lookup: TaobaoItemcatRuntimeData,
): TaobaoProductSnapshot {
  return {
    ...snapshot,
    sourceCategory: enrichSourceCategoryWithLookup(snapshot.sourceCategory, lookup),
  };
}

export async function enrichTaobaoProductSnapshotWithItemcat(
  snapshot: TaobaoProductSnapshot,
): Promise<TaobaoProductSnapshot> {
  if (!snapshot.sourceCategory?.id) return snapshot;
  return enrichTaobaoProductSnapshotWithItemcatLookup(snapshot, await loadTaobaoItemcatRuntimeData());
}
