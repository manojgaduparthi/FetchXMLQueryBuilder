/**
 * Condition Row Component
 *
 * @description React component for rendering a single query condition row
 *
 * This component handles the rendering and interaction for a single condition,
 * including attribute selection, operator selection, and value input.
 * It adapts the UI based on the selected operator type.
 */

import * as React from 'react';
import { Dropdown, IDropdownOption, TextField, IconButton, Stack, DatePicker, ComboBox, IComboBoxOption } from '@fluentui/react';
import { QueryCondition, ConditionOperator, AttributeMetadata } from '../types';
import { FetchXMLGenerator } from '../utils/fetchXmlGenerator';
import { LookupPicker } from './LookupPicker';
import {
    TEXT_SEARCH_OPERATORS,
    NUMERIC_ATTRIBUTE_TYPES,
    LOOKUP_FALLBACK_ENTITY,
    Colors,
    Sizes,
} from '../constants';

interface ConditionRowProps {
    condition: QueryCondition;
    attributes: AttributeMetadata[];
    onConditionChange: (condition: QueryCondition) => void;
    onRemove: () => void;
    onDuplicate?: () => void;
    isSelected?: boolean;
    onToggleSelection?: () => void;
    showCheckbox?: boolean;
    context?: ComponentFramework.Context<unknown>; // Optional: enables lookup picker
}

export const ConditionRow: React.FC<ConditionRowProps> = React.memo(({
    condition,
    attributes,
    onConditionChange,
    onRemove,
    onDuplicate,
    isSelected = false,
    onToggleSelection,
    showCheckbox = false,
    context // PCF context for lookup picker
}) => {
    
    const selectedAttribute = attributes.find(attr => attr.logicalName === condition.attribute);
    const attributeType = selectedAttribute?.attributeType || 'String';
    
    // Check if this is a user-related lookup field (for user-specific operators)
    const isUserLookup = selectedAttribute && (
        attributeType === 'Owner' || 
        selectedAttribute.logicalName === 'ownerid' ||
        selectedAttribute.logicalName === 'createdby' ||
        selectedAttribute.logicalName === 'modifiedby' ||
        selectedAttribute.logicalName === 'owninguser' ||
        selectedAttribute.logicalName === 'owningteam'
    );
    
    // Track validation error for X-operator numeric inputs (e.g. "Last X Days")
    const [xOperatorError, setXOperatorError] = React.useState<string>('');
    
    // Get available operators for the selected attribute type (memoized)
    const availableOperators = React.useMemo(() => {
        const ops = FetchXMLGenerator.getOperatorsForType(attributeType);
        if ((attributeType === 'Lookup' || attributeType === 'Customer') && !isUserLookup) {
            return ops.filter(op => 
                op !== ConditionOperator.EqUserId &&
                op !== ConditionOperator.NeUserId &&
                op !== ConditionOperator.EqUserTeams &&
                op !== ConditionOperator.EqUserOrUserTeams &&
                op !== ConditionOperator.EqUserOrUserHierarchy &&
                op !== ConditionOperator.EqUserOrUserHierarchyAndTeams
            );
        }
        return ops;
    }, [attributeType, isUserLookup]);
    
    const attributeOptions: IComboBoxOption[] = React.useMemo(
        () => attributes.map(attr => ({ key: attr.logicalName, text: attr.displayName })),
        [attributes]
    );
    
    const operatorOptions: IDropdownOption[] = React.useMemo(
        () => availableOperators.map(op => ({ key: op, text: FetchXMLGenerator.getOperatorLabel(op) })),
        [availableOperators]
    );
    
    // Normalize operator for display: "In" → "Equal", "Not In" → "Not Equal"
    // This handles when parser loads saved queries with "in" operator from FetchXML
    let displayOperator = condition.operator;
    if (condition.operator === ConditionOperator.In) {
        displayOperator = ConditionOperator.Equal;
    } else if (condition.operator === ConditionOperator.NotIn) {
        displayOperator = ConditionOperator.NotEqual;
    }
    
    const handleAttributeChange = (option?: IDropdownOption): void => {
        if (option) {
            const newAttribute = attributes.find(attr => attr.logicalName === option.key);
            if (newAttribute) {
                const newOperators = FetchXMLGenerator.getOperatorsForType(newAttribute.attributeType);
                onConditionChange({
                    ...condition,
                    attribute: String(option.key),
                    operator: newOperators[0], // Default to first available operator
                    value: undefined,
                    value2: undefined
                });
            }
        }
    };
    
    const handleOperatorChange = (option?: IDropdownOption): void => {
        if (option) {
            setXOperatorError(''); // Clear any validation error when switching operators
            onConditionChange({
                ...condition,
                operator: option.key as ConditionOperator,
                value: undefined,
                value2: undefined
            });
        }
    };
    
    const needsNumericValue = (): boolean => {
        return [
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
            ConditionOperator.OlderThanXYears
        ].includes(condition.operator);
    };

    const handleValueChange = (value: string | number | boolean | string[] | number[] | (string | number)[] | undefined): void => {
        // Validate numeric operators (X-Days, X-Months, etc.)
        if (needsNumericValue()) {
            // Allow clearing the field
            if (value === undefined || value === null || value === '') {
                setXOperatorError('');
                onConditionChange({ ...condition, value: undefined });
                return;
            }
            const numValue = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
            if (Number.isNaN(numValue) || numValue <= 0) {
                setXOperatorError('Please enter a positive whole number');
                return; // Don't propagate invalid value
            }
            setXOperatorError('');
            value = numValue;
        }
        
        onConditionChange({
            ...condition,
            value
        });
    };
    
    const handleValue2Change = (value: string | number | undefined): void => {
        onConditionChange({
            ...condition,
            value2: value
        });
    };
    
    const needsValue = (): boolean => {
        return ![
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
            ConditionOperator.EqUserId,
            ConditionOperator.NeUserId,
            ConditionOperator.EqUserTeams,
            ConditionOperator.EqUserOrUserTeams,
            ConditionOperator.EqUserOrUserHierarchy,
            ConditionOperator.EqUserOrUserHierarchyAndTeams
        ].includes(condition.operator);
    };
    
    const needsValue2 = (): boolean => {
        return condition.operator === ConditionOperator.Between || 
               condition.operator === ConditionOperator.NotBetween;
    };
    
    // ── Helper: is the current operator a text/wildcard search? ──
    const isTextSearchOperator = (): boolean => TEXT_SEARCH_OPERATORS.includes(condition.operator);

    // ── Extracted value-to-string helper ──
    const valueAsString = (): string => (typeof condition.value === 'string' ? condition.value : '');
    const valueAsNumericString = (): string => {
        if (typeof condition.value === 'number') return String(condition.value);
        if (typeof condition.value === 'string') return condition.value;
        return '';
    };

    // ── Per-type value renderers (each well under complexity 15) ──

    const renderTextSearchInput = (): JSX.Element => (
        <TextField
            placeholder="Enter text to search"
            value={valueAsString()}
            onChange={(_, newValue) => handleValueChange(newValue)}
            styles={{ root: { minWidth: Sizes.valueInputMinWidth } }}
        />
    );

    const determineLookupTarget = (): string => {
        if (selectedAttribute?.targets && selectedAttribute.targets.length > 0) {
            return selectedAttribute.targets[0];
        }
        if (selectedAttribute?.logicalName) {
            const match = /^(.+)id$/.exec(selectedAttribute.logicalName);
            if (match) return match[1];
        }
        console.warn('[ConditionRow] Could not determine target entity for lookup field:', selectedAttribute?.logicalName);
        return LOOKUP_FALLBACK_ENTITY;
    };

    const renderLookupPicker = (targetEntity: string): JSX.Element => {
        let lookupValue: string | string[] | undefined;
        if (Array.isArray(condition.value)) {
            lookupValue = condition.value as string[];
        } else if (typeof condition.value === 'string') {
            lookupValue = condition.value;
        }
        return (
            <LookupPicker
                context={context!}
                targetEntity={targetEntity}
                value={lookupValue}
                onChange={(newValue) => handleValueChange(newValue)}
                multiSelect
            />
        );
    };

    const renderGuidInput = (): JSX.Element => {
        const textVal = valueAsString();
        if (condition.operator === ConditionOperator.In || condition.operator === ConditionOperator.NotIn) {
            const multiValue = Array.isArray(condition.value) ? condition.value.join(',') : textVal;
            return (
                <TextField
                    placeholder="Enter GUIDs (comma-separated)"
                    value={multiValue}
                    onChange={(_, newValue) => {
                        const guids = newValue ? newValue.split(',').map(g => g.trim()).filter(Boolean) : undefined;
                        handleValueChange(guids);
                    }}
                    styles={{ root: { minWidth: Sizes.valueInputMinWidth } }}
                    description="Enter record GUIDs separated by commas"
                />
            );
        }
        return (
            <TextField
                placeholder="Enter GUID"
                value={textVal}
                onChange={(_, newValue) => handleValueChange(newValue)}
                styles={{ root: { minWidth: Sizes.valueInputMinWidth } }}
                description="Enter the record GUID (e.g., 00000000-0000-0000-0000-000000000000)"
            />
        );
    };

    const renderLookupValue = (): JSX.Element => {
        if (isTextSearchOperator()) return renderTextSearchInput();
        const targetEntity = determineLookupTarget();
        if (context) return renderLookupPicker(targetEntity);
        return renderGuidInput();
    };

    const renderBooleanValue = (): JSX.Element => {
        const boolOptions: IDropdownOption[] = [
            { key: 'true', text: 'Yes' },
            { key: 'false', text: 'No' },
        ];
        return (
            <Dropdown
                placeholder="Select value"
                options={boolOptions}
                selectedKey={typeof condition.value === 'string' ? condition.value : undefined}
                onChange={(_, option) => handleValueChange(option?.key as string)}
                styles={{ root: { minWidth: Sizes.valueInputMinWidth } }}
            />
        );
    };

    const renderPicklistMultiSelect = (picklistOptions: IDropdownOption[]): JSX.Element => {
        const selectedKeys = Array.isArray(condition.value)
            ? condition.value.map(v => (typeof v === 'number' ? v : Number(v)))
            : [];
        return (
            <Dropdown
                placeholder="Select values"
                multiSelect
                options={picklistOptions}
                selectedKeys={selectedKeys}
                onChange={(_, option) => {
                    if (!option) return;
                    const currentValues = Array.isArray(condition.value) ? condition.value : [];
                    const newValues = option.selected
                        ? [...currentValues, option.key as number]
                        : currentValues.filter(v => v !== option.key);
                    handleValueChange(newValues);
                }}
                styles={{ root: { minWidth: Sizes.valueInputMinWidth } }}
            />
        );
    };

    const renderPicklistSingleSelect = (picklistOptions: IDropdownOption[]): JSX.Element => {
        let selectedValue: number | undefined;
        if (condition.value !== undefined && condition.value !== null && condition.value !== '') {
            const numValue = typeof condition.value === 'number' ? condition.value : Number(condition.value);
            if (!Number.isNaN(numValue)) selectedValue = numValue;
        }
        return (
            <Dropdown
                placeholder="Select value"
                options={picklistOptions}
                selectedKey={selectedValue}
                onChange={(_, option) => handleValueChange(option?.key as number)}
                styles={{ root: { minWidth: Sizes.valueInputMinWidth } }}
            />
        );
    };

    const renderPicklistValue = (): JSX.Element | null => {
        if (!selectedAttribute?.options) return null;
        if (isTextSearchOperator()) return renderTextSearchInput();
        const picklistOptions: IDropdownOption[] = selectedAttribute.options.map(opt => ({
            key: opt.value,
            text: opt.label,
        }));
        if (condition.operator === ConditionOperator.In || condition.operator === ConditionOperator.NotIn) {
            return renderPicklistMultiSelect(picklistOptions);
        }
        return renderPicklistSingleSelect(picklistOptions);
    };

    const renderXOperatorValue = (): JSX.Element => (
        <TextField
            type="number"
            placeholder="Enter number"
            value={valueAsNumericString()}
            onChange={(_, newValue) => handleValueChange(newValue ? Number(newValue) : undefined)}
            styles={{ root: { minWidth: Sizes.valueInputMinWidth } }}
            min={1}
            errorMessage={xOperatorError || undefined}
        />
    );

    const renderDateTimeValue = (): JSX.Element => {
        const dateValue = (condition.value && typeof condition.value === 'string')
            ? new Date(condition.value)
            : undefined;
        return (
            <DatePicker
                placeholder="Select date"
                value={dateValue}
                onSelectDate={(date) => handleValueChange(date?.toISOString())}
                styles={{ root: { minWidth: Sizes.valueInputMinWidth } }}
                isRequired={needsValue2()}
            />
        );
    };

    const renderNumberValue = (): JSX.Element => {
        const isBetween = needsValue2();
        return (
            <TextField
                type="number"
                placeholder="Enter value"
                value={valueAsNumericString()}
                onChange={(_, newValue) => handleValueChange(newValue ? Number(newValue) : undefined)}
                styles={{ root: { minWidth: Sizes.valueInputMinWidth } }}
                errorMessage={isBetween && !condition.value ? 'Required' : undefined}
                required={isBetween}
            />
        );
    };

    const renderDefaultTextValue = (): JSX.Element => {
        const isBetween = needsValue2();
        return (
            <TextField
                placeholder="Enter value"
                value={valueAsString()}
                onChange={(_, newValue) => handleValueChange(newValue)}
                styles={{ root: { minWidth: Sizes.valueInputMinWidth } }}
                errorMessage={isBetween && !condition.value ? 'Required' : undefined}
                required={isBetween}
            />
        );
    };

    // ── Main dispatcher (cognitive complexity ≈ 8) ──
    const renderValueInput = (): JSX.Element | null => {
        if (!needsValue()) return null;
        if (attributeType === 'Lookup' || attributeType === 'Customer' || attributeType === 'Owner') {
            return renderLookupValue();
        }
        if (attributeType === 'Boolean') return renderBooleanValue();
        if ((attributeType === 'Picklist' || attributeType === 'State' || attributeType === 'Status') && selectedAttribute?.options) {
            return renderPicklistValue();
        }
        if (needsNumericValue()) return renderXOperatorValue();
        if (attributeType === 'DateTime') return renderDateTimeValue();
        if (NUMERIC_ATTRIBUTE_TYPES.includes(attributeType as typeof NUMERIC_ATTRIBUTE_TYPES[number])) {
            return renderNumberValue();
        }
        return renderDefaultTextValue();
    };
    
    const renderValue2Input = (): JSX.Element | null => {
        if (!needsValue2()) {
            return null;
        }
        
        // DateTime
        if (attributeType === 'DateTime') {
            const dateValue2 = condition.value2 && typeof condition.value2 === 'string' 
                ? new Date(condition.value2) 
                : undefined;
                
            return (
                <DatePicker
                    placeholder="Select end date"
                    value={dateValue2}
                    onSelectDate={(date) => handleValue2Change(date?.toISOString())}
                    styles={{ root: { minWidth: Sizes.valueInputMinWidth } }}
                    isRequired
                />
            );
        }
        
        // Number types
        if (['Integer', 'BigInt', 'Decimal', 'Double', 'Money'].includes(attributeType)) {
            let numValue2 = '';
            if (typeof condition.value2 === 'number') {
                numValue2 = String(condition.value2);
            } else if (typeof condition.value2 === 'string') {
                numValue2 = condition.value2;
            }
            
            const showError = !condition.value2;
                
            return (
                <TextField
                    type="number"
                    placeholder="Enter second value"
                    value={numValue2}
                    onChange={(_, newValue) => handleValue2Change(newValue ? Number(newValue) : undefined)}
                    styles={{ root: { minWidth: Sizes.valueInputMinWidth } }}
                    errorMessage={showError ? "Required" : undefined}
                    required
                />
            );
        }
        
        const textValue2 = typeof condition.value2 === 'string' ? condition.value2 : '';
        const showError = !condition.value2;
        
        return (
            <TextField
                placeholder="Enter second value"
                value={textValue2}
                onChange={(_, newValue) => handleValue2Change(newValue)}
                styles={{ root: { minWidth: Sizes.valueInputMinWidth } }}
                errorMessage={showError ? "Required" : undefined}
                required
            />
        );
    };
    
    return (
        <Stack
            horizontal
            tokens={{ childrenGap: Sizes.conditionRowGap }}
            verticalAlign="center"
            wrap
            styles={{
                root: {
                    padding: '6px 10px',
                    borderRadius: Sizes.borderRadius,
                    backgroundColor: Colors.backgroundCard,
                    borderBottom: `1px solid ${Colors.borderLight}`,
                    transition: 'background-color 0.15s ease',
                    selectors: { ':hover': { backgroundColor: Colors.backgroundHover } },
                }
            }}
        >
            {showCheckbox && onToggleSelection && (
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={onToggleSelection}
                    style={{ width: Sizes.checkboxSize, height: Sizes.checkboxSize, cursor: 'pointer', flexShrink: 0 }}
                    title="Select for grouping"
                />
            )}
            <Stack.Item grow={2} styles={{ root: { minWidth: Sizes.attributeDropdownMinWidth } }}>
                <ComboBox
                    placeholder="Search field..."
                    options={attributeOptions}
                    selectedKey={condition.attribute}
                    onChange={(_, option) => handleAttributeChange(option as IDropdownOption)}
                    allowFreeform={false}
                    autoComplete="on"
                    useComboBoxAsMenuWidth
                    styles={{ 
                        root: { width: '100%' },
                        optionsContainer: { maxHeight: Sizes.comboBoxMaxHeight }
                    }}
                />
            </Stack.Item>
            <Stack.Item grow={1} styles={{ root: { minWidth: Sizes.operatorDropdownMinWidth } }}>
                <Dropdown
                    placeholder="Select operator"
                    options={operatorOptions}
                    selectedKey={displayOperator}
                    onChange={(_, option) => handleOperatorChange(option)}
                    styles={{ 
                        root: { width: '100%' },
                        callout: { minWidth: Sizes.dropdownCalloutMinWidth, maxWidth: Sizes.dropdownCalloutMaxWidth },
                        dropdownItemsWrapper: { maxWidth: Sizes.dropdownCalloutMaxWidth }
                    }}
                />
            </Stack.Item>
            {needsValue() && (
                <Stack.Item grow={2} styles={{ root: { minWidth: Sizes.valueInputMinWidth } }}>
                    {renderValueInput()}
                </Stack.Item>
            )}
            {needsValue2() && (
                <Stack.Item grow={2} styles={{ root: { minWidth: Sizes.valueInputMinWidth } }}>
                    {renderValue2Input()}
                </Stack.Item>
            )}
            {onDuplicate && (
                <IconButton
                    iconProps={{ iconName: 'Copy' }}
                    title="Duplicate condition"
                    ariaLabel="Duplicate condition"
                    onClick={onDuplicate}
                    styles={{
                        root: { width: 28, height: 28, color: Colors.textSubtle, flexShrink: 0 },
                        rootHovered: { color: Colors.themePrimary, backgroundColor: 'transparent' },
                    }}
                />
            )}
            <IconButton
                iconProps={{ iconName: 'Cancel' }}
                title="Remove condition"
                ariaLabel="Remove condition"
                onClick={onRemove}
                styles={{
                    root: { width: 28, height: 28, color: Colors.textSubtle, flexShrink: 0 },
                    rootHovered: { color: '#a80000', backgroundColor: 'transparent' },
                }}
            />
        </Stack>
    );
});
