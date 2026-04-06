/**
 * FetchXML Generator Utility
 *
 * @description Utility class for generating FetchXML from query structure
 *
 * This utility converts the internal QueryGroup structure to valid FetchXML syntax.
 * It handles all operators, nested groups, value escaping, and generates XML
 * compatible with Dynamics 365 Advanced Find and Web API.
 *
 * Reference: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/use-fetchxml-construct-query
 */

import { QueryGroup, QueryCondition, ConditionOperator, LinkEntity, OrderBy } from '../types';
import { FETCH_XML_HEADER } from '../constants';

export class FetchXMLGenerator {
    /**
     * Generate FetchXML from a query group
     */
    public static generateFetchXML(
        entityName: string,
        rootGroup: QueryGroup,
        attributes?: string[],
        orderBy?: OrderBy[]
    ): string {
        const xml: string[] = [
            FETCH_XML_HEADER,
            `  <entity name="${entityName}">`
        ];
        
        this.appendAttributes(xml, attributes);
        this.appendFilter(xml, rootGroup);
        this.appendOrderBy(xml, orderBy);
        
        xml.push('  </entity>', '</fetch>');
        
        return xml.join('\n');
    }
    
    /**
     * Generate filter XML recursively
     */
    private static generateFilterXml(group: QueryGroup, indentLevel: number): string {
        const indent = '  '.repeat(indentLevel);
        const xml: string[] = [];
        
        xml.push(`${indent}<filter type="${group.operator}">`);
        
        // Add conditions
        for (const condition of group.conditions) {
            const conditionXml = this.generateConditionXml(condition, indentLevel + 1);
            xml.push(conditionXml);
        }
        
        // Add nested groups
        for (const nestedGroup of group.groups) {
            const nestedXml = this.generateFilterXml(nestedGroup, indentLevel + 1);
            xml.push(nestedXml);
        }
        
        xml.push(`${indent}</filter>`);
        
        return xml.join('\n');
    }
    
    /**
     * Generate condition XML
     */
    private static generateConditionXml(condition: QueryCondition, indentLevel: number): string {
        const indent = '  '.repeat(indentLevel);
        
        // Auto-convert "Equals" to "In" when multiple values are selected (OOB behavior)
        let operator = condition.operator;
        const hasMultipleValues = Array.isArray(condition.value) && condition.value.length > 1;
        
        if (operator === ConditionOperator.Equal && hasMultipleValues) {
            operator = ConditionOperator.In;
        } else if (operator === ConditionOperator.NotEqual && hasMultipleValues) {
            operator = ConditionOperator.NotIn;
        }
        
        const operatorString = this.mapOperatorToFetchXML(operator);
        
        // Handle operators that don't need values
        if (this.isNoValueOperator(operator)) {
            return `${indent}<condition attribute="${condition.attribute}" operator="${operatorString}" />`;
        }
        
        // Handle between operator
        if (operator === ConditionOperator.Between || 
            operator === ConditionOperator.NotBetween) {
            return `${indent}<condition attribute="${condition.attribute}" operator="${operatorString}" ` +
                   `value="${this.escapeXml(condition.value)}" ` +
                   `value2="${this.escapeXml(condition.value2)}" />`;
        }
        
        // Handle in/not-in operators with multiple values
        if (operator === ConditionOperator.In || 
            operator === ConditionOperator.NotIn) {
            const xml: string[] = [];
            xml.push(`${indent}<condition attribute="${condition.attribute}" operator="${operatorString}">`);
            
            const values = Array.isArray(condition.value) ? condition.value : [condition.value];
            for (const val of values) {
                xml.push(`${indent}  <value>${this.escapeXml(val)}</value>`);
            }
            
            xml.push(`${indent}</condition>`);
            return xml.join('\n');
        }
        
        // Handle like operators with wildcards (only for Contains/DoesNotContain)
        let value = condition.value;
        if (operator === ConditionOperator.Contains || 
            operator === ConditionOperator.DoesNotContain) {
            value = `%${value}%`;
        }
        
        // Standard condition with value
        return `${indent}<condition attribute="${condition.attribute}" operator="${operatorString}" value="${this.escapeXml(value)}" />`;
    }
    
    /**
     * Map our operator enum to FetchXML operator strings
     */
    private static mapOperatorToFetchXML(operator: ConditionOperator): string {
        const operatorMap: Record<string, string> = {
            [ConditionOperator.Equal]: 'eq',
            [ConditionOperator.NotEqual]: 'ne',
            [ConditionOperator.GreaterThan]: 'gt',
            [ConditionOperator.GreaterEqual]: 'ge',
            [ConditionOperator.LessThan]: 'lt',
            [ConditionOperator.LessEqual]: 'le',
            [ConditionOperator.Like]: 'like',
            [ConditionOperator.NotLike]: 'not-like',
            [ConditionOperator.In]: 'in',
            [ConditionOperator.NotIn]: 'not-in',
            [ConditionOperator.Between]: 'between',
            [ConditionOperator.NotBetween]: 'not-between',
            [ConditionOperator.Null]: 'null',
            [ConditionOperator.NotNull]: 'not-null',
            [ConditionOperator.Yesterday]: 'yesterday',
            [ConditionOperator.Today]: 'today',
            [ConditionOperator.Tomorrow]: 'tomorrow',
            [ConditionOperator.Last7Days]: 'last-seven-days',
            [ConditionOperator.Next7Days]: 'next-seven-days',
            [ConditionOperator.LastWeek]: 'last-week',
            [ConditionOperator.ThisWeek]: 'this-week',
            [ConditionOperator.NextWeek]: 'next-week',
            [ConditionOperator.LastMonth]: 'last-month',
            [ConditionOperator.ThisMonth]: 'this-month',
            [ConditionOperator.NextMonth]: 'next-month',
            [ConditionOperator.On]: 'on',
            [ConditionOperator.OnOrBefore]: 'on-or-before',
            [ConditionOperator.OnOrAfter]: 'on-or-after',
            [ConditionOperator.LastYear]: 'last-year',
            [ConditionOperator.ThisYear]: 'this-year',
            [ConditionOperator.NextYear]: 'next-year',
            // Date X-operators (require numeric value)
            [ConditionOperator.LastXHours]: 'last-x-hours',
            [ConditionOperator.NextXHours]: 'next-x-hours',
            [ConditionOperator.LastXDays]: 'last-x-days',
            [ConditionOperator.NextXDays]: 'next-x-days',
            [ConditionOperator.LastXWeeks]: 'last-x-weeks',
            [ConditionOperator.NextXWeeks]: 'next-x-weeks',
            [ConditionOperator.LastXMonths]: 'last-x-months',
            [ConditionOperator.NextXMonths]: 'next-x-months',
            [ConditionOperator.LastXYears]: 'last-x-years',
            [ConditionOperator.NextXYears]: 'next-x-years',
            [ConditionOperator.OlderThanXMinutes]: 'olderthan-x-minutes',
            [ConditionOperator.OlderThanXHours]: 'olderthan-x-hours',
            [ConditionOperator.OlderThanXDays]: 'olderthan-x-days',
            [ConditionOperator.OlderThanXWeeks]: 'olderthan-x-weeks',
            [ConditionOperator.OlderThanXMonths]: 'olderthan-x-months',
            [ConditionOperator.OlderThanXYears]: 'olderthan-x-years',
            // String operators
            [ConditionOperator.Contains]: 'like',
            [ConditionOperator.DoesNotContain]: 'not-like',
            [ConditionOperator.BeginsWith]: 'begins-with',
            [ConditionOperator.DoesNotBeginWith]: 'not-begin-with',
            [ConditionOperator.EndsWith]: 'ends-with',
            [ConditionOperator.DoesNotEndWith]: 'not-end-with',
            // User-specific operators
            [ConditionOperator.EqUserId]: 'eq-userid',
            [ConditionOperator.NeUserId]: 'ne-userid',
            [ConditionOperator.EqUserTeams]: 'eq-userteams',
            [ConditionOperator.EqUserOrUserTeams]: 'eq-useroruserteams',
            [ConditionOperator.EqUserOrUserHierarchy]: 'eq-useroruserhierarchy',
            [ConditionOperator.EqUserOrUserHierarchyAndTeams]: 'eq-useroruserhierarchyandteams'
        };
        
        return operatorMap[operator] || 'eq';
    }
    
    /**
     * Check if operator doesn't require a value
     */
    private static isNoValueOperator(operator: ConditionOperator): boolean {
        return [
            ConditionOperator.Null,
            ConditionOperator.NotNull,
            ConditionOperator.Yesterday,
            ConditionOperator.Today,
            ConditionOperator.Tomorrow,
            ConditionOperator.Last7Days,
            ConditionOperator.Next7Days,
            ConditionOperator.LastWeek,
            ConditionOperator.ThisWeek,
            ConditionOperator.NextWeek,
            ConditionOperator.LastMonth,
            ConditionOperator.ThisMonth,
            ConditionOperator.NextMonth,
            ConditionOperator.LastYear,
            ConditionOperator.ThisYear,
            ConditionOperator.NextYear,
            // User-specific operators don't require values
            ConditionOperator.EqUserId,
            ConditionOperator.NeUserId,
            ConditionOperator.EqUserTeams,
            ConditionOperator.EqUserOrUserTeams,
            ConditionOperator.EqUserOrUserHierarchy,
            ConditionOperator.EqUserOrUserHierarchyAndTeams
        ].includes(operator);
    }
    
    /**
     * Escape XML special characters
     */
    private static escapeXml(value: string | number | boolean | string[] | number[] | (string | number)[] | undefined | null): string {
        if (value === null || value === undefined) {
            return '';
        }
        
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&apos;');
    }
    
    /**
     * Get operators available for a specific attribute type
     */
    public static getOperatorsForType(attributeType: string): ConditionOperator[] {
        // Common operator sets to avoid duplication
        const basicOperators = [
            ConditionOperator.Equal,
            ConditionOperator.NotEqual,
            ConditionOperator.NotNull,  // "Contains Data"
            ConditionOperator.Null      // "Does Not Contain Data"
        ];

        const textOperators = [
            ConditionOperator.Equal,
            ConditionOperator.NotEqual,
            ConditionOperator.Contains,
            ConditionOperator.DoesNotContain,
            ConditionOperator.BeginsWith,
            ConditionOperator.DoesNotBeginWith,
            ConditionOperator.EndsWith,
            ConditionOperator.DoesNotEndWith,
            ConditionOperator.NotNull,  // "Contains Data"
            ConditionOperator.Null      // "Does Not Contain Data"
        ];

        switch (attributeType.toLowerCase()) {
            case 'string':
            case 'memo':
            case 'picklist':
            case 'state':
            case 'status':
            case 'lookup':
            case 'customer':
                // All these types support text-based operators
                // Note: For lookup/customer, hierarchical operators (Under, Not Under, Above, 
                // Eq-Or-Above, Eq-Or-Under) are not implemented - they require GUID values 
                // and are only for hierarchical lookups
                return textOperators;
            
            case 'integer':
            case 'bigint':
            case 'decimal':
            case 'double':
            case 'money':
                return [
                    ConditionOperator.Equal,
                    ConditionOperator.NotEqual,
                    ConditionOperator.GreaterThan,
                    ConditionOperator.GreaterEqual,
                    ConditionOperator.LessThan,
                    ConditionOperator.LessEqual,
                    ConditionOperator.NotNull,  // "Contains Data"
                    ConditionOperator.Null      // "Does Not Contain Data"
                ];
            
            case 'datetime':
                return [
                    ConditionOperator.On,
                    ConditionOperator.OnOrBefore,
                    ConditionOperator.OnOrAfter,
                    ConditionOperator.GreaterThan,
                    ConditionOperator.GreaterEqual,
                    ConditionOperator.LessThan,
                    ConditionOperator.LessEqual,
                    ConditionOperator.Yesterday,
                    ConditionOperator.Today,
                    ConditionOperator.Tomorrow,
                    ConditionOperator.Last7Days,
                    ConditionOperator.Next7Days,
                    ConditionOperator.LastWeek,
                    ConditionOperator.ThisWeek,
                    ConditionOperator.NextWeek,
                    ConditionOperator.LastMonth,
                    ConditionOperator.ThisMonth,
                    ConditionOperator.NextMonth,
                    ConditionOperator.LastYear,
                    ConditionOperator.ThisYear,
                    ConditionOperator.NextYear,
                    ConditionOperator.LastXHours,
                    ConditionOperator.NextXHours,
                    ConditionOperator.LastXDays,
                    ConditionOperator.NextXDays,
                    ConditionOperator.LastXWeeks,
                    ConditionOperator.NextXWeeks,
                    ConditionOperator.LastXMonths,
                    ConditionOperator.NextXMonths,
                    ConditionOperator.LastXYears,
                    ConditionOperator.NextXYears,
                    ConditionOperator.OlderThanXMinutes,
                    ConditionOperator.OlderThanXHours,
                    ConditionOperator.OlderThanXDays,
                    ConditionOperator.OlderThanXWeeks,
                    ConditionOperator.OlderThanXMonths,
                    ConditionOperator.OlderThanXYears,
                    ConditionOperator.Null,
                    ConditionOperator.NotNull
                ];
            
            case 'boolean':
                // Boolean and unknown types use basic operators only
                return basicOperators;
            
            case 'owner':
                // Owner field has user-specific operators in addition to text operators
                return [
                    ConditionOperator.Equal,
                    ConditionOperator.NotEqual,
                    ConditionOperator.Contains,
                    ConditionOperator.DoesNotContain,
                    ConditionOperator.BeginsWith,
                    ConditionOperator.DoesNotBeginWith,
                    ConditionOperator.EndsWith,
                    ConditionOperator.DoesNotEndWith,
                    ConditionOperator.NotNull,  // "Contains Data"
                    ConditionOperator.Null,     // "Does Not Contain Data"
                    ConditionOperator.EqUserId,
                    ConditionOperator.NeUserId,
                    ConditionOperator.EqUserOrUserHierarchy,
                    ConditionOperator.EqUserOrUserHierarchyAndTeams,
                    ConditionOperator.EqUserTeams,
                    ConditionOperator.EqUserOrUserTeams
                ];
            
            default:
                // Unknown types default to basic operators
                return basicOperators;
        }
    }
    
    /**
     * Get user-friendly label for operator
     */
    public static getOperatorLabel(operator: ConditionOperator): string {
        const labels: Record<string, string> = {
            [ConditionOperator.Equal]: 'Equals',
            [ConditionOperator.NotEqual]: 'Does Not Equal',
            [ConditionOperator.GreaterThan]: 'Is Greater Than',
            [ConditionOperator.GreaterEqual]: 'Is Greater Than or Equal',
            [ConditionOperator.LessThan]: 'Is Less Than',
            [ConditionOperator.LessEqual]: 'Is Less Than or Equal',
            [ConditionOperator.Contains]: 'Contains',
            [ConditionOperator.DoesNotContain]: 'Does Not Contain',
            [ConditionOperator.BeginsWith]: 'Begins With',
            [ConditionOperator.DoesNotBeginWith]: 'Does Not Begin With',
            [ConditionOperator.EndsWith]: 'Ends With',
            [ConditionOperator.DoesNotEndWith]: 'Does Not End With',
            [ConditionOperator.Null]: 'Does Not Contain Data',
            [ConditionOperator.NotNull]: 'Contains Data',
            [ConditionOperator.Between]: 'Between',
            [ConditionOperator.NotBetween]: 'Not Between',
            [ConditionOperator.In]: 'In',
            [ConditionOperator.NotIn]: 'Not In',
            [ConditionOperator.Yesterday]: 'Yesterday',
            [ConditionOperator.Today]: 'Today',
            [ConditionOperator.Tomorrow]: 'Tomorrow',
            [ConditionOperator.Last7Days]: 'Last 7 Days',
            [ConditionOperator.Next7Days]: 'Next 7 Days',
            [ConditionOperator.LastWeek]: 'Last Week',
            [ConditionOperator.ThisWeek]: 'This Week',
            [ConditionOperator.NextWeek]: 'Next Week',
            [ConditionOperator.LastMonth]: 'Last Month',
            [ConditionOperator.ThisMonth]: 'This Month',
            [ConditionOperator.NextMonth]: 'Next Month',
            [ConditionOperator.LastYear]: 'Last Year',
            [ConditionOperator.ThisYear]: 'This Year',
            [ConditionOperator.NextYear]: 'Next Year',
            [ConditionOperator.On]: 'On',
            [ConditionOperator.OnOrBefore]: 'On or Before',
            [ConditionOperator.OnOrAfter]: 'On or After',
            [ConditionOperator.LastXHours]: 'Last X Hours',
            [ConditionOperator.NextXHours]: 'Next X Hours',
            [ConditionOperator.LastXDays]: 'Last X Days',
            [ConditionOperator.NextXDays]: 'Next X Days',
            [ConditionOperator.LastXWeeks]: 'Last X Weeks',
            [ConditionOperator.NextXWeeks]: 'Next X Weeks',
            [ConditionOperator.LastXMonths]: 'Last X Months',
            [ConditionOperator.NextXMonths]: 'Next X Months',
            [ConditionOperator.LastXYears]: 'Last X Years',
            [ConditionOperator.NextXYears]: 'Next X Years',
            [ConditionOperator.OlderThanXMinutes]: 'Older Than X Minutes',
            [ConditionOperator.OlderThanXHours]: 'Older Than X Hours',
            [ConditionOperator.OlderThanXDays]: 'Older Than X Days',
            [ConditionOperator.OlderThanXWeeks]: 'Older Than X Weeks',
            [ConditionOperator.OlderThanXMonths]: 'Older Than X Months',
            [ConditionOperator.OlderThanXYears]: 'Older Than X Years',
            [ConditionOperator.EqUserId]: 'Equals Current User',
            [ConditionOperator.NeUserId]: 'Does Not Equal Current User',
            [ConditionOperator.EqUserTeams]: 'Equals Current User\'s Teams',
            [ConditionOperator.EqUserOrUserTeams]: 'Equals Current User Or User\'s Teams',
            [ConditionOperator.EqUserOrUserHierarchy]: 'Equals Current User Or Their Reporting Hierarchy',
            [ConditionOperator.EqUserOrUserHierarchyAndTeams]: 'Equals Current User And Their Teams Or Their Reporting Hierarchy And Their Teams'
        };
        
        return labels[operator] || operator;
    }

    /**
     * Generate FetchXML with link-entities (related entities)
     * Enhanced version that supports joining related entities
     */
    public static generateFetchXMLWithLinks(
        entityName: string,
        rootGroup: QueryGroup,
        linkEntities?: LinkEntity[],
        attributes?: string[],
        orderBy?: OrderBy[]
    ): string {
        // Auto-set distinct="true" when link-entities exist (matches Advanced Find behavior)
        const hasLinks = linkEntities && linkEntities.length > 0;
        const header = hasLinks
            ? FETCH_XML_HEADER.replace('distinct="false"', 'distinct="true"')
            : FETCH_XML_HEADER;
        const xml: string[] = [
            header,
            `  <entity name="${entityName}">`
        ];
        
        this.appendAttributes(xml, attributes);
        this.appendFilter(xml, rootGroup);
        this.appendLinkEntities(xml, linkEntities);
        this.appendOrderBy(xml, orderBy);
        
        xml.push('  </entity>', '</fetch>');
        
        return xml.join('\n');
    }

    // ── Shared XML-building helpers (extracted for cognitive complexity) ──

    private static appendAttributes(xml: string[], attributes?: string[]): void {
        if (attributes && attributes.length > 0) {
            for (const attr of attributes) {
                xml.push(`    <attribute name="${attr}" />`);
            }
        } else {
            xml.push('    <all-attributes />');
        }
    }

    private static appendFilter(xml: string[], rootGroup: QueryGroup): void {
        if (rootGroup.conditions.length > 0 || rootGroup.groups.length > 0) {
            xml.push(this.generateFilterXml(rootGroup, 2));
        }
    }

    private static appendLinkEntities(xml: string[], linkEntities?: LinkEntity[]): void {
        if (!linkEntities || linkEntities.length === 0) return;
        for (const le of linkEntities) {
            xml.push(this.generateLinkEntityXml(le, 2));
        }
    }

    private static appendOrderBy(xml: string[], orderBy?: OrderBy[]): void {
        if (!orderBy || orderBy.length === 0) return;
        for (const order of orderBy) {
            xml.push(`    <order attribute="${order.attribute}" descending="${order.descending ? 'true' : 'false'}" />`);
        }
    }

    /**
     * Generate XML for a single link-entity element
     * Recursively handles nested link-entities
     */
    private static generateLinkEntityXml(linkEntity: LinkEntity, indentLevel: number): string {
        const indent = '  '.repeat(indentLevel);
        const childIndent = '  '.repeat(indentLevel + 1);
        
        // Build opening tag with required attributes
        let xml = `${indent}<link-entity name="${linkEntity.name}" from="${linkEntity.from}" to="${linkEntity.to}"`;
        
        // Add optional attributes
        if (linkEntity.alias) {
            xml += ` alias="${linkEntity.alias}"`;
        }
        
        xml += ` link-type="${linkEntity.linkType || 'inner'}"`;
        
        if (linkEntity.intersect) {
            xml += ' intersect="true"';
        }
        
        xml += '>\n';
        
        // Add attributes if specified
        if (linkEntity.attributes && linkEntity.attributes.length > 0) {
            for (const attr of linkEntity.attributes) {
                xml += `${childIndent}<attribute name="${attr}" />\n`;
            }
        }
        
        // Add filter if present
        if (linkEntity.filters && (linkEntity.filters.conditions.length > 0 || linkEntity.filters.groups.length > 0)) {
            const filterXml = this.generateFilterXml(linkEntity.filters, indentLevel + 1);
            xml += filterXml + '\n';
        }
        
        // Add nested link-entities (recursive)
        if (linkEntity.linkEntities && linkEntity.linkEntities.length > 0) {
            for (const nestedLink of linkEntity.linkEntities) {
                xml += this.generateLinkEntityXml(nestedLink, indentLevel + 1) + '\n';
            }
        }
        
        xml += `${indent}</link-entity>`;
        
        return xml;
    }
}

