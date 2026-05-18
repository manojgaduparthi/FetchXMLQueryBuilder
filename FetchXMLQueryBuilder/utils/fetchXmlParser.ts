/**
 * FetchXML Parser Utility
 *
 * @description Utility class for parsing FetchXML back into query structure
 * 
 * This utility parses FetchXML strings and converts them back to the internal
 * QueryGroup structure, allowing users to edit existing queries. It handles
 * nested filter elements, multiple conditions, link-entities, and sort order.
 * 
 * Reference: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/use-fetchxml-construct-query
 */

import { QueryGroup, QueryCondition, ConditionOperator, LinkEntity, LinkType, OrderBy } from '../types';

export class FetchXMLParser {
  /**
   * Extract entity name from FetchXML
   * Returns the logical name from <entity name="xxx"> tag
   */
  public static extractEntityName(fetchXml: string): string | null {
    if (!fetchXml || typeof fetchXml !== 'string') {
      return null;
    }

    try {
      const xml = fetchXml.trim();
      // Match <entity name="entityname">
      const regex = /<entity[^>]*name=["']([^"']+)["']/i;
      const entityMatch = regex.exec(xml);
      if (entityMatch?.[1]) {
        return entityMatch[1];
      }
      return null;
    } catch (error) {
      console.error('Error extracting entity name from FetchXML:', error);
      return null;
    }
  }

  public static parse(fetchXml: string): QueryGroup | null {
    if (!fetchXml || typeof fetchXml !== 'string') {
      return null;
    }

    try {
      const xml = fetchXml.trim();
      // Basic safety: require <fetch> root (skip XML declaration if present)
      if (!xml.includes('<fetch')) {
        return null;
      }

      // Extract the entity block
      const entityRegex = /<entity[^>]*>([\s\S]*?)<\/entity>/i;
      const entityMatch = entityRegex.exec(xml);
      if (!entityMatch) {
        return emptyRoot();
      }
      const entityInner = entityMatch[1];

      // Parse <attribute> tags in this entity block (if any) to populate attributes list on root group
      const attributesList = [];
      const attrPattern = /<attribute[^>]*name=["']([^"']+)["'][^>]*\/?>/gi;
      let attrMatch;
      while ((attrMatch = attrPattern.exec(entityInner)) !== null) {
        attributesList.push(attrMatch[1]);
      }

      // Parse top-level filter(s)
      const filters = parseFilters(entityInner);
      
      // If no filters found, check for direct conditions (rare but possible)
      if (!filters || filters.length === 0) {
        const directConditions = parseConditions(entityInner);
        if (directConditions.length > 0) {
          return { id: 'root', operator: 'and', conditions: directConditions, groups: [], attributes: attributesList.length > 0 ? attributesList : undefined };
        }
        return emptyRoot();
      }

      // If single top-level filter, return it as root
      if (filters.length === 1) {
        // Trying to return attributes list if present on source fetchxml, otherwise return parsed filter as is
        return attributesList.length > 0 ? { ...filters[0], attributes: attributesList } : filters[0];
      }

      // Multiple top-level filters: wrap them under an AND root
      return {
        id: 'root',
        operator: 'and',
        conditions: [],
        groups: filters,
        // try to populate attributes from source fetchxml if present
        attributes: attributesList.length > 0 ? attributesList : undefined
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract order-by clauses from FetchXML.
   * Parses <order attribute="xxx" descending="true|false" /> elements inside the
   * top-level <entity> block (not inside link-entities).
   */
  public static parseOrderBy(fetchXml: string): OrderBy[] {
    if (!fetchXml || typeof fetchXml !== 'string') {
      return [];
    }
    try {
      // Extract only the top-level entity block so we don't pick up link-entity orders
      const entityBlockMatch = /<entity[^>]*>([\s\S]*?)<\/entity>/i.exec(fetchXml);
      const entityBlock = entityBlockMatch ? entityBlockMatch[1] : fetchXml;

      // Strip out link-entity blocks to avoid matching nested <order> elements
      const stripped = entityBlock.replaceAll(/<link-entity[\s\S]*?<\/link-entity>/gi, '');

      const results: OrderBy[] = [];
      const orderRegex = /<order\s+([^/>\s][^/>]*)\/?>/gi;
      let match: RegExpExecArray | null;
      while ((match = orderRegex.exec(stripped)) !== null) {
        const attrName = getAttr(match[1], 'attribute');
        if (!attrName) continue;
        const descStr = getAttr(match[1], 'descending');
        results.push({ attribute: attrName, descending: descStr === 'true' });
      }
      return results;
    } catch {
      return [];
    }
  }
}

function emptyRoot(): QueryGroup {
  return { id: 'root', operator: 'and', conditions: [], groups: [] };
}

/**
 * Find the matching closing tag for a depth-tracked XML element.
 * Returns { innerContent, endIndex } or null if malformed.
 */
function findMatchingClose(
  block: string,
  openTagEnd: number,
  openTag: string,
  closeTag: string
): { inner: string; endIndex: number } | null {
  let depth = 1;
  let pos = openTagEnd + 1;

  while (pos < block.length && depth > 0) {
    const nextOpen = block.indexOf(openTag, pos);
    const nextClose = block.indexOf(closeTag, pos);

    if (nextClose === -1) return null;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + openTag.length;
    } else {
      depth--;
      if (depth === 0) {
        const inner = block.substring(openTagEnd + 1, nextClose);
        return { inner, endIndex: nextClose + closeTag.length };
      }
      pos = nextClose + closeTag.length;
    }
  }
  return null;
}

/**
 * Parse a single top-level <filter> block into a QueryGroup.
 * Recursively parses nested filters and direct conditions.
 */
function parseSingleFilter(openTag: string, inner: string, resultIndex: number): QueryGroup {
  const attrRegex = /<filter\b([^>]*?)>/;
  const attrMatch = attrRegex.exec(openTag);
  const attrs = attrMatch?.[1] || '';
  const operator = getAttr(attrs, 'type') === 'or' ? 'or' : 'and';

  const childFilters = parseFilters(inner);

  // Remove nested filter blocks to get direct conditions only
  let conditionsBlock = inner;
  while (/<filter\b[^>]*>[\s\S]*?<\/filter>/i.test(conditionsBlock)) {
    conditionsBlock = conditionsBlock.replace(/<filter\b[^>]*>[\s\S]*?<\/filter>/i, '');
  }
  const conditions = parseConditions(conditionsBlock);

  return {
    id: `grp_${resultIndex}`,
    operator,
    conditions,
    groups: childFilters,
  };
}

function parseFilters(block: string): QueryGroup[] {
  const results: QueryGroup[] = [];
  let index = 0;

  while (index < block.length) {
    const filterStart = block.indexOf('<filter', index);
    if (filterStart === -1) break;

    const openTagEnd = block.indexOf('>', filterStart);
    if (openTagEnd === -1) break;

    const openTag = block.substring(filterStart, openTagEnd + 1);
    const matched = findMatchingClose(block, openTagEnd, '<filter', '</filter>');
    if (!matched) break;

    results.push(parseSingleFilter(openTag, matched.inner, results.length));
    index = matched.endIndex;
  }

  return results;
}

function parseConditions(block: string): QueryCondition[] {
  const out: QueryCondition[] = [];
  
  // Match both self-closing conditions and conditions with value tags
  // Pattern 1: <condition attr="x" operator="y" value="z" />
  // Pattern 2: <condition attr="x" operator="y"><value>z1</value><value>z2</value></condition>
  const conditionRegex = /<condition\b([^>]*?)(?:\/>|>([\s\S]*?)<\/condition>)/gi;
  let m: RegExpExecArray | null;

  while ((m = conditionRegex.exec(block)) !== null) {
    const attrs = m[1] || '';
    const innerContent = m[2] || ''; // Content between <condition> and </condition>
    const attribute = getAttr(attrs, 'attribute');
    const operator = getAttr(attrs, 'operator');
    const valueAttr = getAttr(attrs, 'value'); // Value from attribute (single value)
    const value2Attr = getAttr(attrs, 'value2'); // Second value for between operators

    if (!attribute || !operator) {
      continue;
    }

    // Parse value(s) - either from attribute or from nested <value> tags
    const parsedValue = parseConditionValue(operator, valueAttr, innerContent);
    
    // Map operator and process value
    let mappedOperator = mapFetchXMLOperator(operator);
    const finalValue = processValueForOperator(operator, parsedValue, mappedOperator);

    // Adjust operator based on wildcard pattern in value (round-trip correctness).
    // Generator maps Contains→like with %val%, so parser must reverse that.
    if (typeof parsedValue === 'string' && parsedValue.length > 2) {
      if (operator === 'like' && parsedValue.startsWith('%') && parsedValue.endsWith('%')) {
        mappedOperator = ConditionOperator.Contains;
      } else if (operator === 'not-like' && parsedValue.startsWith('%') && parsedValue.endsWith('%')) {
        mappedOperator = ConditionOperator.DoesNotContain;
      }
    }

    out.push({
      id: `cond_${out.length}`,
      attribute: attribute,
      operator: mappedOperator,
      value: finalValue,
      ...(value2Attr === undefined ? {} : { value2: value2Attr })
    });
  }

  return out;
}

/**
 * Parse condition value from either attribute or nested <value> tags
 */
function parseConditionValue(operator: string, valueAttr: string | undefined, innerContent: string): string | string[] {
  // If value is in attribute, use it
  if (valueAttr) {
    return valueAttr;
  }
  
  // If no value attribute but has inner content, parse <value> tags
  if (!innerContent) {
    return '';
  }
  
  const valueMatches = innerContent.matchAll(/<value[^>]*>([\s\S]*?)<\/value>/gi);
  const values: string[] = [];
  for (const valueMatch of valueMatches) {
    const extractedValue = valueMatch[1]?.trim();
    if (extractedValue) {
      values.push(extractedValue);
    }
  }
  
  // For "in" and "not-in" operators, return as array; otherwise return first value
  if (values.length > 0) {
    return (operator === 'in' || operator === 'not-in') ? values : values[0];
  }
  
  return '';
}

/**
 * Process value based on operator (remove wildcards for LIKE operators)
 */
function processValueForOperator(
  fetchOperator: string, 
  value: string | string[], 
  mappedOperator: ConditionOperator
): string | string[] {
  // Only process string values for LIKE operators
  if (typeof value !== 'string' || !value || (fetchOperator !== 'like' && fetchOperator !== 'not-like')) {
    return value;
  }
  
  // Determine operator type and strip wildcards based on pattern
  if (value.startsWith('%') && value.endsWith('%') && value.length > 2) {
    // %value% = Contains / DoesNotContain
    return value.substring(1, value.length - 1);
  } else if (value.endsWith('%') && !value.startsWith('%') && value.length > 1) {
    // value% = BeginsWith / DoesNotBeginWith
    return value.substring(0, value.length - 1);
  } else if (value.startsWith('%') && !value.endsWith('%') && value.length > 1) {
    // %value = EndsWith / DoesNotEndWith
    return value.substring(1);
  }
  
  // No wildcards or wildcards in middle = just Like/NotLike
  return value;
}

/**
 * Map FetchXML operator strings to our ConditionOperator enum
 */
function mapFetchXMLOperator(operator: string): ConditionOperator {
  const operatorMap: Record<string, ConditionOperator> = {
    'eq': ConditionOperator.Equal,
    'ne': ConditionOperator.NotEqual,
    'gt': ConditionOperator.GreaterThan,
    'ge': ConditionOperator.GreaterEqual,
    'lt': ConditionOperator.LessThan,
    'le': ConditionOperator.LessEqual,
    'like': ConditionOperator.Like,
    'not-like': ConditionOperator.NotLike,
    'in': ConditionOperator.In,
    'not-in': ConditionOperator.NotIn,
    'between': ConditionOperator.Between,
    'not-between': ConditionOperator.NotBetween,
    'null': ConditionOperator.Null,
    'not-null': ConditionOperator.NotNull,
    'yesterday': ConditionOperator.Yesterday,
    'today': ConditionOperator.Today,
    'tomorrow': ConditionOperator.Tomorrow,
    'last-seven-days': ConditionOperator.Last7Days,
    'next-seven-days': ConditionOperator.Next7Days,
    'last-week': ConditionOperator.LastWeek,
    'this-week': ConditionOperator.ThisWeek,
    'next-week': ConditionOperator.NextWeek,
    'last-month': ConditionOperator.LastMonth,
    'this-month': ConditionOperator.ThisMonth,
    'next-month': ConditionOperator.NextMonth,
    'last-year': ConditionOperator.LastYear,
    'this-year': ConditionOperator.ThisYear,
    'next-year': ConditionOperator.NextYear,
    'on': ConditionOperator.On,
    'on-or-before': ConditionOperator.OnOrBefore,
    'on-or-after': ConditionOperator.OnOrAfter,
    'begins-with': ConditionOperator.BeginsWith,
    'not-begin-with': ConditionOperator.DoesNotBeginWith,
    'ends-with': ConditionOperator.EndsWith,
    'not-end-with': ConditionOperator.DoesNotEndWith,
    'eq-userid': ConditionOperator.EqUserId,
    'ne-userid': ConditionOperator.NeUserId,
    'eq-userteams': ConditionOperator.EqUserTeams,
    'eq-useroruserteams': ConditionOperator.EqUserOrUserTeams,
    'eq-useroruserhierarchy': ConditionOperator.EqUserOrUserHierarchy,
    'eq-useroruserhierarchyandteams': ConditionOperator.EqUserOrUserHierarchyAndTeams,
    // DateTime X-operators
    'last-x-hours': ConditionOperator.LastXHours,
    'next-x-hours': ConditionOperator.NextXHours,
    'last-x-days': ConditionOperator.LastXDays,
    'next-x-days': ConditionOperator.NextXDays,
    'last-x-weeks': ConditionOperator.LastXWeeks,
    'next-x-weeks': ConditionOperator.NextXWeeks,
    'last-x-months': ConditionOperator.LastXMonths,
    'next-x-months': ConditionOperator.NextXMonths,
    'last-x-years': ConditionOperator.LastXYears,
    'next-x-years': ConditionOperator.NextXYears,
    'olderthan-x-minutes': ConditionOperator.OlderThanXMinutes,
    'olderthan-x-hours': ConditionOperator.OlderThanXHours,
    'olderthan-x-days': ConditionOperator.OlderThanXDays,
    'olderthan-x-weeks': ConditionOperator.OlderThanXWeeks,
    'olderthan-x-months': ConditionOperator.OlderThanXMonths,
    'olderthan-x-years': ConditionOperator.OlderThanXYears,
  };
  
  return operatorMap[operator.toLowerCase()] || ConditionOperator.Equal;
}

function getAttr(tagAttrs: string, name: string): string | undefined {
  const re = new RegExp(`${name}="([^"]*)"`, 'i');
  const m = re.exec(tagAttrs);
  return m ? m[1] : undefined;
}

/**
 * Parse link-entity elements from FetchXML
 * Extracts related entity joins from the FetchXML string
 * Uses depth-tracking to correctly handle nested link-entities
 */
export function parseLinkEntities(fetchXml: string): LinkEntity[] {
  if (!fetchXml || typeof fetchXml !== 'string') {
    return [];
  }

  try {
    const entityMatch = /<entity[^>]*>([\s\S]*?)<\/entity>/i.exec(fetchXml);
    if (!entityMatch) {
      return [];
    }

    return parseLinkEntitiesFromBlock(entityMatch[1]);
  } catch (error) {
    console.error('[parseLinkEntities] Error parsing link-entities:', error);
    return [];
  }
}

/**
 * Parse link-entity elements from a block of XML using depth-tracking.
 * Correctly handles nested link-entities by counting open/close tags.
 */
function parseLinkEntitiesFromBlock(block: string): LinkEntity[] {
  const results: LinkEntity[] = [];
  let index = 0;
  const TAG_OPEN = '<link-entity';
  const TAG_CLOSE = '</link-entity>';

  while (index < block.length) {
    const linkStart = block.indexOf(TAG_OPEN, index);
    if (linkStart === -1) break;

    const openTagEnd = block.indexOf('>', linkStart);
    if (openTagEnd === -1) break;

    const openTag = block.substring(linkStart, openTagEnd + 1);
    const linkAttrs = openTag.slice(TAG_OPEN.length, openTag.endsWith('/>') ? -2 : -1).trim();

    // Self-closing tag (no children)
    if (openTag.endsWith('/>')) {
      results.push(buildLinkEntity(linkAttrs, ''));
      index = openTagEnd + 1;
      continue;
    }

    // Find matching closing tag using depth-aware helper
    const matched = findLinkEntityClose(block, openTagEnd, TAG_OPEN, TAG_CLOSE);
    if (!matched) break;

    const innerContent = block.substring(openTagEnd + 1, matched.closeStart);
    results.push(buildLinkEntity(linkAttrs, innerContent));
    index = matched.endIndex;
  }

  return results;
}

/**
 * Find the matching </link-entity> for an opening tag, handling self-closing nested tags.
 * Returns { closeStart, endIndex } or null if malformed.
 */
function findLinkEntityClose(
  block: string,
  openTagEnd: number,
  tagOpen: string,
  tagClose: string
): { closeStart: number; endIndex: number } | null {
  let depth = 1;
  let pos = openTagEnd + 1;

  while (pos < block.length && depth > 0) {
    const nextOpen = block.indexOf(tagOpen, pos);
    const nextClose = block.indexOf(tagClose, pos);

    if (nextClose === -1) return null;

    // No nested open before this close — process the close tag
    if (nextOpen === -1 || nextClose <= nextOpen) {
      depth--;
      if (depth === 0) return { closeStart: nextClose, endIndex: nextClose + tagClose.length };
      pos = nextClose + tagClose.length;
      continue;
    }

    // Nested open tag found before the close tag — check if self-closing
    pos = advancePastOpenTag(block, nextOpen, tagOpen);
    if (!isSelfClosingTag(block, nextOpen)) {
      depth++;
    }
  }
  return null;
}

/** Advance position past the opening tag's '>' */
function advancePastOpenTag(block: string, tagStart: number, tagOpen: string): number {
  const end = block.indexOf('>', tagStart);
  return (end === -1 ? tagStart + tagOpen.length : end) + 1;
}

/** Check whether the tag starting at `tagStart` is self-closing (ends with />) */
function isSelfClosingTag(block: string, tagStart: number): boolean {
  const end = block.indexOf('>', tagStart);
  return end !== -1 && block.substring(tagStart, end + 1).endsWith('/>');
}

/**
 * Build a LinkEntity from parsed XML attributes and inner content.
 * Reuses existing parseFilters/parseConditions for filter extraction.
 */
function buildLinkEntity(linkAttrs: string, innerContent: string): LinkEntity {
  const linkEntity: LinkEntity = {
    id: generateId(),
    name: getAttr(linkAttrs, 'name') || '',
    from: getAttr(linkAttrs, 'from') || '',
    to: getAttr(linkAttrs, 'to') || '',
    alias: getAttr(linkAttrs, 'alias'),
    linkType: (getAttr(linkAttrs, 'link-type') as LinkType) || LinkType.Inner,
    intersect: getAttr(linkAttrs, 'intersect') === 'true',
    attributes: [] as string[],
    linkEntities: [] as LinkEntity[]
  };

  if (!innerContent) {
    return linkEntity;
  }

  // Parse <attribute> tags in this link-entity block
  const attrPattern = /<attribute[^>]*name=["']([^"']+)["'][^>]*\/?>/gi;
  let attrMatch;
  while ((attrMatch = attrPattern.exec(innerContent)) !== null) {
    linkEntity.attributes?.push(attrMatch[1]);
  }

  // Parse filter conditions using existing parseFilters function
  const filters = parseFilters(innerContent);
  if (filters.length > 0) {
    linkEntity.filters = filters[0];
  }

  // Recursively parse nested link-entities using depth-tracking
  linkEntity.linkEntities = parseLinkEntitiesFromBlock(innerContent);

  return linkEntity;
}

/**
 * Generate a unique ID for link-entities
 */
function generateId(): string {
  return `link-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

