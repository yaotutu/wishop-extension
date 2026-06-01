import type { WxProductCategoryPath } from '../../../shared/types.ts';

interface RawWxCategoryNode {
  id: string;
  name: string;
  parentId: string;
  leaf: boolean;
  children: RawWxCategoryNode[];
  qualificationTips: string[];
}

function normalizeCategoryText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeCategoryId(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function readCategoryChildren(record: Record<string, unknown>): unknown[] {
  const value = record.children
    ?? record.child
    ?? record.childs
    ?? record.child_categories
    ?? record.child_category_list;
  return Array.isArray(value) ? value : [];
}

function readQualificationTips(record: Record<string, unknown>): string[] {
  const rawTips = record.qualification_tips
    ?? record.qualificationTips
    ?? record.qua_tips
    ?? record.tips;
  if (!Array.isArray(rawTips)) return [];
  return rawTips.map(item => normalizeCategoryText(item)).filter(Boolean);
}

function readRawCategoryNode(value: unknown): RawWxCategoryNode | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const catRecord = record.cat && typeof record.cat === 'object'
    ? record.cat as Record<string, unknown>
    : record;
  const id = normalizeCategoryId(catRecord.cat_id ?? catRecord.catId ?? catRecord.id);
  const name = normalizeCategoryText(catRecord.name ?? catRecord.cat_name ?? catRecord.catName);
  if (!id || !name) return null;

  const children = readCategoryChildren(catRecord)
    .map(readRawCategoryNode)
    .filter((item): item is RawWxCategoryNode => Boolean(item));
  const leafValue = catRecord.leaf ?? catRecord.is_leaf ?? catRecord.isLeaf;
  const leaf = typeof leafValue === 'boolean' ? leafValue : children.length === 0;

  return {
    id,
    name,
    parentId: normalizeCategoryId(
      catRecord.f_cat_id
        ?? catRecord.fCatId
        ?? catRecord.parent_cat_id
        ?? catRecord.parentCatId
        ?? catRecord.parent_id
        ?? catRecord.parentId,
    ),
    leaf,
    children,
    qualificationTips: readQualificationTips(catRecord),
  };
}

function flattenCategoryNodes(value: unknown): RawWxCategoryNode[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(readRawCategoryNode)
    .filter((item): item is RawWxCategoryNode => Boolean(item));
}

function dedupeCategoryPaths(paths: WxProductCategoryPath[]): WxProductCategoryPath[] {
  const seen = new Set<string>();
  return paths.filter(path => {
    const key = path.catIds.join('/');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectNestedCategoryPaths(
  nodes: RawWxCategoryNode[],
  parentIds: string[] = [],
  parentNames: string[] = [],
): WxProductCategoryPath[] {
  const paths: WxProductCategoryPath[] = [];
  for (const node of nodes) {
    const catIds = [...parentIds, node.id];
    const names = [...parentNames, node.name];
    if (node.children.length > 0) {
      paths.push(...collectNestedCategoryPaths(node.children, catIds, names));
      continue;
    }
    if (node.leaf && catIds.length >= 3) {
      paths.push({
        catIds,
        names,
        leaf: true,
        qualificationTips: node.qualificationTips,
      });
    }
  }
  return paths;
}

function collectFlatCategoryPaths(nodes: RawWxCategoryNode[]): WxProductCategoryPath[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const childrenByParent = new Map<string, RawWxCategoryNode[]>();
  for (const node of nodes) {
    if (!node.parentId || !byId.has(node.parentId)) continue;
    const children = childrenByParent.get(node.parentId) || [];
    children.push(node);
    childrenByParent.set(node.parentId, children);
  }

  const paths: WxProductCategoryPath[] = [];
  for (const node of nodes) {
    const children = childrenByParent.get(node.id) || [];
    const isLeaf = node.leaf || children.length === 0;
    if (!isLeaf) continue;

    const lineage: RawWxCategoryNode[] = [];
    const visited = new Set<string>();
    let current: RawWxCategoryNode | undefined = node;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      lineage.unshift(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }

    if (lineage.length >= 3) {
      paths.push({
        catIds: lineage.map(item => item.id),
        names: lineage.map(item => item.name),
        leaf: true,
        qualificationTips: node.qualificationTips,
      });
    }
  }
  return paths;
}

export function normalizeWxCategoryPaths(value: unknown): WxProductCategoryPath[] {
  const nodes = flattenCategoryNodes(value);
  const hasNestedChildren = nodes.some(node => node.children.length > 0);
  const hasParentIds = nodes.some(node => Boolean(node.parentId));
  const paths = hasParentIds
    ? collectFlatCategoryPaths(nodes)
    : hasNestedChildren
      ? collectNestedCategoryPaths(nodes)
      : collectNestedCategoryPaths(nodes);
  return dedupeCategoryPaths(paths);
}
