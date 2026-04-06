/**
 * Query Group Component
 *
 * @description React component for rendering a group of conditions with AND/OR logic
 *
 * This component is recursive and handles nested query groups, allowing for
 * complex query structures with multiple levels of AND/OR logic. It manages
 * conditions, nested groups, and provides UI for adding/removing both.
 */

import * as React from 'react';
import { Stack, Dropdown, IDropdownOption, PrimaryButton, DefaultButton, Label, Icon, Text, IconButton } from '@fluentui/react';
import { QueryGroup, QueryCondition, AttributeMetadata } from '../types';
import { ConditionRow } from './ConditionRow';
import { FetchXMLGenerator } from '../utils/fetchXmlGenerator';
import { Colors, Sizes } from '../constants';

interface QueryGroupComponentProps {
    group: QueryGroup;
    attributes: AttributeMetadata[];
    onGroupChange: (group: QueryGroup) => void;
    onRemove?: () => void;
    level?: number;
    context?: ComponentFramework.Context<unknown>; // Optional: enables lookup picker
}

const QueryGroupComponentInner: React.FC<QueryGroupComponentProps> = ({
    group,
    attributes,
    onGroupChange,
    onRemove,
    level = 0,
    context // PCF context for lookup picker
}) => {
    const [selectedConditions, setSelectedConditions] = React.useState<Set<number>>(new Set());
    
    const addCondition = (): void => {
        const firstAttribute = attributes[0];
        if (!firstAttribute) {
            return;
        }
        
        const availableOperators = FetchXMLGenerator.getOperatorsForType(firstAttribute.attributeType);
        
        const newCondition: QueryCondition = {
            id: `condition-${crypto.randomUUID()}`,
            attribute: firstAttribute.logicalName,
            operator: availableOperators[0],
            value: undefined
        };
        
        const updatedGroup = {
            ...group,
            conditions: [...group.conditions, newCondition]
        };
        
        onGroupChange(updatedGroup);
    };
    
    const updateCondition = (index: number, condition: QueryCondition): void => {
        const newConditions = [...group.conditions];
        newConditions[index] = condition;
        onGroupChange({
            ...group,
            conditions: newConditions
        });
    };
    
    const removeCondition = (index: number): void => {
        const newConditions = group.conditions.filter((_, i) => i !== index);
        onGroupChange({
            ...group,
            conditions: newConditions
        });
    };
    
    const updateNestedGroup = (index: number, nestedGroup: QueryGroup): void => {
        const newGroups = [...group.groups];
        newGroups[index] = nestedGroup;
        onGroupChange({
            ...group,
            groups: newGroups
        });
    };
    
    const removeNestedGroup = (index: number): void => {
        const newGroups = group.groups.filter((_, i) => i !== index);
        onGroupChange({
            ...group,
            groups: newGroups
        });
    };

    const duplicateCondition = (index: number): void => {
        const source = group.conditions[index];
        const clone: QueryCondition = {
            ...source,
            id: `condition-${crypto.randomUUID()}`
        };
        const newConditions = [...group.conditions];
        newConditions.splice(index + 1, 0, clone);
        onGroupChange({ ...group, conditions: newConditions });
    };
    
    const handleOperatorChange = (option?: IDropdownOption): void => {
        if (option) {
            // Clear checkbox selections when operator changes to avoid confusion
            setSelectedConditions(new Set());
            
            onGroupChange({
                ...group,
                operator: option.key as 'and' | 'or'
            });
        }
    };
    
    const operatorOptions: IDropdownOption[] = [
        { key: 'and', text: 'AND' },
        { key: 'or', text: 'OR' }
    ];
    
    const groupSelectedConditions = (): void => {
        if (selectedConditions.size < 2) {
            return; // Need at least 2 conditions to group
        }
        
        // Get selected conditions and remove them from current group
        const selectedIndices = Array.from(selectedConditions).sort((a, b) => a - b);
        const conditionsToGroup = selectedIndices.map(i => group.conditions[i]);
        const remainingConditions = group.conditions.filter((_, i) => !selectedConditions.has(i));
        
        // Create new group with selected conditions
        const newGroup: QueryGroup = {
            id: `group-${crypto.randomUUID()}`,
            operator: 'and',
            conditions: conditionsToGroup,
            groups: []
        };
        
        // Update current group
        const updatedGroup = {
            ...group,
            conditions: remainingConditions,
            groups: [...group.groups, newGroup]
        };
        
        onGroupChange(updatedGroup);
        setSelectedConditions(new Set()); // Clear selection
    };
    
    const toggleConditionSelection = (index: number): void => {
        const newSelection = new Set(selectedConditions);
        if (newSelection.has(index)) {
            newSelection.delete(index);
        } else {
            newSelection.add(index);
        }
        setSelectedConditions(newSelection);
    };
    
    const hasContent = group.conditions.length > 0 || group.groups.length > 0;
    const showOperatorSwitch = group.conditions.length > 1 || group.groups.length > 0 || 
                                (group.conditions.length > 0 && group.groups.length > 0);
    
    return (
        <Stack
            styles={{
                root: {
                    borderLeft: `${Sizes.accentBarWidth}px solid ${level === 0 ? Colors.borderPrimary : Colors.borderAccent}`,
                    padding: level === 0 ? '14px 16px' : '12px 14px',
                    borderRadius: level === 0 ? Sizes.borderRadius : `0 ${Sizes.borderRadius}px ${Sizes.borderRadius}px 0`,
                    backgroundColor: level === 0 ? Colors.backgroundSection : Colors.backgroundCard,
                    marginBottom: level > 0 ? 8 : 0,
                }
            }}
        >
            <Stack horizontal tokens={{ childrenGap: 10 }} verticalAlign="center" styles={{ root: { marginBottom: hasContent ? 10 : 0 } }}>
                {showOperatorSwitch && (
                    <>
                        <Label styles={{ root: { fontSize: 12, fontWeight: 600, color: Colors.textSubtle, margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' } }}>
                            Filter Type
                        </Label>
                        <Dropdown
                            options={operatorOptions}
                            selectedKey={group.operator}
                            onChange={(_, option) => handleOperatorChange(option)}
                            styles={{
                                root: { minWidth: 90, maxWidth: 110 },
                                title: { fontWeight: 600, fontSize: 13 },
                            }}
                        />
                    </>
                )}
                {level > 0 && onRemove && (
                    <IconButton
                        iconProps={{ iconName: 'Cancel' }}
                        title="Remove group"
                        ariaLabel="Remove group"
                        onClick={onRemove}
                        styles={{
                            root: { marginLeft: 'auto', width: 28, height: 28, color: Colors.textSubtle },
                            rootHovered: { color: '#a80000', backgroundColor: 'transparent' },
                        }}
                    />
                )}
            </Stack>
            
            {!hasContent && (
                <Stack horizontalAlign="center" styles={{ root: { padding: '24px 16px' } }}>
                    <Icon
                        iconName="Filter"
                        styles={{ root: { fontSize: 28, color: Colors.borderDefault, marginBottom: 8 } }}
                    />
                    <Text variant="small" styles={{ root: { color: Colors.textSubtle, textAlign: 'center' } }}>
                        No conditions defined. Click <strong>Add Condition</strong> to start building your query.
                    </Text>
                </Stack>
            )}
            
            <Stack tokens={{ childrenGap: 4 }}>
                {group.conditions.map((condition, index) => (
                    <ConditionRow
                        key={condition.id}
                        condition={condition}
                        attributes={attributes}
                        onConditionChange={(updatedCondition) => updateCondition(index, updatedCondition)}
                        onRemove={() => removeCondition(index)}
                        onDuplicate={() => duplicateCondition(index)}
                        showCheckbox={group.conditions.length >= 2}
                        isSelected={selectedConditions.has(index)}
                        onToggleSelection={() => toggleConditionSelection(index)}
                        context={context}
                    />
                ))}
                
                {group.groups.map((nestedGroup, index) => (
                    <QueryGroupComponent
                        key={nestedGroup.id}
                        group={nestedGroup}
                        attributes={attributes}
                        onGroupChange={(updatedGroup) => updateNestedGroup(index, updatedGroup)}
                        onRemove={() => removeNestedGroup(index)}
                        level={level + 1}
                        context={context}
                    />
                ))}
            </Stack>
            
            <Stack horizontal tokens={{ childrenGap: 8 }} styles={{ root: { marginTop: hasContent ? 10 : 4 } }}>
                <PrimaryButton
                    text="Add Condition"
                    iconProps={{ iconName: 'Add' }}
                    onClick={addCondition}
                    disabled={attributes.length === 0}
                    styles={{
                        root: { height: Sizes.buttonHeightCompact, borderRadius: Sizes.borderRadius, padding: '0 14px' },
                        icon: { fontSize: 12 },
                        label: { fontSize: 13 },
                    }}
                />

                {selectedConditions.size >= 2 && (
                    <DefaultButton
                        text={`Group Selected (${selectedConditions.size})`}
                        iconProps={{ iconName: 'Merge' }}
                        onClick={groupSelectedConditions}
                        styles={{
                            root: { height: Sizes.buttonHeightCompact, borderRadius: Sizes.borderRadius, backgroundColor: Colors.themePrimary, color: 'white', border: 'none', padding: '0 14px' },
                            rootHovered: { backgroundColor: '#106ebe', color: 'white' },
                            icon: { color: 'white', fontSize: 12 },
                            label: { fontSize: 13 },
                        }}
                    />
                )}
            </Stack>
        </Stack>
    );
};

/** Performance: memoize to avoid re-renders when sibling components change */
export const QueryGroupComponent = React.memo(QueryGroupComponentInner);
