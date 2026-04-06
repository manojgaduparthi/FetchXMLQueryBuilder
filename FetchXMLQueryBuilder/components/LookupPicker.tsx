/**
 * Lookup Picker Component
 *
 * @description React component for selecting lookup records using native Dynamics 365 lookup dialog
 *
 * This component uses the native Dynamics 365 lookup dialog for a familiar user experience
 * with full search, paging, and multi-select capabilities.
 */

import * as React from 'react';
import { Stack, IconButton, Text } from '@fluentui/react';
import { LookupService } from '../services/lookupService';

interface LookupPickerProps {
    targetEntity: string;
    value?: string | string[];  // GUID or array of GUIDs
    onChange: (value: string | string[] | undefined) => void;
    context: ComponentFramework.Context<unknown>;
    multiSelect?: boolean;
    placeholder?: string;
}

export const LookupPicker: React.FC<LookupPickerProps> = ({
    targetEntity,
    value,
    onChange,
    context,
    multiSelect = false,
    placeholder = 'Click to select records'
}) => {
    const lookupService = React.useMemo(() => new LookupService(context), [context]);
    const [selectedRecords, setSelectedRecords] = React.useState<{id: string; name: string}[]>([]);
    
    // Load selected record names on mount
    React.useEffect(() => {
        let cancelled = false;
        const loadSelectedRecords = async () => {
            const valuesToLoad: string[] = [];
            if (Array.isArray(value)) {
                valuesToLoad.push(...value.filter(v => v && v.trim() !== ''));
            } else if (typeof value === 'string' && value.trim() !== '') {
                valuesToLoad.push(value);
            }
            
            if (valuesToLoad.length > 0) {
                try {
                    const records = await Promise.all(
                        valuesToLoad.map(id => lookupService.getRecordById(targetEntity, id))
                    );
                    if (!cancelled) {
                        setSelectedRecords(
                            records
                                .filter(r => r !== null)
                                .map(r => ({ id: r.id, name: r.name }))
                        );
                    }
                } catch (error) {
                    console.error('Error loading selected records:', error);
                }
            } else if (!cancelled) {
                setSelectedRecords([]);
            }
        };
        
        loadSelectedRecords();
        return () => { cancelled = true; };
    }, [value, targetEntity, lookupService]);
    
    // Open native Dynamics 365 lookup dialog
    // Normalize GUID - remove braces and convert to lowercase for comparison
    const normalizeGuid = (guid: string): string => {
        return guid.replaceAll(/[{}]/g, '').toLowerCase();
    };

    const openLookupDialog = async () => {
        try {
            const lookupOptions: ComponentFramework.UtilityApi.LookupOptions = {
                entityTypes: [targetEntity],
                allowMultiSelect: multiSelect,
                defaultEntityType: targetEntity
            };
            
            const results = await context.utils.lookupObjects(lookupOptions);
            
            if (results && results.length > 0) {
                if (multiSelect) {
                    // Multiple selection - MERGE with existing selections, preventing duplicates
                    // Normalize GUIDs to remove braces and lowercase
                    const newRecords = results.map(r => ({ 
                        id: normalizeGuid(r.id), 
                        name: r.name || r.id 
                    }));
                    const allRecords = [...selectedRecords, ...newRecords];
                    
                    // Deduplicate by normalized GUID
                    const uniqueRecords = Array.from(
                        new Map(allRecords.map(record => [normalizeGuid(record.id), record])).values()
                    );
                    const allIds = uniqueRecords.map(r => r.id);
                    
                    setSelectedRecords(uniqueRecords);
                    onChange(allIds);
                } else {
                    // Single selection - replace, normalize GUID
                    const normalizedId = normalizeGuid(results[0].id);
                    onChange(normalizedId);
                    setSelectedRecords([{ id: normalizedId, name: results[0].name || results[0].id }]);
                }
            }
        } catch (error) {
            console.error('Error opening lookup dialog:', error);
        }
    };
    
    // Remove a selected record
    const removeRecord = (id: string) => {
        const newRecords = selectedRecords.filter(r => r.id !== id);
        setSelectedRecords(newRecords);
        
        if (newRecords.length === 0) {
            onChange(undefined);
        } else if (multiSelect) {
            onChange(newRecords.map(r => r.id));
        } else {
            onChange(newRecords[0]?.id);
        }
    };
    
    return (
        <Stack 
            horizontal 
            verticalAlign="center"
            styles={{
                root: {
                    minWidth: 180,
                    width: '100%',
                    minHeight: 32,
                    maxHeight: 80,
                    backgroundColor: '#ffffff',
                    border: '1px solid #8a8886',
                    borderRadius: 2,
                    flexShrink: 0,
                    ':hover': {
                        borderColor: '#323130'
                    },
                    ':focus-within': {
                        borderColor: '#0078d4',
                        borderWidth: 2
                    }
                }
            }}
        >
            {/* Scrollable container for selected pills */}
            <Stack
                styles={{
                    root: {
                        flex: 1,
                        minWidth: 0,
                        maxHeight: 80,
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        padding: '4px 6px',
                        boxSizing: 'border-box',
                        // Scrollbar styling
                        '::-webkit-scrollbar': {
                            width: 6
                        },
                        '::-webkit-scrollbar-track': {
                            background: 'transparent'
                        },
                        '::-webkit-scrollbar-thumb': {
                            background: '#c8c6c4',
                            borderRadius: 3
                        }
                    }
                }}
            >
                <div 
                    style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '1fr',
                        gap: '3px',
                        width: '100%'
                    }}
                >
                    {selectedRecords.length > 0 ? (
                        selectedRecords.map(record => (
                            <Stack 
                                key={record.id} 
                                horizontal 
                                verticalAlign="center" 
                                tokens={{ childrenGap: 3 }}
                                styles={{
                                    root: {
                                        padding: '2px 4px 2px 6px',
                                        backgroundColor: '#deecf9',
                                        borderRadius: 2,
                                        border: '1px solid #c7e0f4',
                                        minWidth: 0,
                                        overflow: 'hidden'
                                    }
                                }}
                            >
                                <Text 
                                    variant="small" 
                                    styles={{ 
                                        root: { 
                                            fontSize: 12,
                                            color: '#015cda',
                                            flex: 1,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            minWidth: 0
                                        } 
                                    }}
                                    title={record.name}
                                >
                                    {record.name}
                                </Text>
                                <IconButton
                                    iconProps={{ iconName: 'Cancel' }}
                                    title={`Remove ${record.name}`}
                                    ariaLabel={`Remove ${record.name}`}
                                    onClick={() => removeRecord(record.id)}
                                    styles={{ 
                                        root: { 
                                            width: 16, 
                                            height: 16,
                                            minWidth: 16,
                                            padding: 0,
                                            color: '#015cda',
                                            flexShrink: 0,
                                            ':hover': {
                                                backgroundColor: '#c7e0f4',
                                                color: '#014b8c'
                                            }
                                        },
                                        icon: { fontSize: 8 }
                                    }}
                                />
                            </Stack>
                        ))
                    ) : (
                        <Text 
                            variant="small" 
                            styles={{ 
                                root: { 
                                    color: '#605e5c',
                                    fontStyle: 'italic',
                                    padding: '4px 0'
                                } 
                            }}
                        >
                            {placeholder}
                        </Text>
                    )}
                </div>
            </Stack>
            
            {/* Search icon button - OOB style, inside container on right */}
            <IconButton
                iconProps={{ iconName: 'Search' }}
                title="Look for Record"
                ariaLabel="Look for Record"
                onClick={openLookupDialog}
                styles={{ 
                    root: { 
                        width: 32,
                        height: 32,
                        minWidth: 32,
                        padding: 0,
                        backgroundColor: 'transparent',
                        borderLeft: '1px solid #f3f2f1',
                        borderRadius: 0,
                        flexShrink: 0,
                        ':hover': {
                            backgroundColor: 'rgba(0, 0, 0, 0.03)'
                        }
                    },
                    icon: { 
                        fontSize: 14,
                        color: '#605e5c'
                    }
                }}
            />
        </Stack>
    );
};
